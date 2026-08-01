import nodemailer from "nodemailer";
import { getSmtpConfig } from "./db.js";

export async function sendMagicLinkEmail(toEmail: string, magicLink: string, pin: string) {
  const smtp = await getSmtpConfig();

  if (!smtp || !smtp.host) {
    console.log(`[Mailer] SMTP not configured. Magic link for ${toEmail}: ${magicLink} (PIN: ${pin})`);
    return {
      sent: false,
      reason: "SMTP is not configured in Settings. Direct link / PIN provided.",
      magicLink,
      pin,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.authUser && smtp.authPass ? { user: smtp.authUser, pass: smtp.authPass } : undefined,
      tls: { rejectUnauthorized: false },
    });

    const info = await transporter.sendMail({
      from: smtp.fromEmail || `"Project Waifu" <no-reply@${smtp.host}>`,
      to: toEmail,
      subject: "Your Magic Link & Login PIN for Project Waifu",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px; background: #0f172a; color: #f8fafc;">
          <h2 style="color: #ec4899; margin-top: 0;">Project Waifu Login</h2>
          <p>Click the button below to sign in immediately to your account:</p>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${magicLink}" style="background-color: #ec4899; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Sign In to Project Waifu</a>
          </div>
          <p style="font-size: 14px; color: #94a3b8;">Alternatively, you can manually enter your 6-digit login PIN:</p>
          <div style="font-size: 24px; font-weight: bold; font-family: monospace; letter-spacing: 4px; color: #38bdf8; background: #1e293b; padding: 12px; border-radius: 8px; text-align: center; margin: 12px 0;">
            ${pin}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-top: 24px;">This link and PIN expire in 15 minutes. If you did not request this email, you can safely ignore it.</p>
        </div>
      `,
    });

    console.log(`[Mailer] Magic link email sent to ${toEmail}. MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[Mailer] Failed to send email to ${toEmail}:`, err);
    return { sent: false, error: err.message, magicLink, pin };
  }
}

export async function sendAdminPendingUserNotification(userEmail: string, appUrl: string) {
  const smtp = await getSmtpConfig();

  if (!smtp || !smtp.host || !smtp.adminEmail) {
    console.log(`[Mailer] New pending user ${userEmail} registered. Admin email not configured or SMTP disabled.`);
    return { sent: false };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.authUser && smtp.authPass ? { user: smtp.authUser, pass: smtp.authPass } : undefined,
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: smtp.fromEmail || `"Project Waifu Admin" <no-reply@${smtp.host}>`,
      to: smtp.adminEmail,
      subject: `[Project Waifu] New User Approval Required: ${userEmail}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #0f172a; color: #f8fafc;">
          <h2 style="color: #38bdf8; margin-top: 0;">New User Approval Request</h2>
          <p>A new user has requested access to Project Waifu:</p>
          <p style="font-size: 16px; font-weight: bold; color: #ec4899; background: #1e293b; padding: 10px; border-radius: 6px;">${userEmail}</p>
          <p>Log in to your Admin console to approve or reject this request:</p>
          <div style="margin: 20px 0;">
            <a href="${appUrl}" style="background-color: #38bdf8; color: #0f172a; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Open Admin Panel</a>
          </div>
        </div>
      `,
    });

    console.log(`[Mailer] Admin pending user notification sent for ${userEmail}.`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[Mailer] Failed to send admin notification email:`, err);
    return { sent: false, error: err.message };
  }
}

export async function testSmtpConnection(smtp: {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromEmail: string;
  adminEmail: string;
}) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.authUser && smtp.authPass ? { user: smtp.authUser, pass: smtp.authPass } : undefined,
    tls: { rejectUnauthorized: false },
  });

  await transporter.verify();

  if (smtp.adminEmail) {
    await transporter.sendMail({
      from: smtp.fromEmail || `"Project Waifu Test" <no-reply@${smtp.host}>`,
      to: smtp.adminEmail,
      subject: "Project Waifu SMTP Test Email",
      text: "Congratulations! Your Project Waifu SMTP configuration is working correctly.",
    });
  }

  return true;
}
