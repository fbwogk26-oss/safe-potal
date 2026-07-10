import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { logSecurityEvent, MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MINUTES, generateSessionSecret } from "../../security";
import crypto from "crypto";
import { db } from "../../db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { authenticator } = _require("otplib") as { authenticator: typeof import("otplib").authenticator };
import QRCode from "qrcode";

async function loadOrCreateSessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const rows = await db.select().from(settings).where(eq(settings.key, "session_secret"));
    if (rows.length > 0 && rows[0].value) return rows[0].value;
    const secret = generateSessionSecret();
    await db.insert(settings).values({ key: "session_secret", value: secret }).onConflictDoNothing();
    return secret;
  } catch (e: any) {
    console.error("[session] secret 로드 실패, 임시 secret 사용:", e.message);
    return generateSessionSecret();
  }
}

function buildSession(secret: string) {
  const sessionTtl = 60 * 60 * 1000; // 1시간 무활동 시 자동 세션 만료 (rolling: 활동 중에는 갱신됨)
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  return session({
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: "__sb_sid",
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      maxAge: sessionTtl,
    },
  });
}

export function getSession() {
  return buildSession(generateSessionSecret());
}

export async function setupAuth(app: Express) {
  const secret = await loadOrCreateSessionSecret();
  app.set("trust proxy", 1);
  app.use(buildSession(secret));

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호를 입력해주세요" });
      }

      const sanitizedUsername = String(username).trim().substring(0, 50);

      const user = await authStorage.getUserByUsername(sanitizedUsername);
      if (!user) {
        await logSecurityEvent("LOGIN_FAILED", req, "존재하지 않는 사용자", false, undefined, sanitizedUsername);
        return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다" });
      }

      if (user.isActive === false) {
        await logSecurityEvent("LOGIN_BLOCKED", req, "비활성화된 계정", false, user.id, user.username);
        return res.status(403).json({ message: "비활성화된 계정입니다. 관리자에게 문의하세요." });
      }

      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainMin = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        await logSecurityEvent("LOGIN_BLOCKED", req, `계정 잠금 상태 (${remainMin}분 남음)`, false, user.id, user.username);
        return res.status(423).json({ 
          message: `계정이 잠겨있습니다. ${remainMin}분 후에 다시 시도해주세요.`,
          lockedUntil: user.lockedUntil,
        });
      }

      const isValid = await authStorage.verifyPassword(password, user.password);
      if (!isValid) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
          await logSecurityEvent("ACCOUNT_LOCKED", req, `${MAX_LOGIN_ATTEMPTS}회 실패로 계정 잠금`, false, user.id, user.username);
        } else {
          await logSecurityEvent("LOGIN_FAILED", req, `비밀번호 오류 (${attempts}/${MAX_LOGIN_ATTEMPTS})`, false, user.id, user.username);
        }
        
        await authStorage.updateLoginAttempts(user.id, updateData);
        
        const remaining = MAX_LOGIN_ATTEMPTS - attempts;
        if (remaining > 0) {
          return res.status(401).json({ 
            message: `아이디 또는 비밀번호가 올바르지 않습니다 (${remaining}회 남음)` 
          });
        } else {
          return res.status(423).json({ 
            message: `로그인 ${MAX_LOGIN_ATTEMPTS}회 실패로 계정이 ${LOCK_DURATION_MINUTES}분간 잠겼습니다.` 
          });
        }
      }

      // 2차 인증(TOTP)이 활성화된 경우, pending 상태로 전환
      if (user.totpEnabled && user.totpSecret) {
        req.session.regenerate((err) => {
          if (err) return res.status(500).json({ message: "로그인에 실패했습니다" });
          (req.session as any).pendingTotpUserId = user.id;
          res.json({ requireTotp: true });
        });
        return;
      }

      await authStorage.updateLoginAttempts(user.id, { 
        failedLoginAttempts: 0, 
        lockedUntil: null, 
        lastLoginAt: new Date() 
      });

      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "로그인에 실패했습니다" });
        }

        (req.session as any).userId = user.id;
        (req.session as any).user = {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        };

        logSecurityEvent("LOGIN_SUCCESS", req, undefined, true, user.id, user.username);

        res.json({
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "로그인에 실패했습니다" });
    }
  });

  // TOTP 2차 인증 검증 (로그인 중 pending 상태에서 호출)
  app.post("/api/auth/totp/verify-login", async (req, res) => {
    const pendingUserId = (req.session as any).pendingTotpUserId;
    if (!pendingUserId) {
      return res.status(401).json({ message: "진행 중인 로그인 세션이 없습니다" });
    }
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "인증 코드를 입력해주세요" });

      const user = await authStorage.getUser(pendingUserId);
      if (!user || !user.totpEnabled || !user.totpSecret) {
        return res.status(401).json({ message: "2차 인증 정보가 없습니다" });
      }

      const isValid = authenticator.verify({ token: String(code).replace(/\s/g, ""), secret: user.totpSecret });
      if (!isValid) {
        await logSecurityEvent("TOTP_VERIFY_FAILED", req, "2차 인증 코드 오류", false, user.id, user.username);
        return res.status(401).json({ message: "인증 코드가 올바르지 않습니다" });
      }

      await authStorage.updateLoginAttempts(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      });

      delete (req.session as any).pendingTotpUserId;
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      };

      logSecurityEvent("LOGIN_SUCCESS", req, "2차 인증 완료", true, user.id, user.username);
      res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      });
    } catch (error) {
      console.error("TOTP verify error:", error);
      res.status(500).json({ message: "2차 인증에 실패했습니다" });
    }
  });

  // TOTP 설정 준비 (QR 코드 생성)
  app.get("/api/auth/totp/setup", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) return res.status(401).json({ message: "로그인이 필요합니다" });
    try {
      const user = await authStorage.getUser(session.userId);
      if (!user) return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(user.username, "SafeBoard", secret);
      const qrDataUrl = await QRCode.toDataURL(otpauth);
      await authStorage.updateUser(user.id, { totpSecret: secret, totpEnabled: false });
      res.json({ secret, qrDataUrl });
    } catch (error) {
      console.error("TOTP setup error:", error);
      res.status(500).json({ message: "2차 인증 설정에 실패했습니다" });
    }
  });

  // TOTP 활성화 (코드 검증 후)
  app.post("/api/auth/totp/enable", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) return res.status(401).json({ message: "로그인이 필요합니다" });
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "인증 코드를 입력해주세요" });
      const user = await authStorage.getUser(session.userId);
      if (!user || !user.totpSecret) return res.status(400).json({ message: "먼저 2차 인증을 설정해주세요" });
      const isValid = authenticator.verify({ token: String(code).replace(/\s/g, ""), secret: user.totpSecret });
      if (!isValid) return res.status(400).json({ message: "인증 코드가 올바르지 않습니다" });
      await authStorage.updateUser(user.id, { totpEnabled: true });
      await logSecurityEvent("TOTP_ENABLED", req, "2차 인증 활성화", true, user.id, user.username);
      res.json({ message: "2차 인증이 활성화되었습니다" });
    } catch (error) {
      console.error("TOTP enable error:", error);
      res.status(500).json({ message: "2차 인증 활성화에 실패했습니다" });
    }
  });

  // TOTP 비활성화
  app.post("/api/auth/totp/disable", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) return res.status(401).json({ message: "로그인이 필요합니다" });
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ message: "비밀번호를 입력해주세요" });
      const user = await authStorage.getUser(session.userId);
      if (!user) return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      const isValid = await authStorage.verifyPassword(password, user.password);
      if (!isValid) return res.status(400).json({ message: "비밀번호가 올바르지 않습니다" });
      await authStorage.updateUser(user.id, { totpEnabled: false, totpSecret: null });
      await logSecurityEvent("TOTP_DISABLED", req, "2차 인증 비활성화", true, user.id, user.username);
      res.json({ message: "2차 인증이 비활성화되었습니다" });
    } catch (error) {
      console.error("TOTP disable error:", error);
      res.status(500).json({ message: "2차 인증 비활성화에 실패했습니다" });
    }
  });

  // 현재 사용자 TOTP 상태 조회
  app.get("/api/auth/totp/status", async (req, res) => {
    const session = req.session as any;
    if (!session.userId) return res.status(401).json({ message: "로그인이 필요합니다" });
    try {
      const user = await authStorage.getUser(session.userId);
      if (!user) return res.status(401).json({ message: "사용자를 찾을 수 없습니다" });
      res.json({ totpEnabled: user.totpEnabled ?? false });
    } catch (error) {
      res.status(500).json({ message: "조회에 실패했습니다" });
    }
  });

  app.post("/api/logout", (req, res) => {
    const userId = (req.session as any)?.userId;
    const username = (req.session as any)?.user?.username;
    
    logSecurityEvent("LOGOUT", req, undefined, true, userId, username);
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "로그아웃에 실패했습니다" });
      }
      res.clearCookie("__sb_sid");
      res.json({ message: "로그아웃 되었습니다" });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  
  if (!session.userId) {
    return res.status(401).json({ message: "로그인이 필요합니다" });
  }

  (req as any).user = session.user;
  next();
};
