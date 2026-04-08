import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { setObjectAclPolicy, getObjectAclPolicy } from "./objectAcl";
import { isAuthenticated } from "../auth";

export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv', 'video/webm',
  ]);

  const ALLOWED_EXTENSIONS = new Set([
    'jpg','jpeg','png','gif','webp','bmp','svg',
    'pdf','ppt','pptx','doc','docx','xls','xlsx','csv',
    'mp4','avi','mov','wmv','webm',
  ]);

  const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

  app.post("/api/uploads/request-url", isAuthenticated, async (req: any, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      const ext = name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: "허용되지 않는 파일 형식입니다." });
      }

      if (contentType && !ALLOWED_MIME_TYPES.has(contentType)) {
        return res.status(400).json({ error: "허용되지 않는 파일 형식입니다." });
      }

      if (size && typeof size === 'number' && size > MAX_UPLOAD_SIZE) {
        return res.status(400).json({ error: "파일 크기가 50MB를 초과합니다." });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.get("/api/download", isAuthenticated, async (req: any, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath || !filePath.startsWith("/objects/")) {
        return res.status(400).json({ error: "Invalid file path" });
      }
      const requestedTtl = parseInt(req.query.ttl as string) || 600;
      const safeTtl = Math.min(Math.max(requestedTtl, 60), 7200); // 1min ~ 2hr
      const signedUrl = await objectStorageService.getSignedDownloadURL(filePath, safeTtl);
      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Error generating download URL:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to generate download URL" });
      }
    }
  });

  /**
   * Make an uploaded object publicly accessible (no auth needed to view).
   * Called by the client after a successful signed PUT upload.
   */
  app.post("/api/uploads/make-public", isAuthenticated, async (req: any, res) => {
    try {
      const { objectPath } = req.body;
      if (!objectPath || !objectPath.startsWith("/objects/")) {
        return res.status(400).json({ error: "Invalid objectPath" });
      }
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await setObjectAclPolicy(objectFile, {
        owner: req.user?.id || "system",
        visibility: "public",
      });
      res.json({ success: true, objectPath });
    } catch (error) {
      console.error("Error making object public:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to set ACL" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * Public files (ACL visibility="public") are served without auth.
   * Private files require the user to be authenticated.
   */
  app.get(/^\/objects\/(.*)$/, async (req: any, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublic = aclPolicy?.visibility === "public";
      if (!isPublic) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
          return res.status(401).json({ error: "Authentication required" });
        }
      }
      await objectStorageService.downloadObject(objectFile, res, req);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

