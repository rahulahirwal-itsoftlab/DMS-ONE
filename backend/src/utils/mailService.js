const path = require("path");
// Ensure .env is loaded from backend directory even when executed from project root
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config(); // fallback for current working directory

const nodemailer = require("nodemailer");

let transporter = null;
let verificationPromise = null;

function maskEmail(email) {
  if (!email || typeof email !== "string") return "unknown";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.length <= 3 ? local[0] || "*" : local.slice(0, 3);
  return `${visible}***@${domain}`;
}

function extractEmailOnly(emailStr) {
  if (!emailStr || typeof emailStr !== "string") return "";
  const match = emailStr.match(/<([^>]+)>/);
  const raw = match ? match[1] : emailStr;
  return raw.trim().toLowerCase();
}

function normalizeSender(fromStr, fallbackUser) {
  const defaultUser = String(fallbackUser || "").trim().toLowerCase();
  if (!fromStr || typeof fromStr !== "string") {
    return `"DMS Security" <${defaultUser}>`;
  }
  const match = fromStr.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = match[1].trim();
    const addr = match[2].trim().toLowerCase();
    return name ? `${name} <${addr}>` : `<${addr}>`;
  }
  const addr = fromStr.trim().toLowerCase();
  return `"DMS Security" <${addr}>`;
}

function getMailConfig() {
  const user = String(
    process.env.MAIL_USER ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    ""
  ).trim().toLowerCase();

  // Strip all whitespace and any accidental surrounding quotes
  let pass = String(
    process.env.MAIL_PASS ||
    process.env.MAIL_PASSWORD ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    ""
  ).trim();

  if ((pass.startsWith('"') && pass.endsWith('"')) || (pass.startsWith("'") && pass.endsWith("'"))) {
    pass = pass.slice(1, -1);
  }
  pass = pass.replace(/\s+/g, "");

  if (!user || !pass) {
    const error = new Error("Mail service is not configured: missing MAIL_USER or MAIL_PASS in .env");
    error.status = 500;
    error.code = "ECONFIG";
    throw error;
  }

  const host = String(process.env.MAIL_HOST || process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.MAIL_PORT || process.env.SMTP_PORT) || 587;
  const isPort465 = port === 465;

  const defaultFrom = `"DMS Security" <${user}>`;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || defaultFrom;

  return {
    host,
    port,
    secure: isPort465, // false for 587 (STARTTLS), true for 465
    requireTLS: !isPort465, // Enforce STARTTLS on port 587
    user,
    pass,
    from
  };
}

function getTransporter(forceNew = false) {
  if (transporter && !forceNew) return transporter;
  const config = getMailConfig();

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });

  return transporter;
}

function resetTransporter() {
  transporter = null;
  verificationPromise = null;
}

function logMailError(error) {
  const isAuthError = error.code === "EAUTH" || error.responseCode === 535;

  console.error("[MailService Error]:", {
    code: error.code || "UNKNOWN",
    command: error.command || "N/A",
    responseCode: error.responseCode || "N/A",
    response: error.response || error.message
  });

  if (isAuthError) {
    console.error(
      "[MailService Hint]: Gmail SMTP rejected the credentials (535 BadCredentials).\n" +
      "  1. Ensure 2-Step Verification is enabled on the Google Account.\n" +
      "  2. Generate a fresh 16-character App Password at https://myaccount.google.com/apppasswords.\n" +
      "  3. Set MAIL_PASS=<16-character-app-password> in backend/.env.\n" +
      "  4. Ensure MAIL_USER matches the exact Google account for which the App Password was generated."
    );
  }
}

function mailError(error) {
  logMailError(error);
  const isAuthError = error.code === "EAUTH" || error.responseCode === 535;
  const message = isAuthError
    ? "Gmail SMTP authentication failed. Please verify your Gmail App Password."
    : process.env.NODE_ENV === "production"
      ? "Unable to send verification email. Please check your spam folder or contact support."
      : error.message || "Email sending failed. Check SMTP credentials.";

  const safeError = new Error(message);
  safeError.status = 500;
  safeError.code = error.code || "EMAIL_SEND_FAILED";
  return safeError;
}

async function verifyTransport(force = false) {
  if (force) resetTransporter();

  if (!verificationPromise || force) {
    verificationPromise = getTransporter(force).verify().catch((error) => {
      verificationPromise = null;
      throw error;
    });
  }
  return verificationPromise;
}

async function verifyMailTransport(options = {}) {
  const { force = false } = options;
  try {
    await verifyTransport(force);
    const config = getMailConfig();
    return {
      success: true,
      host: config.host,
      port: config.port,
      user: maskEmail(config.user)
    };
  } catch (error) {
    throw mailError(error);
  }
}

