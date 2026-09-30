import assert from "node:assert/strict";
import test from "node:test";

import { parseConsultationStart, resolveConsultationLifecycle } from "../src/services/consultation-lifecycle";

const appointmentSlot = "Sat, 16 May 2026, 12:30 PM – 01:30 PM";
const startsAt = new Date("2026-05-16T07:00:00.000Z");
const expiresAt = new Date("2026-05-17T07:00:00.000Z");

test("parses saved appointment slots as IST", () => {
  assert.equal(parseConsultationStart(appointmentSlot)?.toISOString(), startsAt.toISOString());
});

test("accepts the en-IN slot format generated for mobile bookings, including the comma after the month", () => {
  const savedSlot = "Wed, 30 Sept, 2026, 10:30 PM – 11:00 PM";
  const booking = { bookingType: "consultation", status: "booked", appointmentSlot: savedSlot };
  const start = new Date("2026-09-30T17:00:00.000Z");
  assert.equal(parseConsultationStart(savedSlot)?.toISOString(), start.toISOString());

  const scheduled = resolveConsultationLifecycle(booking, new Date(start.getTime() - 1));
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.scheduleAvailable, true);
  assert.equal(resolveConsultationLifecycle(booking, start).status, "ongoing");
  assert.equal(resolveConsultationLifecycle(booking, new Date(start.getTime() + 86_400_000)).status, "completed");
});

test("stays scheduled until the exact start time", () => {
  const before = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "booked", appointmentSlot },
    new Date(startsAt.getTime() - 1),
  );
  const atStart = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "booked", appointmentSlot },
    startsAt,
  );

  assert.equal(before.status, "scheduled");
  assert.equal(atStart.status, "ongoing");
  assert.equal(atStart.expiresAt?.toISOString(), expiresAt.toISOString());
});

test("preserves provider pause and permits resume by storing ongoing", () => {
  const paused = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "paused", appointmentSlot },
    new Date(startsAt.getTime() + 60_000),
  );
  const resumed = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "ongoing", appointmentSlot },
    new Date(startsAt.getTime() + 60_000),
  );

  assert.equal(paused.status, "paused");
  assert.equal(resumed.status, "ongoing");
});

test("completes at exactly scheduled start plus 24 hours, including while paused", () => {
  const completed = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "paused", appointmentSlot },
    expiresAt,
  );

  assert.equal(completed.status, "completed");
});

test("fails closed for weekday-only and emergency slots", () => {
  for (const slot of ["Mon 10:00 AM", "Emergency - Immediate", null]) {
    const lifecycle = resolveConsultationLifecycle(
      { bookingType: "consultation", status: "booked", appointmentSlot: slot },
      startsAt,
    );
    assert.equal(lifecycle.status, "scheduled");
    assert.equal(lifecycle.scheduleAvailable, false);
  }
});

test("preserves cancellation as a terminal state", () => {
  const cancelled = resolveConsultationLifecycle(
    { bookingType: "consultation", status: "cancelled", appointmentSlot },
    startsAt,
  );

  assert.equal(cancelled.status, "cancelled");
});