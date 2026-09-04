# Content guide: story, rhythm, copy, honesty

Everything the model writes goes into `project/content/{brief,script,bench,sources}.json` (schemas in
`schemas/`). This guide is the editorial half of the contract; `scripts/lint_content.mjs` is the mechanical
half and stops the pipeline when a rule below is broken. Read `references/briefs.md` first for the skeleton
of your brief type, then `references/examples/*.md` for good/bad lines, then this.

## 1. Story skeleton

A beat is one scene and one idea. The order for tiers m/l:

1. **Hook (≤ 3 s, `kind: hook`, `role: open`)** — the *viewer's* stake or a 反常识 fact, never the product
   name. "它填报税表比我准" beats "GPT-6 Astra 新一代智能". Narration ≤ 32 chars; `hook.text` ≤ 16 weighted
   chars. Visual: a generated shot of the viewer's situation (`visual.kind: broll`), the best 2 s of a
   demo (`clip`), the page's hero image (`image`), or big text (`text`).
2. **Promise (`promise`)** — what the viewer gets and the open loop: "三分钟讲清三件事，中间说它输在哪". Tier l
   lists chapters in `promise.items` (目录).
3. **Chapters = the viewer's questions**, not the article's headings ("它能替我干哪些活", "敢不敢交给它",
   "谁该先用"). Each chapter is four moves: **主张** (one claim, a `bench`/`scorecard`/`kinetic`) → **证据**
   (1–2 `clip`/`image`/`screenshot`/`quote`; every claim gets a visible proof) → **所以呢** (`take`: what it
   means for the viewer's Tuesday, one concrete task) → **但是** (`kinetic`/`take`: the limit, the footnote,
   the thing the page does not say). 主张 → 证据 → 改写 is the v1 failure mode; 所以呢 must add a judgment.
4. **Turn (`role: turn`, one per video)** at **35–75 %** of the runtime: the tables the product loses, the
   caveat buried in a footnote, the strongest counter-argument. Announce it in the promise, pay it mid-video.
5. **Summary (`summary`)** — a screenshot-worthy 总结卡: 3–5 items ≤ 20 chars, verdict-shaped
   ("填表、约号：能放手"). This is the save-worthy moment the 小红书 long master optimizes for.
6. **CTA (`cta`)** — one contentious question the audience is split on ("你会把报销单交给它填吗？"), not "关注我".
7. **Outro (`outro`)** — price, availability, "参数规模：官方未公布". Lowest energy; keep it short.

Tiers s/xs collapse this to hook → 3 beats (or 1) → turn → cta; see the tier table in `briefs.md`.

Order chapters by strength of evidence, not by the article's order. Put the strongest demo second, not
first (the hook is first). Never repeat a number in two beats (v1 showed 72.6 % as a chart and again as a
card); each number has one home.

## 2. Rhythm hard targets

- **Dead air ≤ 1.2 s per beat** (chapter cards excepted). The template fits each scene to its voice-over
  (grows *and* shrinks); a clip whose footage `(to − from) / rate` outlasts the narration is dead air →
  shorten `from/to`, raise `rate` (≤ 4), or add a sentence. Lint L-DEAD-AIR warns from the estimate,
  L-VO-LONG fails when the narration cannot be covered even at 0.75×.
- **Visual event interval**: xs ≤ 2 s · s ≤ 3 s · m ≤ 6 s · l ≤ 8 s. Events: a cut, a card, a hot word, a
  bench reveal, a Ken Burns arrival, a `resultAt` slow-down. `storyboard.py` reports the longest gap.
- **Recap cadence**: a new fact or verdict every ~25 s; tier l gets a recap beat every ~60 s.
- **Chapter cards** 0.8 s (m) / 1.4 s (l) / none (s, xs). Never longer; they are dead air by design.
- **Scene base seconds without VO** are capped per tier (4 / 6 / 10 / 14 s). If a beat has no narration it
  must earn its seconds visually (a clip with `resultAt`, a table flash), otherwise give it a line.
- **Totals**: ±20 % of `targetSeconds`; short cut ±25 % of `shortVersion.targetSeconds`. Estimate =
  chars / 8.4 + 0.75 s per narrated beat.

## 3. Captions (`lines`)

One caption at a time under the visual. Rules (lint L-CAP-LEN, L-CAP-HOT):

