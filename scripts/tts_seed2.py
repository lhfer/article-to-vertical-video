#!/usr/bin/env python3
"""tts_seed2.py — voice-over with Doubao Seed-TTS 2.0 (unidirectional HTTP), one mp3 per beat.

Usage: tts_seed2.py <project_dir> [--speaker ID] [--rate N] [--style "..."] [--force] [--only id1,id2]
                                  [--dry-run] [--json]
       tts_seed2.py --sample "一句话试听" --out sample.mp3 [--speaker ID] [--rate N] [--style "..."] [--dry-run]

Reads   <project_dir>/content/script.json   beats[].narration (beats without narration are skipped)
        <project_dir>/content/brief.json    tts defaults: {"tts": {"speaker", "rate", "style"}} (CLI flags win);
                                            persona.voiceStyle is used as the style when tts.style is absent
Writes  <project_dir>/public/narration/<id>.mp3
        <project_dir>/content/narration-durations.json   {"<id>": seconds} — only ids present in script.json
        <project_dir>/public/narration/index.json        text/voice fingerprint per id (re-synthesises changed lines)
Needs   SEED_AUDIO_KEY in the environment (X-Api-Key from 火山引擎 豆包语音) — not for --dry-run / --sample --dry-run.
Defaults: speaker zh_male_qingshuangnanda_uranus_bigtts (清爽男大 2.0), speech_rate 28 (≈ 8.4 chars/s),
          casual first-person social-media style via additions.context_texts. The speaker is locked by ID.
--force    re-synthesise everything and delete mp3s of ids that are no longer in the script
--only     comma-separated ids to (re)synthesise; others keep their existing mp3
--dry-run  no API call: silent mp3s whose length is the character-count estimate (≥ 1 s), so previews keep
           realistic scene lengths; the durations file is written the same way
--json     machine-readable summary on stdout (human lines go to stderr)
"""
import base64
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

DEFAULT_SPEAKER = "zh_male_qingshuangnanda_uranus_bigtts"
DEFAULT_RATE = 28
DEFAULT_STYLE = "青春活泼的大学生男生口吻，像在跟同学第一人称分享刚看到的新鲜事，语速快、有起伏、带着笑意和兴奋感，随意自然"
ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE_ID = "seed-tts-2.0"
KEY_HINT = "SEED_AUDIO_KEY not set. export SEED_AUDIO_KEY=…  or:  set -a; source config.env; set +a"

JSON_MODE = False


def log(*a):
    print(*a, file=sys.stderr if JSON_MODE else sys.stdout, flush=True)


def die(msg, code=1):
    print(f"tts_seed2.py: {msg}", file=sys.stderr)
    sys.exit(code)


def chars_per_second(rate):
    """Observed Seed-TTS 2.0 pace for zh: rate 0 ≈ 6.6, 20 ≈ 8.0, 28 ≈ 8.4, 35 ≈ 10 chars/s (linear between)."""
    pts = [(-50, 4.5), (0, 6.6), (20, 8.0), (28, 8.4), (35, 10.0), (100, 14.0)]
    for (r0, c0), (r1, c1) in zip(pts, pts[1:]):
        if r0 <= rate <= r1:
            return c0 + (c1 - c0) * (rate - r0) / (r1 - r0)
    return 8.4


def spoken_chars(text):
    return sum(1 for ch in text if not ch.isspace() and ch not in "，。！？、；：“”‘’（）《》——…,.!?;:()\"'-")


