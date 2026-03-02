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
): Promise<boolean> {
  const client = getClient();
  if (!client || !TWILIO_PHONE_NUMBER) {
    console.error("[Twilio] Missing credentials or phone number");
    return false;
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
    return true;
  } catch (error: any) {
    console.error("[Twilio] Voice call failed:", error?.message || error);
    return false;
  }
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  body: string
): Promise<boolean> {
  const client = getClient();
  if (!client || !TWILIO_WHATSAPP_NUMBER) {
    console.error("[Twilio] Missing credentials or WhatsApp number");
    return false;
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    const message = await client.messages.create({
      body: body,
      to: `whatsapp:${formattedPhone}`,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    });

    console.log("[Twilio] WhatsApp message sent:", formattedPhone, "SID:", message.sid);
    return true;
  } catch (error: any) {
    console.error("[Twilio] WhatsApp message failed:", error?.message || error);
    return false;
  }
}

export async function notifyAdminLabBooking(bookingId: number | string, patientName: string, testName: string, amount: string) {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[Twilio] Admin phone number not configured");
    return;
  }

  const voiceMessage = `New lab test booking received on Perfusion. Booking ID: ${bookingId}. Patient: ${patientName}. Test: ${testName}. Amount: ${amount} rupees.`;
  triggerVoiceCall(ADMIN_PHONE_NUMBER, voiceMessage).catch((err: any) => console.error("[Twilio] Admin voice call error:", err));

  const whatsappMessage = `🏥 *New Lab Test Booking*\n\n📋 *Booking ID:* ${bookingId}\n👤 *Patient:* ${patientName}\n🔬 *Test:* ${testName}\n💰 *Amount:* ₹${amount}\n\n_Perfusion Healthcare Platform_`;
  whatsappAdminMessage(whatsappMessage).catch((err: any) => console.error("[Twilio] Admin WhatsApp error:", err));
}

export async function notifyUserReportReady(userPhone: string, patientName: string, testName: string, bookingId: number | string) {
  if (!userPhone) {
    console.error("[Twilio] No user phone number available for report notification");
    return;
  }

  const voiceMessage = `Hello. Your report for ${testName} is ready on the Perfusion portal. Booking reference: ${bookingId}. Please log in to download your report.`;
  triggerVoiceCall(userPhone, voiceMessage).catch((err: any) => console.error("[Twilio] User voice call error:", err));

  const whatsappMessage = `📄 *Report Ready*\n\n👤 *Patient:* ${patientName}\n🔬 *Test:* ${testName}\n📋 *Booking ID:* ${bookingId}\n\nYour report is ready on the Perfusion portal. Please log in to download it.\n\n_Perfusion Healthcare Platform_`;
  sendWhatsAppMessage(userPhone, whatsappMessage).catch((err: any) => console.error("[Twilio] User WhatsApp error:", err));
}

async function whatsappAdminMessage(body: string): Promise<boolean> {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[Twilio] Admin phone number not configured");
    return false;
  }
  return sendWhatsAppMessage(ADMIN_PHONE_NUMBER, body);
}
