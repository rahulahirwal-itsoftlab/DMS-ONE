const asyncHandler = require("../utils/asyncHandler");
const { Op } = require("sequelize");
const { User, Company, Dealer } = require("../models");
const { sendPasswordChangeOtpEmail } = require("../utils/mailService");
const { publicPath } = require("../middleware/upload");
const cloudinaryService = require("../services/cloudinaryService");
const cacheService = require("../services/cacheService");

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: user.avatar,
    avatarPublicId: user.avatarPublicId,
    status: user.status,
    companyId: user.companyId,
    dealerId: user.dealerId,
    isTwoFactorEnabled: Boolean(user.isTwoFactorEnabled),
    twoFactorVerifiedAt: user.twoFactorVerifiedAt,
    passwordChangedAt: user.passwordChangedAt,
    passwordChangeRequired: Boolean(user.passwordChangeRequired),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function profilePayload(user) {
  const [company, dealer] = await Promise.all([
    user.companyId ? Company.findByPk(user.companyId) : null,
    user.dealerId ? Dealer.findByPk(user.dealerId) : null
  ]);
  return { user: cleanUser(user), company, dealer };
}

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  res.json(await profilePayload(user));
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  const { name, email, phone, ownerName } = req.body;

  if (name !== undefined) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return res.status(400).json({ message: "Name is required" });
    user.name = trimmed;
  }

  if (email !== undefined) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return res.status(400).json({ message: "Email is required" });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }
    if (cleanEmail !== user.email) {
      const existing = await User.findOne({ where: { email: cleanEmail, id: { [Op.ne]: user.id } } });
      if (existing) {
        return res.status(400).json({ message: "Email is already in use by another account" });
      }
      user.email = cleanEmail;
    }
  }

  if (phone !== undefined) {
    const rawPhone = String(phone || "").trim();
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length !== 10) {
        return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
      }
      user.phone = digits;
    } else {
      user.phone = null;
    }
  }

  if (req.file) {
    const avatar = publicPath("profiles", req.file);
    const oldAvatarPublicId = user.avatarPublicId || cloudinaryService.extractPublicId(user.avatar);
    if (avatar) {
      user.avatar = avatar;
      user.avatarPublicId = req.file?.cloudinaryPublicId || null;
      if (oldAvatarPublicId) {
        cloudinaryService.deleteAsset(oldAvatarPublicId).catch(() => {});
      }
    }
  }

  await user.save();

  if (user.dealerId) {
    const dealer = await Dealer.findOne({ where: { id: user.dealerId, companyId: user.companyId } });
    if (dealer) {
      const updates = {};
      if (user.phone !== undefined) updates.phone = user.phone;
      if (user.email !== undefined) updates.email = user.email;
      if (ownerName !== undefined && String(ownerName || "").trim()) updates.ownerName = String(ownerName).trim();
      if (Object.keys(updates).length) await dealer.update(updates);
    }
  }

  if (cacheService && typeof cacheService.del === "function") {
    cacheService.del(cacheService.key("global", "auth_user", user.id));
  }

  res.json({ message: "Profile updated successfully", ...(await profilePayload(await User.findByPk(user.id))) });
});

exports.sendPasswordOtp = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const otp = generateOtp();
  user.passwordResetOtp = otp;
  user.passwordResetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendPasswordChangeOtpEmail({ to: user.email, name: user.name, otp });
  res.json({ message: "OTP sent to your registered email" });
});

exports.changePasswordWithOtp = asyncHandler(async (req, res) => {
  const { otp, newPassword, confirmPassword } = req.body;
  if (!otp || !newPassword || !confirmPassword) return res.status(400).json({ message: "All password fields are required" });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: "New passwords do not match" });
  if (String(newPassword).length < 6) return res.status(400).json({ message: "New password must be at least 6 characters" });

  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!user.passwordResetOtp || !user.passwordResetOtpExpiry) return res.status(400).json({ message: "Please request an OTP first" });
  if (new Date(user.passwordResetOtpExpiry).getTime() < Date.now()) return res.status(400).json({ message: "OTP has expired" });
  if (String(user.passwordResetOtp) !== String(otp).trim()) return res.status(400).json({ message: "Invalid OTP" });

  user.password = newPassword;
  user.passwordResetOtp = null;
  user.passwordResetOtpExpiry = null;
  user.passwordChangedAt = new Date();
  await user.save();

  res.json({ message: "Password changed successfully" });
});

exports.changePasswordAfterOtpLogin = asyncHandler(async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  if (!newPassword || !confirmPassword) return res.status(400).json({ message: "All password fields are required" });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: "New passwords do not match" });
  if (String(newPassword).length < 6) return res.status(400).json({ message: "New password must be at least 6 characters" });

  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!user.passwordChangeRequired) return res.status(403).json({ message: "Password recovery verification is required" });

  user.password = newPassword;
  user.passwordChangeRequired = false;
  user.forgotPasswordOtp = null;
  user.forgotPasswordOtpExpiry = null;
  user.passwordChangedAt = new Date();
  await user.save();
  res.json({ message: "Password changed successfully", user: cleanUser(user) });
});

exports.updateTwoFactor = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  const enabled = Boolean(req.body.enabled);
  await user.update({
    isTwoFactorEnabled: enabled,
    twoFactorOtp: null,
    twoFactorOtpExpiry: null,
    twoFactorVerifiedAt: enabled ? user.twoFactorVerifiedAt : null
  });
  res.json({
    message: enabled ? "Two-Factor Authentication enabled" : "Two-Factor Authentication disabled",
    ...(await profilePayload(await User.findByPk(user.id)))
  });
});
