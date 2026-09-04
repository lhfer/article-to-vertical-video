#!/usr/bin/env python3
"""storyboard.py — article-to-vertical-video v2

content/*.json → a Markdown storyboard the user reviews before TTS / render, plus rhythm metrics.

    python3 storyboard.py <project_dir> [--out out/storyboard.md] [--json out/storyboard.json]

Table columns: # | 时间 | 场景 | 画面 | 屏幕文字 | 旁白 | 音效/转场 | 情绪 — one row per beat (chapter cards included).
Timing mirrors scripts/lint_content.mjs fitBeat() and the template's fitSeconds: VO (narration-durations.json,
else chars / 8.4) + 0.25 lead + 0.5 tail; chapter card 0.8 s (m) / 1.4 s (l) / none (xs, s); clips always play
their (to − from) / rate footage, slowed down to rate 0.75 when the voice is longer; clamped by minSeconds / maxSeconds.
--json writes the same metrics plus beats: [{id, kind, start, seconds, energy, short, vo}] (consumed by make_bgm.py --energy).
Exit 0 unless a required file is missing or not valid JSON (exit 1). Python 3 stdlib only.
"""
import argparse
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------- constants (keep in sync with lint_content.mjs)
CHARS_PER_SECOND = 8.4
VO_LEAD, VO_TAIL = 0.25, 0.5
LEAD_TAIL = VO_LEAD + VO_TAIL
RATE_FLOOR = 0.75
DEAD_AIR_SECONDS = 1.2
CHAPTER_CARD_SECONDS = {"xs": 0.0, "s": 0.0, "m": 0.8, "l": 1.4}
MAX_SECONDS_NO_VO = {"xs": 4, "s": 6, "m": 10, "l": 14}
BASE_SECONDS_BY_KIND = {"hook": 3, "promise": 4, "bench": 6, "kinetic": 3, "quote": 4, "steps": 5, "image": 4, "screenshot": 4,
                        "scorecard": 5, "take": 4, "broll": 4, "summary": 5, "cta": 4, "outro": 5}
EVENT_INTERVAL_TARGET = {"xs": 2, "s": 3, "m": 6, "l": 8}  # longest allowed gap between visual events, seconds
TURN_WINDOW = (35, 75)  # % of runtime
DEFAULT_SFX = {"hook": "riser", "chapter": "whoosh", "bench": "tick", "clip": "whoosh", "kinetic": "hit", "take": "hit", "summary": "whoosh"}
DEFAULT_ENERGY = {"hook": 5, "chapter": 4, "bench": 4, "clip": 3, "take": 3, "summary": 2, "cta": 2, "outro": 2}
KIND_LABEL = {"hook": "开场", "promise": "承诺", "chapter": "章节卡", "bench": "对决图", "clip": "片段", "kinetic": "大字", "quote": "引言",
              "steps": "步骤", "image": "图片", "screenshot": "截图", "scorecard": "计分卡", "take": "观点", "broll": "B-roll",
              "summary": "总结卡", "cta": "提问", "outro": "结尾"}


def tier_of(target_seconds):
    return "xs" if target_seconds <= 30 else "s" if target_seconds <= 90 else "m" if target_seconds <= 240 else "l"


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def narr_len(s):
    """Code points excluding whitespace (same as lint narrLen)."""
    return sum(1 for ch in str(s or "") if not ch.isspace() and ch != "\u3000")


def weighted_len(s):
    """CJK / full-width 1, ASCII 0.6, whitespace 0 (same as lint weightedLen)."""
    n = 0.0
    for ch in str(s or ""):
        if ch.isspace() or ch == "\u3000":
            continue
        n += 0.6 if 0x21 <= ord(ch) <= 0x7E else 1.0
    return round(n, 1)


