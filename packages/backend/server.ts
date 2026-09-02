// --- Imports ---
import express from "express";
import { connectToDatabase } from "./src/db";
import dotenv from "dotenv";
import { oxyClient } from "@oxyhq/core";
import { createOxyAuthMiddleware } from "@oxyhq/core/server";

// Routers
import profileSettingsRoutes from "./src/routes/profileSettings";
import postsRoutes from "./src/routes/posts";
import socialAccountsRoutes from "./src/routes/socialAccounts";
import analyticsRoutes from "./src/routes/analytics";
import queueRoutes from "./src/routes/queue";

// Middleware
import { rateLimiter, bruteForceProtection } from "./src/middleware/security";
import { logger } from "./src/utils/logger";
import { validateTokenCipherConfiguration } from "./src/utils/tokenCipher";

// --- Config ---
dotenv.config();

const app = express();

// Behind the ALB (single proxy hop) — required for express-rate-limit /
// express-slow-down to read the real client IP from X-Forwarded-For.
app.set("trust proxy", 1);

// Initialize Oxy client for authentication
export const oxy = oxyClient;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    logger.error("PostgreSQL connection unavailable:", error);
    if (res.headersSent) {
      return;
    }
    res.status(503).json({ message: "Database temporarily unavailable" });
  }
});

// CORS and security headers
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL || "https://schedio.app",
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:8081", "http://localhost:8082"]),
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// --- API ROUTES ---
// Public API routes (no authentication required)
const publicApiRouter = express.Router();

// Health check
publicApiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", service: "schedio-backend" });
});

// Authenticated API routes (require authentication)
const authenticatedApiRouter = express.Router();
authenticatedApiRouter.use("/profile", profileSettingsRoutes);
authenticatedApiRouter.use("/posts", postsRoutes);
authenticatedApiRouter.use("/accounts", socialAccountsRoutes);
authenticatedApiRouter.use("/analytics", analyticsRoutes);
authenticatedApiRouter.use("/queue", queueRoutes);

// Mount public and authenticated API routers.
// Health/public routes are mounted before the limiters so health checks are not
// rate-limited; rate limiting + brute-force protection apply to everything after.
app.use("/api", publicApiRouter);
app.use(rateLimiter);
app.use(bruteForceProtection);
app.use("/api", createOxyAuthMiddleware(oxy), authenticatedApiRouter);

// --- Root API Welcome Route ---
app.get("/", async (req, res) => {
  res.json({ message: "Welcome to Schedio API", version: "1.0.0" });
});

// --- Server Listen ---
const PORT = process.env.PORT || 3000;
const bootServer = async () => {
  try {
    validateTokenCipherConfiguration();
    await connectToDatabase();
    app.listen(PORT, () => {
      logger.info(`Schedio backend server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

if (require.main === module) {
  void bootServer();
}

export default app;
