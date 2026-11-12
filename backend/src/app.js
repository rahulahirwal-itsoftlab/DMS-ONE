const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { superAdminManagerRolesEnabled } = require("./utils/featureFlags");
const { sequelize } = require("./models");

const app = express();
app.set('trust proxy', 1);

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "https://dms-one.netlify.app/",
  "https://dms-one.netlify.app",
  "https://dms.itsoftlab360.com",
  "http://dms-frontend-lb-179175988.ap-south-1.elb.amazonaws.com",
  "https://dms-fb.vercel.app/"
];

const envOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envOrigins])];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Allows inline previews and external Cloudinary images
}));

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Request timeout middleware (30s)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(504).json({ message: "Gateway timeout: request took too long to complete" });
    }
  });
  next();
});

// Legacy uploads static serve (with max-age caching header for performance)
app.use("/uploads", express.static(path.join(__dirname, "../uploads"), {
  maxAge: "7d",
  etag: true
}));

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again later." }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in 15 minutes." }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);

// Comprehensive production health check
app.get("/api/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: "healthy",
      service: "DMS Enterprise API",
      database: "connected",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      service: "DMS Enterprise API",
      database: "disconnected",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/super-admin", require("./routes/superAdminRoutes"));
if (superAdminManagerRolesEnabled()) {
  app.use("/api/super-admin-ceo", require("./routes/superAdminCeoRoutes"));
  app.use("/api/super-admin-it", require("./routes/superAdminItRoutes"));
  app.use("/api/super-admin-sales", require("./routes/superAdminSalesRoutes"));
  app.use("/api/super-admin-finance", require("./routes/superAdminFinanceRoutes"));
  app.use("/api/super-admin-chat", require("./routes/superAdminChatRoutes"));
} else {
  app.use(["/api/super-admin-ceo", "/api/super-admin-it", "/api/super-admin-sales", "/api/super-admin-finance", "/api/super-admin-chat"], (req, res) => {
    res.status(410).json({ message: "This Super Admin manager feature is no longer active." });
  });
}
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/admin-ceo", require("./routes/adminCeoRoutes"));
app.use("/api/admin-internal-chat", require("./routes/adminInternalChatRoutes"));
app.use("/api/dealer", require("./routes/dealerRoutes"));
app.use("/api/dealer-ceo", require("./routes/dealerCeoRoutes"));
app.use("/api/dealer-stock-exchange", require("./routes/dealerStockExchangeRoutes"));
app.use("/api/dealer-internal-chat", require("./routes/dealerInternalChatRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/internal-updates", require("./routes/internalUpdatesRoutes"));
app.use("/api", require("./routes/compatRoutes"));

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Centralized error handler
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[API Error] ${req.method} ${req.url}:`, err);
  }
  const status = err.status || 500;
  const message = status === 500 && process.env.NODE_ENV === "production"
    ? "Internal server error"
    : (err.message || "Server error");

  res.status(status).json({
    message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.licenseStatus ? { licenseStatus: err.licenseStatus } : {})
  });
});

module.exports = app;