def fit_beat(beat, tier, durations):
    """→ dict(seconds, vo, vo_source, footage, too_long). Mirrors lint_content.mjs fitBeat()."""
    kind = beat.get("kind")
    if kind == "chapter":
        return {"seconds": CHAPTER_CARD_SECONDS.get(tier, 0.0), "vo": 0.0, "vo_source": None, "footage": None, "too_long": False}
    dur = durations.get(beat.get("id")) if isinstance(durations, dict) else None
    chars = narr_len(beat.get("narration"))
    vo, vo_source = 0.0, None
    if is_num(dur):
        vo, vo_source = float(dur), "duration"
    elif chars > 0:
        vo, vo_source = chars / CHARS_PER_SECOND, "estimate"
    if vo > 0:
        seconds = vo + LEAD_TAIL
    else:
        base = BASE_SECONDS_BY_KIND.get(kind, 4)
        if kind == "bench" and isinstance(beat.get("bench"), dict) and beat["bench"].get("mode") == "table":
            base = 1.5
        seconds = min(base, MAX_SECONDS_NO_VO.get(tier, 10))
    footage, too_long = None, False
    clip = beat.get("clip")
    if kind == "clip" and isinstance(clip, dict) and is_num(clip.get("from")) and is_num(clip.get("to")) and clip["to"] > clip["from"]:
        rate = clip.get("rate") if is_num(clip.get("rate")) and clip.get("rate") > 0 else 1
        footage = (clip["to"] - clip["from"]) / rate
        too_long = vo > (clip["to"] - clip["from"]) / RATE_FLOOR
        seconds = max(seconds, footage)
    if is_num(beat.get("minSeconds")):
        seconds = max(seconds, beat["minSeconds"])
    if is_num(beat.get("maxSeconds")):
        seconds = min(seconds, beat["maxSeconds"])
    return {"seconds": seconds, "vo": vo, "vo_source": vo_source, "footage": footage, "too_long": too_long}


# ---------------------------------------------------------------- formatting helpers
def cell(s):
    """Make a string safe inside a Markdown table cell."""
    return str(s if s is not None else "").replace("|", "｜").replace("\n", " ").replace("\r", " ").strip()


def fmt_s(x):
    return f"{x:.1f}".rstrip("0").rstrip(".") if x is not None else "–"


def mmss(sec):
    sec = max(0, int(round(sec)))
    return f"{sec // 60}:{sec % 60:02d}"


def fmt_value(v, unit):
    if not is_num(v):
        return "–"
    s = str(int(v)) if float(v).is_integer() else f"{v:g}"
    unit = unit or ""
    return f"{unit}{s}" if unit.strip() in ("$", "US$", "¥", "￥") else f"{s}{unit}"


def rect(r):
    if isinstance(r, dict) and all(is_num(r.get(k)) for k in ("x", "y", "w", "h")):
        return f"({fmt_s(r['x'])},{fmt_s(r['y'])} {fmt_s(r['w'])}×{fmt_s(r['h'])})"
    return ""


def describe_bench(payload, bench):
    tables = (bench or {}).get("tables") if isinstance(bench, dict) else None
    hero = (bench or {}).get("hero") if isinstance(bench, dict) else None
    mode = payload.get("mode", "duel")
    parts = []
    for key in payload.get("tables") or []:
        t = tables.get(key) if isinstance(tables, dict) else None
        if not isinstance(t, dict):
            parts.append(f"{key}（bench.json 里没有）")
            continue
        unit = t.get("unit", "")
        rows = [r for r in (t.get("rows") or []) if isinstance(r, dict) and is_num(r.get("value"))]
        hero_row = next((r for r in rows if r.get("model") == hero), None)
        others = [r for r in rows if r is not hero_row]
        lower = bool(t.get("lowerIsBetter"))
        best = (min if lower else max)(others, key=lambda r: r["value"]) if others else None
        name = t.get("name", key)
        if mode == "table":
            parts.append(f"全表闪现：{name} {len(rows)} 行")
        elif hero_row and best:
            parts.append(f"{name} 主角 {fmt_value(hero_row['value'], unit)} vs {best.get('model')} {fmt_value(best['value'], unit)}")
        elif hero_row:
            parts.append(f"{name} 主角 {fmt_value(hero_row['value'], unit)}")
        else:
            parts.append(f"{name} {len(rows)} 行（无主角行）")
    head = payload.get("heading")
    return f"对决图：{' · '.join(parts)}" + (f" ｢{head}｣" if head else "") if parts else "对决图（未引用表）"


