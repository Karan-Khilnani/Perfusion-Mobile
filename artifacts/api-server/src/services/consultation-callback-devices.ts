import { getPool } from "../db";
import { resolveConsultationLifecycle } from "./consultation-lifecycle";

export const CALLBACK_RECONFIRM_MS = 4 * 60 * 60 * 1000;

type CallbackBooking = {
  status?: string | null;
  appointmentSlot?: string | null;
  callbackDeviceId?: string | null;
  callbackDeviceConfirmedAt?: Date | string | null;
};

export function callbackDeviceAssignment(
  booking: CallbackBooking,
  deviceName: string | null,
  staffName: string | null = null,
  now = new Date(),
) {
  const confirmed = booking.callbackDeviceConfirmedAt
    ? new Date(booking.callbackDeviceConfirmedAt)
    : null;
  const dueAt = confirmed && !Number.isNaN(confirmed.getTime())
    ? new Date(confirmed.getTime() + CALLBACK_RECONFIRM_MS)
    : null;
  const status = resolveConsultationLifecycle(booking, now).status;
  const active = status === "ongoing";
  return {
    deviceId: booking.callbackDeviceId ?? null,
    deviceName: booking.callbackDeviceId ? deviceName : null,
    staffName: booking.callbackDeviceId ? staffName : null,
    confirmedAt: confirmed?.toISOString() ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    due: active && (!booking.callbackDeviceId || !deviceName || !dueAt || now >= dueAt),
  };
}

// Preserve the old single-device registration as the first directory entry.
// This is data-only, idempotent, and leaves the legacy table intact for older clients.
export async function migrateLegacyCallbackDevice(userId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO consultation_callback_devices
       (user_id, device_name, phone_number, legacy_user_id)
     SELECT user_id, device_name, phone_number, user_id
       FROM mobile_callback_devices WHERE user_id = $1
     ON CONFLICT (legacy_user_id) DO NOTHING`,
    [userId],
  );
}

export async function listDueCallbackDeviceReminders(userId: string) {
  const { rows } = await getPool().query<{
    bookingId: string;
    patientName: string;
    status: string;
    appointmentSlot: string | null;
    callbackDeviceId: string | null;
    callbackDeviceConfirmedAt: Date | null;
    deviceName: string | null;
  }>(
    `SELECT b.id AS "bookingId", b.patient_name AS "patientName",
       b.status, b.appointment_slot AS "appointmentSlot",
       b.callback_device_id AS "callbackDeviceId",
       b.callback_device_confirmed_at AS "callbackDeviceConfirmedAt",
       d.device_name AS "deviceName"
     FROM bookings b
     LEFT JOIN consultation_callback_devices d ON d.id = b.callback_device_id AND d.user_id = b.user_id
     WHERE b.user_id = $1 AND b.booking_type = 'consultation'
       AND b.status NOT IN ('completed', 'cancelled', 'report_ready')
       AND (b.callback_device_id IS NULL OR b.callback_device_confirmed_at IS NULL
            OR b.callback_device_confirmed_at <= now() - interval '4 hours')
     ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.flatMap((row) => {
    const assignment = callbackDeviceAssignment(row, row.deviceName);
    return assignment.due
      ? [{ bookingId: row.bookingId, patientName: row.patientName,
           deviceName: assignment.deviceName, dueAt: assignment.dueAt }]
      : [];
  });
}

export async function hasActiveCallbackAssignments(userId: string, deviceId: string) {
  const { rows } = await getPool().query<{ status: string; appointmentSlot: string | null }>(
    `SELECT status, appointment_slot AS "appointmentSlot" FROM bookings
     WHERE user_id = $1 AND callback_device_id = $2
       AND booking_type = 'consultation' AND status NOT IN ('completed', 'cancelled', 'report_ready')`,
    [userId, deviceId],
  );
  return rows.some((booking) => {
    const status = resolveConsultationLifecycle(booking).status;
    return status === "scheduled" || status === "ongoing" || status === "paused";
  });
}