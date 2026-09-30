import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { getPool } from "../db";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { sendPushNotification, type PushPayload } from "./push-notifications";
import { callbackDeviceAssignment } from "./consultation-callback-devices";

type Candidate = {
  id: string;
  userId: string;
  status: string;
  appointmentSlot: string | null;
  callbackDeviceId: string | null;
  callbackDeviceConfirmedAt: Date | null;
  callbackDeviceRemindedAt: Date | null;
  deviceName: string | null;
};

async function sendMobileReminder(userId: string, bookingId: string) {
  const pool = getPool();
  const { rows } = await pool.query<{ token: string }>(
    `SELECT DISTINCT token FROM mobile_push_tokens
     WHERE user_id = $1 AND token_type = 'EXPO'`,
    [userId],
  );
  const messages: ExpoPushMessage[] = rows
    .filter(({ token }) => Expo.isExpoPushToken(token))
    .map(({ token }) => ({
      to: token,
      sound: "default",
      title: "Confirm your callback device",
      body: "A consultation needs its callback device reconfirmed.",
      data: { type: "callback_device_reminder", bookingId },
      priority: "high",
    }));
  const expo = new Expo();
  let delivered = false;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "ok") delivered = true;
      if (ticket.status === "error") {
        logger.warn({ bookingId, error: ticket.details?.error }, "Callback reminder mobile push failed");
        if (ticket.details?.error === "DeviceNotRegistered") {
          await pool.query("DELETE FROM mobile_push_tokens WHERE token = $1", [chunk[i].to]);
        }
      }
    }
  }
  return delivered;
}

export async function fireDueCallbackDeviceReminders() {
  const pool = getPool();
  const { rows } = await pool.query<Candidate>(
    `SELECT b.id, b.user_id AS "userId", b.status,
       b.appointment_slot AS "appointmentSlot",
       b.callback_device_id AS "callbackDeviceId",
       b.callback_device_confirmed_at AS "callbackDeviceConfirmedAt",
       b.callback_device_reminded_at AS "callbackDeviceRemindedAt",
       d.device_name AS "deviceName"
     FROM bookings b
     LEFT JOIN consultation_callback_devices d ON d.id = b.callback_device_id AND d.user_id = b.user_id
     WHERE b.booking_type = 'consultation'
       AND b.status NOT IN ('completed', 'cancelled', 'report_ready')
       AND (b.callback_device_id IS NULL OR b.callback_device_confirmed_at IS NULL
            OR b.callback_device_confirmed_at <= now() - interval '4 hours')
       AND (b.callback_device_reminded_at IS NULL
            OR b.callback_device_reminded_at < COALESCE(b.callback_device_confirmed_at, b.created_at))
     ORDER BY b.created_at DESC LIMIT 200`,
  );

  for (const row of rows) {
    if (!callbackDeviceAssignment(row, row.deviceName).due) continue;
    const client = await pool.connect();
    const lockKey = `callback-device-reminder:${row.id}`;
    let locked = false;
    try {
      // The session lock prevents two API instances from sending the same
      // generation simultaneously without suppressing retries after failures.
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [lockKey],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) continue;
      const fresh = (await client.query<Candidate>(
        `SELECT b.id, b.user_id AS "userId", b.status, b.appointment_slot AS "appointmentSlot",
           b.callback_device_id AS "callbackDeviceId",
           b.callback_device_confirmed_at AS "callbackDeviceConfirmedAt",
           b.callback_device_reminded_at AS "callbackDeviceRemindedAt",
           d.device_name AS "deviceName"
         FROM bookings b
         LEFT JOIN consultation_callback_devices d ON d.id = b.callback_device_id AND d.user_id = b.user_id
         WHERE b.id = $1`,
        [row.id],
      )).rows[0];
      if (!fresh || !callbackDeviceAssignment(fresh, fresh.deviceName).due ||
          (fresh.callbackDeviceRemindedAt &&
           fresh.callbackDeviceRemindedAt >= (fresh.callbackDeviceConfirmedAt ?? new Date(0)))) {
        continue;
      }
      const payload: PushPayload = {
        type: "callback_device_reminder",
        bookingId: fresh.id,
        title: "Confirm your callback device",
        body: "A consultation needs its callback device reconfirmed.",
      };
      const deliveries = await Promise.allSettled([
        sendMobileReminder(fresh.userId, fresh.id),
        storage.getPushSubscriptionsByUserId(fresh.userId).then(async (subscriptions) => {
          const results = await Promise.all(subscriptions.map(async (subscription) => {
            const result = await sendPushNotification(subscription, payload);
            if (result.expired) await storage.deletePushSubscription(fresh.userId, subscription.endpoint);
            return result.sent;
          }));
          return results.some(Boolean);
        }),
      ]);
      for (const delivery of deliveries) {
        if (delivery.status === "rejected") {
          logger.error({ err: delivery.reason, bookingId: fresh.id }, "Could not send callback reminder");
        }
      }
      if (deliveries.some((delivery) => delivery.status === "fulfilled" && delivery.value)) {
        await client.query(
          `UPDATE bookings SET callback_device_reminded_at = now()
           WHERE id = $1
             AND callback_device_confirmed_at IS NOT DISTINCT FROM $2
             AND callback_device_reminded_at IS NOT DISTINCT FROM $3`,
          [fresh.id, fresh.callbackDeviceConfirmedAt, fresh.callbackDeviceRemindedAt],
        );
      }
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      client.release();
    }
  }
}

export function startCallbackDeviceReminderScheduler() {
  const tick = () => void fireDueCallbackDeviceReminders().catch((error) => {
    logger.error({ err: error }, "Callback-device reminder scheduler failed");
  });
  tick();
  setInterval(tick, 60_000).unref();
}