import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
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

export async function notifyAdminLabBooking(bookingId: number | string, patientName: string, testName: string, amount: string) {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[Twilio] Admin phone number not configured");
    return;
  }

  const message = `New lab test booking received on Perfusion. Booking ID: ${bookingId}. Patient: ${patientName}. Test: ${testName}. Amount: ${amount} rupees.`;
  await triggerVoiceCall(ADMIN_PHONE_NUMBER, message);
}

export async function notifyUserReportReady(userPhone: string, patientName: string, testName: string, bookingId: number | string) {
  if (!userPhone) {
    console.error("[Twilio] No user phone number available for report notification");
    return;
  }

  const message = `Hello. Your report for ${testName} is ready on the Perfusion portal. Booking reference: ${bookingId}. Please log in to download your report.`;
  await triggerVoiceCall(userPhone, message);
}
