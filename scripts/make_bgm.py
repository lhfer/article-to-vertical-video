#!/usr/bin/env python3
"""make_bgm.py — original synthesized background beat (kick / hat / side-chained bass / pad / riser). No samples.

Usage: make_bgm.py <project_dir> [--seconds N] [--bpm N] [--kit synth|lofi|minimal] [--energy storyboard.json]
                                 [--base-volume DBFS] [--help]
  --kit          synth   = the v1 sound (128 BPM): punchy kick, tight hats, saw bass, airy pad      (default)
                 lofi    = softer kick, swung hats, mellow triangle bass, detuned pad, vinyl crackle (96 BPM)
                 minimal = kick + pad only                                                            (110 BPM)
  --bpm          overrides the kit's default tempo
  --energy       storyboard JSON written by scripts/storyboard.py:
                 {"beats": [{"id", "kind", "start", "seconds", "energy": 1..5, …}], …}
                 energy ≤ 2 → pad only (kick + hats drop out) · 3 → full groove · ≥ 4 → groove with the bass an
                 octave up and a 4-beat riser that ends exactly at that beat's start.
                 Without --energy: full groove with a riser in the last 4 beats of every 32 (v1 behaviour).
  --seconds      minimum length; the track is max(--seconds, last beat end + 2 s). Default 320 without --energy.
  --base-volume  peak level in dBFS after normalisation (default -6; the template ducks under the voice-over)
  writes <project_dir>/public/bgm.wav (44.1 kHz 16-bit mono) and <project_dir>/public/bgm.json (sections rendered)
Rendering is pure Python (~10 s per 5 min of audio thanks to pre-rendered loops and wavetables).
"""
import array
import json
import math
import pathlib
import random
import sys
import wave

SR = 44100
KITS = {
    "synth": {"bpm": 128, "kick": 0.9, "hat": 1.0, "bass": 0.22, "pad": 0.045, "swing": 0.0},
    "lofi": {"bpm": 96, "kick": 0.7, "hat": 0.6, "bass": 0.2, "pad": 0.05, "swing": 0.18},
    "minimal": {"bpm": 110, "kick": 0.85, "hat": 0.0, "bass": 0.0, "pad": 0.06, "swing": 0.0},
}
PATTERN = [0, 0, 7, 0, 10, 0, 7, 5]          # bass semitones above A1 (55 Hz), one note per beat, 8-beat loop
PAD_FREQS = (220.0, 261.63, 329.63, 493.88)  # A minor add9
RAMP = int(0.03 * SR)                        # 30 ms gain ramps at section changes

TABLE_BITS = 12
TABLE_N = 1 << TABLE_BITS
MASK = TABLE_N - 1
SINE = [math.sin(2 * math.pi * i / TABLE_N) for i in range(TABLE_N)]
K = TABLE_N / (2 * math.pi)                   # radians → table index


def die(msg, code=1):
    print(f"make_bgm.py: {msg}", file=sys.stderr)
    sys.exit(code)


def freq(semi):
    return 55.0 * (2 ** (semi / 12.0))


# ---------------------------------------------------------------- loops (rendered once, tiled)
def drums_loop(kit, beat, L, rng):
    """Kick on every beat, hats on 8ths (accent on the off-beats), one 8-beat loop of L samples."""
    k = KITS[kit]
    out = [0.0] * L
    bl = beat * SR
    # kick: one hit, rendered once
    klen = int(min(beat, 0.6) * SR)
    kick = []
    phase = 0.0
    for i in range(klen):
        tb = i / SR
        if kit == "lofi":
            f = 40 + 80 * math.exp(-tb * 22)
            phase += 2 * math.pi * f / SR
            v = math.sin(phase) * math.exp(-tb * 6)
            v = math.tanh(v * 1.4) / math.tanh(1.4) * 0.9
        else:
            f = 45 + 115 * math.exp(-tb * 18)
            phase += 2 * math.pi * f / SR
            v = math.sin(phase) * math.exp(-tb * 7)
        kick.append(v * k["kick"])
    # hat: one burst, rendered once (lofi: darker, one-pole low-passed noise)
    hlen = int(0.12 * SR)
    hat = []
    lp = 0.0
    for i in range(hlen):
        n = rng.uniform(-1, 1)
        if kit == "lofi":
            lp += 0.35 * (n - lp)
            n = lp * 1.6
        hat.append(n * math.exp(-(i / SR) * (45 if kit == "lofi" else 60)))
    for b in range(8):
        start = int(b * bl)
        for i, v in enumerate(kick):
            if start + i < L:
                out[start + i] += v
        if k["hat"] > 0:
            for e in range(2):
                pos = b * bl + e * bl / 2
                if e == 1:
                    pos += k["swing"] * bl / 2
                start = int(pos)
                amp = (0.22 if e else 0.12) * k["hat"]
                for i, v in enumerate(hat):
                    if start + i < L:
                        out[start + i] += v * amp
    return out