def describe_visual(beat, bench, fit, chapters_by_id):
    kind = beat.get("kind")
    p = beat.get(kind) if isinstance(beat.get(kind), dict) else {}
    if kind == "chapter":
        ch = chapters_by_id.get(beat.get("chapter"), {})
        sub = f"（{ch['sub']}）" if ch.get("sub") else ""
        return f"章节卡 {ch.get('num', '')}「{ch.get('title', beat.get('chapter', '?'))}」{sub}"
    if kind == "hook":
        v = p.get("visual") or {}
        vis = v.get("kind", "text")
        if v.get("src"):
            vis += f" {v['src']}"
            if is_num(v.get("from")) and is_num(v.get("to")):
                vis += f" {fmt_s(v['from'])}–{fmt_s(v['to'])} s"
        return f"开场：「{p.get('text', '')}」" + (f" / {p['sub']}" if p.get("sub") else "") + f" · 视觉 {vis}"
    if kind == "promise":
        items = p.get("items") or []
        return f"承诺：「{p.get('text', '')}」" + (f" · 目录 {' / '.join(map(str, items))}" if items else "")
    if kind == "bench":
        return describe_bench(p, bench)
    if kind == "clip":
        s = f"片段 {p.get('src', '?')}"
        if is_num(p.get("from")) and is_num(p.get("to")):
            s += f" {fmt_s(p['from'])}–{fmt_s(p['to'])} s"
        if is_num(p.get("rate")):
            s += f" ×{p['rate']:g}"
        if fit.get("footage") is not None and fit["vo"] > 0 and fit["vo"] + LEAD_TAIL > fit["footage"] + 1e-9:
            eff = (p["to"] - p["from"]) / (fit["vo"] + LEAD_TAIL)
            s += f" → 放慢至 ×{max(eff, RATE_FLOOR):.2f}" + ("（旁白太长！）" if fit["too_long"] else "")
        if p.get("focus"):
            s += f" 焦点{rect(p['focus'])}"
        if is_num(p.get("resultAt")):
            s += f" 结果点@{fmt_s(p['resultAt'])}s"
        if p.get("tag"):
            s += f" ｢{p['tag']}｣"
        return s
    if kind == "kinetic":
        return f"大字：「{p.get('text', '')}」" + (f" / {p['sub']}" if p.get("sub") else "")
    if kind == "quote":
        return f"引言：「{p.get('text', '')}」— {p.get('by', '')}"
    if kind == "steps":
        return f"步骤：{p.get('title', '')} · " + " → ".join(map(str, p.get("items") or []))
    if kind == "image":
        return f"图片 {p.get('src', '?')}" + (f" 焦点{rect(p['focus'])}" if p.get("focus") else "") + (f" ｢{p['caption']}｣" if p.get("caption") else "")
    if kind == "screenshot":
        return f"截图 {p.get('src', '?')} 高亮{rect(p.get('highlight'))} ｢{p.get('label', '')}｣"
    if kind == "scorecard":
        rows = " · ".join(f"{r.get('label', '')} {fmt_value(r.get('value'), r.get('unit', ''))}" for r in (p.get("rows") or []) if isinstance(r, dict))
        return f"计分卡：{p.get('title', '')} · {rows}"
    if kind == "take":
        return f"观点卡：「{p.get('text', '')}」" + (f"（来源 {p['source']}）" if p.get("source") else "")
    if kind == "broll":
        return f"B-roll {p.get('src', '?')}" + (f" ｢{p['caption']}｣" if p.get("caption") else "")
    if kind == "summary":
        return f"总结卡：{p.get('title', '')} · " + " / ".join(map(str, p.get("items") or []))
    if kind == "cta":
        return f"提问：「{p.get('question', '')}」" + (f" / {p['sub']}" if p.get("sub") else "")
    if kind == "outro":
        return "结尾：" + " / ".join(map(str, p.get("lines") or []))
    return f"{kind}（未知类型）"


