import { pgTable, varchar, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// One accepted Twilio reminder per booking and selected staff installation.
// A handoff before the appointment may notify the newly selected staff member.
export const seekerAppointmentReminders = pgTable("seeker_appointment_reminders", {
  bookingId: varchar("booking_id").notNull(),
  deviceId: varchar("device_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  twilioSid: varchar("twilio_sid", { length: 100 }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.bookingId, table.deviceId] })]);

export const insertSeekerAppointmentReminderSchema = createInsertSchema(seekerAppointmentReminders);
export type InsertSeekerAppointmentReminder = z.infer<typeof insertSeekerAppointmentReminderSchema>;
export type SeekerAppointmentReminder = typeof seekerAppointmentReminders.$inferSelect;