function buildHtmlTemplate({ title, subtitle, name, otp, notice, expiryMinutes = 10 }) {
  const safeName = name ? String(name).trim() : "Valued User";
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:540px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0" border="0">
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">DMS Security Portal</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#e0e7ff;">${subtitle}</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">
                Hello <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#475569;">
                Use the one-time verification code below to complete your request. This code will expire in <strong>${expiryMinutes} minutes</strong>.
              </p>
              
              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
                <tr>
                  <td align="center" style="background-color:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:20px;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#1d4ed8;display:inline-block;">${otp}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#64748b;">
                ${notice || "If you did not request this verification code, please ignore this email or contact your administrator immediately."}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                This is an automated security notification from DMS Portal. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMail(options) {
  try {
    await verifyTransport();
    const config = getMailConfig();

    const rawTo = String(options.to || "").trim();
    // Guarantee the recipient email NEVER starts with a capital letter
    const finalTo = extractEmailOnly(rawTo);

    if (!finalTo) {
      throw new Error("Recipient email address is missing or invalid");
    }

    const bccList = [];
    const shouldBccAdmin = process.env.MAIL_BCC_ADMIN !== "false";
    if (shouldBccAdmin && config.user && finalTo !== config.user) {
      bccList.push(config.user);
    }
    if (process.env.MAIL_COPY_TO) {
      const copies = process.env.MAIL_COPY_TO.split(",").map(s => extractEmailOnly(s)).filter(Boolean);
      bccList.push(...copies);
    }

    const senderFrom = normalizeSender(config.from, config.user);

    const mailOptions = {
      from: senderFrom,
      to: finalTo,
      subject: options.subject,
      text: options.text,
      html: options.html,
      headers: {
        "X-Mailer": "DMS Security Service",
        "X-Priority": "1",
        "Importance": "high",
        ...(options.headers || {})
      }
    };

    if (bccList.length > 0) {
      mailOptions.bcc = [...new Set(bccList.map(e => e.toLowerCase()))].join(", ");
    }

    console.log(`[MailService] Dispatching email to: "${finalTo}" (Subject: "${options.subject}")...`);
    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[MailService] Email delivered successfully! Recipient: "${finalTo}" | MessageId: ${info.messageId}`);
    return info;
  } catch (error) {
    throw mailError(error);
  }
}

async function sendLoginOtpEmail({ to, name, otp }) {
  const recipient = extractEmailOnly(to);
  const text = `Hello ${name || "User"},

Your DMS login verification code is: ${otp}

This code is valid for 10 minutes.
If you did not request this code, please ignore this email.

Regards,
DMS Security Team`;

  const html = buildHtmlTemplate({
    title: "DMS Login Verification Code",
    subtitle: "Two-Factor Authentication",
    name,
    otp,
    notice: "If you did not attempt to sign in to your DMS workspace, please secure your account immediately.",
    expiryMinutes: 10
  });

  return sendMail({
    to: recipient,
    subject: "DMS Login Verification Code",
    text,
    html
  });
}

async function sendPasswordChangeOtpEmail({ to, name, otp }) {
  const recipient = extractEmailOnly(to);
  const text = `Hello ${name || "User"},

Your DMS password change verification code is: ${otp}

This code is valid for 10 minutes.
If you did not request a password change, please contact your administrator immediately.

Regards,
DMS Security Team`;

  const html = buildHtmlTemplate({
    title: "DMS Password Change Code",
    subtitle: "Password Reset Request",
    name,
    otp,
    notice: "If you did not request a password change, please notify your system administrator immediately.",
    expiryMinutes: 10
  });

  return sendMail({
    to: recipient,
    subject: "DMS Password Change Verification Code",
    text,
    html
  });
}

async function sendForgotPasswordOtpEmail({ to, name, otp }) {
  const recipient = extractEmailOnly(to);
  const text = `Hello ${name || "User"},

Your DMS password recovery OTP is: ${otp}

This code is valid for 10 minutes.
If you did not request this code, please ignore this email.

Regards,
DMS Security Team`;

  const html = buildHtmlTemplate({
    title: "DMS Password Recovery OTP",
    subtitle: "Account Access Recovery",
    name,
    otp,
    notice: "If you did not request password recovery for your account, you can safely ignore this email.",
    expiryMinutes: 10
  });

  return sendMail({
    to: recipient,
    subject: "DMS Password Recovery OTP",
    text,
    html
  });
}

async function sendTestEmail(recipient) {
  const config = getMailConfig();
  const to = extractEmailOnly(recipient) || config.user;
  return sendMail({
    to,
    subject: "DMS SMTP Verification Test",
    text: "DMS SMTP configuration is verified and working correctly.",
    html: "<p><strong>DMS SMTP configuration is verified and working correctly.</strong></p><p>This is a test notification confirming email delivery.</p>"
  });
}

module.exports = {
  getMailConfig,
  getTransporter,
  resetTransporter,
  verifyMailTransport,
  sendTestEmail,
  sendLoginOtpEmail,
  sendPasswordChangeOtpEmail,
  sendForgotPasswordOtpEmail,
  extractEmailOnly
};
