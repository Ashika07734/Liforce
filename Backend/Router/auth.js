import express from "express";
import cors from "cors";
import { auth } from "../Middleware/auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../modules/User.js";
import Admin from "../modules/Admin.js";
import bloodbank from "../modules/BloodBank.js";
import Hospital from "../modules/Hospital.js";
import Donor from "../modules/donor.js";
import { env } from "../config/env.js";
import { ACCOUNT_STATUS, ROLES, VERIFICATION_STATUS } from "../config/constants.js";

const router = express.Router();

// Helpers
const mapIncomingRole = (role = "") => {
  const r = (role || "").toLowerCase();
  if (r === "donar" || r === "donor") return { legacy: "donor", canonical: ROLES.DONOR };
  if (r === "hospital" || r === "bloodbank" || r === "organization")
    return { legacy: r === "bloodbank" ? "bloodbank" : "hospital", canonical: ROLES.ORGANIZATION };
  if (r === "admin") return { legacy: "admin", canonical: ROLES.ADMIN };
  return { legacy: r, canonical: r.toUpperCase() };
};

const signTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtl });
  const refreshToken = jwt.sign({ ...payload, type: "refresh" }, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtl,
  });
  return { accessToken, refreshToken };
};

// Signup
router.post("/signup", async (req, res) => {
  const {
    Name,
    Email,
    Password,
    ConfirmPassword,
    City,
    PhoneNumber,
    Role,
    Bloodgroup,
    Dateofbirth,
    // New unified organization fields
    organizationType,
    organizationName,
    Licensenumber,
    Address,
    // Legacy fields (backward compatibility)
    Bankname,
    BankAddress,
    Hospitalname,
    Department,
    HospitalAddress,
    // Admin fields
    Adminname,
    Admincode,
  } = req.body;

  try {
    const { legacy, canonical } = mapIncomingRole(Role);

    // Check if user already exists
    let user = await User.findOne({ Email });
    if (user) {

      return res.status(400).json({ msg: "User already exists" });
    }

    // Password validation
    if (Password !== ConfirmPassword) {
      return res.status(400).json({ msg: "Passwords do not match" });
    }

    if (!Password || Password.length < 8) {
      return res.status(400).json({ msg: "Password must be at least 8 characters" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(Password, 10);

    // Build user object
    const userData = {
      Name,
      Email,
      Password: hashedPassword,
      City,
      PhoneNumber,
      Role: legacy,
      verificationStatus: VERIFICATION_STATUS.PENDING,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    };

    // Add role-specific fields to User model
    if (canonical === ROLES.DONOR) {
      userData.bloodGroup = Bloodgroup;
      userData.DateOfBirth = Dateofbirth;
    } else if (canonical === ROLES.ORGANIZATION) {
      // Handle new unified organization signup
      if (organizationType && organizationName) {
        userData.organizationType = organizationType; // HOSPITAL or BANK
        userData.organizationName = organizationName;
        userData.licenseNo = Licensenumber;
      } else {
        // Backward compatibility: handle legacy hospital/bloodbank signup
        if (legacy === "hospital") {
          userData.organizationType = "HOSPITAL";
          userData.organizationName = Hospitalname;
          userData.licenseNo = Licensenumber;
        } else if (legacy === "bloodbank") {
          userData.organizationType = "BANK";
          userData.organizationName = Bankname;
          userData.licenseNo = Licensenumber;
        }
      }
    }

    // Create user in User collection
    user = new User(userData);
    await user.save();
    const user_Id = user._id;

    // Prepare role-specific data for legacy collections (backward compatibility)
    let Extra = {};

    if (legacy === "donor") {
      Extra = { Bloodgroup, Dateofbirth };
      await Donor.create({ user_Id, ...Extra });
    } else if (legacy === "admin") {
      Extra = { Adminname, Admincode, Address };
      await Admin.create({ user_Id, ...Extra });
    } else if (legacy === "hospital") {
      // For backward compatibility, still create legacy documents
      Extra = {
        Hospitalname: organizationName || Hospitalname,
        Department: Department || "General",
        HospitalAddress: Address || HospitalAddress
      };
      await Hospital.create({ user_Id, ...Extra });
    } else if (legacy === "bloodbank") {
      Extra = {
        Bankname: organizationName || Bankname,
        Licensenumber,
        BankAddress: Address || BankAddress
      };
      await bloodbank.create({ user_Id, ...Extra });
    }

    const tokenPayload = {
      email: Email,
      role: canonical,
      userId: user_Id,
      organizationType: userData.organizationType // Add organizationType to token
    };
    const { accessToken, refreshToken } = signTokens(tokenPayload);

    res.json({
      message: "User Registered Successfully",
      Token: accessToken,
      RefreshToken: refreshToken,
      Role: legacy,
      role: canonical,
      Name: Name,
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {

    res.status(500).json({ message: "Server error during signup", error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { Email, Password, Role } = req.body;

  try {
    const user = await User.findOne({ Email });
    if (!user) {
      return res.status(403).json({ msg: "Invalid Email or password" });
    }

    const { legacy, canonical } = mapIncomingRole(Role);
    // Legacy support: if canonical role is DONOR, allow user role to be "donar" or "donor"
    const userRole = (user.Role || "").toLowerCase().trim();
    const isValidDonor = canonical === ROLES.DONOR && (userRole === "donar" || userRole === "donor");

    // Allow 'hospital', 'bloodbank', AND 'organization' as valid roles for Organization login
    const isValidOrg = (canonical === "ORGANIZATION") && (userRole === "hospital" || userRole === "bloodbank" || userRole === "organization");
    const isValidAdmin = canonical === ROLES.ADMIN && (userRole === "admin");

    if (!isValidDonor && !isValidOrg && !isValidAdmin && userRole !== legacy) {
      return res.status(403).json({
        msg: "Role does not match! Please select correct role."
      });
    }

    if (user.accountStatus === ACCOUNT_STATUS.BLOCKED || user.accountStatus === ACCOUNT_STATUS.DELETED) {
      console.log("Login Failed: Account status is", user.accountStatus);
      return res.status(403).json({ msg: "Account is blocked or deleted" });
    }

    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch) {
      console.log("Login Failed: Password mismatch");
      return res.status(400).json({ msg: "Invalid Email or password" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokenPayload = {
      email: user.Email,
      role: canonical,
      userId: user._id,
      organizationType: user.organizationType // Add organizationType to token
    };
    const { accessToken, refreshToken } = signTokens(tokenPayload);

    res.json({
      message: "Login Successful",
      Token: accessToken,
      RefreshToken: refreshToken,
      Role: user.Role,
      role: canonical,
      Name: user.Name,
      verificationStatus: user.verificationStatus,
      accountStatus: user.accountStatus,
    });
  } catch (err) {

    res.status(500).json({ message: "Server error" });
  }
});

// Get current user
router.get("/auth/me", auth(), async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-Password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const { canonical } = mapIncomingRole(user.Role);

    // Build response with organization-specific fields for ORGANIZATION role
    const response = {
      userId: user._id,
      email: user.Email,
      Email: user.Email, // Keep for compatibility
      name: user.Name,
      Name: user.Name, // Keep for compatibility
      City: user.City,
      PhoneNumber: user.PhoneNumber,
      role: canonical,
      legacyRole: user.Role,
      verificationStatus: user.verificationStatus,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };

    // Add organization-specific fields if user is an organization
    if (canonical === 'ORGANIZATION') {
      response.organizationType = user.organizationType;
      response.organizationName = user.organizationName;
      response.licenseNo = user.licenseNo;
      response.verifiedAt = user.verifiedAt;
      response.rejectionReason = user.rejectionReason;
    }

    // Add donor-specific fields
    if (canonical === 'DONOR') {
      response.bloodGroup = user.bloodGroup;
      response.lastDonationDate = user.lastDonationDate;
      response.eligible = user.eligible;
    }

    res.json(response);
  } catch (err) {

    res.status(500).json({ message: "Server error" });
  }
});

// Token refresh
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ msg: "Refresh token is required" });
  }
  try {
    const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret);
    if (decoded.type !== "refresh") {
      return res.status(400).json({ msg: "Invalid refresh token" });
    }
    const payload = { email: decoded.email, role: decoded.role, userId: decoded.userId };
    const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtl });
    res.json({ Token: accessToken });
  } catch (err) {
    return res.status(401).json({ msg: "Invalid or expired refresh token" });
  }
});

// Change Password
router.post("/change-password", auth(), async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.userId;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.Password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.Password = hashedPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {

    res.status(500).json({ message: "Server error" });
  }
});

