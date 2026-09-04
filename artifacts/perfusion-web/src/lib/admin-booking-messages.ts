import { format } from "date-fns";
import type { Booking } from "@shared/schema";

export type LoginMethod = "password" | "google" | "unavailable";

export type AdminBookingWithAccess = Booking & {
  seekerLoginId?: string | null;
  seekerLoginMethod?: LoginMethod;
  providerLoginId?: string | null;
  providerLoginMethod?: LoginMethod;
};

type AdminUserSummary = {
  id: string;
  hospitalName?: string | null;
};

export type AdminCopySurface = "all_bookings" | "dashboard" | "appointments";
export type AdminCopyAudience = "seeker" | "provider" | "both";

export function getAdminMessageAudience(label: string): AdminCopyAudience | null {
  if (label === "Seeker") return "seeker";
  if (label === "Consultant" || label === "Lab Provider") return "provider";
  return null;
}

export async function auditBookingAccessCopy(
  bookingId: string,
  surface: AdminCopySurface,
  audience: AdminCopyAudience,
): Promise<void> {
  const response = await fetch(`/api/admin/bookings/${bookingId}/access-copy-audit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface, audience }),
  });
  if (!response.ok) {
    throw new Error("Access-detail copy could not be authorized");
  }
}

export function getPasswordGuidance(method?: LoginMethod): string {
  if (method === "google") return "Sign in with Google";
  if (method === "password") return "Use your existing password or reset it from the login page";
  return "Contact support if you cannot access your account";
}

function loginLines(
  label: string,
  loginId?: string | null,
  method?: LoginMethod,
): string[] {
  return [
    `🔐 *${label} Login ID:* ${loginId || "Account login unavailable"}`,
    `🔑 *Password:* ${getPasswordGuidance(method)}`,
  ];
}

export function generateAdminBookingMessages(
  booking: AdminBookingWithAccess,
  users: AdminUserSummary[],
  portalUrl: string,
): { label: string; message: string }[] {
  const bookingRef = booking.bookingNumber || booking.id.substring(0, 12).toUpperCase();
  const seeker = users.find((user) => user.id === booking.userId);
  const seekerHospital = seeker?.hospitalName || "Referring Hospital";
  const bookedOn = booking.createdAt
    ? format(new Date(booking.createdAt), "dd MMM yyyy, h:mm a")
    : "—";

  if (booking.bookingType === "consultation") {
    const slot = booking.appointmentSlot || "As scheduled";
    const videoLine = booking.videoRoomId
      ? `🎥 *Video Call:* Log in to ${portalUrl} and join from My Bookings`
      : "";

    const seekerMsg = [
      `*Consultation Booking Confirmed* ✅`,
      ``,
      `📋 *Booking Ref:* ${bookingRef}`,
      `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
      `🩺 *Consultant:* ${booking.serviceName}`,
      booking.providerName ? `🏥 *Provider:* ${booking.providerName}` : "",
      `🕐 *Slot:* ${slot}`,
      videoLine,
      ``,
      ...loginLines("Care Seeker", booking.seekerLoginId, booking.seekerLoginMethod),
      ``,
      `Please ensure the patient is ready at the scheduled time. Join the video call from the Perfusion portal at your appointment time.`,
      ``,
      `_Perfusion Healthcare Platform_`,
    ].filter(Boolean).join("\n");

    const consultantMsg = [
      `*Consultation Appointment* 📅`,
      ``,
      `📋 *Booking Ref:* ${bookingRef}`,
      `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
      `🏥 *From:* ${seekerHospital}`,
      `🕐 *Slot:* ${slot}`,
      videoLine,
      ``,
      ...loginLines("Provider", booking.providerLoginId, booking.providerLoginMethod),
      ``,
      `Please log in to the Perfusion portal at ${portalUrl} to join the video call at the scheduled time.`,
      ``,
      `_Perfusion Healthcare Platform_`,
    ].filter(Boolean).join("\n");

    return [
      { label: "Seeker", message: seekerMsg },
      { label: "Consultant", message: consultantMsg },
    ];
  }

  if (booking.bookingType === "lab") {
    const urgencyBanner = booking.urgency === "emergency" ? `🚨 *URGENT / EMERGENCY*\n` : "";

    const seekerMsg = [
      `*Lab Test Booking Confirmed* 🔬`,
      ``,
      urgencyBanner,
      `📋 *Booking Ref:* ${bookingRef}`,
      `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
      booking.patientContact ? `📞 *Patient Contact:* ${booking.patientContact}` : "",
      `🧪 *Test:* ${booking.serviceName}`,
      booking.providerName ? `🏥 *Processing Lab:* ${booking.providerName}` : "",
      `📅 *Booked On:* ${bookedOn}`,
      ``,
      ...loginLines("Care Seeker", booking.seekerLoginId, booking.seekerLoginMethod),
      ``,
      `A sample collection agent will be in touch shortly. Please keep the patient ready as per the test requirements.`,
      ``,
      `_Perfusion Healthcare Platform_`,
    ].filter(Boolean).join("\n");

    const agentMsg = [
      `*Sample Pickup Assignment* 🚗`,
      ``,
      urgencyBanner,
      `📋 *Booking Ref:* ${bookingRef}`,
      `🧪 *Test:* ${booking.serviceName}`,
      `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
      booking.patientContact ? `📞 *Patient Contact:* ${booking.patientContact}` : "",
      booking.callbackPhone
        ? `📞 *Ward Contact:* ${booking.callbackPhone}${booking.callbackWardName ? ` (${booking.callbackWardName})` : ""}`
        : "",
      `🏥 *Pickup From:* ${seekerHospital}`,
      booking.providerName ? `📦 *Deliver To:* ${booking.providerName}` : "",
      `📅 *Booked On:* ${bookedOn}`,
      ``,
      `Please collect the sample and deliver to the lab at the earliest. Handle with care.`,
      ``,
      `_Perfusion Healthcare Platform_`,
    ].filter(Boolean).join("\n");

    const labMsg = [
      `*Incoming Sample Alert* 🧪`,
      ``,
      urgencyBanner,
      `📋 *Booking Ref:* ${bookingRef}`,
      `🔬 *Test:* ${booking.serviceName}`,
      `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
      `🏥 *From:* ${seekerHospital}`,
      `📅 *Booked On:* ${bookedOn}`,
      ``,
      ...loginLines("Provider", booking.providerLoginId, booking.providerLoginMethod),
      ``,
      `Sample is being dispatched. Please prepare for processing upon arrival.`,
      ``,
      `_Perfusion Healthcare Platform_`,
    ].filter(Boolean).join("\n");

    return [
      { label: "Seeker", message: seekerMsg },
      { label: "Delivery Agent", message: agentMsg },
      { label: "Lab Provider", message: labMsg },
    ];
  }

  return [];
}

export function generateConsultationMeetingDetails(
  booking: AdminBookingWithAccess,
  portalUrl: string,
): string {
  const bookingRef = booking.bookingNumber || booking.id.substring(0, 12).toUpperCase();
  const slot = booking.appointmentSlot || "As scheduled";

  return [
    "Consultation Meeting Details",
    "",
    `Booking Ref: ${bookingRef}`,
    `Consultant: ${booking.serviceName}`,
    `Patient: ${booking.patientName} (${booking.patientAge} yrs)`,
    `Appointment: ${slot}`,
    `Portal: ${portalUrl}`,
    "Join: Log in and open My Bookings",
    "",
    "Care Seeker",
    `Login ID: ${booking.seekerLoginId || "Account login unavailable"}`,
    `Password: ${getPasswordGuidance(booking.seekerLoginMethod)}`,
    "",
    "Provider",
    `Login ID: ${booking.providerLoginId || "Account login unavailable"}`,
    `Password: ${getPasswordGuidance(booking.providerLoginMethod)}`,
  ].join("\n");
}