import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
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
  ]);

  const ALLOWED_EXTENSIONS = new Set([
    'jpg','jpeg','png','gif','webp','bmp','svg',
    'pdf','ppt','pptx','doc','docx','xls','xlsx','csv',
  ]);

  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

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
      const fileName = req.query.name as string;
      if (!filePath || !filePath.startsWith("/objects/")) {
        return res.status(400).json({ error: "Invalid file path" });
      }
      const objectFile = await objectStorageService.getObjectEntityFile(filePath);
      const downloadName = fileName || "download";
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error downloading object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to download object" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get(/^\/objects\/(.*)$/, isAuthenticated, async (req: any, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

