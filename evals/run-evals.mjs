#!/usr/bin/env node
// Runs every case in evals/cases.json through POST /tasks/classify and reports
// how many matched the expected category (the key field for grading).
//
// Usage:   node evals/run-evals.mjs            (server on http://localhost:3000)
//          BASE_URL=http://localhost:3000 node evals/run-evals.mjs
//
// NOTE: this eval sends only hand-written, made-up test data. It never sends
// real/company data through the LLM endpoint.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/tasks/classify`;

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, "cases.json"), "utf8"));

const results = [];
for (const c of spec.cases) {
  let body;
  let status;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: c.description }),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    status = 0;
    body = { error: `could not reach ${ENDPOINT}: ${err.message}` };
  }
  const gotCategory = body?.category;
  const matched = status === 200 && gotCategory === c.expected.category;
  results.push({ id: c.id, matched, status, gotCategory, body });
}

const passed = results.filter((r) => r.matched).length;
const total = results.length;

console.log(`Eval run: ${new Date().toISOString()}`);
console.log(`Prompt version: ${spec.prompt_version}`);
console.log(`Endpoint: ${ENDPOINT}`);
console.log(`Matched category: ${passed}/${total}\n`);

for (const r of results) {
  if (r.matched) {
    console.log(`PASS ${r.id}: category=${r.gotCategory}`);
  } else {
    console.log(
      `FAIL ${r.id}: HTTP ${r.status} expected.category=${spec.cases.find((c) => c.id === r.id)?.expected.category}` +
        ` got=${r.gotCategory ?? JSON.stringify(r.body)}`
    );
  }
}

process.exit(passed === total ? 0 : 1);
