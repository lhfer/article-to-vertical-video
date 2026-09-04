# Captions — 20 that pass, 10 that fail

Rules (lint L-CAP-LEN / L-CAP-HOT): ≤ 14 weighted chars (CJK 1, ASCII 0.6, space 0); exactly one `hot` word
that occurs verbatim in `text`; one idea per line; verbs first; digits exact, spoken rounding stays in the
narration. Weighted length shown as `w`.

## 20 good lines

| text | hot | w | note |
|---|---|---|---|
| 它填 1040 报税表，比我准 | 比我准 | 11.4 | hook: stake, number from the page |
| 电脑操作考试 72.6% | 72.6% | 9.0 | alias + exact number |
| 比上一代高近 7 个点 | 近 7 个点 | 8.6 | spoken rounding is fine on screen when marked 近 |
| 界面找按钮 92.7% | 92.7% | 8.0 | alias + number |
| 一百次里九十多次点对 | 九十多次 | 10.0 | anchor sentence, Chinese numerals |
| 读 W-2，自动填 1040 | 自动填 | 9.2 | verb first, what the clip shows |
| 报销单、CRM、日程表 | 报销单 | 9.8 | the viewer's tasks, one hot |
| 填表的活，丢给它 | 丢给它 | 8.0 | the 所以呢 in 8 chars |
| 一道题 40 分钟，上代 75 | 40 分钟 | 10.4 | two numbers, one hot |
| 下午就能出第一版 | 第一版 | 8.0 | concrete task |
| 分是 OpenAI 自己测的 | 自己测的 | 9.6 | the 但是 |
| 出事率 2.4%，上一代 22% | 2.4% | 11.2 | lower-is-better pair |
| 越权率 48% → 0% | 0% | 7.0 | arrow reads as "to" |
| 比任何跑分都值钱 | 值钱 | 8.0 | `kind: take` |
| 命令行实战 57.9% vs 55.8% | 57.9% | 12.2 | duel in one line |
| 素数间隙：240 → 186 | 186 | 9.6 | the result number is hot |
| 第三方综合分 61.2 vs 65.7 | 65.7 | 12.0 | the rival's number is hot in the turn |
| 推理过程更难监控了 | 更难监控 | 9.0 | quote-shaped fact |
| 截图收藏这一页 | 收藏 | 7.0 | summary card cue |
| 报销单交给它填，你敢吗 | 你敢吗 | 11.0 | cta question |

## 10 bad lines and the rule they break

| text | hot | problem |
|---|---|---|
| OSWorld 2.0 72.6%，比 Sol 高近 7 个点 | 72.6% | w = 17.6 > 14 (L-CAP-LEN); two numbers compete |
| 幼儿园分析：学区、通勤、口碑 | 一次讲清 | hot word not in text (L-CAP-HOT) — renders with no highlight (v1 bug) |
| 速度、准确率、判断力，全面刷新 | 速度, 全面刷新 | two hot words (L-CAP-HOT) |
| 五速变速箱，齿轮与轴同步运转 | 同步运转 | w = 14.0 but two ideas; split: 五速变速箱 / 齿轮与轴同步转 |
| 意味着：又准，又快 | 又准，又快 | restates the number; hot word is the whole line |
| 新一代智能，已经到来 | 已经到来 | hype line; fine only as a quoted brand line, never as a caption claim |
| 此外，该模型同时支持多种任务 | 多种任务 | 此外/同时 connectives; "多种" is not an idea |
| 3 分钟讲清 3 件事 | 3 件事 | `check_numbers` will flag 3 分钟 as a number not in the article — use 三分钟 |
| 全球最智能、最对齐的模型 | 最智能 | vendor superlative presented as fact without 官方说 |
| GPT-6 Astra 在 Terminal-Bench 4.0 上取得 57.9% | 57.9% | w ≈ 24; a caption is not a sentence |

## Writing order

1. Write the narration first; 2. cut it into 2–4 spoken chunks; 3. compress each chunk to ≤ 14 weighted
chars keeping the verb; 4. pick the one word the eye should land on; 5. mark opinion lines `kind: take`.
`fitLines()` re-times lines proportionally to the narration, so keep the same order as the sentences.
