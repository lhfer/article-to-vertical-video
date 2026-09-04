#!/usr/bin/env python3
"""propose_trims.py — rank candidate highlight windows for every clip (scene changes + motion energy).

Usage: propose_trims.py <workdir> [--tier xs|s|m|l] [--clips DIR] [--json] [--help]
  reads   <workdir>/assets/clips.json (from download_media.sh); clips at <workdir>/project/public/<src>
          tier default: derived from project/content/brief.json targetSeconds when present, else m
  writes  <workdir>/assets/trims.json  { "01": [{from, to, resultAt, score, reasons: ["…"]}, …], … }
          up to 3 windows per clip, best first; times are source seconds at rate 1 (apply `rate` yourself);
          resultAt = the second with the strongest motion inside the window ("the moment the result appears")
  prints  a table (or the JSON with --json)

Window length by tier: xs 6 s · s 8 s · m 12 s · l 15 s. Windows never start inside the first 0.5 s.
Scoring: mean motion energy in the window (0..1, normalised per clip) + 0.35 when a scene change falls inside the
window's first second + 0.5 when the window contains the clip's global motion peak.
Analysis: `ffmpeg -vf "select='gt(scene,0.25)',showinfo"` for scene changes; `ffmpeg -vf fps=2,scale=160:-2,format=gray
-f rawvideo -` and mean absolute frame difference (pure Python) for the motion series.
"""
import json
import operator
import pathlib
import re
import subprocess
import sys

TIER_SECONDS = {"xs": 6.0, "s": 8.0, "m": 12.0, "l": 15.0}
SCENE_THRESHOLD = 0.25
FPS = 2                # motion samples per second
HEAD_SKIP = 0.5        # never start inside the first half second
SCENE_BONUS = 0.35
PEAK_BONUS = 0.5
MAX_WINDOWS = 3
MAX_OVERLAP = 0.4      # fraction of a window that may overlap an already chosen one


def die(msg, code=1):
    print(f"propose_trims.py: {msg}", file=sys.stderr)
    sys.exit(code)


def tier_of(seconds):
    return "xs" if seconds <= 30 else "s" if seconds <= 90 else "m" if seconds <= 240 else "l"


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                   "-show_entries", "format=duration", "-of", "json", str(path)], stderr=subprocess.DEVNULL).decode()
    j = json.loads(out)
    s = (j.get("streams") or [{}])[0]
    return int(s.get("width") or 0), int(s.get("height") or 0), float(j.get("format", {}).get("duration") or 0)


