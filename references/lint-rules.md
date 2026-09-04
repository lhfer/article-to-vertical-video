# 内容检查规则（lint_content · check_numbers · storyboard）

三个工具都只读 `<project_dir>/content/*.json`（+ 可选 `narration-durations.json`、`public/`），不改文件。
时长模型三处一致（模板 `fitSeconds`、lint、storyboard）：配音秒数 + 0.25 前导 + 0.5 尾巴；没有配音时长就按 字数 ÷ 8.4 估；
clip 场景 = max(配音拟合, (to − from) / rate)，素材最多放慢到 0.75×；章节卡 m 0.8 s、l 1.4 s（xs/s 不出卡）。

## 怎么跑、怎么读

```bash
node scripts/lint_content.mjs <project_dir> [--json] [--strict] [--article <article.md>]
node scripts/check_numbers.mjs <project_dir> <article.md> [--json]
python3 scripts/storyboard.py <project_dir> [--out 分镜.md] [--json 指标.json]
bash scripts/tests/lint/run_tests.sh        # 自测：fixtures + schema 交叉验证，最后一行是总结
```

- lint 人读模式：先列文件状态与档位，再按 `ERROR ×n` / `WARN ×n` 分组，每行 `[规则码] beat <id>：说明（含出问题的原文片段）`。
  `--json` → `{ok, exitCode, errors:[{code, beat, message}], warnings:[…], stats:{tier, estimatedSeconds, shortSeconds, deadAir, numbers…}}`。
  exit 0 通过；1 有 ERROR（或文件读不出来）；2 用法错误，或 `--strict` 下只有 WARN。`--article` 会顺带跑 check_numbers：MISS → `N-MISS`（ERROR），弱匹配 → `N-WEAK`（WARN）。
- check_numbers：四个桶。`✓ 已核对`（打印原文 ±40 字上下文，数值用【】标出）、`? 弱匹配`（值在原文里，但 160/200 字内没有模型名 / 标签，请人工确认）、
  `· 未核对`（两位以内裸整数、型号数字、近/约/大概/差不多/超过/不到/两/几 开头的口语约数）、`✗ MISS`（没找到 → exit 1）。
  take 句（`takes[].text`、`take.text`）和带 `card.source` 的卡片对照 `sources.json` 引文而不是原文；没有 source 直接算 MISS。
- storyboard：每个 beat 一行（章节卡也算），8 列 `# | 时间 | 场景 | 画面 | 屏幕文字 | 旁白 | 音效/转场 | 情绪`；带 `*` 的配音秒数是估算。
  表下「节奏指标」：总时长 vs 目标、各类型占比、空白处、视觉事件最长间隔、转折位置、短版时长、缺旁白 / 缺配音时长、章节。
  `--json` 另存同样的指标 + `beats:[{id, kind, start, seconds, energy, short, vo}]`（`make_bgm.py --energy` 读这个）。永远 exit 0，只有文件缺失 / JSON 坏了才 exit 1。

## 规则表

