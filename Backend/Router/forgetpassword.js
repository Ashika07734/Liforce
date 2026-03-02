import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "../modules/User.js";
import { sendPasswordResetEmail } from "../utils/emailBrevo.js";

const router = express.Router();

// ==================== FORGOT PASSWORD ====================
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ Email: email });

    // We generate a token whether the user exists or not as a slight mitigation against timing attacks
    const resetToken = crypto.randomBytes(32).toString('hex');

    if (user) {
      // Hash token and set to resetPasswordToken field
      const resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Set expiration to 15 minutes
      const resetPasswordExpire = Date.now() + 15 * 60 * 1000;

      user.resetPasswordToken = resetPasswordToken;
      user.resetPasswordExpire = resetPasswordExpire;
      await user.save();

      // Create reset link with the unhashed token
      const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${resetToken}`;

      // Send the email using Brevo
      await sendPasswordResetEmail(email, resetLink, user.Name);
    }

    // Standardized response to prevent email enumeration
    res.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent."
    });

  } catch (error) {
    console.error("❌ Forgot password error:", error);

    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
});

// ==================== RESET PASSWORD ====================
router.post("/reset-password", async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  try {
    // Validate passwords
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    // Hash the incoming token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with this token and ensure it hasn't expired
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token"
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token fields
    user.Password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password."
    });

  } catch (error) {
    console.error("❌ Reset password error:", error);

    res.status(500).json({
      success: false,
      message: "Server error. Please try again later."
    });
  }
});

// ==================== VERIFY TOKEN ====================
router.post("/verify-reset-token", async (req, res) => {
  const { token } = req.body;

  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Check if user still exists with valid token
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token"
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
      email: user.Email
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

export default router;
