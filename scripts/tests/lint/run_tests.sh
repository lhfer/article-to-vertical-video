#!/usr/bin/env bash
# run_tests.sh — 跑 lint_content.mjs / check_numbers.mjs / storyboard.py 的全部测试。
#   bash scripts/tests/lint/run_tests.sh [-v]
# 断言：exit code、--json 里每个规则码、storyboard 的 8 列 + 指标区 + beats[].energy、
# 自写 schema 校验器与 python3-jsonschema 一致；另外对 assets/template/content 与
# references/example-gpt6/content（若存在）做冒烟运行（默认只报告；A2V_TEST_EXTERNAL_STRICT=1 时计入失败）。
# 最后一行是一句话总结；有失败则 exit 1。
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/../.." && pwd)"
SKILL="$(cd "$SCRIPTS/.." && pwd)"
FX="$HERE/fixtures"
LINT="$SCRIPTS/lint_content.mjs"; NUMS="$SCRIPTS/check_numbers.mjs"; SB="$SCRIPTS/storyboard.py"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/a2v-lint-tests.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
VERBOSE="${1:-}"
PASS=0; FAIL=0; FAILED=()

ok()   { PASS=$((PASS + 1)); [ -n "$VERBOSE" ] && echo "  ok   $1"; return 0; }
fail() { FAIL=$((FAIL + 1)); FAILED+=("$1"); echo "  FAIL $1"; }
section() { echo "▸ $1"; }

# expect_exit <name> <expected-exit> <out-file> <cmd...>
expect_exit() {
  local name=$1 want=$2 out=$3; shift 3
  "$@" >"$out" 2>"$TMP/stderr.txt"; local got=$?
  if [ "$got" -eq "$want" ]; then ok "$name (exit $got)"; else
    fail "$name: exit $got, 期望 $want"; { head -c 600 "$out"; echo; head -c 600 "$TMP/stderr.txt"; } | sed 's/^/      /'; fi
}
# pyassert <name> <json-file> <python-expr on d>   (also asserts the file is valid JSON)
pyassert() {
  local name=$1 file=$2 expr=$3
  if python3 - "$file" "$expr" <<'EOF'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf8"))
except Exception as e:
    print(f"      不是合法 JSON：{e}"); sys.exit(1)
try:
    ok = bool(eval(sys.argv[2], {"d": d, "json": json}))
except Exception as e:
    print(f"      表达式异常：{e}"); sys.exit(1)
sys.exit(0 if ok else 1)
EOF
  then ok "$name"; else fail "$name  [$expr]"; fi
}
# grep_assert <name> <file> <fixed-string>
grep_assert() { if grep -qF -- "$3" "$2"; then ok "$1"; else fail "$1: 输出里没有 “$3”"; fi; }

ERROR_CODES="S-SCHEMA L-ID-DUP L-ID-PATTERN L-PAYLOAD L-CHAPTER-REF L-CAP-LEN L-CAP-HOT L-CARD-COUNT L-CARD-OVERLAP L-FIRST-HOOK L-LAST-CTA L-TURN L-BENCH-REF L-CLIP-RANGE L-CLIP-RATE L-RECT L-SRC L-TAKE-TEXT L-TAKE-SOURCE L-SOURCE-REF L-NARR-LEN L-BANNED L-VO-LONG N-MISS"
WARN_CODES="L-PERSON L-HOOK-LEN L-SHORT-STRUCT L-SHORT-LEN L-TOTAL-LEN L-GLOSSARY L-SUMMARY L-DEAD-AIR L-BADGE L-NARR-LEN N-WEAK"
py_set() { python3 -c 'import sys, json; print(json.dumps(sys.argv[1].split()))' "$1"; }