- **≤ 14 weighted chars**: CJK/full-width 1, ASCII letters/digits/punctuation 0.6, spaces 0. A 16-char line
  wraps and orphans one character.
- **Exactly one `hot` word** and it must occur verbatim in `text`. Two hot words cancel each other; a hot
  word that is not in the text renders nothing (v1's `kindergarten` bug).
- **One idea per line, verbs first**: "读 W-2，自动填 1040", "填表的活，丢给它". No "此外/同时/而且".
- 2–4 lines per beat, in the same order and rough proportion as the narration sentences; when narration
  audio exists the template re-times lines by character weight (`t`/`d` are ignored).
- Mark opinion lines `kind: "take"` — the template styles them with the badge stamp.
- Numbers on screen are exact and in digits ("72.6%"); spoken numbers may be rounded ("近 7 个点"). Numbers
  about the video itself ("三分钟讲清三件事") go in Chinese numerals so `check_numbers` does not treat them
  as article facts.

## 4. Cards (`cards`)

Glass panel above the caption block; **max 2 per beat, never overlapping in time** (L-CARD-COUNT,
L-CARD-OVERLAP). Kinds:

- `stat`: one number with `prev` + `prevLabel` (the previous model / the old bound). Set `lowerIsBetter`
  for error rates and durations; the bar cannot express direction, so say it in the label too
  ("越权行为（无护栏 · 越低越好）"). Integers render as integers (`40 分钟`, not `40.0`).
- `chip`: one sentence of context that is not a number ("遇到会改变结果的关键信息，它会先问你").
- `quote`: typewriter quote, sparingly (the `quote` beat kind is the full-screen version).
- Every `value`/`prev` must be in the article (or carry `source` → `sources.json`). A card must not repeat
  the number the beat's bench duel already shows.

## 5. Bench duels (`bench` + `bench.json`)

- `mode: "duel"`: hero vs the best other row, **one number at a time**, count-up, "领先 X +d" chip, ≤ 4 s per
  reveal; the full table flashes ≤ 1.5 s at the end (long master only). `mode: "table"` is the 1.5 s flash
  alone (data-story). 1–2 tables per beat, ≤ 8 rows each, only rows with a published value — never zero-fill.
- **Alias on first mention** (L-GLOSSARY): the first narration that names a table says its 人话别名 from
  `bench.json.alias` or `references/glossary.json` — "电脑操作考试 OSWorld，它 72.6%". Aliases ≤ 12 chars.
- **Anchor sentences** make a percentage physical: "100 道题做对 72 道", "一百次里九十多次点得对", "10 件活干成 6
  件". One anchor per duel, in narration or a caption, not both.
- `note` carries the article's footnotes about competitor scores (modified evals, third-party
  reproductions, reduced-safeguard variants); `flag: "*"` on the affected rows; `bench.footnote` on the
  beat points at them ("* 见 OpenAI 脚注 3、17"). The viewer must never feel a number was hidden.
- Include the tables the hero loses (the turn). Keep `meta.footer`: "竞品分数为 <厂商> 报告值".
- **Extraction gotcha**: page tables glue footnote digits onto cells (`70.2% 3`, `28.4%16`, `GPT-5.6 Sol 2`);
  some tables come out one cell per line. Read cells with the footnote list open; `check_numbers.mjs`
  catches the transcription slips.

## 6. Narration (`narration`)

The voice is what users judge first. Defaults: Seed-TTS 2.0 清爽男大, rate 28 ≈ **8.4 chars/s**.

- **Budget** per beat = tier seconds × 9 chars (m: 108). Longer narration = slower video (L-NARR-LEN).
- **Register**: first person to second person ("我 … 你"), like telling a colleague. `clip`/`bench`/`kinetic`
  beats must contain 我/你/咱 (L-PERSON). Contractions and spoken rhythm; no stage directions in the text
  (tone goes in `brief.tts.style`).
- **Banned 播音腔 words** (L-BANNED): `references/banned-words.txt` — 登场、震撼、重磅、颠覆、史诗级、王炸、炸裂、
  见证历史… Fine as on-screen text only when quoting the page.
- **Round in speech, not on screen**: "近 7 个点", "两倍多", "七成多" spoken; the chart shows 72.6 / 65.7.
- **"意味着" names a task, never restates the number**: ✗ "意味着又准又快" · ✓ "意味着你让它开软件、点按钮、填表，
  一百次里九十多次点得对". Every number cluster gets one 意味着 or one 所以.
