// --- Imports ---
import express from "express";
import { connectToDatabase } from "./src/utils/database";
import dotenv from "dotenv";
import { oxyClient } from "@oxyhq/core";

// Routers
import profileSettingsRoutes from "./src/routes/profileSettings";
import postsRoutes from "./src/routes/posts";
import socialAccountsRoutes from "./src/routes/socialAccounts";
import analyticsRoutes from "./src/routes/analytics";
import queueRoutes from "./src/routes/queue";

// Middleware
import { rateLimiter } from "./src/middleware/security";

// --- Config ---
dotenv.config();

const app = express();

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
    console.error("MongoDB connection unavailable:", error);
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
    "http://localhost:8081",
    "http://localhost:8082",
    "http://192.168.86.44:8081",
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
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

// --- Optional Auth Middleware ---
// Tries to authenticate but doesn't fail if no token is provided
const optionalAuth = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const authMiddleware = oxy.auth();
  authMiddleware(req, res, (err?: any) => {
    if (err) {
      console.log(
        "Optional auth: Authentication failed, continuing as unauthenticated:",
        err?.message || "Unknown error"
      );
      (req as any).user = undefined;
    }
    next();
  });
};

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

// Mount public and authenticated API routers
app.use("/api", publicApiRouter);
app.use("/api", oxy.auth(), authenticatedApiRouter);

// --- Root API Welcome Route ---
app.get("/", async (req, res) => {
  res.json({ message: "Welcome to Schedio API", version: "1.0.0" });
});

// --- MongoDB Connection ---
const db = require("mongoose").connection;
db.on("error", (error: Error) => {
  console.error("MongoDB connection error:", error);
});
db.once("open", () => {
  console.log("Connected to MongoDB successfully");
  // Load models
  require("./src/models/UserSettings");
  require("./src/models/Block");
  require("./src/models/Restrict");
  require("./src/models/UserBehavior");
});

// --- Server Listen ---
const PORT = process.env.PORT || 3000;
const bootServer = async () => {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      console.log(`Schedio backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server: unable to connect to MongoDB", error);
    process.exit(1);
  }
};

if (require.main === module) {
  void bootServer();
}

export default app;
