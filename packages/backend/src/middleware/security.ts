import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import type { Request, RequestHandler } from 'express';

// Rate limiting middleware (exclude file uploads)
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000, // limit each IP to 100 requests per window
  handler: (req, res) => {
    const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(((reset?.getTime() ?? Date.now() + 900000) - Date.now()) / 1000),
    );
    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: 'Too many requests; try again later',
        details: { retryAfterSeconds },
      },
    });
  },
  skip: (req: Request) => req.path.startsWith('/files/upload'),
});

// Brute force protection middleware (exclude file uploads).
// Explicit RequestHandler annotation keeps the emitted type portable under
// composite builds (express-slow-down's nested express-rate-limit type isn't).
const bruteForceProtection: RequestHandler = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50000, // allow 100 requests per 15 minutes, then...
  delayMs: () => 500, // add 500ms delay per request above 100 (new behavior)
  skip: (req: Request) => req.path.startsWith('/files/upload'),
});

export { rateLimiter, bruteForceProtection };
