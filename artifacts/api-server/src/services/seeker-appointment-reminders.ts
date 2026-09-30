import { getPool } from "../db";
import { logger } from "../lib/logger";
import { parseConsultationStart } from "./consultation-lifecycle";
import { formatPhoneNumber, triggerVoiceCall } from "./msg91";

const LEAD_TIME_MS = 10 * 60_000;

type Candidate = { id: string; appointmentSlot: string | null };
type Recipient = Candidate & {
  deviceId: string;
  phoneNumber: string;
};

/** A pre-appointment reminder is never sent at or after the appointment start. */
export function isSeekerAppointmentReminderDue(slot: string | null, now: Date): boolean {
  const startsAt = parseConsultationStart(slot);
  if (!startsAt) return false;
  const untilStart = startsAt.getTime() - now.getTime();
  return untilStart > 0 && untilStart <= LEAD_TIME_MS;
}

export async function fireDueSeekerAppointmentReminders(
  now = new Date(),
  { pool = getPool(), sendVoice = triggerVoiceCall }: {
    pool?: ReturnType<typeof getPool>;
    sendVoice?: typeof triggerVoiceCall;
  } = {},
): Promise<void> {
  // Appointment labels are not normalized in the legacy bookings table; use
  // the same explicit-date IST parser as consultation lifecycle for each row.
  const { rows } = await pool.query<Candidate>(
    `SELECT id, appointment_slot AS "appointmentSlot"
     FROM bookings
     WHERE booking_type = 'consultation' AND status IN ('booked', 'confirmed')
       AND callback_device_id IS NOT NULL AND appointment_slot IS NOT NULL`,
  );

  for (const booking of rows) {
    if (!isSeekerAppointmentReminderDue(booking.appointmentSlot, now)) continue;

    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      // The transaction lock spans the Twilio request. Competing scheduler
      // instances skip this booking; handoffs/cancellations wait until the
      // selected recipient has been checked and Twilio accepts the call.
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext('seeker-appointment-reminder'), hashtext($1)) AS locked",
        [booking.id],
      );
      if (!lock.rows[0]?.locked) continue;

      const { rows: recipients } = await client.query<Recipient>(
        `SELECT b.id, b.appointment_slot AS "appointmentSlot",
                d.id AS "deviceId", d.phone_number AS "phoneNumber"
         FROM bookings b
         JOIN consultation_callback_devices d
           ON d.id = b.callback_device_id AND d.user_id = b.user_id
         WHERE b.id = $1 AND b.booking_type = 'consultation'
           AND b.status IN ('booked', 'confirmed')
           AND d.archived_at IS NULL
           AND NULLIF(btrim(d.installation_id), '') IS NOT NULL
           AND NULLIF(btrim(d.staff_name), '') IS NOT NULL
           AND NULLIF(btrim(d.phone_number), '') IS NOT NULL
         FOR SHARE OF b, d`,
        [booking.id],
      );
      const recipient = recipients[0];
      if (!recipient || !isSeekerAppointmentReminderDue(recipient.appointmentSlot, new Date())) {
        continue; // Never fall back to the shared account or ward contact.
      }

      const normalizedPhone = formatPhoneNumber(recipient.phoneNumber);
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        logger.warn({ bookingId: booking.id, deviceId: recipient.deviceId }, "Selected callback contact has an invalid phone number");
        continue;
      }

      // Commit an at-most-once claim on a separate connection BEFORE contacting
      // Twilio. The booking/device SHARE locks above are still held here. If
      // this process crashes after Twilio accepts but before recording its SID,
      // a restart must not place another possibly duplicate call.
      const claim = await pool.query<{ booking_id: string }>(
        `INSERT INTO seeker_appointment_reminders (booking_id, device_id, attempt_count, last_attempt_at)
         VALUES ($1, $2, 1, now()) ON CONFLICT DO NOTHING RETURNING booking_id`,
        [booking.id, recipient.deviceId],
      );
      if (!claim.rows[0]) continue;
      const sid = await sendVoice(
        recipient.phoneNumber,
        "Hello. This is a reminder from Perfusion Healthcare. Your consultation starts soon. Please be ready to join the call in the Perfusion app.",
      );
      if (sid) {
        await client.query(
          `UPDATE seeker_appointment_reminders SET sent_at = now(), twilio_sid = $3
           WHERE booking_id = $1 AND device_id = $2 AND sent_at IS NULL`,
          [booking.id, recipient.deviceId, sid],
        );
        logger.info({ bookingId: booking.id, deviceId: recipient.deviceId }, "Selected seeker contact reminder accepted by Twilio");
      } else {
        logger.warn({ bookingId: booking.id, deviceId: recipient.deviceId }, "Selected seeker contact reminder failed or outcome unknown; not redialing automatically");
      }
    } catch (error) {
      if (inTransaction) {
        try { await client.query("ROLLBACK"); } catch {}
        inTransaction = false;
      }
      logger.error({ err: error, bookingId: booking.id }, "Selected seeker contact reminder failed");
    } finally {
      if (inTransaction) {
        try { await client.query("COMMIT"); }
        catch (error) { logger.error({ err: error, bookingId: booking.id }, "Could not commit seeker reminder state"); }
      }
      client.release();
    }
  }
}

export function startSeekerAppointmentReminderScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await fireDueSeekerAppointmentReminders();
    } catch (error) {
      logger.error({ err: error }, "Seeker appointment reminder scheduler failed");
    } finally {
      running = false;
    }
  };
  tick();
  setInterval(tick, 60_000).unref();
  logger.info("Selected seeker contact reminder scheduler started (10-minute lead time)");
}