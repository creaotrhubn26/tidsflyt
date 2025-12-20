import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { apiKeys, apiUsageLog, vendors } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

export interface ApiRequest extends Request {
  vendorId?: number;
  apiKeyId?: number;
  apiKeyPermissions?: string[];
}

const rateLimitStore = new Map<number, { count: number; resetAt: number }>();

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `st_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = key.substring(0, 11);
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function apiKeyAuth(req: ApiRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Use: Bearer <api_key>",
      code: "MISSING_API_KEY"
    });
  }

  const apiKey = authHeader.substring(7);
  const keyHash = hashApiKey(apiKey);

  try {
    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyHash, keyHash),
        eq(apiKeys.isActive, true),
        isNull(apiKeys.revokedAt)
      ))
      .limit(1);

    if (!keyRecord) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
        code: "INVALID_API_KEY"
      });
    }

    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key has expired",
        code: "EXPIRED_API_KEY"
      });
    }

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, keyRecord.vendorId))
      .limit(1);

    if (!vendor || !vendor.apiAccessEnabled) {
      return res.status(403).json({
        error: "Forbidden",
        message: "API access is not enabled for this vendor",
        code: "API_ACCESS_DISABLED"
      });
    }

    if (vendor.apiSubscriptionEnd && new Date(vendor.apiSubscriptionEnd) < new Date()) {
      return res.status(403).json({
        error: "Forbidden",
        message: "API subscription has expired",
        code: "SUBSCRIPTION_EXPIRED"
      });
    }

    const rateLimit = keyRecord.rateLimit || 60;
    const now = Date.now();
    const rateLimitKey = keyRecord.id;
    let rateLimitData = rateLimitStore.get(rateLimitKey);

    if (!rateLimitData || rateLimitData.resetAt < now) {
      rateLimitData = { count: 0, resetAt: now + 60000 };
    }

    rateLimitData.count++;
    rateLimitStore.set(rateLimitKey, rateLimitData);

    res.setHeader("X-RateLimit-Limit", rateLimit.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, rateLimit - rateLimitData.count).toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimitData.resetAt / 1000).toString());

    if (rateLimitData.count > rateLimit) {
      const responseTime = Date.now() - startTime;
      await logApiUsage(keyRecord.id, keyRecord.vendorId, req, 429, responseTime);
      
      return res.status(429).json({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Maximum ${rateLimit} requests per minute.`,
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((rateLimitData.resetAt - now) / 1000)
      });
    }

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id));

    req.vendorId = keyRecord.vendorId;
    req.apiKeyId = keyRecord.id;
    req.apiKeyPermissions = keyRecord.permissions || [];

    res.on("finish", async () => {
      const responseTime = Date.now() - startTime;
      await logApiUsage(keyRecord.id, keyRecord.vendorId, req, res.statusCode, responseTime);
    });

    next();
  } catch (error) {
    console.error("API authentication error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "An error occurred during authentication",
      code: "AUTH_ERROR"
    });
  }
}

async function logApiUsage(
  apiKeyId: number,
  vendorId: number,
  req: Request,
  statusCode: number,
  responseTimeMs: number
) {
  try {
    const requestId = crypto.randomUUID();
    await db.insert(apiUsageLog).values({
      apiKeyId,
      vendorId,
      endpoint: req.path,
      method: req.method,
      statusCode,
      responseTimeMs,
      requestId,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });
  } catch (error) {
    console.error("Failed to log API usage:", error);
  }
}

export function requirePermission(permission: string) {
  return (req: ApiRequest, res: Response, next: NextFunction) => {
    const permissions = req.apiKeyPermissions || [];
    
    if (!permissions.includes(permission) && !permissions.includes("*")) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Missing required permission: ${permission}`,
        code: "INSUFFICIENT_PERMISSIONS"
      });
    }
    
    next();
  };
}
