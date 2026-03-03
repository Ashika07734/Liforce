import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import connectdb from "./config/db.js";
import { env } from "./config/env.js";

import auth from "./Router/auth.js";
import ForgotPassword from "./Router/forgetpassword.js";
import donorRoutes from "./Router/donor.js";
import orgRoutes from "./Router/org.js";
import adminRoutes from "./Router/admin.js";
import geoRoutes from "./Router/geo.js";
import notificationRoutes from "./Router/notification.js";
import requestRoutes from "./Router/requests-complete.js";
import donationRoutes from "./Router/donation.js";
import appointmentRoutes from "./Router/appointments.js";

const app = express();

console.log("----------------------------------------");
console.log("SERVER STARTING - PRODUCTION MODE");
console.log("----------------------------------------");

/* ==============================
   MIDDLEWARE
================================ */

// Logger
app.use(morgan("dev"));

// CORS (Production Safe)
app.use(
  cors({
    origin: true, // allow all origins (Vercel, localhost, etc.)
    credentials: true,
  })
);

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==============================
   DATABASE
================================ */
connectdb();

/* ==============================
   HEALTH CHECK
================================ */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

/* ==============================
   ROUTES
================================ */
app.use("/api", auth);
app.use("/api", ForgotPassword);

app.use("/api/donor", donorRoutes);
app.use("/api/org", orgRoutes);

app.use("/api/admin/donations", donationRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/geo", geoRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);

/* ==============================
   FALLBACKS
================================ */

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(500).json({ message: "Internal server error" });
});

/* ==============================
   SERVER START
================================ */
const PORT = process.env.PORT || env.port || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;