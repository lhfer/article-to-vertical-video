# Hooks — 12 templates, filled, plus 6 that fail

The hook is beat #1 (`kind: hook`, `role: open`, `short: true`): ≤ 3 s, narration ≤ 32 chars, `hook.text` ≤ 16
weighted chars, one caption line. It states the **viewer's** stake or breaks an expectation. Product name
optional; brand slam never. Numbers in a hook must be in the article (or Chinese numerals when they are
about the video). Filled examples use the GPT-6 page (`references/example-gpt6/article.md`).

| # | template | pattern | filled example (`hook.text` / narration) |
|---|---|---|---|
| 1 | **Stake** | 「它 + 你每天做的事 + 比你」 | 它填报税表比我准 / OpenAI 说这模型填报税表比我准，我把 12 个演示全看了一遍。 |
| 2 | **Contradiction** | 「官方说 A，表里是 B」 | 综合分它其实没赢 / 官方说全球最强，第三方综合分它排第四，我把表翻出来给你看。 |
| 3 | **Open loop** | 「最后告诉你 + 它输在哪」 | 它输在哪，最后说 / 三分钟讲清它能替你干啥，最后告诉你它输在哪。 |
| 4 | **Number shock** | 「一个反差数字 + 单位」 | 出事率 22% 降到 2.4% / 上一代操作电脑出事率 22%，这一代 2.4%，我想知道差在哪。 |
| 5 | **我试了 / 我看了** | 「我 + 动作 + 数量」 | 12 个演示我全看了 / 12 个官方演示我全看完了，挑三个你会用到的说。 |
| 6 | **反常识** | 「以为 X，其实 Y」 | 写代码反而差距最小 / 我以为它最强的是写代码，结果差距最小的就是写代码。 |
| 7 | **Time saved** | 「原来 N 分钟，现在 M 分钟」 | 一道题 75 分钟变 40 分钟 / 同一道电脑操作题，上一代 75 分钟，它 40 分钟，这意味着什么？ |
| 8 | **Question to the viewer** | 「你敢 + 把 X 交给它吗」 | 你敢让它填报销单吗 / 你敢把报销单交给 AI 填吗？看完这 12 个演示再回答。 |
| 9 | **The buried line** | 「页面第 N 段藏了一句」 | 官方承认更难监控了 / 发布页有一句“推理更难监控了”，我觉得比所有跑分都重要。 |
| 10 | **Who should care** | 「X 的人先别划走」 | 做科研的先别划走 / 做科研跑数据的先别划走，这次差距最大的就是你们这块。 |
| 11 | **Money** | 「多少钱 + 值不值」 | 每百万 token 50 美元 / 输出每百万 token 50 美元，打工人到底该等套餐还是充 API？ |
| 12 | **Before / after** | 「原理图进去，板子出来」 | 原理图进去，板子出来 / 原理图丢进去，15 秒后出来一块能送厂的电路板，我看愣了。 |

Template 7's minutes and template 11's price are article facts; template 4's rates are from the alignment
table. Change the numbers when the page changes.

## 6 bad hooks and why

| bad hook | why it fails |
|---|---|
| GPT-6 ASTRA，新一代智能，登场。 | Brand slam; product-first; 登场 is banned (L-BANNED); nothing about the viewer. |
| 家人们，今天给大家带来一个重磅消息！ | Filler + 重磅 (banned); says nothing; 3 s spent on zero information. |
| OpenAI 发布了 GPT-6 Astra，全球最智能、最对齐的模型。 | Restates the headline; the viewer already scrolled past it. |
| 这个模型在 ARC-AGI-3 上达到了 99.9%。 | Number without a stake; the viewer does not know what ARC-AGI-3 is (no alias, no anchor). |
| 你还在手动填表吗？AI 时代已经到来！ | Rhetorical cliché + hype tail; "AI 时代已经到来" is the same family as 新一代智能已经到来. |
| 今天我们来深度解析一下 OpenAI 的最新发布。 | Announces the video instead of starting it; "深度解析" is a promise with no content. |

Rule of thumb: read the hook aloud in 3 seconds; if the listener cannot say what is in it for them, rewrite.
