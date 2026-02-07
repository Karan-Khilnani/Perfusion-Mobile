import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email: string, code: string, firstName?: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: "Perfusion <onboarding@resend.dev>",
      to: email,
      subject: "Verify your Perfusion account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #dc2626; font-size: 24px; margin: 0;">Perfusion</h1>
            <p style="color: #666; font-size: 14px;">Healthcare Platform</p>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 24px; text-align: center;">
            <p style="color: #333; font-size: 16px; margin-top: 0;">
              Hi${firstName ? ` ${firstName}` : ''},
            </p>
            <p style="color: #555; font-size: 14px;">
              Your verification code is:
            </p>
            <div style="background: #fff; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626;">${code}</span>
            </div>
            <p style="color: #888; font-size: 12px;">
              This code expires in 10 minutes. If you didn't create an account, you can ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

export { generateVerificationCode, sendVerificationEmail };
