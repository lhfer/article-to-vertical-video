# 生成视觉：Grok Imagine 出封面、开场镜头、章节板、概念镜头、B-roll

工具：`scripts/media_provider.py`（调 `scripts/grok_media.py` → grok CLI 内置工具，走 Grok Heavy 订阅，不用 `XAI_API_KEY`）。
一切产物写进 `<workdir>/project/public/gen/`，并登记到 `public/gen/gen.json`。视频统一转成 ≤1600 px、30 fps、H.264 yuv420p、**无音轨**，
并附带一份预模糊的 `gen/<id>.bg.mp4`（270 px，gblur 14，压暗提饱和，crf 28），与 `clips/NN.bg.mp4` 同规格。

## 1. 什么时候生成什么

| 用途 | 命令 | 产物 | 何时用 |
|---|---|---|---|
| 封面 cover | `cover --prompt "…"` | `gen/cover.png`（3:4，864×1152） | 每支视频一张；`Cover` 合成在上面叠标题，所以主体压在下三分之二 |
| 开场镜头 hook shot | `video --id hook --from gen/cover.png --prompt "运镜"` 或 `video --id hook --prompt "画面"` | `gen/hook.mp4` + `.bg.mp4` | hook beat 的 `visual.kind = "broll"`；≤3 s 用到，生成 6 s 即可 |
| 章节板 / 背景板 plates | `plates --style "…" --count N` | `gen/plate-01.mp4 …`（480p 足够） | 章节卡、纯文字 beat 的底、`clip.bg = "plate"`；从 plate-01 编辑链出来，风格一致 |
| “意味着”概念镜头 | `broll --concept --id meaning-xxx --prompt "隐喻"` | `gen/meaning-xxx.mp4` | so-what / turn 段落，讲“这对你意味着什么”时的视觉隐喻，6 s |
| 无视频文章的 B-roll | `broll --id xxx --prompt "氛围画面"` | `gen/xxx.mp4` | 文章没有 mp4 可下载时，给字幕垫画面，一段 6 s 可反复用 |
| 账号徽章 badge | `badge --name "账号名" --prompt "…"` | `gen/badge.png`（1024²）+ `public/badge.png`（512²，自动裁掉模型爱画的外框；`--no-crop` 保留） | 一次生成长期复用；`brief.account.badge = "badge.png"` |

`brief.generation.allow` 里没有的用途不要生成（见 §7）。文章自己的图片/视频永远优先；生成视觉只是补位。

## 2. 边界（不能越线）

- **不出现数字**：屏幕上的数字只来自文章事实，由字幕/卡片渲染。提示词里含数字（含全角）直接被拒。
- **不冒充产品演示**：不要让生成画面看起来像“产品在跑”；写隐喻、氛围、人物状态、材质与光。
- **不模仿真实 UI**：提示词含 `界面 / UI / 图表 / 榜单` 被拒（`--allow-ui` 可覆盖，只在你确定是抽象表达时用）。脚本还自动追加硬否定：
  `no text, no numbers, no letters, no logos, no user interface, no charts, no watermark`。
- 生成画面只能落在 `hook.visual`、`broll`、`Cover`、背景板和徽章上；`clip / image / screenshot` beat 只放文章素材。
- 屏幕上**不加 AI 标签**（用户决定）；`gen.json` 里保留完整 prompt 与 provider 作为内部记录。
- 生成结果要看一眼：文字、字母、假界面偶尔会漏进画面（便签、屏幕、招牌最常见），发现就 `--force` 重出，或换提示词避开屏幕/纸张。

## 3. 提示词：你只写主体，脚本负责风格块与否定

最终图片提示词 = `Style: <主题风格块>. Subject: <你的描述>. <用途提示>. <硬否定>.`（徽章只用短的调色词句，避免“网格/写实”把徽章画成卡片样机）。主题风格块取自 `theme.ts` 的调色词：

