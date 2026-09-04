# Takes — 8 examples, how they are sourced and marked

A take is a judgment sentence. It lives inside a beat's `narration` (listed verbatim in `takes[]`) or as a
`take` beat's payload. Rules: `takes[].text` must be a substring of the narration or a caption
(L-TAKE-TEXT); a take with any digit needs `source` (L-TAKE-SOURCE) pointing at `sources.json`
(L-SOURCE-REF), whose `quote` is the verbatim sentence you fetched; `check_numbers` checks the take's
numbers against that quote. On screen a take gets the badge stamp and the "观点" tag (`lines[].kind:
"take"`). The report lists every take with its source. Examples 1–6 are in `references/example-gpt6/`.

| # | take (as spoken) | where | source | why it is a take, how it is marked |
|---|---|---|---|---|
| 1 | 填表类的活，它已经比我这个打工人靠谱了 | `take-c1` narration + `take.text` | none | Pure judgment from the two demos; no outside fact, no digit → no source needed. Caption `是能不能替我填报销单` is `kind: take`. |
| 2 | 你可以信方向，别把小数点后那一位当真 | `but-c1` (kinetic) `takes[]` | `s3` — the page's own sentence "Evaluation scores are the maximum at any effort…" | The take leans on a page sentence, so the page is cited even though no digit forces it. Caption `信方向，别信小数点` is `kind: take`. |
| 3 | 越权率从上一代的 48% 降到 0%，我觉得这一条比任何跑分都值钱 | `dmv` narration `takes[]` | `s1` — "…went beyond the authorized target 48% of the time, GPT‑6 Astra did this in 0% of cases." | Contains digits → source required; the quote carries 48% and 0% so `check_numbers` passes. Caption `比任何跑分都值钱` is `kind: take`; the numbers stay in a `fact` line. |
| 4 | 涉及钱和账号的操作，我还是会开着自动审批 | `take-c2` | none | Advice, no numbers. The 但是 half of the chapter's 所以呢. |
| 5 | 写代码这块几家都差不多，你换不换都行 | `take-c3` | none | Judgment drawn from the coding tables the video already showed; the numbers were stated as facts in `bench-code`, the verdict is here. |
| 6 | 我觉得这是整页最该聊的一句 | `honest` (turn) `takes[]` | `s4` — "Our evaluations found Astra’s written reasoning harder to monitor…" | Opinion about a specific page sentence → cite the sentence so the viewer can check what "这一句" is. |
| 7 | 这套考试的初版，人类自己也才做对七成多 | a `bench` beat about OSWorld (optional variant) | `s2` — os-world.github.io: "While humans can accomplish over 72.36% of the tasks…" | Outside fact in Chinese numerals (no digit → lint would not force a source) but it *is* outside information, so it is sourced anyway. Fetched live; quote copied verbatim. |
| 8 | 我这种打工人等套餐里送就行 | `outro` `takes[]` | none (pricing facts in the same beat are article facts; `s6` holds the quote if you want to cite it) | Personal stance on the price; the $10/$50 numbers are stated as facts in the narration and on screen, verified against the article. |

## Anti-patterns

- **Unsourced outside number**: "上一代发布时定价是 $8/$40" with no `sources.json` entry → L-TAKE-SOURCE. Fetch
  the page, copy the sentence, then cite; or drop the number.
- **Invented quote**: a `sources.json` `quote` paraphrased from memory. `check_numbers` will not catch it;
  the reader will. Quotes are copy-pasted from a fetch you actually made (WebFetch / fetch_page.py output).
- **Take text not verbatim in narration**: `takes[].text: "别把小数点当真"` while the narration says
  "别把小数点后那一位当真" → L-TAKE-TEXT. Copy the exact substring.
- **Fact dressed as take**: "越权率 48% 降到 0%" alone is a fact (from the article) — say it as a fact; the
  take is the judgment you attach ("比任何跑分都值钱").
- **Take with no 所以呢**: "这波真的有点东西" is a reaction. A take answers 对你意味着什么 / 该信几分 / 等还是换.