def bass_loop(kit, beat, L, octave):
    """Side-chained bass, one 8-beat loop. synth: 5-harmonic saw · lofi: triangle (odd harmonics)."""
    k = KITS[kit]
    if k["bass"] <= 0:
        return None
    out = [0.0] * L
    bl = beat * SR
    # wavetable for the timbre (one period)
    table = []
    for i in range(TABLE_N):
        x = 2 * math.pi * i / TABLE_N
        if kit == "lofi":
            v = sum(((-1) ** ((h - 1) // 2)) * math.sin(h * x) / (h * h) for h in (1, 3, 5, 7))
        else:
            v = sum(math.sin(h * x) / h for h in range(1, 6))
        table.append(v)
    tpeak = max(abs(v) for v in table)
    table = [v / tpeak for v in table]
    phase = 0.0
    for i in range(L):
        b = i / bl
        bi = int(b)
        tb = (b - bi) * beat
        f = freq(PATTERN[bi % 8] + 12 * octave)
        phase += f * TABLE_N / SR
        side = 1 - 0.85 * math.exp(-tb * 9)
        out[i] = table[int(phase) & MASK] * k["bass"] * side * (1.15 if kit != "lofi" else 1.0)
    return out


# ---------------------------------------------------------------- sections from the storyboard
def load_energy(path):
    j = json.load(open(path, encoding="utf-8"))
    beats = j.get("beats") if isinstance(j, dict) else j
    if isinstance(j, dict) and not beats:
        beats = j.get("items") or j.get("scenes") or j.get("timeline") or []
    if not isinstance(beats, list) or not beats:
        die(f"{path}: no beats found (expected {{\"beats\": [{{start, seconds, energy}}]}})")
    out = []
    t = 0.0
    for b in beats:
        if not isinstance(b, dict):
            continue
        secs = None
        for key in ("seconds", "duration", "dur", "estSeconds", "length"):
            if isinstance(b.get(key), (int, float)):
                secs = float(b[key])
                break
        start = None
        for key in ("start", "startSeconds", "t", "at"):
            if isinstance(b.get(key), (int, float)):
                start = float(b[key])
                break
        if start is None:
            start = t
        if secs is None:
            secs = 4.0
        energy = b.get("energy")
        if not isinstance(energy, (int, float)):
            energy = {"hook": 4, "bench": 4, "cta": 4, "chapter": 2, "quote": 2, "take": 2, "outro": 2, "summary": 2}.get(b.get("kind"), 3)
        out.append({"id": str(b.get("id", len(out))), "kind": b.get("kind", ""), "start": start, "seconds": secs, "energy": int(max(1, min(5, round(energy))))})
        t = start + secs
    out.sort(key=lambda s: s["start"])
    return out


def plan_sections(beats, duration, beat):
    """→ (sections [{start, end, energy, mode, id}], risers [(start, end)])."""
    sections, risers = [], []
    for i, b in enumerate(beats):
        end = beats[i + 1]["start"] if i + 1 < len(beats) else max(duration, b["start"] + b["seconds"])
        e = b["energy"]
        mode = "pad" if e <= 2 else "groove" if e == 3 else "groove+octave"
        sections.append({"id": b["id"], "kind": b["kind"], "start": round(b["start"], 3), "end": round(end, 3), "energy": e, "mode": mode})
        if e >= 4 and b["start"] > 0.5:
            r0 = max(0.0, b["start"] - 4 * beat)
            risers.append((r0, b["start"]))
    if not sections or sections[0]["start"] > 0:
        first = sections[0]["start"] if sections else duration
        sections.insert(0, {"id": "pre", "kind": "", "start": 0.0, "end": round(first, 3), "energy": 2, "mode": "pad"})
    if sections[-1]["end"] < duration:
        sections.append({"id": "tail", "kind": "", "start": sections[-1]["end"], "end": duration, "energy": 2, "mode": "pad"})
    return sections, risers


# ---------------------------------------------------------------- render
def render(kit, bpm, duration, sections, risers, rng):
    k = KITS[kit]
    beat = 60.0 / bpm
    N = int(SR * duration)
    L = int(round(8 * beat * SR))
    drums = drums_loop(kit, beat, L, rng)
    bass = bass_loop(kit, beat, L, 0)
    bass_hi = bass_loop(kit, beat, L, 1)
    noise = [rng.uniform(-1, 1) for _ in range(SR // 4)]
    NL = len(noise)
    crackle = kit == "lofi"
    out = array.array("f", bytes(4 * N))
    sine = SINE
    pad_inc = [f * TABLE_N / SR for f in PAD_FREQS]   # table steps per sample
    pad_amp = k["pad"]
    detune = [1.0, 1.0, 1.0, 1.0] if kit != "lofi" else [1.0, 1.0018, 0.9985, 1.0012]
    pad_inc = [inc * d for inc, d in zip(pad_inc, detune)]
    breathe_inc = TABLE_N / (beat * 8 * SR)  # one breath per 8 beats
    vib_inc = 0.2 * TABLE_N / SR
    riser_spans = [(int(a * SR), int(b * SR)) for a, b in risers]

    prev_gd, prev_gb, prev_hi, prev_gp = 0.0, 0.0, 0.0, 1.0
    p0 = p1 = p2 = p3 = 0.0
    pb = 3 * TABLE_N // 4  # breathing starts at its minimum (v1: -π/2)
    pv = 0.0
    ri = 0
    for sec in sections:
        s0, s1 = int(sec["start"] * SR), min(N, int(sec["end"] * SR))
        if sec["mode"] == "pad":            # bed only: pad a little louder so the section does not vanish
            gd, gb, hi, gp = 0.0, 0.0, 0.0, 1.8
        elif sec["mode"] == "groove":
            gd, gb, hi, gp = 1.0, 1.0, 0.0, 1.0
        else:
            gd, gb, hi, gp = 1.0, 1.0, 1.0, 1.0
        for i in range(s0, s1):
            kk = i - s0
            if kk < RAMP:
                w = kk / RAMP
                g_d = prev_gd + (gd - prev_gd) * w
                g_b = prev_gb + (gb - prev_gb) * w
                g_h = prev_hi + (hi - prev_hi) * w
                g_p = prev_gp + (gp - prev_gp) * w
            else:
                g_d, g_b, g_h, g_p = gd, gb, hi, gp
            li = i % L
            v = drums[li] * g_d
            if bass is not None and g_b > 0:
                v += (bass[li] * (1 - g_h) + bass_hi[li] * g_h) * g_b
            # pad: 4 voices with slow vibrato, breathing every 8 beats, 4 s fade-in
            vib = 0.3 * sine[int(pv) & MASK]
            p0 += pad_inc[0]; p1 += pad_inc[1]; p2 += pad_inc[2]; p3 += pad_inc[3]
            pv += vib_inc; pb += breathe_inc
            pad = sine[int(p0 + vib * K) & MASK] + sine[int(p1 + vib * K) & MASK] + sine[int(p2 + vib * K) & MASK] + sine[int(p3 + vib * K) & MASK]
            breathe = 0.55 + 0.45 * sine[int(pb) & MASK]
            t = i / SR
            v += pad * pad_amp * g_p * breathe * (t / 4 if t < 4 else 1.0)
            # riser: filtered noise swell ending at the target beat
            while ri < len(riser_spans) and i >= riser_spans[ri][1]:
                ri += 1
            if ri < len(riser_spans) and i >= riser_spans[ri][0]:
                a, b2 = riser_spans[ri]
                amt = (i - a) / max(1, b2 - a)
                v += noise[(i * 3) % NL] * 0.12 * amt * amt
            if crackle:
                v += noise[(i * 7) % NL] * 0.012 * (1.0 if noise[(i // 97) % NL] > 0.92 else 0.15)
            out[i] = v
        prev_gd, prev_gb, prev_hi, prev_gp = gd, gb, hi, gp
    return out


def main(argv):
    args = list(argv)
    if not args or "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0 if args else 2
    proj = None
    seconds = bpm = energy = None
    kit = "synth"
    base_db = -6.0
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--seconds", "--bpm", "--kit", "--energy", "--base-volume"):
            if i + 1 >= len(args):
                die(f"{a} needs a value", 2)
            v = args[i + 1]
            if a == "--seconds": seconds = float(v)
            elif a == "--bpm": bpm = int(v)
            elif a == "--kit": kit = v
            elif a == "--energy": energy = v
            else: base_db = float(v)
            i += 1
        elif a.startswith("-") and not a.lstrip("-").replace(".", "").isdigit():
            die(f"unknown option {a}", 2)
        elif proj is None:
            proj = pathlib.Path(a)
        elif seconds is None and a.replace(".", "").isdigit():
            seconds = float(a)          # v1 positional: make_bgm.py <project_dir> [seconds] [bpm]
        elif bpm is None and a.isdigit():
            bpm = int(a)
        else:
            die(f"unexpected argument {a}", 2)
        i += 1
    if proj is None:
        die("usage: make_bgm.py <project_dir> [--seconds N] [--bpm N] [--kit synth|lofi|minimal] [--energy storyboard.json]", 2)
    if kit not in KITS:
        die(f"unknown kit {kit!r} (synth|lofi|minimal)", 2)
    bpm = bpm or KITS[kit]["bpm"]
    if not 40 <= bpm <= 220:
        die("bpm must be within 40..220", 2)
    beat = 60.0 / bpm

    beats = load_energy(energy) if energy else None
    if beats:
        last_end = max(b["start"] + b["seconds"] for b in beats)
        duration = max(seconds or 0.0, last_end + 2.0)
    else:
        duration = seconds if seconds is not None else 320.0
    if duration < 1:
        die("length must be ≥ 1 s", 2)

    if beats:
        sections, risers = plan_sections(beats, duration, beat)
    else:  # v1: one long groove, riser in the last 4 beats of every 32
        sections = [{"id": "all", "kind": "", "start": 0.0, "end": duration, "energy": 3, "mode": "groove"}]
        risers = []
        n32 = 32 * beat
        t = n32
        while t <= duration + 1e-9:
            risers.append((t - 4 * beat, t))
            t += n32

    rng = random.Random(7)
    out = render(kit, bpm, duration, sections, risers, rng)
    peak = max(abs(x) for x in out) or 1.0
    target = 10 ** (base_db / 20)
    drive = 1.3
    norm = math.tanh(drive)
    pcm = array.array("h", (int(max(-1.0, min(1.0, math.tanh(x / peak * drive) / norm * target)) * 32767) for x in out))
    pub = proj / "public"
    pub.mkdir(parents=True, exist_ok=True)
    with wave.open(str(pub / "bgm.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    meta = {"kit": kit, "bpm": bpm, "seconds": round(len(out) / SR, 3), "peakDbfs": base_db, "energySource": energy,
            "sections": sections, "risers": [{"start": round(a, 3), "end": round(b, 3)} for a, b in risers]}
    json.dump(meta, open(pub / "bgm.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"ok  {pub / 'bgm.wav'}  {len(out) / SR:.1f} s  kit={kit} bpm={bpm} peak={base_db:g} dBFS  sections={len(sections)} risers={len(risers)}")
    for s in sections:
        print(f"  {s['start']:7.2f}–{s['end']:7.2f}  E{s['energy']}  {s['mode']:14s} {s['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
