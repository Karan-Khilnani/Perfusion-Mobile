import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER;

function getClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("[Twilio] Missing Account SID or Auth Token");
    return null;
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("91") && cleaned.length === 12) {
      cleaned = "+" + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = "+91" + cleaned;
    }
  }
  return cleaned;
}

export async function triggerVoiceCall(
  phoneNumber: string,
  message: string
): Promise<string | null> {
  const client = getClient();
  if (!client || !TWILIO_PHONE_NUMBER) {
    console.error("[Twilio] Missing credentials or phone number");
    return null;
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    const twiml = `<Response><Say voice="alice" language="en-IN">${message}</Say><Pause length="1"/><Say voice="alice" language="en-IN">${message}</Say></Response>`;

    const call = await client.calls.create({
      twiml: twiml,
      to: formattedPhone,
      from: TWILIO_PHONE_NUMBER,
    });

    console.log("[Twilio] Voice call triggered:", formattedPhone, "SID:", call.sid);
    return call.sid;
  } catch (error: any) {
    console.error("[Twilio] Voice call failed:", error?.message || error);
    return null;
  }
}

export async function cancelVoiceCall(callSid: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    // Use "completed" which ends both queued/ringing and in-progress calls
    await client.calls(callSid).update({ status: "completed" });
    console.log("[Twilio] Voice call cancelled:", callSid);
  } catch (error: any) {
    // Silently ignore — call may have already ended on its own
    console.log("[Twilio] Cancel voice call skipped:", error?.message || error);
  }
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  body: string,
  mediaUrl?: string
): Promise<boolean> {
  const client = getClient();
  if (!client || !TWILIO_WHATSAPP_NUMBER) {
    console.error("[Twilio] Missing credentials or WhatsApp number");
    return false;
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    const messageParams: any = {
      body: body,
      to: `whatsapp:${formattedPhone}`,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    };

    if (mediaUrl) {
      messageParams.mediaUrl = [mediaUrl];
    }

    const message = await client.messages.create(messageParams);

    console.log("[Twilio] WhatsApp message sent:", formattedPhone, "SID:", message.sid);
    return true;
  } catch (error: any) {
    console.error("[Twilio] WhatsApp message failed:", error?.message || error);
    return false;
  }
}

const REPORT_READY_TEMPLATE_SID = "HX78ef8f43e14cfc2a8e3e56ecd2607e43";

export async function sendWhatsAppTemplate(
  phoneNumber: string,
  contentSid: string,
  contentVariables: Record<string, string>,
  mediaUrl?: string
): Promise<boolean> {
  const client = getClient();
  if (!client || !TWILIO_WHATSAPP_NUMBER) {
    console.error("[Twilio] Missing credentials or WhatsApp number");
    return false;
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    const messageParams: any = {
      to: `whatsapp:${formattedPhone}`,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables),
    };

    if (mediaUrl) {
      messageParams.mediaUrl = [mediaUrl];
    }

    const message = await client.messages.create(messageParams);
    console.log("[Twilio] WhatsApp template sent:", formattedPhone, "SID:", message.sid);
    return true;
  } catch (error: any) {
    console.error("[Twilio] WhatsApp template failed:", error?.message || error);
    return false;
  }
}

export interface LabBookingNotification {
  bookingId: string;
  seekerHospitalName: string;
  testName: string;
  bookingDateTime: string;
  contactPersonName: string;
  contactPersonNumber: string;
}

export async function notifyAdminLabBooking(data: LabBookingNotification) {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[Twilio] Admin phone number not configured");
    return;
  }

  const contactInfo = data.contactPersonName && data.contactPersonNumber
    ? `Contact person: ${data.contactPersonName}, ${data.contactPersonNumber}.`
    : data.contactPersonName
    ? `Contact person: ${data.contactPersonName}.`
    : "Contact person: Not available.";

  const voiceMessage = `New lab test booked. Hospital: ${data.seekerHospitalName}. Booking ID: ${data.bookingId}. ${contactInfo} Test: ${data.testName}. Booked on: ${data.bookingDateTime}.`;
  triggerVoiceCall(ADMIN_PHONE_NUMBER, voiceMessage).catch((err: any) => console.error("[Twilio] Admin voice call error:", err));

  const contactLine = data.contactPersonName || data.contactPersonNumber
    ? `👤 *Contact Person:* ${data.contactPersonName || "—"} ${data.contactPersonNumber ? "(" + data.contactPersonNumber + ")" : ""}`
    : "👤 *Contact Person:* Not available";

  const whatsappMessage = `🏥 *New Lab Test Booked*\n\n🏢 *Hospital:* ${data.seekerHospitalName}\n📋 *Booking ID:* ${data.bookingId}\n${contactLine}\n🔬 *Test:* ${data.testName}\n📅 *Booked On:* ${data.bookingDateTime}\n\n_Perfusion Healthcare Platform_`;
  whatsappAdminMessage(whatsappMessage).catch((err: any) => console.error("[Twilio] Admin WhatsApp error:", err));
}

async function sendReportReadyWhatsApp(phoneNumber: string, patientName: string, testName: string, bookingId: string, reportMediaUrl?: string) {
  const templateVars = { "1": patientName, "2": testName, "3": bookingId };
  const templateSent = await sendWhatsAppTemplate(phoneNumber, REPORT_READY_TEMPLATE_SID, templateVars, reportMediaUrl);

  if (!templateSent) {
    console.log("[Twilio] Template failed, falling back to free-form message for", phoneNumber);
    const fallbackMessage = `📄 *Report Ready*\n\n👤 *Patient:* ${patientName}\n🔬 *Test:* ${testName}\n📋 *Booking ID:* ${bookingId}\n\nYour report is ready. Please find it attached or log in to the Perfusion portal to download.\n\n_Perfusion Healthcare Platform_`;
    await sendWhatsAppMessage(phoneNumber, fallbackMessage, reportMediaUrl);
  }
}

export async function notifyUserReportReady(userPhone: string, patientName: string, testName: string, bookingId: number | string, reportMediaUrl?: string) {
  if (!userPhone) {
    console.error("[Twilio] No user phone number available for report notification");
    return;
  }

  const bookingIdStr = String(bookingId);

  const voiceMessage = `Hello. Your report for ${testName} is ready on the Perfusion portal. Booking reference: ${bookingIdStr}. Please log in to download your report.`;
  triggerVoiceCall(userPhone, voiceMessage).catch((err: any) => console.error("[Twilio] User voice call error:", err));

  sendReportReadyWhatsApp(userPhone, patientName, testName, bookingIdStr, reportMediaUrl)
    .catch((err: any) => console.error("[Twilio] User WhatsApp error:", err));

  if (ADMIN_PHONE_NUMBER) {
    sendReportReadyWhatsApp(ADMIN_PHONE_NUMBER, patientName, testName, bookingIdStr, reportMediaUrl)
      .catch((err: any) => console.error("[Twilio] Admin report WhatsApp error:", err));
  }
}

async function whatsappAdminMessage(body: string, mediaUrl?: string): Promise<boolean> {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[Twilio] Admin phone number not configured");
    return false;
  }
  return sendWhatsAppMessage(ADMIN_PHONE_NUMBER, body, mediaUrl);
}
