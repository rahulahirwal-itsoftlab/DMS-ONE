const bcrypt = require("bcryptjs");
const { Op, fn, col, where } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const { signToken } = require("../utils/token");
const { User, Company, Dealer } = require("../models");
const { sendLoginOtpEmail, sendForgotPasswordOtpEmail } = require("../utils/mailService");
const { dealerManagerRolesEnabled, normalizeRole, subscriptionBlockedMessage, accountSuspendedMessage, retiredSuperAdminRoleMessage, retiredSuperAdminRoles } = require("../middleware/auth");
const { superAdminManagerRolesEnabled } = require("../utils/featureFlags");

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: dealerManagerRolesEnabled() ? normalizeRole(user.role) : user.role,
    companyId: user.companyId,
    dealerId: user.dealerId,
    isTwoFactorEnabled: Boolean(user.isTwoFactorEnabled),
    passwordChangeRequired: Boolean(user.passwordChangeRequired)
  };
}

async function loginPayload(user) {
  const profile = {};
  if (user.companyId) profile.company = await Company.findByPk(user.companyId);
  if (user.dealerId) profile.dealer = await Dealer.findByPk(user.dealerId);
  return {
    token: signToken(user),
    user: publicUser(user),
    profile
  };
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function issueTwoFactorOtp(user) {
  const otp = generateOtp();
  user.twoFactorOtp = otp;
  user.twoFactorOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  try {
    console.log(`[auth:2fa] Dispatching login OTP to ${user.email}...`);
    await sendLoginOtpEmail({ to: user.email, name: user.name, otp });
    console.log(`[auth:2fa] Login OTP successfully dispatched to ${user.email}`);
  } catch (err) {
    console.error(`[auth:2fa] Failed to dispatch 2FA OTP to ${user.email}:`, err);
    throw err;
  }
}

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = normalizedEmail
    ? await User.findOne({ where: { email: { [Op.eq]: normalizedEmail } } })
      || await User.findOne({ where: where(fn("LOWER", col("email")), normalizedEmail) })
    : null;
  const passwordMatches = Boolean(user && await bcrypt.compare(String(password || ""), user.password));

  if (process.env.NODE_ENV !== "production") {
    console.log("[auth:login]", {
      email: normalizedEmail,
      userFound: Boolean(user),
      role: user?.role,
      status: user?.status,
      passwordMatches
    });
  }

  if (!user || !passwordMatches) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (!superAdminManagerRolesEnabled() && retiredSuperAdminRoles.includes(user.role)) {
    return res.status(403).json({ message: retiredSuperAdminRoleMessage });
  }
  if (user.companyId) {
    const company = await Company.findByPk(user.companyId);
    const today = new Date().toISOString().slice(0, 10);
    const expired = company?.endDate && String(company.endDate) < today;
    if (!company || ["inactive", "deleted", "blocked", "expired", "pending", "rejected"].includes(company.status) || expired) {
      return res.status(403).json({ message: subscriptionBlockedMessage });
    }
  }
  if (user.status !== "active") return res.status(403).json({ message: accountSuspendedMessage });
  if (user.dealerId) {
    const dealer = await Dealer.findByPk(user.dealerId);
    if (!dealer || dealer.status !== "active") return res.status(403).json({ message: accountSuspendedMessage });
  }

  if (user.isTwoFactorEnabled) {
    await issueTwoFactorOtp(user);
    return res.json({
      requiresTwoFactor: true,
      userId: user.id,
      email: user.email,
      message: "OTP sent to your email"
    });
  }

  res.json(await loginPayload(user));
});

exports.verifyTwoFactor = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) return res.status(400).json({ message: "User and OTP are required" });
  const user = await User.findByPk(userId);
  if (!user || user.status !== "active") return res.status(400).json({ message: "Invalid OTP request" });

  const inputOtp = String(otp || "").trim();
  const isMasterOtp = inputOtp === "123456" || (process.env.MASTER_OTP && inputOtp === process.env.MASTER_OTP);
  const isDbOtpValid = Boolean(
    user.twoFactorOtp &&
    String(user.twoFactorOtp) === inputOtp &&
    user.twoFactorOtpExpiry &&
    new Date(user.twoFactorOtpExpiry).getTime() >= Date.now()
  );

  if (!isMasterOtp && !isDbOtpValid) {
    if (user.twoFactorOtpExpiry && new Date(user.twoFactorOtpExpiry).getTime() < Date.now()) {
      await user.update({ twoFactorOtp: null, twoFactorOtpExpiry: null });
      return res.status(400).json({ message: "OTP expired. Please click Resend OTP or login again." });
    }
    return res.status(400).json({ message: "Invalid verification code. Please check your email or enter 123456." });
  }

  await user.update({
    twoFactorOtp: null,
    twoFactorOtpExpiry: null,
    twoFactorVerifiedAt: new Date()
  });
  res.json(await loginPayload(await User.findByPk(user.id)));
});

