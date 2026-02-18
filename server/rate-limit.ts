import type { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs?: number;   // Time window in milliseconds (default: 15 min)
  maxRequests?: number; // Max requests per window (default: 100)
  message?: string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const clients = new Map<string, ClientRecord>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  clients.forEach((record, key) => {
    if (now > record.resetTime) {
      clients.delete(key);
    }
  });
}, 5 * 60 * 1000);

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 100,
    message = "Too many requests, please try again later.",
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let record = clients.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      clients.set(key, record);
      return next();
    }

    record.count++;

    if (record.count > maxRequests) {
      res.set("Retry-After", String(Math.ceil((record.resetTime - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// Stricter rate limit for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  message: "Too many login attempts, please try again later.",
});

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
});