def scene_changes(path):
    """Timestamps (s) where ffmpeg's scene score exceeds SCENE_THRESHOLD."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-nostats", "-i", str(path), "-vf", f"select='gt(scene,{SCENE_THRESHOLD})',showinfo", "-an", "-f", "null", "-"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    times = [float(m.group(1)) for m in re.finditer(r"pts_time:\s*(-?\d+(?:\.\d+)?)", r.stderr.decode(errors="replace"))]
    return sorted(t for t in times if t >= 0)


def motion_series(path, w, h):
    """Mean absolute difference between consecutive gray frames sampled at FPS → [(second, energy 0..255)]."""
    tw = 160
    th = max(2, int(round(tw * (h / w) / 2)) * 2) if w and h else 90
    r = subprocess.run(["ffmpeg", "-v", "error", "-nostats", "-i", str(path), "-vf", f"fps={FPS},scale={tw}:{th},format=gray", "-f", "rawvideo", "-"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw = r.stdout
    size = tw * th
    n = len(raw) // size
    series = []
    prev = None
    for k in range(n):
        frame = raw[k * size:(k + 1) * size]
        if prev is not None:
            diff = sum(map(abs, map(operator.sub, frame, prev))) / size
            series.append((k / FPS, diff))
        prev = frame
    return series


def propose(series, scenes, duration, target):
    """→ list of windows {from, to, resultAt, score, reasons} sorted best first."""
    length = min(target, max(duration - HEAD_SKIP, 0.5)) if duration > 0 else target
    if duration <= 0:
        return []
    if duration <= target + HEAD_SKIP:  # too short to choose: take (almost) everything
        start = HEAD_SKIP if duration > HEAD_SKIP + 1.0 else 0.0
        win = {"from": round(start, 2), "to": round(duration, 2), "resultAt": None, "score": 0.0,
               "reasons": [f"素材只有 {duration:.1f} 秒，整段可用"]}
        if series:
            peak_t = max(series, key=lambda s: s[1])[0]
            win["resultAt"] = round(min(max(peak_t, start), duration), 2)
            win["reasons"].append(f"动作峰值在第 {peak_t:.1f} 秒")
        else:
            win["resultAt"] = round(start, 2)
        return [win]

    emax = max((e for _, e in series), default=0.0)
    norm = [(t, (e / emax if emax > 0 else 0.0)) for t, e in series]
    peak_t = max(norm, key=lambda s: s[1])[0] if norm and emax > 0 else None

    cands = []
    start = HEAD_SKIP
    step = 1.0 / FPS
    last_start = duration - length
    while start <= last_start + 1e-6:
        end = start + length
        inside = [(t, e) for t, e in norm if start <= t < end]
        mean_e = sum(e for _, e in inside) / len(inside) if inside else 0.0
        scene_in_head = next((s for s in scenes if start <= s <= start + 1.0), None)
        has_peak = peak_t is not None and start <= peak_t < end
        score = mean_e + (SCENE_BONUS if scene_in_head is not None else 0.0) + (PEAK_BONUS if has_peak else 0.0)
        result_at = max(inside, key=lambda s: s[1])[0] if inside and emax > 0 else start
        reasons = []
        if has_peak:
            reasons.append(f"包含全片动作峰值（第 {peak_t:.1f} 秒，结果出现的瞬间）")
        if scene_in_head is not None:
            reasons.append(f"开头 1 秒内有镜头切换（{scene_in_head:.1f} 秒），剪进来干净")
        if mean_e >= 0.6:
            reasons.append(f"动作最密集的一段（能量 {mean_e:.2f}）")
        elif mean_e >= 0.3:
            reasons.append(f"画面变化适中（能量 {mean_e:.2f}）")
        elif emax > 0:
            reasons.append(f"画面较静，适合叠字幕（能量 {mean_e:.2f}）")
        else:
            reasons.append("画面几乎静止，按位置均匀提议")
        cands.append({"from": round(start, 2), "to": round(end, 2), "resultAt": round(result_at, 2), "score": round(score, 3), "reasons": reasons})
        start += step

    cands.sort(key=lambda c: (-c["score"], c["from"]))
    chosen = []
    for c in cands:  # pass 1: (almost) non-overlapping windows
        if len(chosen) >= MAX_WINDOWS:
            break
        overlap = max((min(c["to"], o["to"]) - max(c["from"], o["from"]) for o in chosen), default=0.0)
        if overlap > MAX_OVERLAP * length:
            continue
        chosen.append(c)
    min_shift = max(1.0, 0.25 * length)
    for c in cands:  # pass 2: short clips cannot hold 3 disjoint windows → offer distinctly shifted alternatives
        if len(chosen) >= MAX_WINDOWS:
            break
        if all(abs(c["from"] - o["from"]) >= min_shift for o in chosen):
            chosen.append(c)
    chosen.sort(key=lambda c: (-c["score"], c["from"]))
    if emax == 0 and len(chosen) < MAX_WINDOWS:  # static clip: spread proposals along the timeline
        chosen = []
        for i in range(MAX_WINDOWS):
            s = HEAD_SKIP + i * max(0.0, (last_start - HEAD_SKIP)) / max(1, MAX_WINDOWS - 1)
            chosen.append({"from": round(s, 2), "to": round(s + length, 2), "resultAt": round(s, 2), "score": 0.0, "reasons": ["画面几乎静止，按位置均匀提议"]})
    return chosen


def main(argv):
    args = list(argv)
    if not args or "-h" in args or "--help" in args:
        print(__doc__.strip())
        return 0 if args else 2
    tier = None
    clips_dir = None
    as_json = False
    pos = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--json":
            as_json = True
        elif a == "--tier":
            i += 1
            tier = args[i] if i < len(args) else die("--tier needs xs|s|m|l", 2)
        elif a == "--clips":
            i += 1
            clips_dir = pathlib.Path(args[i]) if i < len(args) else die("--clips needs a directory", 2)
        elif a.startswith("-"):
            die(f"unknown option {a}", 2)
        else:
            pos.append(a)
        i += 1
    if len(pos) != 1:
        die("usage: propose_trims.py <workdir> [--tier xs|s|m|l] [--json]", 2)
    W = pathlib.Path(pos[0])
    assets = W / "assets"
    clips_json = assets / "clips.json"
    if not clips_json.is_file():
        die(f"{clips_json} not found — run download_media.sh first", 2)
    clips = json.load(open(clips_json, encoding="utf-8"))
    if tier is None:
        try:
            brief = json.load(open(W / "project/content/brief.json", encoding="utf-8"))
            tier = brief.get("tier") or tier_of(int(brief.get("targetSeconds", 200)))
        except (FileNotFoundError, json.JSONDecodeError, ValueError, TypeError):
            tier = "m"
    if tier not in TIER_SECONDS:
        die(f"unknown tier {tier!r} (xs|s|m|l)", 2)
    target = TIER_SECONDS[tier]
    public = W / "project/public"

    trims = {}
    rows = []
    for c in clips:
        key = f"{int(c['index']):02d}"
        path = (clips_dir / pathlib.Path(c["src"]).name) if clips_dir else (public / c["src"])
        if not path.is_file():
            print(f"warn: {path} missing, skipped", file=sys.stderr)
            continue
        try:
            w, h, dur = probe(path)
        except (subprocess.CalledProcessError, ValueError):
            print(f"warn: cannot probe {path}, skipped", file=sys.stderr)
            continue
        if not dur:
            dur = float(c.get("duration") or 0)
        scenes = scene_changes(path)
        series = motion_series(path, w or int(c.get("w") or 16), h or int(c.get("h") or 9))
        wins = propose(series, scenes, dur, target)
        trims[key] = wins
        rows.append((key, dur, len(scenes), wins, (c.get("alt") or c.get("title") or "")[:40]))

    assets.mkdir(parents=True, exist_ok=True)
    json.dump(trims, open(assets / "trims.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    if as_json:
        print(json.dumps(trims, ensure_ascii=False, indent=2))
    else:
        print(f"tier {tier} → window {target:.0f} s · {len(trims)} clips → {assets / 'trims.json'}")
        print(f"{'clip':4s} {'dur':>6s} {'scn':>3s} {'from':>6s} {'to':>6s} {'result':>6s} {'score':>5s}  reasons")
        for key, dur, ns, wins, label in rows:
            if not wins:
                print(f"{key:4s} {dur:6.1f} {ns:3d}   (no window)  {label}")
            for j, wn in enumerate(wins):
                ra = f"{wn['resultAt']:6.1f}" if wn.get("resultAt") is not None else "     -"
                print(f"{key if j == 0 else '':4s} {dur if j == 0 else 0:6.1f} {ns if j == 0 else 0:3d} {wn['from']:6.1f} {wn['to']:6.1f} {ra} {wn['score']:5.2f}  {'；'.join(wn['reasons'])}" + (f"  | {label}" if j == 0 and label else ""))
    return 0 if trims else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