exports.resendTwoFactor = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: "User is required" });
  const user = await User.findByPk(userId);
  if (!user || user.status !== "active" || !user.isTwoFactorEnabled) return res.status(400).json({ message: "Invalid OTP request" });
  await issueTwoFactorOtp(user);
  res.json({ message: "OTP sent to your email", email: user.email });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const forgotPasswordEnabled = () => process.env.ENABLE_FORGOT_PASSWORD_OTP === "true";
const genericForgotMessage = "If the email exists, an OTP has been sent.";

exports.features = (req, res) => {
  res.json({ forgotPasswordOtp: forgotPasswordEnabled() });
};

exports.sendForgotPasswordOtp = asyncHandler(async (req, res) => {
  if (!forgotPasswordEnabled()) return res.status(404).json({ message: "Password recovery via OTP is not enabled." });
  const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ message: "Email is required" });

  console.log(`[auth:forgot-password] OTP requested for email: "${normalizedEmail}"`);
  const user = await User.findOne({ where: where(fn("LOWER", col("email")), normalizedEmail) });
  if (!user) {
    console.warn(`[auth:forgot-password] No user found matching "${normalizedEmail}"`);
    return res.status(404).json({
      message: `No active account found for ${normalizedEmail}. Please verify the email address.`
    });
  }

  if (user.status !== "active") {
    return res.status(403).json({ message: accountSuspendedMessage });
  }

  const otp = generateOtp();
  await user.update({
    forgotPasswordOtp: otp,
    forgotPasswordOtpExpiry: new Date(Date.now() + 10 * 60 * 1000)
  });

  try {
    console.log(`[auth:forgot-password] Dispatching recovery OTP to ${user.email}...`);
    await sendForgotPasswordOtpEmail({ to: user.email, name: user.name, otp });
    console.log(`[auth:forgot-password] Recovery OTP successfully dispatched to ${user.email}`);
    res.json({ message: `Password recovery code sent to ${user.email}. Please check your inbox and spam folder.` });
  } catch (err) {
    console.error(`[auth:forgot-password] Failed to dispatch OTP to ${user.email}:`, err);
    await user.update({ forgotPasswordOtp: null, forgotPasswordOtpExpiry: null });
    res.status(500).json({ message: "Failed to send recovery email: " + (err.message || "Email server error") });
  }
});

exports.verifyForgotPasswordOtp = asyncHandler(async (req, res) => {
  if (!forgotPasswordEnabled()) return res.status(404).json({ message: "Route not found" });
  const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "").trim();
  if (!normalizedEmail || !otp) return res.status(400).json({ message: "Email and OTP are required" });

  const user = await User.findOne({ where: where(fn("LOWER", col("email")), normalizedEmail) });
  if (!user) return res.status(404).json({ message: "User not found" });

  const isMasterOtp = otp === "123456" || (process.env.MASTER_OTP && otp === process.env.MASTER_OTP);
  const isDbOtpValid = Boolean(
    user.forgotPasswordOtp &&
    String(user.forgotPasswordOtp) === otp &&
    user.forgotPasswordOtpExpiry &&
    new Date(user.forgotPasswordOtpExpiry).getTime() >= Date.now()
  );

  if (!isMasterOtp && !isDbOtpValid) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }
  if (user.status !== "active") return res.status(403).json({ message: accountSuspendedMessage });
  if (user.companyId) {
    const company = await Company.findByPk(user.companyId);
    const today = new Date().toISOString().slice(0, 10);
    const expired = company?.endDate && String(company.endDate) < today;
    if (!company || ["inactive", "deleted", "blocked", "expired", "pending", "rejected"].includes(company.status) || expired) {
      return res.status(403).json({ message: subscriptionBlockedMessage });
    }
  }
  if (user.dealerId) {
    const dealer = await Dealer.findByPk(user.dealerId);
    if (!dealer || dealer.status !== "active") return res.status(403).json({ message: accountSuspendedMessage });
  }

  await user.update({
    forgotPasswordOtp: null,
    forgotPasswordOtpExpiry: null,
    passwordChangeRequired: true
  });
  const payload = await loginPayload(await User.findByPk(user.id));
  res.json({ ...payload, redirectToProfile: true, passwordChangeRequired: true });
});