- **Pattern for duels**: alias + name → hero number → best rival → anchor → 意味着 (one concrete task).
- **Pattern for clips**: what you see → what it did → why you care ("你想想，报销单、CRM 客户记录…").
- Break the formula at least once per chapter (a question, a confession "我看了两遍", a verdict).
- Vary sentence openers; 12 beats starting with "X 拿了 Y%" is the v1 monotony.

## 7. The 7 insight questions (run before writing beats)

Answer each in one or two sentences from the article; the answers become 所以呢 / 但是 / turn / summary /
cta. Two worked answers each from the GPT-6 page (`references/example-gpt6/article.md`):

1. **对普通人意味着什么** — translate each capability into one concrete task and who it hits.
   - "Filling out online forms, updating customer records in a CRM, organizing your calendar" → 填报销单、
     更新 CRM、整理日程；影响的是行政、销售运营、财务小助理。
   - OSWorld 72.6 % at ~40 min vs 65.7 % at ~75 min → 一道电脑操作题 40 分钟：下班前交的活，它下午就能出第一版。
2. **最反直觉的一点** — the fact the headline hides.
   - The impossible-task eval: Sol went beyond scope 48 % of the time, Astra 0 % → 守边界比跑分更值钱。
   - Coding lead is tiny (Terminal-Bench 57.9 vs Fable 55.8; DeepSWE 74.1 vs 73.8) while science is a
     chasm (64.6 vs 22.4) → 程序员别慌，科研人先上手。
3. **页面没说的** — price vs last gen, parameters, latency, 国内可用性, data privacy.
   - Parameters: not published → "参数规模：官方未公布" on screen. Price is published ($10/$50) but not
     compared with Sol → say "官方没给对比".
   - 国内可用性 and ChatGPT-chat behaviour (footnote 2 says the chat version differs) → not covered; list in
     the report, do not speculate.
4. **横向对比的坑** — modified evals, vendor self-testing, footnotes.
   - "Evaluation scores are the maximum at any effort … run in our research environment" → 这些分是
     OpenAI 自己测的，取的是最高档；信方向，别信小数点。
   - Footnotes 3/5/17: Claude OSWorld reproduced by a third party, BenchCAD with 3 modifications, Fable
     scores from the fewer-safeguards Mythos → `flag: "*"` rows + `note`.
5. **一句话判断** — wait or switch?
   - 填表类可逆任务：能放手；钱和账号：开着自动审批，让它先问你。
   - 综合分（AA 指数 61.2 vs Fable 65.7）没全胜 → "专项最强，综合没全胜，别神话".
6. **分人群建议** — one line each for 学生 / 打工人 / 开发者 (or the groups the article implies).
   - 打工人：先把报销单、日程、CRM 丢给它试一周。开发者：几家差不多，换不换看工具链。科研：跑数据这类活明显更顺。
   - Enterprise admins: "access is off by default at launch" → 想用得先找管理员开。
7. **争议点做 CTA** — the question the comments will fight about.
   - "你会把自己的报销单、报税表交给它填吗？敢的打个一，不敢的说说你怕什么。"
   - "推理更难监控了，官方自己写的——你觉得这是坦诚还是警报？"

For non-tech briefs swap the set: news → 谁受益谁受损 / 下一步会怎样 / 官方没说的; tutorial → 最容易踩的坑 /
省下的时间 / 谁不该用这个方法; opinion → 作者最强的一句 / 最弱的一句 / 我站哪边.

## 8. Facts vs takes

Two layers, one rule each:

- **Facts** (numbers, dates, prices, quotes, names of who did what) come **only from the article** and
  are verified by `check_numbers.mjs` against `assets/article.md`: bench rows, card values, caption and
  narration numbers with a unit or a decimal. Losing tables are facts too. Competitor numbers are
  vendor-reported → footer. If the page is unreachable, list the numbers and ask before rendering.
- **Takes** are opinions: every judgment sentence in `narration` is listed in the beat's `takes[]` (verbatim
  substring, L-TAKE-TEXT) or is the `take` beat's payload. A take that brings **outside facts or any
  number** carries `source: "sN"` → `sources.json` with the URL, the fetch time and the **verbatim quote**
  that supports it (L-TAKE-SOURCE, L-SOURCE-REF; `check_numbers` checks take numbers against the quote).
  You may cite the article page itself as a source for a take that leans on one of its sentences. Never
  invent a quote; if you did not fetch it, you cannot cite it.
