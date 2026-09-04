#!/usr/bin/env python3
"""Cross-check lint_content.mjs's hand-written JSON-schema validator against python-jsonschema (Draft 7).

    python3 schema_crosscheck.py [fixture_project_dir ...]

For every content/{brief,script,bench,sources}.json in the given projects (default: the fixtures next to this
file) both validators must agree on valid / invalid. Then a set of deterministic mutations of each *valid* file
(missing required key, wrong type, extra field, bad enum, over-long string, out-of-range number, bad id pattern,
duplicate array items, bad property name, …) is checked the same way. jsonschema is a TEST dependency only.
Exit 0 when everything agrees, 1 otherwise.
"""
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import jsonschema
except ImportError:  # pragma: no cover
    sys.exit("schema_crosscheck: 需要 python3 -m pip install jsonschema（仅测试用）")

HERE = Path(__file__).resolve().parent
SKILL = HERE.parents[2]
SCHEMAS = SKILL / "schemas"
VALIDATE_ONE = HERE / "validate_one.mjs"
FILES = ["brief", "script", "bench", "sources"]


def node_valid(schema_path: Path, data) -> bool:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf8") as f:
        json.dump(data, f, ensure_ascii=False)
        tmp = f.name
    try:
        r = subprocess.run(["node", str(VALIDATE_ONE), str(schema_path), tmp], capture_output=True, text=True)
        if r.returncode not in (0, 1):
            raise RuntimeError(f"validate_one.mjs 崩溃：{r.stderr.strip()}")
        return r.returncode == 0
    finally:
        Path(tmp).unlink(missing_ok=True)


def py_valid(schema, data) -> bool:
    return not list(jsonschema.Draft7Validator(schema).iter_errors(data))