# ------------------------------------------------------------------ 0. selftest / --help
section "selftest 与 --help"
expect_exit "lint --selftest" 0 "$TMP/selftest.txt" node "$LINT" --selftest
grep_assert "selftest 报告全部通过" "$TMP/selftest.txt" "selftest: 全部通过"
expect_exit "lint --help" 0 "$TMP/h1.txt" node "$LINT" --help
grep_assert "lint --help 含规则表" "$TMP/h1.txt" "L-CAP-LEN"
expect_exit "check_numbers --help" 0 "$TMP/h2.txt" node "$NUMS" --help
expect_exit "storyboard --help" 0 "$TMP/h3.txt" python3 "$SB" --help
expect_exit "lint 无参数 → 用法 + exit 2" 2 "$TMP/h4.txt" node "$LINT"

# ------------------------------------------------------------------ 1. ok fixture
section "fixtures/ok（应全绿）"
expect_exit "lint ok" 0 "$TMP/ok-human.txt" node "$LINT" "$FX/ok"
grep_assert "lint ok 人类可读结果" "$TMP/ok-human.txt" "✓ 通过"
expect_exit "lint ok --strict --article --json" 0 "$TMP/ok.json" node "$LINT" "$FX/ok" --strict --json --article "$FX/ok/article.md"
pyassert "lint ok json：ok=true、无 error/warn、数字全部核对" "$TMP/ok.json" \
  "d['ok'] is True and d['errors'] == [] and d['warnings'] == [] and d['stats']['numbers']['missing'] == 0 and d['stats']['numbers']['checked'] > 20 and d['stats']['tier'] == 'm'"
expect_exit "check_numbers ok --json" 0 "$TMP/ok-num.json" node "$NUMS" "$FX/ok" "$FX/ok/article.md" --json
pyassert "check_numbers ok：missing=[]、weak=[]、有 unchecked（裸小整数）" "$TMP/ok-num.json" \
  "d['missing'] == [] and d['weak'] == [] and len(d['checked']) > 20 and len(d['unchecked']) > 0"
expect_exit "storyboard ok --out --json" 0 "$TMP/sb-ok.txt" python3 "$SB" "$FX/ok" --out "$TMP/ok.md" --json "$TMP/ok-sb.json"
grep_assert "storyboard 表头 8 列" "$TMP/ok.md" "| # | 时间 | 场景 | 画面 | 屏幕文字 | 旁白 | 音效/转场 | 情绪 |"
grep_assert "storyboard 指标区" "$TMP/ok.md" "## 节奏指标"
for label in "预计总时长" "各类型占比" "空白（画面 − 配音" "视觉事件最长间隔" "转折位置" "短版" "缺旁白的 beat" "章节"; do
  grep_assert "storyboard 指标：$label" "$TMP/ok.md" "- $label"
done
pyassert "storyboard md：每个 beat 一行且每行 8 列" "$TMP/ok-sb.json" \
  "(lambda rows: len(rows) == len(d['beats']) and all(r.count('|') == 9 for r in rows))([l for l in open('$TMP/ok.md', encoding='utf8').read().splitlines() if l.startswith('| ') and l[2].isdigit()])"
pyassert "storyboard json：beats[] 字段恰为 id/kind/start/seconds/energy/short/vo，energy 1–5" "$TMP/ok-sb.json" \
  "len(d['beats']) > 10 and all(set(b) == {'id','kind','start','seconds','energy','short','vo'} and isinstance(b['energy'], int) and 1 <= b['energy'] <= 5 and isinstance(b['short'], bool) for b in d['beats'])"
pyassert "storyboard json：指标字段齐全" "$TMP/ok-sb.json" \
  "{'tier','targetSeconds','totalSeconds','totalPct','share','deadAir','longestEventGap','eventGapTarget','turn','short','missingNarration','chapters','beats'} <= set(d)"
pyassert "storyboard 与 lint 的总时长一致（±0.2 s）" "$TMP/ok-sb.json" \
  "abs(d['totalSeconds'] - json.load(open('$TMP/ok.json'))['stats']['estimatedSeconds']) < 0.2"
pyassert "storyboard：转折在 35–75% 内、无空白" "$TMP/ok-sb.json" "d['turn'] and 35 <= d['turn']['pct'] <= 75 and d['deadAir'] == []"