def ffprobe_seconds(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode().strip()
    return round(float(out), 3)


# ------------------------------------------------------------------ Seed-TTS 2.0 (kept verbatim from v1)
def tts(text, dst, key, speaker, rate, style):
    body = {"user": {"uid": "vertical-video"}, "req_params": {"text": text, "speaker": speaker,
            "audio_params": {"format": "mp3", "sample_rate": 48000, "speech_rate": rate},
            "additions": json.dumps({"context_texts": [style]}, ensure_ascii=False)}}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "X-Api-Key": key, "X-Api-Resource-Id": RESOURCE_ID, "X-Api-Request-Id": str(uuid.uuid4())})
    raw = None
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
            break
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: {e.read()[:300]}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == 2:
                sys.exit(f"network error for {dst.stem}: {e}")
            log(f"  retry {dst.stem}: {e}")
    audio = b""
    for line in raw.split(b"\n"):
        if line.strip():
            j = json.loads(line)
            if j.get("code") not in (0, 20000000): sys.exit(f"TTS error for {dst.stem}: {j}")
            if j.get("data"): audio += base64.b64decode(j["data"])
    if not audio: sys.exit(f"no audio for {dst.stem}: {raw[:300]}")
    dst.write_bytes(audio)


def silent_mp3(dst, seconds):
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", f"{seconds:.3f}",
                           "-c:a", "libmp3lame", "-b:a", "64k", str(dst)])


def fingerprint(text, speaker, rate, style, dry):
    return hashlib.sha1(f"{text}\x1f{speaker}\x1f{rate}\x1f{style}\x1f{'dry' if dry else 'seed2'}".encode()).hexdigest()[:16]


