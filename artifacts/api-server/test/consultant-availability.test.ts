import assert from "node:assert/strict";
import test from "node:test";
import { getConsultantAvailabilityPreview } from "../src/services/consultant-availability";

test("keeps a legacy time range available today until its end-time buffer", () => {
  const consultant = {
    status: "active",
    availableSlots: ["Sat 9:00 AM - 1:00 PM"],
  };

  const at1230Ist = getConsultantAvailabilityPreview(
    consultant,
    [],
    new Date("2026-09-26T07:00:00.000Z"),
  );
  assert.equal(at1230Ist.label, "Available Today");
  assert.equal(at1230Ist.date, "2026-09-26");
  assert.equal(at1230Ist.windows[0]?.from, "9:00 AM");
  assert.equal(at1230Ist.windows[0]?.to, "1:00 PM");

  const afterCutoff = getConsultantAvailabilityPreview(
    consultant,
    [],
    new Date("2026-09-26T07:46:00.000Z"),
  );
  assert.equal(afterCutoff.label, "Available next Saturday");
  assert.equal(afterCutoff.date, "2026-10-03");
});

test("skips a date paused by the shared slot override", () => {
  const preview = getConsultantAvailabilityPreview(
    {
      status: "active",
      slotSeries: [{ days: ["Sat", "Sun"], from: "2:00 PM", to: "5:00 PM" }],
    },
    [{ date: "2026-09-26", isPaused: true }],
    new Date("2026-09-26T07:00:00.000Z"),
  );

  assert.equal(preview.label, "Available Tomorrow");
  assert.equal(preview.date, "2026-09-27");
});

test("treats consultant pause as unavailable and uses IST for the current date", () => {
  const paused = getConsultantAvailabilityPreview(
    {
      status: "paused",
      slotSeries: [{ days: ["Sun"], from: "9:00 AM", to: "5:00 PM" }],
    },
    [],
    new Date("2026-09-26T18:45:00.000Z"),
  );
  assert.deepEqual(paused, { label: null, date: null, windows: [] });

  const active = getConsultantAvailabilityPreview(
    {
      status: "active",
      slotSeries: [{ days: ["Sun"], from: "9:00 AM", to: "5:00 PM" }],
    },
    [],
    new Date("2026-09-26T18:45:00.000Z"),
  );
  assert.equal(active.label, "Available Today");
  assert.equal(active.date, "2026-09-27");
});