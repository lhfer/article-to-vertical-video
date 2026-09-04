# Briefs: content type × duration tier × platform

`brief.json` (schema: `schemas/brief.schema.json`) is written before any content. It picks one **type**
(narrative template), one **tier** (derived from `targetSeconds`), one or more **platforms**, a persona and
a theme. The story skeleton below tells you which beat kinds to write and in what order; the lint
(`scripts/lint_content.mjs`) enforces the structural parts (first beat `hook`, exactly one `role: "turn"` for
tiers m/l, last beat `cta`/`outro`, short-cut coverage). Worked example: `references/example-gpt6/content/`.

Infer everything you can from the article and the user's prompt; ask only about items you cannot infer
(type, target length, platform, persona, theme). Write the assumptions into `brief.notes`.

## 1. Content types

Every type follows the same spine: **hook (viewer's stake, ≤ 3 s) → promise → chapters of
主张 → 证据 → 所以呢 → 但是 → turn (at 35–75 %) → summary (收藏点) → cta (争议) → outro**. The type decides
what counts as evidence and which scene kinds carry it. Roles: `open` · `evidence` · `so-what` · `turn` ·
`payoff` · `close`.

### launch-explainer (发布解读)
A product/model launch page with claims, comparison tables and demo clips. Angle: 打工人 asks "它能替我干什么、
该信几分、该等还是该换" — not the vendor's feature order. Evidence = bench duels (hero vs best rival, one
number at a time) + the page's own demo clips with `focus`. The turn is the "没赢的地方" bench (the tables the
product loses; this is what makes the rest credible). Competitor scores are the vendor's reported values
(keep `meta.footer`). Default theme: `neon`.

Skeleton (tier m): `hook(open)` → `promise(open)` → per chapter: `chapter` → `bench duel(evidence)` →
1–2 `clip(evidence)` → `take(so-what)` → `kinetic`/`take` 但是(so-what) → `bench(turn)` → optional last
chapter (分人群建议) → `summary(payoff)` → `cta(close)` → `outro(close)` (price, availability, "官方未公布").

### news-brief (新闻快讯)
One event, one page (an announcement post, a policy change, a funding note). Angle: 5W → 影响 → 立场: who
benefits, who loses, what happens next. Evidence = `kinetic` key sentences, `quote` (the announcement's own
words, `by` = the source), `scorecard` for the 2–5 numbers the post has, `image`/`screenshot` of the post.
No bench tables → no `bench` beats. Turn = the caveat the post buries (pricing, region, "beta"). Default
theme: `editorial` (paper for consumer topics).

Skeleton (tier s): `hook` → `kinetic`(what happened) → `quote`/`screenshot`(proof) → `scorecard`(numbers) →
`take`(立场, sourced) → `kinetic`(turn: the catch) → `cta`.

### case-reel (案例集锦)
A page that is mostly demos (a showcase, a "made with X" collection). Angle: what each clip proves about
one question ("它到底会不会 X"). Evidence = `clip` after `clip`, each with `focus` and `resultAt`, one
caption idea per clip; a `scorecard` tallies the reel (做到 / 没做到 / 没演示). Turn = the clip that shows
a limit, or "页面没演示的". Default theme: `neon`.

Skeleton: `hook`(the best 2 s of the best clip, `visual.kind: "clip"`) → `promise`(我看了 N 段) → 4–8
`clip`(evidence, grouped by what they prove) → `scorecard`(payoff) → `take`(turn: what none of them shows)
→ `summary` → `cta`.

### tutorial (教程)
A how-to article. Angle: the one outcome the viewer gets, then the steps, then the trap. Evidence =
`steps` (2–5 items per beat, one beat per phase), `screenshot` with `highlight` for each click that matters,
`image` for results, before/after as two `image` beats. Turn = 最容易踩的坑. Default theme: `paper`.

Skeleton: `hook`(result first) → `promise`(N 步) → per phase: `steps` → `screenshot`/`clip` → `take`(为什么这一步)
→ `kinetic`(turn: the trap) → `summary`(checklist, screenshot-worthy) → `cta`(你卡在哪一步).

### opinion (观点长文)
An essay or a pasted text with no media. Angle: the author's thesis vs the viewer's life; you add the
"所以呢". Evidence = `quote` (verbatim sentences, `by` the author), `kinetic` for your paraphrase, `take` for
your position (sourced when it brings outside facts), generated `broll` under captions when allowed.
Turn = the strongest counter-argument, stated fairly. Default theme: `editorial`.

Skeleton (tier s, 75 s): `hook`(the claim that stings) → `quote` → `kinetic`(what it means for you) → `take`
→ `quote`(turn: the counter) → `take`(where you land) → `cta`(the split question). Short cut only when
`platforms` has a 9:16 entry and the long master is not wanted.

### comparison (对比评测)
Two or more products/models compared. Angle: which one for whom. Evidence = `bench` duels when the page
has tables (hero = the one the user cares about), `scorecard` for non-benchmark criteria (price, limits,
availability), `clip`/`image` side by side as consecutive beats. Turn = the criterion where the favourite
loses. Default theme: `editorial`.

Skeleton: `hook`(the decision the viewer faces) → `promise`(N 个维度) → per criterion: `bench`/`scorecard` →
`take` → `bench`/`scorecard`(turn) → `summary`(分人群建议: 学生 / 打工人 / 开发者) → `cta`(你选哪个).

### data-story (数据故事)
A report or dataset write-up. Angle: one number per beat, each translated into a person-sized fact.
Evidence = `scorecard` (≤ 5 rows), `bench` in `table` mode for a 1.5 s flash of the full table, `kinetic`
for the anchor sentence ("100 个人里 72 个"), `image` for the report's own charts. Turn = the number that
contradicts the headline. Default theme: `paper`.