# ------------------------------------------------------------------ main
def main(argv):
    global JSON_MODE
    args = list(argv)
    if not args or "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0 if args else 2
    opts = {"--speaker": None, "--rate": None, "--style": None, "--only": None, "--sample": None, "--out": None}
    force = dry = False
    pos = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in opts:
            if i + 1 >= len(args):
                die(f"{a} needs a value", 2)
            opts[a] = args[i + 1]
            i += 1
        elif a == "--force":
            force = True
        elif a == "--dry-run":
            dry = True
        elif a == "--json":
            JSON_MODE = True
        elif a.startswith("-"):
            die(f"unknown option {a}", 2)
        else:
            pos.append(a)
        i += 1

    proj = pathlib.Path(pos[0]).resolve() if pos else None
    brief = {}
    if proj and (proj / "content/brief.json").is_file():
        try:
            brief = json.load(open(proj / "content/brief.json", encoding="utf-8"))
        except json.JSONDecodeError as e:
            die(f"content/brief.json is not valid JSON: {e}")
    btts = brief.get("tts") or {}
    speaker = opts["--speaker"] or btts.get("speaker") or DEFAULT_SPEAKER
    try:
        rate = int(opts["--rate"]) if opts["--rate"] is not None else int(btts.get("rate", DEFAULT_RATE))
    except ValueError:
        die("--rate must be an integer (-50..100)", 2)
    style = opts["--style"] or btts.get("style") or (brief.get("persona") or {}).get("voiceStyle") or DEFAULT_STYLE
    if btts.get("provider") not in (None, "seed2"):
        log(f"warn: brief.tts.provider is {btts.get('provider')!r}; synthesising with Seed-TTS 2.0 anyway")

    key = os.environ.get("SEED_AUDIO_KEY")
    if not dry and not key:
        die(KEY_HINT, 3)

    # --- one-off sample: never touches the project
    if opts["--sample"] is not None:
        out = pathlib.Path(opts["--out"] or "sample.mp3")
        out.parent.mkdir(parents=True, exist_ok=True)
        text = opts["--sample"]
        if dry:
            silent_mp3(out, max(1.0, spoken_chars(text) / chars_per_second(rate)))
        else:
            tts(text, out, key, speaker, rate, style)
        secs = ffprobe_seconds(out)
        log(f"ok  sample {secs:.1f}s  {spoken_chars(text)} chars  {spoken_chars(text) / secs if secs else 0:.1f} chars/s  → {out}")
        if JSON_MODE:
            print(json.dumps({"ok": True, "mode": "dry-run" if dry else "seed2", "speaker": speaker, "rate": rate, "out": str(out), "seconds": secs}, ensure_ascii=False))
        return 0

    if not proj:
        die("usage: tts_seed2.py <project_dir> [options]   |   tts_seed2.py --sample \"text\" --out sample.mp3", 2)
    script_path = proj / "content/script.json"
    if not script_path.is_file():
        die(f"{script_path} not found (v2 reads content/script.json; v1's narration.json is no longer used)", 2)
    try:
        script = json.load(open(script_path, encoding="utf-8"))
    except json.JSONDecodeError as e:
        die(f"content/script.json is not valid JSON: {e}")
    beats = script.get("beats") or []
    lines = []
    for b in beats:
        text = (b.get("narration") or "").strip()
        if not b.get("id") or not text:
            continue
        lines.append((b["id"], text))
    if not lines:
        die("no beat has a narration field — nothing to synthesise", 1)
    ids = [i for i, _ in lines]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        die(f"duplicate beat ids in script.json: {sorted(dup)}")
    only = [s.strip() for s in opts["--only"].split(",") if s.strip()] if opts["--only"] else None
    if only:
        unknown = [o for o in only if o not in ids]
        if unknown:
            die(f"--only ids not in script.json (or without narration): {unknown}", 2)

    out_dir = proj / "public/narration"
    out_dir.mkdir(parents=True, exist_ok=True)
    (proj / "content").mkdir(parents=True, exist_ok=True)
    index_path = out_dir / "index.json"
    try:
        index = json.load(open(index_path, encoding="utf-8")) if index_path.is_file() else {}
    except json.JSONDecodeError:
        index = {}

    generated, kept, cps = [], [], chars_per_second(rate)
    for id_, text in lines:
        dst = out_dir / f"{id_}.mp3"
        fp = fingerprint(text, speaker, rate, style, dry)
        if only is not None and id_ not in only:
            if dst.exists():
                kept.append(id_)
            continue
        if dst.exists() and not force and index.get(id_) == fp:
            kept.append(id_)
            continue
        if dst.exists() and not force and index.get(id_) is None:
            # mp3 from before fingerprints existed: keep it (v1 behaviour); --force regenerates
            kept.append(id_)
            index[id_] = fp
            continue
        if dry:
            silent_mp3(dst, max(1.0, spoken_chars(text) / cps))
        else:
            tts(text, dst, key, speaker, rate, style)
        index[id_] = fp
        generated.append(id_)
        log(f"{'dry' if dry else 'ok '} {id_:14s} {spoken_chars(text):4d} chars")

    # stale mp3s: ids no longer in the script
    stale = sorted(p.stem for p in out_dir.glob("*.mp3") if p.stem not in ids)
    if stale:
        if force:
            for s in stale:
                (out_dir / f"{s}.mp3").unlink()
                index.pop(s, None)
            log(f"removed stale narration: {', '.join(stale)}")
        else:
            log(f"warn: stale narration mp3s not in script.json (delete with --force): {', '.join(stale)}")

    durations = {}
    for id_, text in lines:
        dst = out_dir / f"{id_}.mp3"
        if dst.exists():
            durations[id_] = ffprobe_seconds(dst)
    json.dump(durations, open(proj / "content/narration-durations.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    json.dump({k: v for k, v in index.items() if k in ids}, open(index_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    total = 0.0
    log(f"{'id':14s} {'sec':>6s}  chars/s")
    for id_, text in lines:
        if id_ not in durations:
            log(f"{id_:14s}      -  (no audio)")
            continue
        d = durations[id_]
        total += d
        n = spoken_chars(text)
        log(f"{id_:14s} {d:6.1f}  {n / d if d else 0:5.1f}{'  (estimated)' if dry else ''}")
    log(f"total {total:.1f}s across {len(durations)} beats · speaker {speaker} · rate {rate}{' · DRY RUN (silent mp3s)' if dry else ''} → {proj / 'content/narration-durations.json'}")
    if JSON_MODE:
        print(json.dumps({"ok": True, "mode": "dry-run" if dry else "seed2", "speaker": speaker, "rate": rate, "generated": generated, "kept": kept,
                          "stale": stale, "durations": durations, "total": round(total, 3),
                          "files": {"durations": str(proj / "content/narration-durations.json"), "dir": str(out_dir)}}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
