import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComorbidities } from "../src/services/patient-comorbidities";

test("normalizes blank lines and surrounding spaces without changing entry order", () => {
  assert.equal(
    normalizeComorbidities("  Type 2 Diabetes \r\n\n Hypertension \nAsthma  "),
    "Type 2 Diabetes\nHypertension\nAsthma",
  );
});

test("keeps long condition names and removes duplicate entries case-insensitively", () => {
  const longName = "Chronic obstructive pulmonary disease with acute exacerbation and hypoxemia";
  assert.equal(
    normalizeComorbidities(`${longName}\n${longName.toLowerCase()}\nAsthma`),
    `${longName}\nAsthma`,
  );
});

test("preserves commas that belong to a condition name", () => {
  assert.equal(
    normalizeComorbidities("Asthma, moderate persistent\nType 2 Diabetes"),
    "Asthma, moderate persistent\nType 2 Diabetes",
  );
});

test("returns null for empty input", () => {
  assert.equal(normalizeComorbidities(" \n\r\n "), null);
  assert.equal(normalizeComorbidities(null), null);
});