| 主题 | 风格块（英文原文，脚本自动前置） |
|---|---|
| neon | Dark cinematic scene on a near-black navy background, neon cyan and electric violet rim light with a warm orange accent, glowing highlights, faint grid texture, floating light particles, high contrast, shallow depth of field, photographic realism |
| paper | Warm cream paper background, ink-black flat illustration with coral orange and cobalt blue accents, yellow marker highlights, hand-drawn sticky-note editorial illustration feel, soft paper grain, flat even lighting, generous negative space |
| editorial | Charcoal black background, muted off-white subject, a single gold accent light, restrained magazine-editorial photography, soft directional light, fine film grain, elegant minimal composition |

按用途写主体（英文更稳，中文也可）：

| 用途 | 模板 | 例子 |
|---|---|---|
| cover | 人物/物件 + 时间与光线 + 环境 + cinematic | a young office worker at a desk at midnight, laptop glow, city lights outside the window, cinematic |
| hook（运镜，配 `--from`） | 镜头动作 + 人物一个小动作 + 微漂移 | slow push-in, the worker leans toward the screen, subtle camera drift |
| concept（意味着） | A 变成 B 的隐喻 + abstract, clean | a stack of paper forms turning into a neat digital checklist, abstract, clean |
| broll | 场景 + 材质细节 + 光 | rain on an office window at night, soft bokeh, shallow focus |
| plate（`--style`） | 抽象材质 + 光，不带物件 | abstract flowing neon ribbons |
| badge | minimal emblem of + 吉祥物 + flat vector, single accent color | minimal emblem of a friendly cat wearing headphones, flat vector, single accent color |

`video/broll` 没有 `--from` 时：`--prompt` 描述画面（先 image_gen 再 image_to_video），运镜用 `--motion`（默认按用途：hook 缓推、plate 无进出物的漂移、concept 轻微漂移）。
有 `--from` 时：`--prompt` 就是运镜文字；同时给 `--motion` 则 `--motion` 是运镜、`--prompt` 是场景说明。徽章的账号名只登记、不送进模型（名字会引出字母）。

## 4. 一致性配方：一张底图 → 编辑链 → 图生视频

同一支视频里的生成画面要像一套：`plates` 已内置（plate-01 用 image_gen，plate-02… 用 image_edit 从 plate-01 改构图，再各自 image_to_video）。手工同理：

```bash
media_provider.py --provider grok-cli --theme neon image --project P --id base  --prompt "…" --aspect 3:4 --use concept
media_provider.py --provider grok-cli image --project P --id meaning-a --from gen/base.png --prompt "new composition …"
media_provider.py --provider grok-cli video --project P --id meaning-a --from gen/meaning-a.png --prompt "gentle camera drift"
```

`image_edit` 与 `image_to_video` 都**继承输入画幅**，所以 `--aspect` 只在没有 `--from` 时有效；想要 9:16 就从 9:16 的底图开始。
已存在的产物默认跳过（`--force` 重出）；同一 id 的 image 与 video 各占一条 gen.json 记录。

## 5. CLI 限制（2026-09-03 在 grok 1.0.18 实测）

| 项 | 结果 |
|---|---|
| `image_gen` 3:4 | 864×1152 JPEG，约 20–30 s；1:1 → 1024×1024（脚本转 PNG；占位模式按 1152 长边合成） |
| `image_edit` | 输出跟随输入画幅，JPEG，约 20–30 s；最多 5 张参考图 |
| `image_to_video` | 时长只能 **6 或 10 s**，分辨率 **480p / 720p**；3:4 底图 720p → **816×1104**，480p → 480×640，1:1 480p → 544×544；**24 fps，带 AAC 音轨**（脚本 `-an` 去掉并转 30 fps）；还带一条 mjpeg 封面流（脚本只取 `0:v:0`）；约 45–55 s |
| 每次调用 | 只开放一个工具（`--tools <id>`，`bash` 不合法）；一次工具往返 2 turn，故 `--max-turns 4`；聊天成本约 $0.005–0.008，Imagine 额度走订阅 |
| 证据 | 每次运行在 `--work-dir`（默认 `<project>/gen-work/<id>/{image,i2v}/`）留下 `grok-stream.ndjson` 与原始 `raw.mp4` |
| 失败 | 401/403 或“not logged in” → 让用户 `grok login`，**不要**改用 `XAI_API_KEY`；文生视频 `video_gen` 在 headless 不可用；超时图片 300 s、视频 720 s |

