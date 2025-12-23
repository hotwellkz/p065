import { Router } from "express";
import * as path from "path";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import { Logger } from "../utils/logger";
// Media routes для отдачи файлов из хранилища

const router = Router();

/**
 * Endpoint для отдачи медиа-файлов из хранилища
 * GET /api/media/:userSlug/:channelSlug/:fileName
 * 
 * Безопасно отдаёт файлы только из STORAGE_ROOT, предотвращая path traversal
 * Структура: STORAGE_ROOT/userSlug/channelSlug/fileName
 * Поддерживает Range-запросы для потоковой передачи больших файлов
 */
router.get("/:userSlug/:channelSlug/:fileName", async (req, res) => {
  const { userSlug, channelSlug, fileName } = req.params;

  try {
    // Проверяем, что userSlug, channelSlug и fileName не содержат опасных символов
    if (!userSlug || !channelSlug || !fileName) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // Проверяем на path traversal
    if (userSlug.includes("..") || channelSlug.includes("..") || fileName.includes("..") || 
        userSlug.includes("/") || channelSlug.includes("/") || fileName.includes("/")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    // Получаем STORAGE_ROOT
    const storageRoot = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage/videos');
    
    // Формируем безопасный путь: STORAGE_ROOT/userSlug/channelSlug/fileName
    const filePath = path.join(storageRoot, userSlug, channelSlug, fileName);

    // Проверяем, что файл находится внутри STORAGE_ROOT (защита от path traversal)
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(storageRoot);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      Logger.warn("MediaRoutes: Path traversal attempt detected", {
        userSlug,
        channelSlug,
        fileName,
        requestedPath: filePath,
        storageRoot: resolvedRoot
      });
      return res.status(403).json({ error: "Access denied" });
    }

    // Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }

    // Получаем информацию о файле
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: "Not a file" });
    }

    // Определяем MIME-тип по расширению
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".m4v": "video/x-m4v"
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Обработка Range-запросов (для поддержки частичной загрузки)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const fileStream = createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      });

      fileStream.pipe(res);

      Logger.info("MediaRoutes: File served (partial)", {
        userSlug,
        channelSlug,
        fileName,
        range: `${start}-${end}`,
        size: chunksize,
        contentType
      });
    } else {
      // Полная отдача файла
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600"); // Кэш на 1 час

      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);

      Logger.info("MediaRoutes: File served (full)", {
        userSlug,
        channelSlug,
        fileName,
        size: stats.size,
        contentType
      });
    }
  } catch (error: any) {
    Logger.error("MediaRoutes: Error serving file", {
      userSlug,
      channelSlug,
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;

