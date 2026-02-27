const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_VOICE_FLOW_ID = process.env.MSG91_VOICE_FLOW_ID;
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER;

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
  variables: Record<string, string> = {}
): Promise<boolean> {
  if (!MSG91_AUTH_KEY || !MSG91_VOICE_FLOW_ID) {
    console.error("[MSG91] Missing auth key or voice flow ID");
    return false;
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    const payload: any = {
      flow_id: MSG91_VOICE_FLOW_ID,
      sender: "0",
      mobiles: formattedPhone,
      ...variables,
    };

    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("[MSG91] Voice call triggered:", formattedPhone, data);
    return response.ok;
  } catch (error) {
    console.error("[MSG91] Voice call failed:", error);
    return false;
  }
}

export async function notifyAdminLabBooking(bookingId: number, patientName: string, testName: string, amount: string) {
  if (!ADMIN_PHONE_NUMBER) {
    console.error("[MSG91] Admin phone number not configured");
    return;
  }

  await triggerVoiceCall(ADMIN_PHONE_NUMBER, {
    booking_id: String(bookingId),
    patient_name: patientName,
    test_name: testName,
    amount: amount,
  });
}

export async function notifyUserReportReady(userPhone: string, patientName: string, testName: string, bookingId: number) {
  if (!userPhone) {
    console.error("[MSG91] No user phone number available for report notification");
    return;
  }

  await triggerVoiceCall(userPhone, {
    booking_id: String(bookingId),
    patient_name: patientName,
    test_name: testName,
  });
}