`--provider grok-rest`（api.x.ai：`/v1/images/generations` grok-imagine-image-2.0、`/v1/videos/generations` + `GET /v1/videos/{id}` grok-imagine-video-1.5，`generate_audio: false`）仅在显式设置 `XAI_API_KEY` 时可用，是按文档写的、本机未验证的备用路径。

## 6. 模板怎么用 gen/ 里的文件

所有 `src` 相对 `project/public/`，`w/h/seconds` 直接抄 `gen.json`（ffprobe 实测值，不要猜）：

```jsonc
// hook beat：开场镜头
{ "id": "hook", "kind": "hook", "hook": { "text": "…", "visual": { "kind": "broll", "src": "gen/hook.mp4", "w": 816, "h": 1104, "from": 0, "to": 6 } } }
// broll beat：概念镜头 / B-roll（caption 可选；prompt 只是记录，不上屏）
{ "id": "meaning-tax", "kind": "broll", "narration": "…", "broll": { "src": "gen/meaning-tax.mp4", "w": 816, "h": 1104, "caption": "…" } }
// Cover 合成读 public/gen/cover.png；徽章：brief.account.badge = "badge.png"（public/badge.png）
// 背景板：clip.bg = "plate" 或纯文字 beat 的底，模板从 gen/plate-NN.bg.mp4 / plate-NN.mp4 取
```

场景里同一时刻只解一路视频：需要模糊背景时用 `gen/<id>.bg.mp4`，不要再叠一个全尺寸 `<Video>`。`lint_content.mjs` 会检查 `src` 文件存在。

## 7. `brief.generation` 如何门控

```jsonc
"generation": { "provider": "grok-cli", "allow": ["cover", "hook", "plates", "concept", "broll", "badge"] }
```

- `provider` 缺省时脚本读 brief（`--provider` 覆盖）；`none` 只打印计划并返回 0，`none --placeholder` 离线合成主题色占位（尺寸/时长/无音轨都与真品一致，供渲染流水线跑通）。
- `allow` 是白名单：不在其中的用途不要调用对应命令，改用主题自带的纯色/网格底。`hook` 缺席时 `hook.visual.kind` 用 `"text"` 或文章图片。
- `--theme` 缺省读 `brief.theme`，风格块随之切换；三种主题下同一 prompt 会得到三种色系。

## 8. 手工登记：`ingest`

任何手工得到的文件（Grok Build 里直接调工具、别处生成、用户给的素材）都用 `ingest` 进登记表，走同一套转码和 bg 生成：

```bash
media_provider.py ingest --project P --id hook --in /path/to/1.mp4 --source grok-build --prompt "原始提示词"
media_provider.py ingest --project P --id cover --in /path/to/1.jpg            # 图片转 PNG 到 gen/cover.png
media_provider.py list --project P                                             # 看 gen.json
```

## 9. 宿主差异

- **Grok Build**：直接调内置工具 `image_gen(prompt, aspect_ratio)`、`image_edit(prompt, image=[…])`、`image_to_video(image, prompt, duration, resolution_name)`，返回 `~/.grok/sessions/…/images/N.jpg | videos/N.mp4` 的绝对路径；随后用 `ingest` 登记转码。提示词仍按 §3 拼（风格块 + 主体 + 否定），数字/界面规则同样适用。
- **Claude Code / Cursor / Codex / Gemini CLI**：统一用 `media_provider.py --provider grok-cli`，要求本机 grok CLI 已登录（`grok_media.py doctor` 自检）。
- 长任务：一支视频通常 1 张封面 + 1 个 hook + 2–3 个概念镜头 + 2 块板，约 5–8 分钟串行；命令彼此独立，可分两个进程并行。
