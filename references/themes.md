# Themes: neon · paper · editorial

`brief.theme` picks one preset from `assets/template/src/theme.ts`; every scene renders correctly in all
three (the model never edits `theme.ts`; director mode may only *choose* a theme and its fonts). A theme
changes colours, texture, the hot-word style, the default transition table, the default sfx per beat kind
and the bgm kit — nothing about layout, sizes or safe areas.

| | neon | paper | editorial |
|---|---|---|---|
| Look | dark `#05070d`, cyan `#37e6ff` / violet `#7c5cff` / orange gradients, grid texture, particles, glow 1.0, radius 24 | warm paper `#f6f1e7`, ink `#1b1b1f`, coral `#ff5c39` + blue `#2b59ff`, grain texture, no particles, no glow, radius 18 | charcoal `#101114`, off-white `#f4f2ee`, gold `#e8c547`, no texture, glow 0.2, radius 6 |
| Hot word | gradient text (cyan → violet → orange) | yellow highlighter `#ffe45c` behind the word, solid ink text | gold underline 6 px, gold text |
| Fonts (CSS stack) | cn: Noto Sans SC → PingFang SC → Hiragino Sans GB → Microsoft YaHei; display: Smiley Sans (得意黑) | same as neon | cn: Noto Serif SC → Songti SC → STSong; en: Playfair Display → Georgia; display: Noto Serif SC |
| Transitions (default) | fade; `*>chapter` slide, `hook>*` whip, `chapter>*` zoom, `*>take` cut, `*>summary` wipe | cut; `*>chapter` slide, `*>summary` slide, `*>cta`/`*>outro` fade | fade; `*>chapter` wipe, `hook>*` wipe, `*>summary` wipe |
| SFX (default) | hook riser · chapter whoosh · bench tick · clip whoosh · kinetic/take hit · summary whoosh | hook hit · otherwise as neon | as neon but clip none |
| BGM kit | synth, 128 BPM, base volume 0.22 | lofi, 96 BPM, 0.20 | minimal, 110 BPM, 0.18 |

## When to pick which

- **neon** — launch-explainer, case-reel, comparison of tech products; persona `worker` talking about AI
  tools; anything with demo clips (dark frame makes screen recordings pop). The v1 look; the safest default.
- **paper** — tutorial, data-story about everyday money/work/health, opinion pieces in a friendly voice;
  persona `worker` when the topic is life admin rather than tech. Light frame reads well on 小红书 feeds
  full of dark AI videos and matches the 便签 / 荧光笔 feel of a summary card.
- **editorial** — news-brief, opinion essays, comparison for a business audience; persona `neutral`.
  Serif numerals and gold underlines signal "analysis", not "hype". Fewer sfx (clip cuts are silent).

Pick by brief type first, persona second, article tone third. One account should stick to one theme for
recognizability; change themes between content types only if the account is deliberately multi-format.

## Fonts

`scripts/fetch_fonts.sh <workdir>/project/public/fonts` downloads the OFL fonts once into
`~/.cache/article-to-vertical-video/fonts/` and copies them into the project. Files the template's
`FontLoader` looks for (stable names):

| file | family | weight | used by |
|---|---|---|---|
| `NotoSansSC-Bold.ttf` | Noto Sans SC | 700 | body captions (neon, paper, editorial fallback) |
| `NotoSansSC-Black.ttf` | Noto Sans SC | 900 | hot words, hook text, numbers (neon, paper) |
| `NotoSerifSC-Bold.ttf` | Noto Serif SC | 700 | editorial captions and numerals |
| `SmileySans-Oblique.ttf` | Smiley Sans (得意黑) | 700 | display text: chapter titles, kinetic lines (neon, paper) |

Missing files never crash a render: `FontLoader` skips absent files and the CSS stack falls through to
system fonts (PingFang SC on macOS, Microsoft YaHei on Windows, Noto/WenQuanYi on Linux if installed).
The first still with Chinese text is the font check — tofu boxes mean no CJK font at all; run
`bash <skill>/scripts/doctor.sh --fix-fonts`. `fonts.json` next to the files records what was downloaded.

## Account badge

`brief.account.badge` names a PNG in `project/public/` (1:1, transparent background, ≥ 256 px). It sits in
the top bar in every scene and "stamps" (scale pulse + ring) when a take appears. Generate one with
`media_provider.py badge --name "账号名" --prompt "…"` or drop a hand-made file in; omit the field to render
the account name only.