def mutations(name, data):
    """Yield (label, mutated_copy) — each should be caught by at least one keyword our validator supports."""
    d = copy.deepcopy(data)
    yield "extra root field", {**d, "zzz_extra": 1}
    if isinstance(d, dict):
        for k in list(d.keys())[:3]:
            m = copy.deepcopy(d); del m[k]
            yield f"remove root key {k}", m
    if name == "brief":
        m = copy.deepcopy(d); m["theme"] = "purple"; yield "bad enum theme", m
        m = copy.deepcopy(d); m["targetSeconds"] = 10; yield "targetSeconds below minimum", m
        m = copy.deepcopy(d); m["targetSeconds"] = 120.5; yield "targetSeconds not integer", m
        m = copy.deepcopy(d); m["platforms"] = ["xhs-3x4", "xhs-3x4"]; yield "duplicate platforms", m
        m = copy.deepcopy(d); m["platforms"] = []; yield "empty platforms", m
        m = copy.deepcopy(d); m["persona"] = {"voiceStyle": "x"}; yield "persona missing viewpoint", m
        m = copy.deepcopy(d); m["tts"] = {"rate": 500}; yield "tts.rate above maximum", m
        m = copy.deepcopy(d); m["account"] = {"name": "这个名字太长了这个名字太长了这个名字太长了"}; yield "account.name too long", m
    if name == "script":
        m = copy.deepcopy(d); m["beats"][0]["id"] = "Bad_Id"; yield "beat id pattern", m
        m = copy.deepcopy(d); m["beats"][0]["kind"] = "dance"; yield "beat kind enum", m
        m = copy.deepcopy(d); m["beats"][0]["energy"] = 9; yield "energy above maximum", m
        m = copy.deepcopy(d); m["beats"][0]["energy"] = 2.5; yield "energy not integer", m
        m = copy.deepcopy(d); m["beats"][0]["mystery"] = True; yield "beat extra field", m
        m = copy.deepcopy(d); m["beats"] = m["beats"][:1]; yield "beats below minItems", m
        m = copy.deepcopy(d); m["meta"]["brand"] = "x" * 25; yield "meta.brand too long", m
        m = copy.deepcopy(d); m["chapters"] = [{"id": "cu", "num": "01"}]; yield "chapter missing title", m
        m = copy.deepcopy(d); m["beats"].append({"id": "x", "kind": "clip", "clip": {"src": "a.mp4", "w": 1, "h": 1, "from": 0, "to": 1, "rate": 0.5, "tag": "t"}}); yield "clip.rate below minimum", m
        m = copy.deepcopy(d); m["beats"].append({"id": "y", "kind": "clip", "clip": {"src": "a.mp4", "w": 100, "h": 100, "from": 0, "to": 0, "rate": 1, "tag": "t"}}); yield "clip.to exclusiveMinimum", m
        m = copy.deepcopy(d); m["beats"].append({"id": "z", "kind": "kinetic", "lines": [{"text": "a", "hot": ["a", "b"]}], "kinetic": {"text": "t"}}); yield "line.hot maxItems", m
        m = copy.deepcopy(d); m["beats"].append({"id": "w", "kind": "kinetic", "lines": [{"text": "a", "hot": []}], "kinetic": {"text": "t"}}); yield "line.hot minItems", m
        m = copy.deepcopy(d); m["beats"].append({"id": "v", "kind": "kinetic", "cards": [{"t": 0, "d": 2, "kind": "stat"}] * 3, "kinetic": {"text": "t"}}); yield "cards maxItems", m
        m = copy.deepcopy(d); m["beats"].append({"id": "u", "kind": "kinetic", "cards": [{"t": 0, "d": 0.5, "kind": "stat"}], "kinetic": {"text": "t"}}); yield "card.d below minimum", m
        m = copy.deepcopy(d); m["beats"].append({"id": "t", "kind": "image", "image": {"src": "a.jpg", "w": 10, "h": 10, "focus": {"x": 0, "y": 0, "w": 0, "h": 5}}}); yield "rect.w exclusiveMinimum", m
        m = copy.deepcopy(d); m["beats"].append({"id": "s", "kind": "take", "takes": [{"text": "x"}], "take": {"text": "t"}}); yield "take.text minLength", m
        m = copy.deepcopy(d); m["beats"].append({"id": "r", "kind": "steps", "steps": {"title": "t", "items": ["a"]}}); yield "steps.items minItems", m
        m = copy.deepcopy(d); m["beats"].append({"id": "q", "kind": "hook", "hook": {"text": "t", "visual": {"kind": "gif"}}}); yield "hook.visual.kind enum", m
        m = copy.deepcopy(d); m["beats"].append({"id": "p", "kind": "hook", "hook": {"text": "t", "visual": {"kind": "clip", "w": 1.5}}}); yield "hook.visual.w not integer", m
        m = copy.deepcopy(d); m["beats"].append({"id": "o", "kind": "cta", "cta": {"question": "q", "sub": "s", "extra": 1}}); yield "cta extra field", m
        m = copy.deepcopy(d); m["beats"].append({"id": "n", "kind": "outro", "outro": {"lines": []}}); yield "outro.lines minItems", m
        m = copy.deepcopy(d); m["beats"].append({"id": "m", "kind": "cta", "narration": 42, "cta": {"question": "q"}}); yield "narration wrong type", m
        m = copy.deepcopy(d); m["beats"].append({"id": "l", "kind": "cta", "short": "yes", "cta": {"question": "q"}}); yield "short wrong type", m
    if name == "bench":
        m = copy.deepcopy(d); m["tables"]["Bad Key"] = {"name": "n", "unit": "%", "rows": [{"model": "a", "value": 1}]}; yield "table key pattern (propertyNames)", m
        m = copy.deepcopy(d); k = next(iter(m["tables"])); m["tables"][k]["rows"] = []; yield "rows minItems", m
        m = copy.deepcopy(d); k = next(iter(m["tables"])); m["tables"][k]["rows"][0]["value"] = "72.6"; yield "row.value wrong type", m
        m = copy.deepcopy(d); k = next(iter(m["tables"])); m["tables"][k]["alias"] = "这个别名实在是太长了太长了"; yield "alias too long", m
        m = copy.deepcopy(d); k = next(iter(m["tables"])); del m["tables"][k]["unit"]; yield "table missing unit", m
        m = copy.deepcopy(d); k = next(iter(m["tables"])); m["tables"][k]["rows"][0]["flag"] = "***"; yield "flag too long", m
        m = copy.deepcopy(d); m["tables"] = "none"; yield "tables wrong type", m
    if name == "sources":
        m = copy.deepcopy(d); m["sources"].append({"id": "x1", "url": "u", "quote": "q"}); yield "source id pattern", m
        m = copy.deepcopy(d); m["sources"].append({"id": "s9", "url": "u"}); yield "source missing quote", m
        m = copy.deepcopy(d); m["sources"].append({"id": "s8", "url": "u", "quote": "q", "note": "extra"}); yield "source extra field", m
        m = copy.deepcopy(d); m["sources"] = {}; yield "sources wrong type", m


def main(argv):
    projects = [Path(p) for p in argv] or sorted(p for p in (HERE / "fixtures").iterdir() if (p / "content").is_dir())
    schemas = {n: json.loads((SCHEMAS / f"{n}.schema.json").read_text(encoding="utf8")) for n in FILES}
    agree = disagree = 0
    problems = []
    for proj in projects:
        for name in FILES:
            f = proj / "content" / f"{name}.json"
            if not f.exists():
                continue
            try:
                data = json.loads(f.read_text(encoding="utf8"))
            except ValueError:
                continue  # malformed on purpose (bad-json fixture); lint reports S-JSON, nothing to cross-check
            cases = [("as-is", data)]
            if py_valid(schemas[name], data):
                cases += list(mutations(name, data))
            for label, doc in cases:
                a, b = node_valid(SCHEMAS / f"{name}.schema.json", doc), py_valid(schemas[name], doc)
                if a == b:
                    agree += 1
                else:
                    disagree += 1
                    problems.append(f"{proj.name}/{name}.json [{label}]: node={'valid' if a else 'invalid'} jsonschema={'valid' if b else 'invalid'}")
    for p in problems:
        print("DISAGREE", p)
    print(f"schema_crosscheck: {agree} 个用例一致，{disagree} 个不一致（{len(projects)} 个项目）")
    return 1 if disagree else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
