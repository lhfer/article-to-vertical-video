# Narration — per beat kind, worker persona

Three lines that landed and two that were rejected for each kind. Register: first person to second
person, ~8.4 chars/s, ≤ 108 chars for tier m, no words from `references/banned-words.txt`, alias on the
first mention of a benchmark, every 意味着 names a task. Facts below are from the GPT-6 page; the pattern is
what to copy.

## hook (≤ 32 chars)
Good
- OpenAI 说这模型填报税表比我准，我把 12 个演示全看了一遍。
- 上一代操作电脑出事率 22%，这一代 2.4%，差在哪我给你翻出来了。
- 你敢把报销单交给 AI 填吗？看完这三分钟再回答。
Bad
- 家人们，今天必须聊聊 GPT-6 Astra！OpenAI 自己说这是全球最聪明、最听话的模型，我看完发布页直接坐不住了，带你们过一遍。 — 58 chars, brand first, nothing for the viewer (the v1 intro).
- 新一代智能已经到来，让我们拭目以待。 — two banned phrases, zero information.

## promise
Good
- 三分钟，我讲清三件事：它能替你干哪些活、生活琐事敢不敢交给它、程序员和科研人该怎么用。中间还会说它输在哪。
- 这条视频只回答一个问题：它能不能替你干活。先看能，再看敢不敢，最后看它输在哪。
- 五分钟四章，目录在屏幕上，想跳哪章就跳。第三章是它没赢的地方，别跳过。
Bad
- 接下来我会为大家全面、深度地解析这款模型的各项能力。 — announces, doesn't promise anything checkable; 全面 深度 are empty.
- 3 分钟讲清 3 件事。 — digits about the video itself trip `check_numbers`; write 三分钟、三件事.

## bench (duel)
Good
- 先看电脑操作考试 OSWorld，它 72.6%，上一代 Sol 65.7%，Opus 5 也被压了两个点。界面找按钮 ScreenSpot-Pro 92.7%，意味着你让它开软件、点按钮、填表，一百次里九十多次点得对。
- 职场实操考 Agents' Last Exam，它 59.3%，Opus 5 是 55.5%。更关键的是电脑操作出事率：它 2.4%，上一代 22%。意味着让它替你约医生、订东西，翻车概率低了一个量级。
- 命令行实战题 Terminal-Bench，它 57.9%，Fable 5.1 是 55.8%，只差两个点。意味着写代码你选哪家都行。
Bad
- OSWorld 2.0 拿了 72.6%，比 Sol 高近 7 个点，比 Opus 5 也高。界面定位 92.7%，Sol 只有 76.9%。而且每个任务的时间少了 47%，意味着又准又快。 — no alias for OSWorld (L-GLOSSARY), "意味着又准又快" restates the numbers, three numbers in one breath with no anchor.
- 该模型在多项基准测试中均取得领先，展现出强大的综合实力。 — no number, no person (L-PERSON), review-copy voice.

## clip
Good
- 这是我最有感觉的一个：读一张 W-2，自动把 1040 报税表填好。你想想，报销单、CRM 客户记录、日程表，这种填表的活以后真能丢给它。
- 约 DMV 这种谁都嫌烦的事，它查材料、找网点、定时间，最后写成文档给你。更狠的是守边界：越权率从上一代的 48% 降到 0%，我觉得这一条比任何跑分都值钱。
- 工程师看这个：KiCad 里布线一块 PCB，原理图丢进去，元件摆放、走线全自己来，出来就是能送厂的板子。我一个外行都看得一愣一愣的。
Bad
- 日常向的也有，读一张 W-2，自动把 1040 报税表填好。填表、更新 CRM、整理日历这种琐事，以后真的可以丢给它了。 — fine words, but the footage runs 10 s and this is 7 s of voice: 3 s of dead air (L-DEAD-AIR). Add the 所以呢 or raise `rate`.
- 视频展示了模型在浏览器中完成表单填写的过程，体现了其强大的电脑操作能力。 — describes the video instead of talking to the viewer; 体现了…能力 is caption-of-a-museum voice.

## kinetic (one big spoken phrase)
Good
- 但是，这些分是 OpenAI 自己测的，页面写了：取每个模型任意投入档位的最高分。你可以信方向，别把小数点后那一位当真。
- 记住一句话：专项它最强，综合它没全胜。
- 官方自己写的：推理过程更难监控了。我觉得这是整页最该聊的一句。
Bad
- 划时代的突破，见证历史的一刻。 — two banned phrases; no content.
- 综上所述，我们可以得出以下结论。 — written-essay connective; a kinetic line is a spoken punch, not a paragraph opener.

## take (the 所以呢)
Good
- 说句实话，我最关心的不是分，是它能不能替我填报销单。从这两段演示看，填表类的活，它已经比我这个打工人靠谱了。
- 所以我的判断：约号、查资料、填表这种可逆的事，敢放手了。但涉及钱和账号的操作，我还是会开着自动审批，让它先问我。
- 所以程序员先别慌，写代码这块几家都差不多，你换不换都行。做科研的倒是可以先上手，跑数据这类活它明显更顺。
Bad
- 官方的说法叫饱和，就是这些题基本被做完了。 — hedges behind 官方的说法; a take is *your* call.
- 这波真的有点东西，大家可以关注一下。 — a reaction, not a judgment; says nothing the viewer can act on.

## summary
Good
- 截个图收藏：填表约号能放手；钱和账号让它先问你；写代码几家差不多；科研跑数据它明显更顺；综合分没全胜，别神话。
- 一屏说完：能替你干的是填表和查资料，不能替你担的是钱和账号，该等的是国内可用性。
- 收藏这张：三个能放手的活，两个别放手的活，一个官方没说的事。
Bad
- 总的来说，GPT-6 Astra 是一款非常强大的模型，在多个方面都有显著提升。 — nothing to screenshot; no verdicts.
- 以上就是今天的全部内容。 — the summary is the save-point of the video, not a sign-off.

## cta
Good
- 最后一个问题：你会把自己的报销单、报税表交给它填吗？敢的打个一，不敢的说说你怕什么，评论区聊聊。
- 推理更难监控了，官方自己写的——你觉得这是坦诚还是警报？评论区站个队。
- 程序员和科研人，你们哪边先换？评论区报个职业，我看看谁更急。
Bad
- 喜欢的话点个关注，我们下期再见。 — no question; nothing to argue about.
- 你觉得 AI 会取代人类吗？ — too big to answer; invites slogans, not the split this video set up.

## outro
Good
- 最后说钱：API 每百万 token 输入 10 美元、输出 50 美元，Fast 模式快 2.5 倍、价格翻倍。参数官方没公布。今天先给部分机构，过几天 Plus、Pro 等套餐都有，我这种打工人等套餐里送就行。
- 几个官方没说的：参数规模、国内怎么用、和上一代比贵了还是便宜了。说了的我都放屏幕上了。
- 数据全部来自 OpenAI 发布页，竞品分数是 OpenAI 自己报的，链接在评论区，自己去核。
Bad
- 新一代智能，已经到来。 — v1 final line spoken; banned family.
- 该模型将于近期陆续开放，敬请期待。 — 敬请期待 banned; vague where the page is specific.
