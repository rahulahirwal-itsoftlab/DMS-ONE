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

function getMailConfig() {
  const user = String(
    process.env.MAIL_USER ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    ""
  ).trim();

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

  const defaultFrom = `"ITSOFTLAB DMS" <${user}>`;
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
      ? "Unable to send verification email. Please contact support."
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

async function sendMail(options) {
  try {
    await verifyTransport();
    const config = getMailConfig();
    return await getTransporter().sendMail({ from: config.from, ...options });
  } catch (error) {
    throw mailError(error);
  }
}

async function sendLoginOtpEmail({ to, name, otp }) {
  const text = `Hello ${name || "User"},

Your DMS login verification code is:

${otp}


This code is valid for 10 minutes.

If you did not request this, please ignore this email.

Regards,
ITSOFTLAB DMS Security Team`;
  console.log("this is your otp", otp);
  return sendMail({
    to,
    subject: "DMS Login Verification Code",
    text,
    html: `<p>Hello ${name || "User"},</p><p>Your DMS login verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;color:#4f46e5">${otp}</p><p>This code is valid for 10 minutes.</p><p>If you did not request this, please ignore this email.</p><p>Regards,<br>ITSOFTLAB DMS Security Team</p>`
  });
}

async function sendPasswordChangeOtpEmail({ to, name, otp }) {
  const text = `Hello ${name || "User"},

Your DMS password change verification code is:

${otp}

This code is valid for 10 minutes.

If you did not request a password change, please contact your administrator immediately.

Regards,
ITSOFTLAB DMS Security Team`;

  return sendMail({
    to,
    subject: "DMS Password Change Verification Code",
    text,
    html: `<p>Hello ${name || "User"},</p><p>Your DMS password change verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;color:#4f46e5">${otp}</p><p>This code is valid for 10 minutes.</p><p>If you did not request a password change, please contact your administrator immediately.</p><p>Regards,<br>ITSOFTLAB DMS Security Team</p>`
  });
}

async function sendForgotPasswordOtpEmail({ to, name, otp }) {
  const text = `Hello ${name || "User"},

Your DMS password recovery OTP is:

${otp}

This OTP is valid for 10 minutes.

If you did not request this, please ignore this email.

Regards,
ITSOFTLAB DMS Security Team`;

  return sendMail({
    to,
    subject: "DMS Password Recovery OTP",
    text,
    html: `<p>Hello ${name || "User"},</p><p>Your DMS password recovery OTP is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;color:#4f46e5">${otp}</p><p>This OTP is valid for 10 minutes.</p><p>If you did not request this, please ignore this email.</p><p>Regards,<br>ITSOFTLAB DMS Security Team</p>`
  });
}

async function sendTestEmail(recipient) {
  const config = getMailConfig();
  const to = recipient || config.user;
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
  sendForgotPasswordOtpEmail
};