# ------------------------------------------------------------------ 2. bad fixtures
section "fixtures/bad（每条 ERROR 至少一次）"
expect_exit "lint bad --json --article" 1 "$TMP/bad.json" node "$LINT" "$FX/bad" --json --article "$FX/bad/article.md"
pyassert "lint bad：ok=false，errors 与 warnings 非空" "$TMP/bad.json" "d['ok'] is False and len(d['errors']) > 20 and len(d['warnings']) > 5"
for code in $ERROR_CODES; do
  pyassert "ERROR 规则码出现：$code" "$TMP/bad.json" "any(e['code'] == '$code' for e in d['errors'])"
done
for code in $WARN_CODES; do
  pyassert "WARN 规则码出现：$code" "$TMP/bad.json" "any(w['code'] == '$code' for w in d['warnings'])"
done
pyassert "lint bad：每条消息带 beat 字段与中文说明" "$TMP/bad.json" \
  "all(set(e) >= {'code','beat','message'} and any('\u4e00' <= ch <= '\u9fff' for ch in e['message']) for e in d['errors'] + d['warnings'])"
pyassert "lint bad：L-VO-LONG 提到“旁白太长”" "$TMP/bad.json" "any(e['code'] == 'L-VO-LONG' and '旁白太长' in e['message'] for e in d['errors'])"
pyassert "lint bad：L-SRC 是 ERROR（public/ 存在）" "$TMP/bad.json" "d['stats']['publicExists'] is True and any(e['code'] == 'L-SRC' for e in d['errors'])"
expect_exit "lint bad --strict 仍是 exit 1（ERROR 优先）" 1 "$TMP/bad-strict.txt" node "$LINT" "$FX/bad" --strict
expect_exit "lint bad 人类可读" 1 "$TMP/bad-human.txt" node "$LINT" "$FX/bad"
grep_assert "人类可读输出分组 ERROR" "$TMP/bad-human.txt" "ERROR ×"
grep_assert "人类可读输出分组 WARN" "$TMP/bad-human.txt" "WARN ×"
grep_assert "人类可读输出带规则码" "$TMP/bad-human.txt" "[L-CAP-LEN]"
expect_exit "storyboard bad 不崩溃（exit 0）" 0 "$TMP/sb-bad.txt" python3 "$SB" "$FX/bad" --out "$TMP/bad.md" --json "$TMP/bad-sb.json"
pyassert "storyboard bad：报告空白与缺时长" "$TMP/bad-sb.json" "len(d['deadAir']) >= 1 and len(d['missingDurations']) >= 1 and len(d['voTooLong']) >= 1"

section "fixtures/bad-missing · bad-json"
expect_exit "lint bad-missing" 1 "$TMP/bm.json" node "$LINT" "$FX/bad-missing" --json
pyassert "S-FILE 出现" "$TMP/bm.json" "any(e['code'] == 'S-FILE' for e in d['errors'])"
expect_exit "lint bad-json" 1 "$TMP/bj.json" node "$LINT" "$FX/bad-json" --json
pyassert "S-JSON 出现；L-SRC 在无 public/ 时降为 WARN；不猜 tier 结构规则" "$TMP/bj.json" \
  "any(e['code'] == 'S-JSON' for e in d['errors']) and any(w['code'] == 'L-SRC' for w in d['warnings']) and not any(e['code'] == 'L-TURN' for e in d['errors'])"
expect_exit "storyboard bad-missing → exit 1" 1 "$TMP/sb-bm.txt" python3 "$SB" "$FX/bad-missing"
expect_exit "storyboard bad-json → exit 1" 1 "$TMP/sb-bj.txt" python3 "$SB" "$FX/bad-json"
expect_exit "lint 不存在的目录 → exit 1" 1 "$TMP/nodir.txt" node "$LINT" "$TMP/does-not-exist"

