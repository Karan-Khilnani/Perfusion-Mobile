import assert from "node:assert/strict";
import test from "node:test";

import {
  fireDueSeekerAppointmentReminders,
  isSeekerAppointmentReminderDue,
} from "../src/services/seeker-appointment-reminders";

const slot = "Wed, 30 Sept, 2026, 10:30 PM – 11:00 PM";
const start = new Date("2026-09-30T17:00:00.000Z");

test("starts the selected contact reminder exactly ten minutes before the IST appointment", () => {
  assert.equal(isSeekerAppointmentReminderDue(slot, new Date(start.getTime() - 600_001)), false);
  assert.equal(isSeekerAppointmentReminderDue(slot, new Date(start.getTime() - 600_000)), true);
  assert.equal(isSeekerAppointmentReminderDue(slot, new Date(start.getTime() - 120_000)), true);
  assert.equal(isSeekerAppointmentReminderDue(slot, start), false);
  assert.equal(isSeekerAppointmentReminderDue(slot, new Date(start.getTime() + 1)), false);
});

test("does not invent a date for legacy weekday or emergency bookings", () => {
  const tenMinutesBefore = new Date(start.getTime() - 600_000);
  assert.equal(isSeekerAppointmentReminderDue("Wednesday 10:30 PM", tenMinutesBefore), false);
  assert.equal(isSeekerAppointmentReminderDue("Emergency - Immediate", tenMinutesBefore), false);
  assert.equal(isSeekerAppointmentReminderDue(null, tenMinutesBefore), false);
});

test("calls only the selected device, deduplicates it, and follows a booking handoff", async () => {
  const appointmentSlot = new Date(Date.now() + 5 * 60_000).toISOString();
  const sends: string[] = [];
  const claims = new Set<string>();
  const order: string[] = [];
  let selected = { deviceId: "selected-staff-a", phoneNumber: "+919876543210" };
  let joinedLookup = "";
  const client = {
    async query(sql: string) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ locked: true }] };
      if (sql.includes("FROM bookings b")) {
        joinedLookup = sql;
        return { rows: [{ id: "booking-1", appointmentSlot, ...selected }] };
      }
      if (sql.includes("SET sent_at")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {},
  };
  const pool = {
    async query(sql: string) {
      if (sql.startsWith("INSERT INTO seeker_appointment_reminders")) {
        if (claims.has(selected.deviceId)) return { rows: [] };
        claims.add(selected.deviceId);
        order.push("claim");
        return { rows: [{ booking_id: "booking-1" }] };
      }
      return { rows: [{ id: "booking-1", appointmentSlot }] };
    },
    async connect() { return client; },
  };
  const deps = {
    pool: pool as unknown as Parameters<typeof fireDueSeekerAppointmentReminders>[1] extends infer D
      ? NonNullable<D>["pool"] : never,
    sendVoice: async (phone: string) => {
      order.push("send");
      sends.push(phone);
      return "CAaccepted";
    },
  };

  await fireDueSeekerAppointmentReminders(new Date(), deps);
  await fireDueSeekerAppointmentReminders(new Date(), deps);
  assert.deepEqual(sends, ["+919876543210"]);
  assert.deepEqual(order, ["claim", "send"]);
  assert.match(joinedLookup, /d\.user_id = b\.user_id/);
  assert.match(joinedLookup, /d\.archived_at IS NULL/);
  assert.match(joinedLookup, /FOR SHARE OF b, d/);

  selected = { deviceId: "selected-staff-b", phoneNumber: "+919876543211" };
  await fireDueSeekerAppointmentReminders(new Date(), deps);
  assert.deepEqual(sends, ["+919876543210", "+919876543211"]);
  assert.deepEqual(order, ["claim", "send", "claim", "send"]);
});

test("does not redial after an uncertain Twilio failure or a server restart", async () => {
  const appointmentSlot = new Date(Date.now() + 5 * 60_000).toISOString();
  let claimed = false;
  let sends = 0;
  const client = {
    async query(sql: string) {
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ locked: true }] };
      if (sql.includes("FROM bookings b")) {
        return { rows: [{ id: "booking-3", appointmentSlot, deviceId: "staff-3", phoneNumber: "+919876543210" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query(sql: string) {
      if (sql.startsWith("INSERT INTO seeker_appointment_reminders")) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [{ booking_id: "booking-3" }] };
      }
      return { rows: [{ id: "booking-3", appointmentSlot }] };
    },
    async connect() { return client; },
  };
  const deps = {
    pool: pool as unknown as NonNullable<Parameters<typeof fireDueSeekerAppointmentReminders>[1]>["pool"],
    sendVoice: async () => { sends++; return null; },
  };
  await fireDueSeekerAppointmentReminders(new Date(), deps);
  await fireDueSeekerAppointmentReminders(new Date(), deps);
  assert.equal(sends, 1);
});

test("an unavailable selected device never falls back to the shared account phone", async () => {
  const appointmentSlot = new Date(Date.now() + 5 * 60_000).toISOString();
  let sends = 0;
  const client = {
    async query(sql: string) {
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ locked: true }] };
      return { rows: [] }; // Device lookup joins no active, owned installation.
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [{ id: "booking-2", appointmentSlot }] }; },
    async connect() { return client; },
  };
  await fireDueSeekerAppointmentReminders(new Date(), {
    pool: pool as unknown as NonNullable<Parameters<typeof fireDueSeekerAppointmentReminders>[1]>["pool"],
    sendVoice: async () => { sends++; return "CAwrong"; },
  });
  assert.equal(sends, 0);
});