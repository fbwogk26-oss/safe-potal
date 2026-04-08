import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { logSecurityEvent, MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MINUTES, generateSessionSecret } from "../../security";
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || generateSessionSecret();

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === "production";
  return session({
    secret: SESSION_SECRET,
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

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

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

  // Attach user to request
  (req as any).user = session.user;
  next();
};