def screen_text(beat):
    parts = []
    for ln in beat.get("lines") or []:
        if not isinstance(ln, dict):
            continue
        text = str(ln.get("text", ""))
        hot = ln.get("hot") or []
        if isinstance(hot, list) and len(hot) == 1 and isinstance(hot[0], str) and hot[0] and hot[0] in text:
            text = text.replace(hot[0], f"**{hot[0]}**", 1)
        parts.append(text + ("（观点）" if ln.get("kind") == "take" else ""))
    for c in beat.get("cards") or []:
        if not isinstance(c, dict):
            continue
        k = c.get("kind")
        if k == "stat":
            s = f"{c.get('label', '')} {fmt_value(c.get('value'), c.get('unit', ''))}"
            if is_num(c.get("prev")):
                s += f"（{c.get('prevLabel', '上代')} {fmt_value(c['prev'], c.get('unit', ''))}）"
        else:
            s = str(c.get("text", ""))
        parts.append(f"[卡{k or ''} @{fmt_s(c.get('t'))}s] {s}")
    return " / ".join(parts)


def sfx_transition(beat):
    kind = beat.get("kind")
    sfx = beat.get("sfx") or DEFAULT_SFX.get(kind, "none")
    return f"{sfx} / {beat.get('transition') or '模板'}"


def energy_of(beat):
    e = beat.get("energy")
    if is_num(e) and 1 <= e <= 5:
        return int(e)
    return DEFAULT_ENERGY.get(beat.get("kind"), 3)


