#!/usr/bin/env python3
"""make_sfx.py — synthesize the template's four sound effects. Pure Python (wave + math + random), no samples.

Usage: make_sfx.py <project_dir> [--help]
  writes <project_dir>/public/sfx/whoosh.wav  0.45 s  band-passed noise sweep (transitions: whip / slide)
                                  hit.wav     0.35 s  low sine thump + click        (stat cards, cuts)
                                  riser.wav   1.60 s  rising filtered noise + pitch ramp (into a chapter / reveal)
                                  tick.wav    0.08 s  short click                   (list items, captions)
  44.1 kHz · 16-bit · mono · peak −3 dBFS · deterministic (fixed random seed) → identical bytes on every run.
"""
import math
import pathlib
import random
import struct
import sys
import wave

SR = 44100
PEAK_DBFS = -3.0


def bandpass(samples, freqs, q):
    """2-pole constant-0dB-peak band-pass with a per-sample centre frequency."""
    out = []
    x1 = x2 = y1 = y2 = 0.0
    for x, f0 in zip(samples, freqs):
        w0 = 2 * math.pi * min(max(f0, 20.0), SR * 0.45) / SR
        alpha = math.sin(w0) / (2 * q)
        a0 = 1 + alpha
        y = (alpha * x - alpha * x2 + 2 * math.cos(w0) * y1 - (1 - alpha) * y2) / a0
        out.append(y)
        x2, x1 = x1, x
        y2, y1 = y1, y
    return out


def highpass(samples, cutoff):
    rc = 1.0 / (2 * math.pi * cutoff)
    a = rc / (rc + 1.0 / SR)
    out, prev_x, prev_y = [], 0.0, 0.0
    for x in samples:
        y = a * (prev_y + x - prev_x)
        out.append(y)
        prev_x, prev_y = x, y
    return out


def noise(n, rng):
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def whoosh(rng):
    n = int(0.45 * SR)
    src = noise(n, rng)
    freqs = []
    for i in range(n):
        u = i / n
        # sweep up fast, then fall: 400 → 3200 → 900 Hz
        f = 400 * (8 ** (math.sin(math.pi * u) ** 0.7)) if u < 0.5 else 3200 * (900 / 3200) ** ((u - 0.5) / 0.5)
        freqs.append(f)
    y = bandpass(src, freqs, q=2.2)
    out = []
    for i, v in enumerate(y):
        u = i / n
        env = min(1.0, u / 0.12) * (1.0 - u) ** 1.4
        out.append(v * env)
    return out


def hit(rng):
    n = int(0.35 * SR)
    out = []
    phase = 0.0
    click = highpass(noise(int(0.006 * SR), rng), 1800)
    for i in range(n):
        t = i / SR
        f = 48 + 90 * math.exp(-t * 28)                    # pitch drop 138 → 48 Hz
        phase += 2 * math.pi * f / SR
        body = math.sin(phase) * math.exp(-t * 9.5)
        body = math.tanh(body * 1.8) / math.tanh(1.8)       # gentle saturation
        c = click[i] * math.exp(-t * 400) * 0.9 if i < len(click) else 0.0
        out.append(body * min(1.0, t / 0.002) + c)
    return out


def riser(rng):
    n = int(1.6 * SR)
    src = noise(n, rng)
    freqs = [220 * (6000 / 220) ** (i / n) for i in range(n)]
    y = bandpass(src, freqs, q=1.6)
    out = []
    phase = 0.0
    for i, v in enumerate(y):
        u = i / n
        t = i / SR
        f = 180 * (4 ** u) * (1 + 0.012 * math.sin(2 * math.pi * 6.5 * t))   # 180 → 720 Hz with light vibrato
        phase += 2 * math.pi * f / SR
        tone = (math.sin(phase) + 0.35 * math.sin(2 * phase + 0.3)) * 0.35
        env = u ** 1.8
        tail = 1.0 if u < 0.985 else (1 - u) / 0.015           # 24 ms release so the loop does not click
        out.append((v * 1.1 + tone) * env * tail)
    return out


def tick(rng):
    n = int(0.08 * SR)
    burst = highpass(noise(int(0.003 * SR), rng), 3000)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        phase += 2 * math.pi * 2600 / SR
        tone = math.sin(phase) * math.exp(-t * 140)
        b = burst[i] * 0.8 if i < len(burst) else 0.0
        out.append((tone + b) * min(1.0, t / 0.0005))
    return out


def write_wav(path, samples):
    peak = max((abs(s) for s in samples), default=1.0) or 1.0
    gain = (10 ** (PEAK_DBFS / 20)) / peak
    frames = struct.pack("<%dh" % len(samples), *(int(max(-1.0, min(1.0, s * gain)) * 32767) for s in samples))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    return len(samples) / SR


def main(argv):
    if not argv or "-h" in argv or "--help" in argv:
        print(__doc__.strip())
        return 0 if argv else 2
    if len(argv) != 1 or argv[0].startswith("-"):
        print("usage: make_sfx.py <project_dir>", file=sys.stderr)
        return 2
    out = pathlib.Path(argv[0]) / "public" / "sfx"
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in (("whoosh", whoosh), ("hit", hit), ("riser", riser), ("tick", tick)):
        rng = random.Random(20260903 + len(name))
        secs = write_wav(out / f"{name}.wav", fn(rng))
        print(f"ok  {name + '.wav':11s} {secs:5.2f} s  → {out / (name + '.wav')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