# ------------------------------------------------------------------ 3. warnings only → --strict exit 2
section "只有 WARN 时 --strict → exit 2"
rm -rf "$TMP/warn" && cp -R "$FX/ok" "$TMP/warn" && rm -f "$TMP/warn/public/badge.png"
expect_exit "lint warn-only 默认 exit 0" 0 "$TMP/warn.json" node "$LINT" "$TMP/warn" --json
pyassert "warn-only：L-BADGE 为 WARN，无 ERROR" "$TMP/warn.json" "d['ok'] is True and d['errors'] == [] and any(w['code'] == 'L-BADGE' for w in d['warnings'])"
expect_exit "lint warn-only --strict exit 2" 2 "$TMP/warn-strict.txt" node "$LINT" "$TMP/warn" --strict

# ------------------------------------------------------------------ 4. numbers fixture
section "fixtures/numbers（check_numbers：MISS / weak / unchecked / take↔source）"
expect_exit "check_numbers numbers --json → exit 1" 1 "$TMP/num.json" node "$NUMS" "$FX/numbers" "$FX/numbers/article.md" --json
pyassert "json 四个桶齐全" "$TMP/num.json" "{'checked','missing','weak','unchecked'} <= set(d)"
pyassert "MISS：bench 行 71.9%（原文没有）" "$TMP/num.json" "any(m['where'].startswith('bench.osworld.rows[2]') and m['value'] == '71.9' for m in d['missing'])"
pyassert "MISS：旁白 1.7x（原文没有）" "$TMP/num.json" "any('kicad narration' in m['where'] and m['value'] == '1.7' for m in d['missing'])"
pyassert "MISS：take 含数字但没有 source" "$TMP/num.json" "any('take-bet' in m['where'] and m['value'] == '2027' for m in d['missing'])"
pyassert "weak：卡片值 59.3 找到但标签不在附近" "$TMP/num.json" "any('bench-cu cards[1]' in w['where'] and w['value'] == '59.3' for w in d['weak'])"
pyassert "unchecked：裸小整数（如 hook 的 3 / 6）" "$TMP/num.json" "any(u['value'] in ('3', '6') and 'hook' in u['where'] for u in d['unchecked'])"
pyassert "take 句子按 sources.json 引文核对（15 秒）" "$TMP/num.json" "any(c['where'] == 'beat kicad takes[0]' and c['value'] == '15' for c in d['checked'])"
pyassert "card.source 卡片按引文核对" "$TMP/num.json" "any('cards[0].value' in c['where'] and c['beat'] == 'kicad' for c in d['checked'])"
pyassert "每条记录都有 where/value/unit/hint" "$TMP/num.json" "all(set(x) >= {'where','value','unit','hint'} for k in ('missing','weak','unchecked') for x in d[k])"
expect_exit "check_numbers numbers 人类可读 → exit 1" 1 "$TMP/num-human.txt" node "$NUMS" "$FX/numbers" "$FX/numbers/article.md"
grep_assert "人类可读：打印匹配上下文（【值】）" "$TMP/num-human.txt" "【72.6】"
grep_assert "人类可读：列出 MISS" "$TMP/num-human.txt" "71.9"
expect_exit "lint numbers --article --json → exit 1" 1 "$TMP/num-lint.json" node "$LINT" "$FX/numbers" --json --article "$FX/numbers/article.md"
pyassert "lint 折叠：N-MISS 进 errors、N-WEAK 进 warnings、stats.numbers 存在" "$TMP/num-lint.json" \
  "sum(e['code'] == 'N-MISS' for e in d['errors']) == 3 and any(w['code'] == 'N-WEAK' for w in d['warnings']) and d['stats']['numbers']['missing'] == 3"
expect_exit "check_numbers 缺 article → exit 2" 2 "$TMP/num-noarg.txt" node "$NUMS" "$FX/numbers"
expect_exit "check_numbers article 不存在 → exit 1" 1 "$TMP/num-noart.txt" node "$NUMS" "$FX/numbers" "$TMP/nope.md"