| 代码 | 级别 | 检查什么 | 为什么 |
|---|---|---|---|
| S-FILE | ERROR | `brief.json`、`script.json` 必须存在可读；`bench.json`、`sources.json` 可选 | 没有这两份什么都做不了 |
| S-JSON | ERROR | 每个文件都是合法 JSON | 半截 JSON 会让模板在渲染时才崩 |
| S-SCHEMA | ERROR | 对照 `schemas/*.json`：类型、必填、枚举、长度、额外字段、id 模式、数值范围 | 模板按 schema 读字段，不合规就是未定义行为 |
| L-ID-DUP | ERROR | beat id 唯一 | id 是配音文件名和时长表的键 |
| L-ID-PATTERN | ERROR | id 匹配 `^[a-z0-9][a-z0-9-]*$`、≤ 32 字符 | 要当文件名和 CLI 参数用 |
| L-PAYLOAD | ERROR | 除 chapter 外，每个 beat 都有与 kind 同名的载荷对象 | 没有载荷模板只能渲染空场景 |
| L-CHAPTER-REF | ERROR | `chapter` 引用的章节在 `chapters` 里；chapter beat 必须带 `chapter` | 章节卡要拿标题和编号 |
| L-CAP-LEN | ERROR | 字幕加权长度 ≤ 14（中文 / 全角标点 1，数字 / 拉丁 / ASCII 标点 0.6，空格 0） | 3:4 画幅一行大字最多这么宽 |
| L-CAP-HOT | ERROR | 每条字幕恰好一个 hot 词，且必须出现在 text 里 | 高亮找不到词就整行不高亮 |
| L-CARD-COUNT | ERROR | 每个 beat 最多 2 张卡片 | 再多就盖住画面 |
| L-CARD-OVERLAP | ERROR | 同一 beat 的卡片时间段不重叠 | 两张卡叠在同一位置 |
| L-FIRST-HOOK | ERROR | 第一个 beat 是 hook | 前 3 秒决定完播 |
| L-LAST-CTA | ERROR | 最后一个是 cta 或 outro；outro 前必须有 cta | 评论区提问是互动来源 |
| L-TURN | ERROR | m / l 档恰好一个 `role: "turn"` 的 beat（tier 取 brief.tier，否则按 targetSeconds：xs ≤ 30、s ≤ 90、m ≤ 240、l > 240） | 「但也别吹过头」是可信度和节奏的转折 |
| L-BENCH-REF | ERROR | bench beat 引用的表都在 `bench.json`；有 bench beat 就必须有 bench.json | 表不存在对决图就是空的 |
| L-CLIP-RANGE | ERROR | clip（含 hook.visual 的 clip / broll）from < to | 负时长素材 |
| L-CLIP-RATE | ERROR | clip.rate ∈ [0.75, 4] | 更慢会卡帧，更快看不清 |
| L-RECT | ERROR | focus / highlight 矩形落在 w×h 内 | 裁切框出界 = 黑边 |
| L-SRC | ERROR / WARN | clip / image / screenshot / broll / hook.visual 的 src 存在于 `public/`；`public/` 还没建、或对应目录（`clips/`、`images/`、`gen/`）里还没有任何素材时降为 WARN | 渲染时 404 |
| L-TAKE-TEXT | ERROR | take.text 是本 beat 旁白或某条字幕的子串 | 观点卡要和旁白同步出现 |
| L-TAKE-SOURCE | ERROR | 含数字的 take 必须带 `source` | 观点里的数字最容易被质疑 |
| L-SOURCE-REF | ERROR | takes / take / cards 引用的 source id 存在于 `sources.json` | 引用了不存在的出处 |
| L-NARR-LEN | ERROR / WARN | 每个 beat 旁白 ≤ (maxSeconds ?? 档默认秒) × 9 字；> 1.3 倍 ERROR，超出 WARN | 旁白比场景长会被截断或拖慢 |
| L-BANNED | ERROR | 旁白含 `references/banned-words.txt`（没有则内置：登场、震撼、重磅、颠覆、史诗级、王炸、炸裂、新一代智能已经到来、见证历史） | 播音腔一开口就掉粉 |
| L-VO-LONG | ERROR | 有配音时长时：clip 配音秒数 > (to − from) / 0.75 | 素材放到最慢也盖不住旁白 |
| N-MISS | ERROR | `--article`：数字在原文 / 引文里找不到 | 数字错一个，整条视频被打脸 |
| L-PERSON | WARN | clip / bench / kinetic 旁白含 我 / 你 / 你们 / 咱 | 没人称就是念稿 |
| L-HOOK-LEN | WARN | hook 旁白 ≤ 32 字、hook.text 加权 ≤ 16 | 开场要一句话说完 |
| L-SHORT-STRUCT | WARN | shortVersion.enabled 时：short=true 的 beat ≥ 3 且含 hook、cta | 短版也得有头有尾 |
| L-SHORT-LEN | WARN | 短版预计时长在 shortVersion.targetSeconds ±25% 内 | 短版目标是平台限时 |
| L-TOTAL-LEN | WARN | 预计总时长在 brief.targetSeconds ±20% 内 | 目标时长决定节奏档位 |
| L-GLOSSARY | WARN | 每张 bench 表第一次被旁白提到时带人话别名（表 `alias`，否则 `references/glossary.json`） | 观众不认识 OSWorld，认识「电脑操作考试」 |
| L-SUMMARY | WARN | l 档有 summary beat | 长视频需要截图收藏点 |
| L-DEAD-AIR | WARN | 有配音时长时：非 chapter 场景 预计秒数 − 配音秒数 > 1.2 s | 素材比旁白长就是干等 |
| L-BADGE | WARN | account.badge 文件存在于 `public/` | 角标缺了模板会留空 |
| N-WEAK | WARN | `--article`：数值在原文里，但附近没有模型名 / 标签 | 可能对到了别的模型的分数 |

## 档位表

| 档 | 目标时长 | 每 beat 旁白预算（默认秒 × 9 字；> 1.3× 为 ERROR） | 章节卡 | 无配音场景上限 | 视觉事件间隔目标 |
|---|---|---|---|---|---|
| xs | ≤ 30 s | 4 s → 36 字（ERROR > 46） | 无 | 4 s | ≤ 2 s |
| s | 31–90 s | 6 s → 54 字（ERROR > 70） | 无 | 6 s | ≤ 3 s |
| m | 91–240 s | 12 s → 108 字（ERROR > 140） | 0.8 s | 10 s | ≤ 6 s |
| l | > 240 s | 15 s → 135 字（ERROR > 175） | 1.4 s | 14 s | ≤ 8 s |

其他阈值：字幕加权长度 ≤ 14；hook 旁白 ≤ 32 字、hook.text 加权 ≤ 16；卡片 ≤ 2 张 / beat；clip.rate ∈ [0.75, 4]；
空白阈值 1.2 s（场景 − 配音）；总时长 ±20%，短版 ±25%；转折位置建议落在片长 35–75%（storyboard 指标，不算 lint 错误）；
数字核对：模型名在数值前 160 字内、标签词在 200 字内；数值 + 单位须紧邻（允许空格，`70.2% 3` 这种脚注粘连算找到）。

## 测试

`scripts/tests/lint/fixtures/`：`ok/`（m 档全绿）、`bad/`（每条 ERROR 至少一次 + 多条 WARN）、`bad-missing/`、`bad-json/`、
`numbers/`（MISS / 弱匹配 / 未核对 / take 对引文）。`run_tests.sh` 断言 exit code、每个规则码、storyboard 的 8 列与指标、
`beats[].energy`，并用 `schema_crosscheck.py` 拿 python3-jsonschema 交叉验证自写校验器（含 55 个变异用例；jsonschema 仅测试用）。
若 `assets/template/content/` 或 `references/example-gpt6/content/` 存在也会冒烟跑一遍（默认只报告，`A2V_TEST_EXTERNAL_STRICT=1` 才计入失败）。
