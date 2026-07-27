// node patch_proxy.cjs — Windows Object Storage 프록시 패치
const fs = require("fs");
const path = require("path");

const routesFile = path.join(__dirname, "server", "replit_integrations", "object_storage", "routes.ts");

if (!fs.existsSync(routesFile)) {
  console.error("❌ routes.ts 파일 없음:", routesFile);
  process.exit(1);
}

let c = fs.readFileSync(routesFile, "utf8");

if (c.includes("OBJECT_STORAGE_PROXY_URL")) {
  console.log("✅ 이미 패치됨. .env에 아래 줄 확인 후 재시작:");
  console.log("   OBJECT_STORAGE_PROXY_URL=https://safety-potal.replit.app");
  console.log("   npm run build && pm2 restart safetyboard --update-env");
  process.exit(0);
}

const OLD = `  app.get(/^\\/objects\\/uploads\\/(.*)$/, async (req: any, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res, req);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      console.error("Error serving upload:", error);
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });`;

const NEW = `  // Object Storage 프록시 (Replit 사이드카 없는 환경용)
  async function proxyToRemote(req: any, res: any): Promise<boolean> {
    const remoteBase = process.env.OBJECT_STORAGE_PROXY_URL;
    if (!remoteBase) return false;
    try {
      const url = \`\${remoteBase.replace(/\\/$/, "")}\${req.path}\`;
      const upstream = await fetch(url, { headers: { "User-Agent": "SafeBoard-Proxy/1.0" } });
      if (!upstream.ok) return false;
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(await upstream.arrayBuffer()));
      return true;
    } catch { return false; }
  }

  app.get(/^\\/objects\\/uploads\\/(.*)$/, async (req: any, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res, req);
    } catch (error) {
      if (await proxyToRemote(req, res)) return;
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      console.error("Error serving upload:", error);
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });`;

if (!c.includes(OLD.substring(0, 80))) {
  console.log("⚠️ 패턴 매칭 실패. 수동으로 .env에 추가하세요:");
  console.log("   OBJECT_STORAGE_PROXY_URL=https://safety-potal.replit.app");
  process.exit(0);
}

c = c.replace(OLD, NEW);
fs.writeFileSync(routesFile, c);
console.log("✅ routes.ts 패치 완료!");
console.log("\n다음 순서로 진행:");
console.log("  1. C:\\SafeBoard\\.env 파일에 추가:");
console.log("     OBJECT_STORAGE_PROXY_URL=https://safety-potal.replit.app");
console.log("  2. npm run build");
console.log("  3. pm2 restart safetyboard --update-env");