# ---------------------------------------------------------------- build
def load_json(path, required):
    if not path.exists():
        if required:
            sys.exit(f"storyboard: 缺少必需文件 {path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except (OSError, ValueError) as e:
        sys.exit(f"storyboard: {path} 不是合法 JSON：{e}")


def build(project_dir: Path):
    content = project_dir / "content"
    brief = load_json(content / "brief.json", True)
    script = load_json(content / "script.json", True)
    bench = load_json(content / "bench.json", False)
    durations = load_json(content / "narration-durations.json", False)
    if not isinstance(brief, dict) or not isinstance(script, dict) or not isinstance(script.get("beats"), list):
        sys.exit("storyboard: brief.json 须为对象，script.json 须含 beats 数组")
    has_durations = isinstance(durations, dict) and len(durations) > 0  # an empty {} placeholder = TTS not run yet
    durations = durations if has_durations else {}
    target = brief.get("targetSeconds") if is_num(brief.get("targetSeconds")) else None
    tier = brief.get("tier") if brief.get("tier") in CHAPTER_CARD_SECONDS else (tier_of(target) if target is not None else "m")
    beats = [b for b in script["beats"] if isinstance(b, dict)]
    chapters = [c for c in (script.get("chapters") or []) if isinstance(c, dict)]
    chapters_by_id = {c.get("id"): c for c in chapters}

    rows, events, timeline = [], [], []
    t = 0.0
    for i, b in enumerate(beats):
        fit = fit_beat(b, tier, durations)
        sec, vo = fit["seconds"], fit["vo"]
        kind = b.get("kind", "?")
        bid = b.get("id") or f"#{i + 1}"
        short = bool(b.get("short")) and kind != "chapter"
        timeline.append({"id": bid, "kind": kind, "start": round(t, 2), "seconds": round(sec, 2), "energy": energy_of(b), "short": short, "vo": round(vo, 2)})
        # visual events: beat start, each caption line start, each card start
        if sec > 0:
            events.append((t, f"{bid} 开始"))
        lines = [ln for ln in (b.get("lines") or []) if isinstance(ln, dict)]
        if lines and sec > 0:
            if vo > 0:
                total_w = sum(max(weighted_len(ln.get("text")), 0.1) for ln in lines)
                cum = 0.0
                for ln in lines:
                    events.append((t + VO_LEAD + vo * cum / total_w, f"{bid} 字幕"))
                    cum += max(weighted_len(ln.get("text")), 0.1)
            else:
                for j, ln in enumerate(lines):
                    start = ln["t"] if is_num(ln.get("t")) else sec * j / len(lines)
                    events.append((t + min(start, sec), f"{bid} 字幕"))
        for c in b.get("cards") or []:
            if isinstance(c, dict) and is_num(c.get("t")) and sec > 0:
                events.append((t + min(c["t"], sec), f"{bid} 卡片"))
        # list-like payloads reveal one item at a time (steps / summary / promise 目录 / outro lines)
        payload = b.get(kind) if isinstance(b.get(kind), dict) else {}
        items = payload.get("lines" if kind == "outro" else "rows" if kind == "scorecard" else "items") if kind in ("steps", "summary", "promise", "outro", "scorecard") else None
        if isinstance(items, list) and len(items) > 1 and sec > 0:
            span = vo if vo > 0 else sec
            for j in range(1, len(items)):
                events.append((t + VO_LEAD + span * j / len(items), f"{bid} 第 {j + 1} 项"))
        scene = f"{kind} `{bid}`"
        if b.get("role") == "turn":
            scene += " ★转折"
        elif b.get("role"):
            scene += f" ({b['role']})"
        if short:
            scene += " 短"
        if kind == "chapter" and sec == 0:
            scene += "（本档不显示）"
        time_col = f"{mmss(t)}–{mmss(t + sec)} ({fmt_s(sec)} s)"
        if vo > 0:
            time_col += f"<br>配音 {fmt_s(vo)} s" + ("" if fit["vo_source"] == "duration" else "*")
        rows.append([str(i + 1), time_col, scene, describe_visual(b, bench, fit, chapters_by_id), screen_text(b),
                     b.get("narration", "") or ("—" if kind != "chapter" else ""), sfx_transition(b), f"{energy_of(b)} " + "●" * energy_of(b) + "○" * (5 - energy_of(b))])
        t += sec
    total = t
    events.append((total, "结束"))

    # ---- metrics
    by_kind = {}
    for e in timeline:
        by_kind[e["kind"]] = by_kind.get(e["kind"], 0.0) + e["seconds"]
    share = [{"kind": k, "seconds": round(v, 1), "pct": round(100 * v / total, 1) if total else 0.0} for k, v in sorted(by_kind.items(), key=lambda kv: -kv[1])]
    dead_air = []
    if has_durations:
        for b, e in zip(beats, timeline):
            if e["kind"] == "chapter":
                continue
            gap = e["seconds"] - e["vo"]
            if gap > DEAD_AIR_SECONDS:
                dead_air.append({"id": e["id"], "seconds": e["seconds"], "vo": e["vo"], "gap": round(gap, 1), "why": "没有旁白" if e["vo"] <= 0 else "素材比旁白长"})
    events.sort(key=lambda x: x[0])
    longest = {"gap": 0.0, "at": 0.0, "after": ""}
    for (a, la), (bb, _) in zip(events, events[1:]):
        if bb - a > longest["gap"]:
            longest = {"gap": round(bb - a, 1), "at": round(a, 1), "after": la}
    turn = next((e for b, e in zip(beats, timeline) if b.get("role") == "turn"), None)
    turn_pct = round(100 * turn["start"] / total, 1) if turn and total else None
    short_beats = [e for e in timeline if e["short"]]
    short_total = round(sum(e["seconds"] for e in short_beats), 1)
    short_cfg = brief.get("shortVersion") if isinstance(brief.get("shortVersion"), dict) else {}
    short_target = short_cfg.get("targetSeconds") if is_num(short_cfg.get("targetSeconds")) else None
    missing_narration = [e["id"] for b, e in zip(beats, timeline) if e["kind"] != "chapter" and not str(b.get("narration") or "").strip()]
    missing_durations = [e["id"] for b, e in zip(beats, timeline) if has_durations and str(b.get("narration") or "").strip() and not is_num(durations.get(b.get("id")))]
    chapter_rows = []
    for c in chapters:
        members = [e for b, e in zip(beats, timeline) if b.get("chapter") == c.get("id")]
        chapter_rows.append({"id": c.get("id"), "num": c.get("num"), "title": c.get("title"), "beats": len([m for m in members if m["kind"] != "chapter"]),
                             "seconds": round(sum(m["seconds"] for m in members), 1), "start": members[0]["start"] if members else None})
    too_long = [e["id"] for b, e in zip(beats, timeline) if fit_beat(b, tier, durations)["too_long"]]
    metrics = {
        "tier": tier, "targetSeconds": target, "totalSeconds": round(total, 1),
        "totalPct": round(100 * total / target, 1) if target else None,
        "timingSource": "narration-durations.json" if has_durations else "估算（字数 / 8.4）",
        "share": share, "deadAir": dead_air, "deadAirThreshold": DEAD_AIR_SECONDS,
        "longestEventGap": longest, "eventGapTarget": EVENT_INTERVAL_TARGET.get(tier, 6),
        "turn": {"id": turn["id"], "start": turn["start"], "pct": turn_pct} if turn else None, "turnWindowPct": list(TURN_WINDOW),
        "short": {"beats": len(short_beats), "ids": [e["id"] for e in short_beats], "seconds": short_total, "targetSeconds": short_target,
                  "pct": round(100 * short_total / short_target, 1) if short_target else None},
        "missingNarration": missing_narration, "missingDurations": missing_durations, "voTooLong": too_long, "chapters": chapter_rows,
    }
    return rows, timeline, metrics, brief, script


def render_md(project_dir, rows, metrics, brief, script):
    meta = script.get("meta") if isinstance(script.get("meta"), dict) else {}
    out = [f"# 分镜表 · {meta.get('brand', '')} {meta.get('brandAccent', '')}".rstrip(), ""]
    out.append(f"项目 `{project_dir}` · 档位 **{metrics['tier']}** · 目标 {metrics['targetSeconds'] or '–'} s · 时长来源：{metrics['timingSource']}"
               + ("" if metrics["timingSource"].startswith("narration") else "（带 * 的配音秒数为估算）"))
    out.append("")
    out.append("| # | 时间 | 场景 | 画面 | 屏幕文字 | 旁白 | 音效/转场 | 情绪 |")
    out.append("|---|---|---|---|---|---|---|---|")
    for r in rows:
        out.append("| " + " | ".join(cell(x) for x in r) + " |")
    out.append("")
    out.append("## 节奏指标")
    out.append("")
    tp = f"（目标 {metrics['targetSeconds']} s，{metrics['totalPct']}%）" if metrics["targetSeconds"] else ""
    out.append(f"- 预计总时长：**{metrics['totalSeconds']} s**{tp}")
    out.append("- 各类型占比：" + " · ".join(f"{s['kind']} {s['seconds']} s（{s['pct']}%）" for s in metrics["share"]))
    if metrics["timingSource"].startswith("narration"):
        da = metrics["deadAir"]
        out.append(f"- 空白（画面 − 配音 > {metrics['deadAirThreshold']} s）：**{len(da)} 处**" + ("" if not da else " — " + "；".join(f"`{d['id']}` 画面 {d['seconds']} s / 配音 {d['vo']} s，空 {d['gap']} s（{d['why']}）" for d in da)))
    else:
        out.append("- 空白：需要 narration-durations.json（先跑 tts_seed2.py）才能计算")
    lg = metrics["longestEventGap"]
    ok = lg["gap"] <= metrics["eventGapTarget"]
    out.append(f"- 视觉事件最长间隔：**{lg['gap']} s**（{metrics['tier']} 档目标 ≤ {metrics['eventGapTarget']} s）{'✓' if ok else '✗'} · 出现在 {mmss(lg['at'])}，{lg['after']} 之后")
    if metrics["turn"]:
        tw = metrics["turnWindowPct"]
        t_ok = tw[0] <= metrics["turn"]["pct"] <= tw[1]
        out.append(f"- 转折位置：**{metrics['turn']['pct']}%**（目标 {tw[0]}–{tw[1]}%）{'✓' if t_ok else '✗'} · `{metrics['turn']['id']}` @ {mmss(metrics['turn']['start'])}")
    else:
        out.append(f"- 转折位置：无 role=turn 的 beat（{metrics['tier']} 档" + ("需要恰好一个）" if metrics["tier"] in ("m", "l") else "可选）"))
    sh = metrics["short"]
    st = f"（目标 {sh['targetSeconds']} s，{sh['pct']}%）" if sh["targetSeconds"] else ""
    out.append(f"- 短版：{sh['beats']} 个 beat，**{sh['seconds']} s**{st}" + (f" · {', '.join('`' + i + '`' for i in sh['ids'])}" if sh["ids"] else ""))
    out.append("- 缺旁白的 beat：" + (", ".join(f"`{i}`" for i in metrics["missingNarration"]) if metrics["missingNarration"] else "无"))
    if metrics["missingDurations"]:
        out.append("- 有旁白但缺配音时长：" + ", ".join(f"`{i}`" for i in metrics["missingDurations"]))
    if metrics["voTooLong"]:
        out.append("- 旁白太长（素材放慢到 0.75× 也盖不住）：" + ", ".join(f"`{i}`" for i in metrics["voTooLong"]))
    if metrics["chapters"]:
        out.append("- 章节：" + " · ".join(f"{c['num'] or ''}「{c['title']}」`{c['id']}` {c['beats']} beats {c['seconds']} s" + (f" @ {mmss(c['start'])}" if c["start"] is not None else "") for c in metrics["chapters"]))
    else:
        out.append("- 章节：无")
    out.append("")
    return "\n".join(out) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(prog="storyboard.py", description="content/*.json → Markdown 分镜表 + 节奏指标（时长模型与 lint_content.mjs 一致）",
                                 epilog="退出码：0 正常；1 缺文件 / JSON 非法。--json 的 beats[] 字段 {id, kind, start, seconds, energy, short, vo} 供 make_bgm.py --energy 使用。")
    ap.add_argument("project_dir", help="含 content/{brief,script}.json（可选 bench.json、narration-durations.json）的项目目录")
    ap.add_argument("--out", help="写出 Markdown 的路径（默认打印到 stdout）")
    ap.add_argument("--json", dest="json_out", help="同时写出指标 JSON 的路径")
    args = ap.parse_args(argv)
    project_dir = Path(args.project_dir).resolve()
    if not (project_dir / "content").is_dir():
        sys.exit(f"storyboard: 找不到目录 {project_dir / 'content'}")
    rows, timeline, metrics, brief, script = build(project_dir)
    md = render_md(project_dir, rows, metrics, brief, script)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(md, encoding="utf8")
        print(f"storyboard → {args.out}（{len(rows)} 行，预计 {metrics['totalSeconds']} s）")
    else:
        sys.stdout.write(md)
    if args.json_out:
        Path(args.json_out).parent.mkdir(parents=True, exist_ok=True)
        payload = {"project": str(project_dir), **metrics, "beats": timeline}
        Path(args.json_out).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        print(f"metrics → {args.json_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