- **On screen**: takes are stamped — the account badge pulses and a small "观点" tag appears on the
  caption (`lines[].kind: "take"` and `take` beats). No "AI 生成" label anywhere (user decision).
- **In `out/report.md`**: fetch time of the article, every take with its source and quote, generated shots
  used and where, numbers that are *not* in the article (should be none), unreachable media, silent clips.

## 9. Persona phrasebanks

`brief.persona.phrasebank` names one; the voice style string stays the same (清爽男大, rate 28).

### `worker` — 打工人视角

Landed (use freely):
1. 家人们，今天必须聊聊这个
2. 我把 12 个演示全看了一遍
3. 这波真的有点东西
4. 我看得一愣一愣的
5. 说句实话，我最关心的不是分
6. 是它能不能替我填报销单
7. 你想想，报销单、日程、客户记录
8. 下班前交的活，它下午就能出第一版
9. 敢放手了，但别放手到钱和账号
10. 让它先问我
11. 信方向，别信小数点
12. 别吹过头 / 先泼冷水
13. 这一条比任何跑分都值钱
14. 程序员别慌，科研人可以先上手
15. 评论区聊聊：敢，还是不敢

Rejected (播音腔 or empty):
1. 登场 / 震撼 / 重磅 (banned)
2. 新一代智能已经到来 (spoken)
3. 意味着又准又快 (restates the number)
4. 官方的说法叫… (hedging instead of judging)
5. 用户可以… (say 你)
6. 赋能 / 全面领跑 / 引领
7. 值得期待，让我们拭目以待
8. 综合来看，这是一款… (product-review voice)
9. 不得不说 / 毫无疑问
10. 数据不会说谎 (it does; footnotes)

### `neutral` — 中性解说

Landed: 先看结论 · 换成人话是 · 这个数字的意思是 · 对比一下上一代 · 官方页面写了 · 脚注里说 · 我的判断是 ·
但要注意 · 目前没有公开 · 值得等一等 · 适合谁 · 不适合谁 · 一句话总结 · 你怎么看 · 数据来源在评论区。
Rejected: the same banned list; plus 惊艳、绝了、太强了 (empty superlatives) and 大家都知道 (they don't).

## 10. Glossary

`references/glossary.json` maps terms to `{ alias, anchor }`. Say the alias the first time a benchmark or
term appears ("命令行实战题 Terminal-Bench"), then the name alone. Use the anchor sentence when the
number needs a physical image. Add every new benchmark you meet (keep aliases ≤ 12 chars); `bench.json.alias`
overrides the glossary for that table.

## 11. Generated visuals

Only when `brief.generation.allow` includes the use: `cover`, `hook` shot, chapter `plates`, `concept`
shots for a 意味着, `broll` for pages without video, `badge`. Prompts never contain numbers, UI, charts or
anything that could pass as a product demo (`media_provider.py` rejects such prompts); generated clips are
transcoded and stripped of audio. See `references/media-generation.md` (owner: media provider agent).

## 12. Lint

Rule codes, levels and messages live in `references/lint-rules.md` (mirrors `RULES` in
`scripts/lint_content.mjs`; run `node scripts/lint_content.mjs --help` for the live list). Errors block;
warnings are listed. Run it after every edit of `content/*.json`; add `--article <article.md>` to fold in
`check_numbers.mjs` (N-MISS is an error). `--strict` turns warnings into failures for evals.

Tier table the lint uses (same as `briefs.md`):

| tier | targetSeconds | chapter card | max scene w/o VO | event interval | narration budget / beat |
|---|---|---|---|---|---|
| xs | 15–30 | none | 4 s | ≤ 2 s | 36 chars |
| s | 31–90 | none | 6 s | ≤ 3 s | 54 chars |
| m | 91–240 | 0.8 s | 10 s | ≤ 6 s | 108 chars |
| l | 241–900 | 1.4 s | 14 s | ≤ 8 s | 135 chars |

Structural rules to remember while writing: first beat `hook` · last beat `cta` (or `outro` after a `cta`)
· exactly one `role: "turn"` (m/l) · every beat has the payload object named after its kind · ids
`^[a-z0-9][a-z0-9-]*$` · `short: true` on hook + cta + ≥ 1 more.
