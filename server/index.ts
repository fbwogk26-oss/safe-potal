// ── pdfjs-dist Node.js 폴리필 (브라우저 전용 API 스텁) ──
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a=1; b=0; c=0; d=1; e=0; f=0;
    is2D=true; isIdentity=true;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a,this.b,this.c,this.d,this.e,this.f] = init as number[];
      }
    }
    static fromMatrix(o: any) { return Object.assign(new (globalThis as any).DOMMatrix(), o); }
    static fromFloat32Array(a: Float32Array) { return new (globalThis as any).DOMMatrix(Array.from(a)); }
    static fromFloat64Array(a: Float64Array) { return new (globalThis as any).DOMMatrix(Array.from(a)); }
    multiply(o: any) {
      const m = new (globalThis as any).DOMMatrix();
      m.a = this.a*o.a + this.c*o.b; m.b = this.b*o.a + this.d*o.b;
      m.c = this.a*o.c + this.c*o.d; m.d = this.b*o.c + this.d*o.d;
      m.e = this.a*o.e + this.c*o.f + this.e; m.f = this.b*o.e + this.d*o.f + this.f;
      return m;
    }
    translate(tx=0, ty=0) {
      return new (globalThis as any).DOMMatrix([this.a,this.b,this.c,this.d,
        this.e+this.a*tx+this.c*ty, this.f+this.b*tx+this.d*ty]);
    }
    scale(sx=1, sy=sx) {
      return new (globalThis as any).DOMMatrix([this.a*sx,this.b*sx,this.c*sy,this.d*sy,this.e,this.f]);
    }
    rotate(_rx=0,_ry=0,rz=0) {
      const rad=rz*Math.PI/180; const cos=Math.cos(rad); const sin=Math.sin(rad);
      return new (globalThis as any).DOMMatrix([
        this.a*cos+this.c*sin, this.b*cos+this.d*sin,
        -this.a*sin+this.c*cos, -this.b*sin+this.d*cos,
        this.e, this.f]);
    }
    inverse() { return new (globalThis as any).DOMMatrix(); }
    toFloat32Array() { return new Float32Array([this.a,this.b,this.c,this.d,this.e,this.f]); }
    toFloat64Array() { return new Float64Array([this.a,this.b,this.c,this.d,this.e,this.f]); }
  };
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray; width: number; height: number;
    constructor(swOrData: number|Uint8ClampedArray, sh: number) {
      if (swOrData instanceof Uint8ClampedArray) {
        this.data=swOrData; this.width=sh; this.height=swOrData.length/(sh*4);
      } else {
        this.width=swOrData; this.height=sh; this.data=new Uint8ClampedArray(swOrData*sh*4);
      }
    }
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {
    addPath(){}; closePath(){}; moveTo(){}; lineTo(){}; rect(){}; arc(){}; ellipse(){};
  };
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { authStorage } from "./replit_integrations/auth/storage";
import { setupSecurity } from "./security";
import "./autoEmailJob";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.set("trust proxy", 1);
setupSecurity(app);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    limit: "10mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 200)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize default admin user if not exists
  await authStorage.initializeDefaultAdmin();
  
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 && process.env.NODE_ENV === "production"
      ? "서버 오류가 발생했습니다"
      : (err.message || "Internal Server Error");

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
