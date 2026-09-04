#!/usr/bin/env node
// Test helper: validate one JSON document with lint_content.mjs's hand-written validator.
//   node validate_one.mjs <schema.json> <data.json>   → prints "valid" / "invalid: …", exit 0 / 1
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema } from "../../lint_content.mjs";

const [schemaFile, dataFile] = process.argv.slice(2);
if (!schemaFile || !dataFile) { process.stderr.write("usage: validate_one.mjs <schema.json> <data.json>\n"); process.exit(2); }
const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const problems = validateSchema(schema, data);
if (problems.length) { process.stdout.write(`invalid: ${problems.map((p) => `${p.path}: ${p.message}`).join(" | ")}\n`); process.exit(1); }
process.stdout.write("valid\n");
void path; void fileURLToPath;
