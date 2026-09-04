#!/usr/bin/env python3
"""media_provider.py — generated visuals for article-to-vertical-video.

Writes into <project>/public/gen/ and upserts <project>/public/gen/gen.json
([{id, kind: image|video, file, w, h, seconds?, prompt, provider, createdAt, ...}]).
Providers: grok-cli (grok CLI Imagine tools via grok_media.py, subscription), grok-rest (api.x.ai, only
with XAI_API_KEY), none (prints the plan; --placeholder synthesizes theme-colored stand-ins).

  media_provider.py [--provider P] [--theme T] [--json] [--allow-ui] [--force] [--placeholder] [--work-dir D] <command> ...

  image  --project P --id ID --prompt "…" [--aspect 3:4] [--from IMG] [--use cover|hook|plate|concept|broll|badge]
  video  --project P --id ID --prompt "…" [--from IMG] [--seconds 6|10] [--resolution 480p|720p] [--aspect 3:4|9:16] [--motion "…"]
  cover  --project P --prompt "…" [--aspect 3:4]                       → gen/cover.png
  plates --project P --style "…" [--count N] [--aspect 3:4] [--seconds 6]  → gen/plate-01.mp4 … (edit-chained from plate-01)
  broll  --project P --id X --prompt "…" [--from IMG] [--seconds 6] [--concept]  → gen/X.mp4 (B-roll / 意味着 concept shot)
  badge  --project P --name "账号名" --prompt "…"                       → gen/badge.png + public/badge.png (512², name never sent to the model)
  ingest --project P --id ID --in FILE [--kind image|video] [--prompt "…"]  → register an existing file (Grok Build host, hand-made clips)
  list   --project P

video/broll: without --from, --prompt describes the picture (image_gen → image_to_video) and --motion (default by use) drives
the camera; with --from, --prompt is the motion text (or, together with --motion, the scene description).
Videos are transcoded like clips (≤ 1600 px, 30 fps, H.264 yuv420p, audio stripped) plus a pre-blurred twin gen/<id>.bg.mp4
(270 px, gblur 14, darker, crf 28). w/h/seconds come from ffprobe. Every grok call leaves grok-stream.ndjson under --work-dir
(default <project>/gen-work/<id>/{image,i2v}/).
Prompt hygiene: theme style block prepended, hard negatives appended; prompts with digits or 界面/UI/图表/榜单 are
rejected unless --allow-ui. Never prints credentials; never uses XAI_API_KEY unless --provider grok-rest is chosen explicitly.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
GROK_MEDIA = HERE / "grok_media.py"
PROVIDERS = ("grok-cli", "grok-rest", "none")
ASPECTS = ("3:4", "9:16", "16:9", "1:1", "4:3", "2:3", "3:2")
RESOLUTIONS = ("480p", "720p")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
NEGATIVES = "no text, no numbers, no letters, no logos, no user interface, no charts, no watermark"
MOTION_NEGATIVES = "no captions, no subtitles, no text, no logos, no user interface"

# Palette words taken from assets/template/src/theme.ts (image models read colour words, not hex).
THEME_STYLE = {
    "neon": ("Dark cinematic scene on a near-black navy background, neon cyan and electric violet rim light with a warm "
             "orange accent, glowing highlights, faint grid texture, floating light particles, high contrast, shallow "
             "depth of field, photographic realism"),
    "paper": ("Warm cream paper background, ink-black flat illustration with coral orange and cobalt blue accents, "
              "yellow marker highlights, hand-drawn sticky-note editorial illustration feel, soft paper grain, flat "
              "even lighting, generous negative space"),
    "editorial": ("Charcoal black background, muted off-white subject, a single gold accent light, restrained "
                  "magazine-editorial photography, soft directional light, fine film grain, elegant minimal "
                  "composition"),
}
# Short palette-only variant for flat assets (badge): the full block's "grid texture / photographic realism" turns an
# emblem into a mockup card on a grid.
THEME_PALETTE = {
    "neon": "Palette: neon cyan and electric violet with a warm orange accent on near-black navy, soft glow",
    "paper": "Palette: ink black with coral orange and cobalt blue accents and yellow marker on warm cream paper",
    "editorial": "Palette: muted off-white and a single gold accent on charcoal black",
}
USE_HINTS = {
    "cover": "Vertical cover composition: subject in the lower two thirds, upper third calm and uncluttered for a title overlay.",
    "hook": "One strong centered subject with a clear silhouette, dramatic lighting, room for large captions in the lower third.",
    "plate": "Abstract background plate: no people, no faces, no objects with meaning, soft shapes, light and material only, seamless and loop friendly.",
    "concept": "A visual metaphor for the idea, symbolic and cinematic, no product, no screens, no devices shown in detail.",
    "broll": "Cinematic B-roll still, atmospheric, natural detail, no product and no screens shown in detail.",
    "badge": ("Square avatar emblem that fills the whole frame: one centered mascot or symbol, bold simple shapes, clean edges, "
              "flat plain background, no card, no frame, no mockup, no grid, readable at a tiny size."),
    "image": "",
}
DEFAULT_MOTION = {
    "cover": "slow push-in, subtle parallax, light flickers gently",
    "hook": "slow push-in, subtle parallax, the light flickers gently",
    "plate": "slow seamless drifting motion, nothing enters or leaves the frame, loop friendly",
    "concept": "gentle camera drift, subtle natural motion, nothing new appears",
    "broll": "gentle camera drift, subtle natural motion, nothing new appears",
    "badge": "subtle motion",
    "image": "subtle cinematic motion, slow camera drift",
}
PLATE_VARIATIONS = ["slow light streaks in depth", "soft bokeh orbs", "flowing silk-like gradients",
                    "layered translucent planes", "fine particles drifting in depth", "soft folded light"]
DIGIT_RE = re.compile(r"[0-9０-９]")
UI_RE = re.compile(r"界面|图表|榜单|(?<![A-Za-z])UI(?![A-Za-z])", re.I)


class ProviderError(Exception):
    def __init__(self, msg: str, code: int = 2):
        super().__init__(msg)
        self.code = code


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def run(cmd: list[str], timeout: int | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def need(tool: str) -> str:
    p = shutil.which(tool)
    if not p:
        raise ProviderError(f"{tool} not found on PATH", 1)
    return p


# ---------------------------------------------------------------- prompt hygiene

def check_prompt(text: str) -> list[str]:
    """Things a generated visual must never be asked for. Both are overridable with --allow-ui (logged as warnings)."""
    problems = []
    if DIGIT_RE.search(text):
        problems.append("contains digits — generated visuals never carry numbers; spell the idea without them")
    if UI_RE.search(text):
        problems.append("mentions 界面/UI/图表/榜单 — generated visuals never imitate a UI or a chart")
    return problems


def build_image_prompt(user: str, theme: str, use: str) -> str:
    """Theme style block first (palette words from theme.ts), then the subject, the use hint, the hard negatives."""
    style = THEME_PALETTE[theme] if use == "badge" else "Style: " + THEME_STYLE[theme]
    parts = [style + ".", "Subject: " + user.strip().rstrip("。.") + "."]
    hint = USE_HINTS.get(use, "")
    if hint:
        parts.append(hint)
    parts.append(NEGATIVES + ".")
    return " ".join(parts)


def build_edit_prompt(user: str, theme: str, use: str) -> str:
    return ("Keep the exact palette, lighting and material of the source image; new composition: " + user.strip().rstrip("。.")
            + ". " + (USE_HINTS.get(use, "") + " " if USE_HINTS.get(use) else "") + NEGATIVES + ".")


def build_motion_prompt(motion: str, scene: str | None) -> str:
    """image_to_video prompt: the camera/motion text, optionally what the scene is about, then the motion negatives."""
    m = motion.strip().rstrip("。.")
    scene_part = f" Scene: {scene.strip().rstrip('。.')}." if scene else ""
    return f"{m}.{scene_part} Keep the composition, subject and colours of the source image. {MOTION_NEGATIVES}."


# ---------------------------------------------------------------- media helpers

def probe_video(path: Path) -> dict:
    out = run([need("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]).stdout
    data = json.loads(out or "{}")
    vs = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    if vs is None:
        raise ProviderError(f"no video stream in {path}", 4)
    rate = vs.get("avg_frame_rate") or vs.get("r_frame_rate") or "0/1"
    num, _, den = rate.partition("/")
    fps = float(num) / float(den) if den and float(den) else float(num or 0)
    return {"w": int(vs["width"]), "h": int(vs["height"]), "seconds": round(float(data.get("format", {}).get("duration") or 0), 2),
            "fps": round(fps, 3), "hasAudio": any(s.get("codec_type") == "audio" for s in data.get("streams", []))}


def probe_image(path: Path) -> dict:
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(path) as im:
            return {"w": im.width, "h": im.height}
    except (UnidentifiedImageError, OSError) as exc:
        raise ProviderError(f"not an image: {path} ({exc})", 1)


def to_png(src: Path, dst: Path) -> None:
    from PIL import Image
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix.lower() == ".png" and src.resolve() != dst.resolve():
        shutil.copy2(src, dst)
        return
    with Image.open(src) as im:
        im.convert("RGB").save(dst)


def transcode(src: Path, dst: Path, bg: Path) -> dict:
    """Like download_media.sh: ≤ 1600 px, 30 fps, H.264 yuv420p, faststart, audio stripped; plus the blurred twin."""
    ff = need("ffmpeg")
    dst.parent.mkdir(parents=True, exist_ok=True)
    # -map 0:v:0: grok's i2v mp4 carries h264 + AAC + an mjpeg cover-art stream; take only the first video stream, drop audio
    common = ["-map", "0:v:0", "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]
    r = run([ff, "-v", "error", "-y", "-i", str(src), "-vf", "scale='min(1600,iw)':-2:flags=lanczos,fps=30", "-crf", "19", *common, str(dst)])
    if r.returncode:
        raise ProviderError("ffmpeg transcode failed: " + r.stderr.strip()[-400:], 4)
    r = run([ff, "-v", "error", "-y", "-i", str(src), "-vf", "scale=270:-2,gblur=sigma=14,eq=brightness=-0.3:saturation=1.4,fps=30", "-crf", "28", *common, str(bg)])
    if r.returncode:
        raise ProviderError("ffmpeg bg transcode failed: " + r.stderr.strip()[-400:], 4)
    info = probe_video(dst)
    if info["hasAudio"]:
        raise ProviderError("transcoded file still has audio", 4)
    return info


def aspect_of(w: int, h: int) -> str:
    best, err = None, 9e9
    for a in ASPECTS:
        aw, ah = (float(x) for x in a.split(":"))
        e = abs(w / h - aw / ah)
        if e < err:
            best, err = a, e
    return best if err < 0.03 else f"{w}:{h}"


def dims_for(aspect: str, long_side: int = 1152) -> tuple[int, int]:
    aw, ah = (float(x) for x in aspect.split(":"))
    if aw >= ah:
        return long_side, int(round(long_side * ah / aw / 2) * 2)
    return int(round(long_side * aw / ah / 2) * 2), long_side


# ---------------------------------------------------------------- gen.json

def gen_dir(project: Path) -> Path:
    return project / "public" / "gen"


def load_gen(project: Path) -> list[dict]:
    f = gen_dir(project) / "gen.json"
    if f.is_file():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    return []


def upsert_gen(project: Path, entry: dict) -> None:
    entries = [e for e in load_gen(project) if not (e.get("id") == entry["id"] and e.get("kind") == entry["kind"])]
    entries.append(entry)
    f = gen_dir(project) / "gen.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- providers

class Ctx:
    def __init__(self, a):
        self.provider = a.provider
        self.theme = a.theme
        self.json = a.json
        self.allow_ui = a.allow_ui
        self.force = a.force
        self.placeholder = a.placeholder
        self.project = Path(a.project).expanduser().resolve()
        self.work_root = Path(a.work_dir).expanduser().resolve() if a.work_dir else self.project / "gen-work"
        self.planned: list[dict] = []
        self.outputs: list[dict] = []
        self.started = time.time()

    def work(self, *parts: str) -> Path:
        d = self.work_root.joinpath(*parts)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def plan(self, step: str, **kw) -> None:
        item = {"step": step, **kw}
        self.planned.append(item)
        if not self.json:
            log(f"[{self.provider}] {step}: " + json.dumps({k: v for k, v in kw.items()}, ensure_ascii=False))


class GrokCliProvider:
    name = "grok-cli"

    def __init__(self, ctx: Ctx):
        self.ctx = ctx
        if not GROK_MEDIA.is_file():
            raise ProviderError(f"missing {GROK_MEDIA}", 1)

    def _call(self, args: list[str], timeout: int) -> dict:
        cmd = [sys.executable, str(GROK_MEDIA), *args]
        log("  $ grok_media.py " + " ".join(a if len(a) < 60 else a[:57] + "…" for a in args))
        try:
            r = run(cmd, timeout=timeout + 30)
        except subprocess.TimeoutExpired:
            raise ProviderError(f"grok_media.py timed out after {timeout}s", 2)
        line = ""
        for ln in reversed(r.stdout.strip().splitlines()):
            if ln.startswith("{"):
                line = ln
                break
        try:
            res = json.loads(line) if line else {}
        except json.JSONDecodeError:
            res = {}
        if r.returncode or not res.get("ok"):
            msg = res.get("error") or (r.stderr.strip()[-400:] or r.stdout.strip()[-400:] or f"exit {r.returncode}")
            if re.search(r"\b(401|403|unauthori[sz]ed|forbidden)\b", msg, re.I):
                msg += " — run `grok login` and retry (do not switch to XAI_API_KEY)"
            raise ProviderError(f"grok CLI: {msg}", 2)
        log(f"  ← {res.get('seconds')}s cost≈${res.get('costUsd') or 0:.4f} {res.get('width')}x{res.get('height')} {res.get('sourceFormat', '')}")
        return res

    def image(self, prompt: str, aspect: str, out: Path, work: Path, from_image: Path | None = None) -> dict:
        if from_image:
            res = self._call(["edit", "-o", str(out), "--prompt", prompt, "--image", str(from_image), "--work-dir", str(work), "--timeout", "300"], 300)
        else:
            res = self._call(["image", "-o", str(out), "--prompt", prompt, "--aspect", aspect, "--work-dir", str(work), "--timeout", "300"], 300)
        return {"w": res["width"], "h": res["height"], "seconds": res.get("seconds"), "cost": res.get("costUsd"), "source": res.get("source")}

    def i2v(self, image: Path, prompt: str, seconds: int, resolution: str, out: Path, work: Path) -> dict:
        res = self._call(["i2v", "-o", str(out), "--image", str(image), "--prompt", prompt, "--duration", str(seconds),
                          "--resolution", resolution, "--work-dir", str(work), "--timeout", "720"], 720)
        return {"w": res["width"], "h": res["height"], "seconds": res.get("seconds"), "cost": res.get("costUsd"),
                "raw": {"w": res["width"], "h": res["height"], "duration": res.get("duration"), "fps": res.get("fps"), "hasAudio": res.get("hasAudio")}}


class GrokRestProvider:
    """api.x.ai Imagine REST (docs.x.ai). Implemented per the docs, gated on XAI_API_KEY; not exercised on this machine."""
    name = "grok-rest"
    BASE = "https://api.x.ai"
    IMAGE_MODEL = "grok-imagine-image-2.0"
    VIDEO_MODEL = "grok-imagine-video-1.5"

    def __init__(self, ctx: Ctx):
        self.ctx = ctx
        self.key = os.environ.get("XAI_API_KEY", "").strip()
        if not self.key:
            raise ProviderError("grok-rest is not enabled: the user prefers the subscription tools (grok-cli). "
                                "Set XAI_API_KEY only if you really want billed api.x.ai calls.", 3)

    def _req(self, method: str, path: str, body: dict | None = None, timeout: int = 120) -> dict:
        import urllib.error
        import urllib.request
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.BASE + path, data=data, method=method,
                                     headers={"Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            hint = " (401/403: check the key's credits and entitlement; the user prefers grok-cli)" if exc.code in (401, 403) else ""
            raise ProviderError(f"api.x.ai {method} {path} → HTTP {exc.code}: {detail}{hint}", 2)
        except urllib.error.URLError as exc:
            raise ProviderError(f"api.x.ai {method} {path} → {exc.reason}", 2)

    @staticmethod
    def _data_url(path: Path) -> str:
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

    def image(self, prompt: str, aspect: str, out: Path, work: Path, from_image: Path | None = None) -> dict:
        t0 = time.time()
        if from_image:
            body = {"model": self.IMAGE_MODEL, "prompt": prompt, "image": {"url": self._data_url(from_image)}, "response_format": "b64_json"}
            res = self._req("POST", "/v1/images/edits", body, 300)
        else:
            body = {"model": self.IMAGE_MODEL, "prompt": prompt, "aspect_ratio": aspect, "resolution": "2k", "n": 1, "response_format": "b64_json"}
            res = self._req("POST", "/v1/images/generations", body, 300)
        b64 = (res.get("data") or [{}])[0].get("b64_json")
        if not b64:
            raise ProviderError("api.x.ai returned no b64_json image", 2)
        raw = work / "rest-image.bin"
        raw.write_bytes(base64.b64decode(b64))
        to_png(raw, out)
        info = probe_image(out)
        return {**info, "seconds": round(time.time() - t0, 1), "cost": (res.get("usage") or {}).get("cost_in_usd_ticks")}

    def i2v(self, image: Path, prompt: str, seconds: int, resolution: str, out: Path, work: Path) -> dict:
        import urllib.request
        t0 = time.time()
        info = probe_image(image)
        body = {"model": self.VIDEO_MODEL, "prompt": prompt, "duration": seconds, "aspect_ratio": aspect_of(info["w"], info["h"]),
                "resolution": resolution, "generate_audio": False, "image": {"url": self._data_url(image)}}
        res = self._req("POST", "/v1/videos/generations", body, 120)
        rid = res.get("request_id") or res.get("id")
        if not rid:
            raise ProviderError("api.x.ai returned no request_id for the video", 2)
        deadline = time.time() + 900
        while True:
            st = self._req("GET", f"/v1/videos/{rid}", None, 60)
            status = st.get("status")
            if status == "done":
                url = (st.get("video") or {}).get("url")
                if not url:
                    raise ProviderError("video done but no url in the response", 2)
                with urllib.request.urlopen(url, timeout=300) as resp:
                    out.write_bytes(resp.read())
                break
            if status in ("failed", "expired"):
                raise ProviderError(f"video request {status}: {json.dumps(st)[:300]}", 2)
            if time.time() > deadline:
                raise ProviderError("video request timed out after 900s", 2)
            time.sleep(5)
        raw = probe_video(out)
        return {"w": raw["w"], "h": raw["h"], "seconds": round(time.time() - t0, 1), "raw": raw}


class NoneProvider:
    """Prints the plan. With --placeholder it synthesizes theme-coloured stand-ins so the pipeline can run offline."""
    name = "none"

    def __init__(self, ctx: Ctx):
        self.ctx = ctx

    def image(self, prompt: str, aspect: str, out: Path, work: Path, from_image: Path | None = None) -> dict:
        self.ctx.plan("image_edit" if from_image else "image_gen", aspect=aspect, out=str(out), **({"from": str(from_image)} if from_image else {}), prompt=prompt)
        if not self.ctx.placeholder:
            return {}
        from PIL import Image
        w, h = (probe_image(from_image)["w"], probe_image(from_image)["h"]) if from_image else dims_for(aspect)
        c0, c1 = PLACEHOLDER_COLORS[self.ctx.theme]
        strip = Image.new("RGB", (1, h))
        for y in range(h):
            t = y / max(1, h - 1)
            strip.putpixel((0, y), tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)))
        im = strip.resize((w, h), Image.NEAREST)  # vertical theme gradient, cheap for any size
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out)
        return {"w": w, "h": h, "seconds": 0, "placeholder": True}

    def i2v(self, image: Path, prompt: str, seconds: int, resolution: str, out: Path, work: Path) -> dict:
        self.ctx.plan("image_to_video", image=str(image), duration=seconds, resolution=resolution, out=str(out), prompt=prompt)
        if not self.ctx.placeholder:
            return {}
        info = probe_image(image)
        w, h = info["w"], info["h"]
        c0, c1 = PLACEHOLDER_COLORS[self.ctx.theme]
        hex_ = lambda c: "0x%02x%02x%02x" % c
        out.parent.mkdir(parents=True, exist_ok=True)
        r = run([need("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i", f"gradients=s={w}x{h}:c0={hex_(c0)}:c1={hex_(c1)}:speed=0.02:d={seconds}:r=24",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
        if r.returncode:
            raise ProviderError("ffmpeg placeholder failed: " + r.stderr.strip()[-300:], 4)
        return {"w": w, "h": h, "seconds": 0, "placeholder": True, "raw": probe_video(out)}


PLACEHOLDER_COLORS = {"neon": ((5, 7, 13), (55, 90, 160)), "paper": ((246, 241, 231), (255, 200, 170)), "editorial": ((16, 17, 20), (90, 76, 40))}


def make_provider(ctx: Ctx):
    return {"grok-cli": GrokCliProvider, "grok-rest": GrokRestProvider, "none": NoneProvider}[ctx.provider](ctx)


# ---------------------------------------------------------------- steps

def resolve_from(ctx: Ctx, spec: str | None) -> Path | None:
    if not spec:
        return None
    p = Path(spec).expanduser()
    for cand in ([p] if p.is_absolute() else [ctx.project / "public" / p, ctx.project / p, Path.cwd() / p]):
        if cand.is_file():
            return cand.resolve()
    raise ProviderError(f"--from image not found: {spec}", 1)


def check_id(id_: str) -> str:
    if not ID_RE.match(id_):
        raise ProviderError(f"id must match ^[a-z0-9][a-z0-9-]*$ (got {id_!r})", 1)
    return id_


def read_prompt(a, attr: str = "prompt") -> str:
    pf = getattr(a, "prompt_file", None)
    text = Path(pf).read_text(encoding="utf-8").strip() if pf else (getattr(a, attr, None) or "").strip()
    if not text:
        raise ProviderError(f"--{attr.replace('_', '-')} (or --prompt-file) is required", 1)
    return text


def hygiene(ctx: Ctx, text: str, what: str = "prompt") -> None:
    problems = check_prompt(text)
    if not problems:
        return
    if ctx.allow_ui:
        log(f"  ! {what} passed only because of --allow-ui: " + "; ".join(problems))
        return
    raise ProviderError(f"{what} rejected: " + "; ".join(problems) + " (override with --allow-ui)", 1)


def rel_public(ctx: Ctx, p: Path) -> str:
    """Path relative to project/public when inside it (what script.json `src` expects), else absolute."""
    pub = ctx.project / "public"
    return p.relative_to(pub).as_posix() if p.is_relative_to(pub) else str(p)


def step_image(ctx: Ctx, prov, id_: str, user_prompt: str, aspect: str, use: str, from_image: Path | None, out: Path | None = None) -> dict | None:
    """image_gen (or image_edit when from_image) → gen/<id>.png + gen.json entry. Returns the entry (None for a plan-only run)."""
    hygiene(ctx, user_prompt)
    out = out or gen_dir(ctx.project) / f"{id_}.png"
    rel = rel_public(ctx, out)
    if out.is_file() and not ctx.force:
        info = probe_image(out)
        log(f"  = {rel} exists ({info['w']}x{info['h']}), keeping it (--force to regenerate)")
        entry = next((e for e in load_gen(ctx.project) if e.get("id") == id_ and e.get("kind") == "image"), None)
        return entry or {"id": id_, "kind": "image", "file": rel, **info, "provider": "existing", "createdAt": now_iso()}
    if from_image:
        prompt = build_edit_prompt(user_prompt, ctx.theme, use)
        if aspect and from_image.is_file():
            got = aspect_of(*probe_image(from_image).values())
            if got != aspect:
                log(f"  ! --from image is {got}; image_edit inherits the input aspect, --aspect {aspect} ignored")
    else:
        prompt = build_image_prompt(user_prompt, ctx.theme, use)
    log(f"→ image {id_} ({use}, {aspect if not from_image else 'aspect of --from'})")
    res = prov.image(prompt, aspect, out, ctx.work(id_, "image"), from_image)
    if not res:
        return None
    entry = {"id": id_, "kind": "image", "file": rel, "w": res["w"], "h": res["h"], "prompt": prompt, "userPrompt": user_prompt,
             "provider": prov.name, "createdAt": now_iso(), "aspect": aspect_of(res["w"], res["h"]), "use": use}
    if from_image:
        entry["from"] = rel_public(ctx, from_image)
    if res.get("placeholder"):
        entry["placeholder"] = True
    upsert_gen(ctx.project, entry)
    ctx.outputs.append(entry)
    log(f"  ✓ {rel} {res['w']}x{res['h']}")
    return entry


def step_video(ctx: Ctx, prov, id_: str, user_prompt: str, aspect: str, seconds: int, resolution: str, use: str,
               from_image: Path | None, motion: str | None) -> dict | None:
    """(image_gen →) image_to_video → transcode → gen/<id>.mp4 + gen/<id>.bg.mp4 + gen.json entry."""
    hygiene(ctx, user_prompt)
    if motion:
        hygiene(ctx, motion, "--motion")
    if seconds not in (6, 10):
        raise ProviderError("--seconds must be 6 or 10 (image_to_video limit)", 1)
    if resolution not in RESOLUTIONS:
        raise ProviderError("--resolution must be 480p or 720p", 1)
    out = gen_dir(ctx.project) / f"{id_}.mp4"
    bg = gen_dir(ctx.project) / f"{id_}.bg.mp4"
    rel = f"gen/{id_}.mp4"
    if out.is_file() and bg.is_file() and not ctx.force:
        info = probe_video(out)
        log(f"  = {rel} exists ({info['w']}x{info['h']} {info['seconds']}s), keeping it (--force to regenerate)")
        entry = next((e for e in load_gen(ctx.project) if e.get("id") == id_ and e.get("kind") == "video"), None)
        return entry or {"id": id_, "kind": "video", "file": rel, "bg": f"gen/{id_}.bg.mp4", "w": info["w"], "h": info["h"], "seconds": info["seconds"], "provider": "existing", "createdAt": now_iso()}
    base = from_image
    if base is None:
        # --prompt describes the picture: generate the base frame first, then animate it with --motion (or the default motion by use)
        img_entry = step_image(ctx, prov, id_, user_prompt, aspect, use, None)
        if img_entry is None:
            base = gen_dir(ctx.project) / f"{id_}.png"  # plan-only: keep planning the second step
        else:
            base = (ctx.project / "public" / img_entry["file"]).resolve()
        mprompt = build_motion_prompt(motion or DEFAULT_MOTION.get(use, DEFAULT_MOTION["image"]), user_prompt)
    else:
        # --from given: --prompt IS the motion text (there is no picture to describe). With --motion as well,
        # --motion drives the camera and --prompt becomes the scene description.
        if aspect and base.is_file():
            got = aspect_of(*probe_image(base).values())
            if got != aspect:
                log(f"  ! --from image is {got}; image_to_video inherits the input aspect, --aspect {aspect} cannot be honoured (drop --from to generate a {aspect} base)")
        mprompt = build_motion_prompt(motion, user_prompt) if motion else build_motion_prompt(user_prompt, None)
    work = ctx.work(id_, "i2v")
    raw = work / "raw.mp4"
    log(f"→ video {id_} ({use}, {seconds}s {resolution}) from {base.name}")
    res = prov.i2v(base, mprompt, seconds, resolution, raw, work)
    if not res:
        ctx.plan("transcode", **{"in": str(raw), "out": str(out), "bg": str(bg)})
        return None
    info = transcode(raw, out, bg)
    entry = {"id": id_, "kind": "video", "file": rel, "bg": f"gen/{id_}.bg.mp4", "w": info["w"], "h": info["h"], "seconds": info["seconds"],
             "fps": info["fps"], "prompt": mprompt, "userPrompt": user_prompt, "provider": prov.name, "createdAt": now_iso(),
             "from": rel_public(ctx, base), "resolution": resolution, "raw": res.get("raw")}
    if res.get("placeholder"):
        entry["placeholder"] = True
    upsert_gen(ctx.project, entry)
    ctx.outputs.append(entry)
    log(f"  ✓ {rel} {info['w']}x{info['h']} {info['seconds']}s {info['fps']}fps audio={info['hasAudio']} + gen/{id_}.bg.mp4")
    return entry


# ---------------------------------------------------------------- commands

def cmd_image(ctx, prov, a):
    step_image(ctx, prov, check_id(a.id), read_prompt(a), a.aspect, a.use, resolve_from(ctx, a.from_image))


def cmd_video(ctx, prov, a):
    step_video(ctx, prov, check_id(a.id), read_prompt(a), a.aspect, a.seconds, a.resolution, a.use, resolve_from(ctx, a.from_image), a.motion)


def cmd_cover(ctx, prov, a):
    step_image(ctx, prov, "cover", read_prompt(a), a.aspect, "cover", resolve_from(ctx, a.from_image))


def cmd_broll(ctx, prov, a):
    step_video(ctx, prov, check_id(a.id), read_prompt(a), a.aspect, a.seconds, a.resolution, "concept" if a.concept else "broll",
               resolve_from(ctx, a.from_image), a.motion)


def cmd_plates(ctx, prov, a):
    style = read_prompt(a, "style")
    if a.count < 1 or a.count > 12:
        raise ProviderError("--count must be 1..12", 1)
    first: Path | None = resolve_from(ctx, a.from_image)
    for i in range(1, a.count + 1):
        id_ = f"plate-{i:02d}"
        variation = PLATE_VARIATIONS[(i - 1) % len(PLATE_VARIATIONS)]
        user = f"{style}, {variation}" if i > 1 or first else style
        base_from = first if i > 1 or first else None
        entry = step_image(ctx, prov, id_, user, a.aspect, "plate", base_from)
        base = (ctx.project / "public" / entry["file"]).resolve() if entry else gen_dir(ctx.project) / f"{id_}.png"
        if first is None:
            first = base
        step_video(ctx, prov, id_, user, a.aspect, a.seconds, a.resolution, "plate", base, a.motion or DEFAULT_MOTION["plate"])


def tight_square_crop(im, threshold: int = 28):
    """Trim a uniform outer margin: the image model likes to draw the emblem on an inset card. Keeps the image when the
    content box is smaller than half the frame (the crop would be guessing) or when the margin is not uniform."""
    from PIL import Image, ImageChops
    rgb = im.convert("RGB")
    corner = rgb.getpixel((2, 2))
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, corner)).convert("L").point(lambda v: 255 if v > threshold else 0)
    box = diff.getbbox()
    if not box:
        return im
    w, h = box[2] - box[0], box[3] - box[1]
    if w < im.width * 0.5 or h < im.height * 0.5 or (w >= im.width - 4 and h >= im.height - 4):
        return im
    s = max(w, h)
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    left = max(0, min(im.width - s, cx - s // 2))
    top = max(0, min(im.height - s, cy - s // 2))
    return im.crop((left, top, left + s, top + s))


def cmd_badge(ctx, prov, a):
    # The account name is recorded, never sent to the image model: names invite rendered letters (and may contain digits).
    user = read_prompt(a)
    entry = step_image(ctx, prov, "badge", user, "1:1", "badge", resolve_from(ctx, a.from_image))
    if entry is None:
        ctx.plan("copy", **{"from": "gen/badge.png", "to": "badge.png", "size": a.size, "account": a.name})
        return
    if entry.get("provider") != "existing":
        entry["account"] = a.name
        upsert_gen(ctx.project, entry)
    from PIL import Image
    src = ctx.project / "public" / entry["file"]
    dst = ctx.project / "public" / "badge.png"
    with Image.open(src) as im:
        im = im.convert("RGBA")
        if not a.no_crop:
            im = tight_square_crop(im)
        if im.width != im.height:
            s = min(im.size)
            im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width - s) // 2 + s, (im.height - s) // 2 + s))
        im.resize((a.size, a.size), Image.LANCZOS).save(dst)
    log(f"  ✓ badge.png {a.size}x{a.size} (square copy for brief.account.badge)")
    ctx.outputs.append({"id": "badge", "kind": "image", "file": "badge.png", "w": a.size, "h": a.size, "provider": prov.name, "createdAt": now_iso()})


def cmd_ingest(ctx, prov, a):
    id_ = check_id(a.id)
    src = Path(a.src).expanduser().resolve()
    if not src.is_file():
        raise ProviderError(f"--in file not found: {src}", 1)
    kind = a.kind or ("video" if src.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v") else "image")
    prompt = (a.prompt or "").strip()
    if kind == "image":
        out = gen_dir(ctx.project) / f"{id_}.png"
        to_png(src, out)
        info = probe_image(out)
        entry = {"id": id_, "kind": "image", "file": f"gen/{id_}.png", **info, "prompt": prompt, "provider": a.source, "createdAt": now_iso(), "from": str(src)}
    else:
        out = gen_dir(ctx.project) / f"{id_}.mp4"
        bg = gen_dir(ctx.project) / f"{id_}.bg.mp4"
        info = transcode(src, out, bg)
        entry = {"id": id_, "kind": "video", "file": f"gen/{id_}.mp4", "bg": f"gen/{id_}.bg.mp4", "w": info["w"], "h": info["h"], "seconds": info["seconds"],
                 "fps": info["fps"], "prompt": prompt, "provider": a.source, "createdAt": now_iso(), "from": str(src)}
    upsert_gen(ctx.project, entry)
    ctx.outputs.append(entry)
    log(f"  ✓ {entry['file']} {entry['w']}x{entry['h']}" + (f" {entry['seconds']}s" if kind == "video" else ""))


def cmd_list(ctx, prov, a):
    for e in load_gen(ctx.project):
        ctx.outputs.append(e)
        log(f"  {e.get('kind'):5} {e.get('id'):12} {e.get('file')} {e.get('w')}x{e.get('h')}" + (f" {e.get('seconds')}s" if e.get("seconds") else ""))


# ---------------------------------------------------------------- main

def theme_from_brief(project: Path) -> str | None:
    f = project / "content" / "brief.json"
    if f.is_file():
        try:
            t = json.loads(f.read_text(encoding="utf-8")).get("theme")
            return t if t in THEME_STYLE else None
        except (json.JSONDecodeError, AttributeError):
            return None
    return None


def provider_from_brief(project: Path) -> str | None:
    f = project / "content" / "brief.json"
    if f.is_file():
        try:
            p = (json.loads(f.read_text(encoding="utf-8")).get("generation") or {}).get("provider")
            return p if p in PROVIDERS else None
        except (json.JSONDecodeError, AttributeError):
            return None
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provider", choices=PROVIDERS, help="default: brief.json generation.provider, else none")
    ap.add_argument("--theme", choices=sorted(THEME_STYLE), help="style block; default: brief.json theme, else neon")
    ap.add_argument("--json", action="store_true", help="JSON summary on stdout (progress always goes to stderr)")
    ap.add_argument("--allow-ui", action="store_true", help="accept prompts containing digits or 界面/UI/图表/榜单 (normally rejected; still logged)")
    ap.add_argument("--force", action="store_true", help="regenerate even if the output exists")
    ap.add_argument("--placeholder", action="store_true", help="--provider none: synthesize theme-coloured stand-ins instead of only planning")
    ap.add_argument("--work-dir", help="scratch dir for raw tool outputs and grok-stream.ndjson (default <project>/gen-work)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, with_id=True):
        p.add_argument("--project", required=True, help="the Remotion project dir (<workdir>/project)")
        if with_id:
            p.add_argument("--id", required=True)
        p.add_argument("--prompt")
        p.add_argument("--prompt-file")
        p.add_argument("--from", dest="from_image", help="base image (edit-chain / i2v source); relative paths resolve against public/")

    p = sub.add_parser("image", help="text-to-image (or image_edit with --from) → gen/<id>.png")
    common(p)
    p.add_argument("--aspect", default="3:4", choices=ASPECTS)
    p.add_argument("--use", default="image", choices=sorted(USE_HINTS))
    p.set_defaults(fn=cmd_image)

    def video_args(p, default_use, default_res):
        p.add_argument("--seconds", type=int, default=6)
        p.add_argument("--resolution", default=default_res, choices=RESOLUTIONS)
        p.add_argument("--aspect", default="3:4", choices=ASPECTS)
        p.add_argument("--motion", help="camera / motion text for image_to_video (default by use; with --from, --prompt is the motion unless --motion is set)")
        p.add_argument("--use", default=default_use, choices=sorted(USE_HINTS))

    p = sub.add_parser("video", help="(image_gen →) image_to_video → gen/<id>.mp4 + gen/<id>.bg.mp4 (with --from IMG the prompt is the motion)")
    common(p)
    video_args(p, "hook", "720p")
    p.set_defaults(fn=cmd_video)

    p = sub.add_parser("cover", help="3:4 cover image → gen/cover.png (the Cover composition overlays text)")
    common(p, with_id=False)
    p.add_argument("--aspect", default="3:4", choices=ASPECTS)
    p.set_defaults(fn=cmd_cover)

    p = sub.add_parser("plates", help="N abstract theme plates (image → i2v, chained from plate-01) → gen/plate-NN.mp4")
    p.add_argument("--project", required=True)
    p.add_argument("--style", help="what the plates look like (no text, no faces, no UI)")
    p.add_argument("--prompt-file")
    p.add_argument("--count", type=int, default=3)
    p.add_argument("--from", dest="from_image", help="optional existing base image to chain from")
    video_args(p, "plate", "480p")
    p.set_defaults(fn=cmd_plates)

    p = sub.add_parser("broll", help="concept shot / B-roll → gen/<id>.mp4 (6 s)")
    common(p)
    video_args(p, "broll", "720p")
    p.add_argument("--concept", action="store_true", help="a 意味着 concept shot (visual metaphor) instead of atmospheric B-roll")
    p.set_defaults(fn=cmd_broll)

    p = sub.add_parser("badge", help="1:1 account emblem → gen/badge.png + public/badge.png")
    common(p, with_id=False)
    p.add_argument("--name", required=True, help="account name (mood only; never rendered as text)")
    p.add_argument("--size", type=int, default=512)
    p.add_argument("--no-crop", action="store_true", help="keep the model's margins instead of trimming the uniform border around the emblem")
    p.set_defaults(fn=cmd_badge)

    p = sub.add_parser("ingest", help="register an existing image/video (e.g. produced by Grok Build tools) into gen/ + gen.json")
    p.add_argument("--project", required=True)
    p.add_argument("--id", required=True)
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--kind", choices=("image", "video"))
    p.add_argument("--prompt")
    p.add_argument("--source", default="ingest", help="provider label to record (e.g. grok-build)")
    p.set_defaults(fn=cmd_ingest)

    p = sub.add_parser("list", help="print gen.json")
    p.add_argument("--project", required=True)
    p.set_defaults(fn=cmd_list)

    a = ap.parse_args(argv)
    project = Path(a.project).expanduser().resolve()
    a.provider = a.provider or provider_from_brief(project) or "none"
    a.theme = a.theme or theme_from_brief(project) or "neon"
    ctx = Ctx(a)
    code = 0
    err = None
    try:
        if not ctx.project.is_dir():
            raise ProviderError(f"project dir not found: {ctx.project}", 1)
        prov = make_provider(ctx) if a.cmd not in ("ingest", "list") else None
        a.fn(ctx, prov, a)
    except ProviderError as exc:
        code, err = exc.code, str(exc)
        log(f"error: {err}")
    except KeyboardInterrupt:
        code, err = 130, "interrupted"
    summary = {"ok": code == 0, "provider": ctx.provider, "theme": ctx.theme, "command": a.cmd, "outputs": ctx.outputs,
               "planned": ctx.planned, "genJson": str(gen_dir(ctx.project) / "gen.json"), "seconds": round(time.time() - ctx.started, 1)}
    if err:
        summary["error"] = err
    if a.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    elif code == 0 and ctx.provider == "none" and not ctx.placeholder and a.cmd not in ("ingest", "list"):
        log(f"[none] planned {len(ctx.planned)} step(s); nothing generated (use --provider grok-cli, or --placeholder for offline stand-ins)")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