Skeleton: `hook`(the shock number) → `promise` → 3–5 × (`scorecard`/`kinetic` → `take`) → `scorecard`(turn) →
`summary` → `cta`.

## 2. Duration tiers (from DESIGN §2.1)

`tier` is derived from `targetSeconds` unless set explicitly. The tier drives chapter-card length, the
maximum length of a scene without voice-over, the visual-event interval the storyboard checks, and the
narration budget per beat (`tier seconds × 9` chars; lint L-NARR-LEN).

| tier | targetSeconds | chapter card | max scene w/o VO | visual event interval | narration budget / beat | structure |
|---|---|---|---|---|---|---|
| xs | 15–30 | none | 4 s | ≤ 2 s | 36 chars (4 s) | hook → 1 evidence → cta |
| s | 31–90 | none (big `kinetic` text separates) | 6 s | ≤ 3 s | 54 chars (6 s) | hook → 3 beats → turn → cta |
| m | 91–240 | 0.8 s | 10 s | ≤ 6 s | 108 chars (12 s) | hook → promise → 3–4 chapters → turn → summary → cta |
| l | 241–900 | 1.4 s | 14 s | ≤ 8 s, pauses allowed | 135 chars (15 s) | hook → promise with 目录 → chapters with a recap every ~60 s → turn → summary → cta |

Rhythm targets per tier (the storyboard reports them; the lint warns on totals):

- **Dead air** ≤ 1.2 s in any beat (chapter cards excepted). Clip footage `(to − from) / rate` must not
  outlast the narration by more than that; shorten `from/to`, raise `rate`, or add a sentence.
- **Visual event** = a cut, a card appearing, a hot word landing, a bench bar revealing, a Ken Burns
  target reached. Interval per tier as above.
- **Payoff cadence**: a new concrete fact or verdict every ~25 s (m/l). For tier l add a `summary`-style
  recap (`kinetic` or `steps`) every ~60 s and list the chapters in `promise.items`.
- **Turn position**: 35–75 % of the estimated total (`role: "turn"`; lint requires exactly one for m/l).
- **Total**: within ±20 % of `targetSeconds` (lint L-TOTAL-LEN). Estimate = narration chars / 8.4 + 0.75 s
  per beat, chapter cards per the table.

Tier defaults for `energy`: hook 5, evidence 4, so-what 3, turn 3, payoff 3, cta 4, outro 2. `make_bgm.py`
follows the energy curve of `out/storyboard.json`.

## 3. Platforms

Two aspect ratios come out of one content set: `Main` (1080×1440, 3:4) and `Short` (1080×1920, 9:16).
`platforms` picks which to render and which safe-area tokens `layout.ts` applies. Algorithm notes below
come from the 2026-09-03 review; the ones marked **二手** are second-hand reports, not platform documentation.

| platform | output | safe area | what it rewards |
|---|---|---|---|
| `xhs-3x4` | Main 1080×1440 | full frame usable; keep captions ≥ 120 px from the bottom for the UI overlay | 3:4 and 9:16 both recommended, landscape down-ranked (**二手**). Mid-2026 reports say 小红书 pushes mid-length video and weighs 收藏 / 关注 / 观看时长 / 弹幕 over completion rate (**二手**) → the long master optimizes watch time + saves: a screenshot-worthy `summary` card, a conclusion list, a `cta` that asks a real question. |
| `wechat-3x4` | Main 1080×1440 | keep key content inside the central **6:7** (1080×1260) area; the top ~90 px and bottom ~90 px are covered by 视频号 UI (official developer-community guidance) | Shares and 朋友圈 reach; captions and cards must sit inside the 6:7 box — the template's `wechat-3x4` tokens move the caption block and footer up. |
| `douyin-9x16` | Short 1080×1920 | top ~150–220 px (status/search), bottom ~300–380 px (caption/music), right ~120 px (buttons) unusable (**二手**, values differ by source) | First 3 s and a new stimulus every ~3 s; completion rate matters here → cut hard, no chapter cards, bigger captions (the template scales ×1.3). |
| `xhs-9x16` | Short 1080×1920 | as douyin minus the right column; keep captions above the bottom 300 px | Same account identity as the 3:4 master; used when the user wants the short on 小红书 too. |

Choose `platforms: ["xhs-3x4"]` when in doubt; add `"douyin-9x16"` when `shortVersion.enabled`.

## 4. Short cut

`shortVersion.script: "auto-cut"` (default): the Short composition plays only beats with `short: true`,
skipping `chapter` beats. Mark **hook + the 3 strongest evidence beats + the turn + cta**; add `summary` when
the estimate lands under the target. Lint checks the set contains hook and cta with ≥ 3 beats
(L-SHORT-STRUCT) and that the estimate is within ±25 % of `shortVersion.targetSeconds` (L-SHORT-LEN).
The GPT-6 example marks 7 beats for 63 s against a 75 s target.

Write a **separate short script** (`shortVersion.script: "separate"`, a second `content/` set in
`project-short/`) when: the long master is tier l (the cut would be > 25 % of it); the short has to open on a
different stake (a different audience); or the user wants a 15–30 s teaser (tier xs: hook → one conclusion →
one proof → one 争议). A separate short is still linted and storyboarded like any other project.

Short-cut rules: captions are re-fitted by the template (×1.3), so a 14-weighted-char line still fits;
bench duels drop the full-table flash; the badge stays; the outro is skipped unless marked.
