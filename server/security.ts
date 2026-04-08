import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { securityLogs } from "@shared/models/auth";
import { desc } from "drizzle-orm";
import crypto from "crypto";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.ip || req.socket.remoteAddress || "unknown");
  // IPv4-mapped IPv6 주소 정규화 (::ffff:1.2.3.4 → 1.2.3.4)
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

function makeKeyGenerator() {
  return (req: Request) => getClientIp(req);
}

export function setupSecurity(app: Express) {
  const isProduction = process.env.NODE_ENV === "production";
  
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: isProduction ? ["'self'", "https:"] : ["'self'", "https:", "wss:", "ws:"],
          frameSrc: ["blob:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      noSniff: true,
      xssFilter: true,
    })
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.removeHeader("X-Powered-By");
    next();
  });

  app.use("/api/", (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/download") {
      return next();
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: makeKeyGenerator(),
    message: { message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
  });
  app.use("/api/", globalLimiter);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: makeKeyGenerator(),
    message: { message: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요." },
    skipSuccessfulRequests: true,
  });
  app.use("/api/login", loginLimiter);

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: makeKeyGenerator(),
    message: { message: "파일 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요." },
  });
  app.use("/api/upload", uploadLimiter);
  // 파일 업로드 엔드포인트 공통 rate limit 추가
  app.use("/api/users/bulk-upload", uploadLimiter);
  app.use("/api/work-plans/upload", uploadLimiter);
  app.use("/api/chemicals", uploadLimiter);
}

export async function logSecurityEvent(
  eventType: string,
  req: Request,
  details?: string,
  success: boolean = true,
  userId?: string,
  username?: string
) {
  try {
    await db.insert(securityLogs).values({
      eventType,
      userId: userId || (req as any).user?.id || null,
      username: username || (req as any).user?.username || null,
      ipAddress: getClientIp(req),
      userAgent: (req.headers["user-agent"] || "unknown").substring(0, 500),
      details,
      success,
    });
  } catch (e) {
    console.error("Failed to log security event:", e);
  }
}

export async function getSecurityLogs(limit: number = 100) {
  return db.select().from(securityLogs).orderBy(desc(securityLogs.createdAt)).limit(limit);
}

export { MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MINUTES };

export function generateSessionSecret(): string {
  return crypto.randomBytes(64).toString("hex");
}