# ------------------------------------------------------------------ 5. schema validator vs python-jsonschema
section "schema 校验器交叉验证（vs python3 jsonschema）"
if python3 -c 'import jsonschema' 2>/dev/null; then
  expect_exit "schema_crosscheck.py" 0 "$TMP/xcheck.txt" python3 "$HERE/schema_crosscheck.py"
  tail -1 "$TMP/xcheck.txt" | sed 's/^/  /'
else
  echo "  跳过：python3 缺少 jsonschema（pip install jsonschema）"
fi

# ------------------------------------------------------------------ 6. external content (other owners)
section "外部内容冒烟（存在才跑）"
EXT_FAIL=0
lint_summary() { # lint_summary <lint-json>
  python3 - "$1" <<'EOF'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf8"))
    codes = ",".join(sorted({e["code"] for e in d["errors"] + d["warnings"]}))
    print(f"errors={len(d['errors'])} warnings={len(d['warnings'])} tier={d['stats'].get('tier')} est={d['stats'].get('estimatedSeconds')}s codes={codes}")
except Exception as e:
    print("无法解析 JSON:", e)
EOF
}
numbers_summary() { # numbers_summary <check_numbers-json>
  python3 - "$1" <<'EOF'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf8"))
    print({k: len(v) for k, v in d.items() if isinstance(v, list)})
except Exception as e:
    print("无法解析 JSON:", e)
EOF
}
run_external() { # run_external <label> <project_dir> [article]
  local label=$1 dir=$2 article=${3:-}
  [ -d "$dir/content" ] || { echo "  跳过 ${label}：$dir/content 不存在"; return; }
  local args=("$dir" --json); [ -n "$article" ] && [ -f "$article" ] && args+=(--article "$article")
  node "$LINT" "${args[@]}" >"$TMP/ext.json" 2>"$TMP/ext.err"; local rc=$?
  echo "  ${label} · lint exit $rc · $(lint_summary "$TMP/ext.json")"
  python3 "$SB" "$dir" --out "$TMP/ext.md" --json "$TMP/ext-sb.json" >"$TMP/ext-sb.txt" 2>&1; local rc2=$?
  echo "  ${label} · storyboard exit $rc2 · $(tail -1 "$TMP/ext-sb.txt")"
  if [ -n "$article" ] && [ -f "$article" ]; then
    node "$NUMS" "$dir" "$article" --json >"$TMP/ext-num.json" 2>/dev/null; local rc3=$?
    echo "  ${label} · check_numbers exit $rc3 · $(numbers_summary "$TMP/ext-num.json")"
  fi
  if [ "$rc" -ne 0 ] || [ "$rc2" -ne 0 ]; then EXT_FAIL=$((EXT_FAIL + 1)); fi
  # even when the content has editorial errors, the tools themselves must not crash
  if [ "$rc" -gt 2 ] || [ "$rc2" -gt 1 ]; then fail "${label}：工具崩溃（lint $rc / storyboard $rc2）"; sed 's/^/      /' "$TMP/ext.err" | head -10; else ok "${label}：工具正常结束"; fi
}
run_external "assets/template/content" "$SKILL/assets/template" "$SKILL/assets/template/article.md"
GPT6_ARTICLE=""
for cand in "$SKILL/references/example-gpt6/article.md" "$SKILL/references/example-gpt6/content/article.md"; do [ -f "$cand" ] && GPT6_ARTICLE=$cand && break; done
run_external "references/example-gpt6" "$SKILL/references/example-gpt6" "$GPT6_ARTICLE"
if [ "$EXT_FAIL" -gt 0 ] && [ "${A2V_TEST_EXTERNAL_STRICT:-0}" = "1" ]; then fail "外部内容有 lint/storyboard 失败（A2V_TEST_EXTERNAL_STRICT=1）"; fi

# ------------------------------------------------------------------ summary
echo
if [ "$FAIL" -eq 0 ]; then
  echo "lint tests: $PASS passed, 0 failed ✓"
  exit 0
else
  echo "lint tests: $PASS passed, $FAIL failed ✗ — ${FAILED[*]}"
  exit 1
fi
