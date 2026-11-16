// Unit checks for the version diff and fix application. Usage: npx tsx scripts/test-workflow.ts
import assert from "node:assert/strict";
import { wordDiff } from "../lib/diff";
import { applyFixes } from "../lib/checks/apply";

const a = "OMG!! India's #1 serum, now just ₹399";
const b = "India's best serum, now just ₹449";
const parts = wordDiff(a, b);
assert.equal(parts.filter((p) => p.type !== "del").map((p) => p.text).join(""), b);
assert.equal(parts.filter((p) => p.type !== "add").map((p) => p.text).join(""), a);
assert.ok(parts.some((p) => p.type === "del" && p.text.includes("₹399")));

// replacement + insertion at 0 + deletion; overlapping fix is skipped
const text = "OMG!! Buy cheap serum now";
const r = applyFixes(text, [
  { spanStart: 0, spanEnd: 6, fix: "" },
  { spanStart: 0, spanEnd: 0, fix: "#collab " },
  { spanStart: 10, spanEnd: 15, fix: "affordable" },
  { spanStart: 12, spanEnd: 20, fix: "x" }, // overlaps the previous one → skipped
  { spanStart: null, spanEnd: null, fix: "advice only" }, // not applicable → skipped
]);
assert.equal(r.text, "#collab Buy affordable serum now");
assert.equal(r.applied, 3);
assert.equal(r.skipped, 2);

console.log("workflow: all assertions passed");