// Update Profile (for organizations)
router.put("/profile", auth([ROLES.ORGANIZATION]), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { organizationName, Name, Email, PhoneNumber, City, licenseNo } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields if provided
    if (organizationName !== undefined) user.organizationName = organizationName;
    if (Name !== undefined) user.Name = Name;
    if (PhoneNumber !== undefined) user.PhoneNumber = PhoneNumber;
    if (City !== undefined) user.City = City;
    if (licenseNo !== undefined) user.licenseNo = licenseNo;

    // Email update requires additional validation
    if (Email && Email !== user.Email) {
      const existingUser = await User.findOne({ Email });
      if (existingUser && existingUser._id.toString() !== userId.toString()) {
        return res.status(400).json({ message: "Email already in use by another account" });
      }
      user.Email = Email;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        organizationName: user.organizationName,
        Name: user.Name,
        Email: user.Email,
        PhoneNumber: user.PhoneNumber,
        City: user.City,
        licenseNo: user.licenseNo
      }
    });
  } catch (err) {

    res.status(500).json({ message: "Server error" });
  }
});

// Delete Account (Soft Delete)
router.delete("/delete-account", auth(), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Soft delete: Change account status to DELETED
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.accountStatus = ACCOUNT_STATUS.DELETED;

    await user.save();

    res.json({ message: "Account deleted successfully" });
  } catch (err) {

    res.status(500).json({ message: "Server error" });
  }
});

export default router;
