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
 * Структура: STORAGE_ROOT/users/{userSlug}/channels/{channelSlug}/inbox/{fileName}
 * Поддерживает Range-запросы для потоковой передачи больших файлов
 */
// Поддержка HEAD запросов для проверки доступности файла
router.head("/:userSlug/:channelSlug/:fileName", async (req, res) => {
  const { userSlug, channelSlug, fileName } = req.params;
  
  try {
    // Используем ту же логику поиска файла, что и в GET
    if (!userSlug || !channelSlug || !fileName) {
      return res.status(400).end();
    }

    if (userSlug.includes("..") || channelSlug.includes("..") || fileName.includes("..") || 
        userSlug.includes("/") || channelSlug.includes("/") || fileName.includes("/")) {
      return res.status(400).end();
    }

    const storageRoot = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage/videos');
    const inboxPath = path.join(storageRoot, 'users', userSlug, 'channels', channelSlug, 'inbox', fileName);
    const rootPath = path.join(storageRoot, 'users', userSlug, 'channels', channelSlug, fileName);
    const legacyPath = path.join(storageRoot, userSlug, channelSlug, fileName);
    
    let filePath: string | null = null;
    let fileExists = false;
    
    for (const testPath of [inboxPath, rootPath, legacyPath]) {
      try {
        await fs.access(testPath);
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          filePath = testPath;
          fileExists = true;
          break;
        }
      } catch {
        // Продолжаем поиск
      }
    }
    
    if (!fileExists || !filePath) {
      return res.status(404).end();
    }

    const stats = await fs.stat(filePath);
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

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    return res.status(200).end();
  } catch (error: any) {
    Logger.error("MediaRoutes: HEAD request error", {
      userSlug,
      channelSlug,
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
    if (!res.headersSent) {
      return res.status(500).end();
    }
  }
});

router.get("/:userSlug/:channelSlug/:fileName", async (req, res) => {
  const { userSlug, channelSlug, fileName } = req.params;
  const startTime = Date.now();

  // Детальное логирование входа в роут
  Logger.info("MediaRoutes: Request received", {
    userSlug,
    channelSlug,
    fileName,
    url: req.url,
    method: req.method,
    headers: {
      range: req.headers.range,
      "user-agent": req.headers["user-agent"]
    }
  });

  try {
    // Проверяем, что userSlug, channelSlug и fileName не содержат опасных символов
    if (!userSlug || !channelSlug || !fileName) {
      Logger.warn("MediaRoutes: Missing parameters", { userSlug, channelSlug, fileName });
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // Проверяем на path traversal
    if (userSlug.includes("..") || channelSlug.includes("..") || fileName.includes("..") || 
        userSlug.includes("/") || channelSlug.includes("/") || fileName.includes("/")) {
      Logger.warn("MediaRoutes: Path traversal attempt", { userSlug, channelSlug, fileName });
      return res.status(400).json({ error: "Invalid path" });
    }

    // Получаем STORAGE_ROOT
    const storageRoot = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage/videos');
    
    // Формируем безопасный путь: STORAGE_ROOT/users/{userSlug}/channels/{channelSlug}/inbox/{fileName}
    // Пробуем сначала inbox (новые файлы), затем корень канала (для обратной совместимости)
    const inboxPath = path.join(storageRoot, 'users', userSlug, 'channels', channelSlug, 'inbox', fileName);
    const rootPath = path.join(storageRoot, 'users', userSlug, 'channels', channelSlug, fileName);
    const legacyPath = path.join(storageRoot, userSlug, channelSlug, fileName);
    
    // Проверяем существование файла в разных местах
    let filePath: string | null = null;
    let fileExists = false;
    
    // Приоритет: inbox > root > legacy
    for (const testPath of [inboxPath, rootPath, legacyPath]) {
      try {
        await fs.access(testPath);
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          filePath = testPath;
          fileExists = true;
          Logger.info("MediaRoutes: File found", {
            userSlug,
            channelSlug,
            fileName,
            foundAt: testPath === inboxPath ? 'inbox' : testPath === rootPath ? 'root' : 'legacy',
            filePath: testPath
          });
          break;
        }
      } catch {
        // Продолжаем поиск
      }
    }
    
    // Если файл не найден, используем inbox как основной путь для логирования ошибки
    if (!filePath) {
      filePath = inboxPath;
    }

    // Логируем вычисленный путь
    Logger.info("MediaRoutes: Path calculation", {
      userSlug,
      channelSlug,
      fileName,
      storageRoot,
      filePath,
      resolvedPath: path.resolve(filePath),
      resolvedRoot: path.resolve(storageRoot)
    });

    // Проверяем, что файл находится внутри STORAGE_ROOT (защита от path traversal)
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(storageRoot);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      Logger.warn("MediaRoutes: Path traversal attempt detected", {
        userSlug,
        channelSlug,
        fileName,
        requestedPath: filePath,
        resolvedPath,
        storageRoot: resolvedRoot
      });
      return res.status(403).json({ error: "Access denied" });
    }

    // Если файл не найден, возвращаем 404
    if (!fileExists || !filePath) {
      Logger.warn("MediaRoutes: File not found", {
        userSlug,
        channelSlug,
        fileName,
        searchedPaths: {
          inbox: inboxPath,
          root: rootPath,
          legacy: legacyPath
        },
        storageRoot
      });
      return res.status(404).json({ 
        error: "File not found",
        searchedPaths: {
          inbox: inboxPath,
          root: rootPath,
          legacy: legacyPath
        },
        storageRoot
      });
    }

    // Получаем информацию о файле
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      Logger.warn("MediaRoutes: Path is not a file", {
        userSlug,
        channelSlug,
        fileName,
        filePath,
        isFile: false,
        isDirectory: stats.isDirectory()
      });
      return res.status(404).json({ error: "Not a file" });
    }

    Logger.info("MediaRoutes: File stats", {
      userSlug,
      channelSlug,
      fileName,
      size: stats.size,
      isFile: stats.isFile(),
      mtime: stats.mtime.toISOString()
    });

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

      Logger.info("MediaRoutes: File served (206 Partial Content)", {
        userSlug,
        channelSlug,
        fileName,
        range: `${start}-${end}`,
        size: chunksize,
        totalSize: stats.size,
        contentType,
        statusCode: 206,
        duration: Date.now() - startTime
      });
    } else {
      // Полная отдача файла
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600"); // Кэш на 1 час

      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);

      Logger.info("MediaRoutes: File served (200 OK)", {
        userSlug,
        channelSlug,
        fileName,
        size: stats.size,
        contentType,
        statusCode: 200,
        duration: Date.now() - startTime
      });
    }
  } catch (error: any) {
    Logger.error("MediaRoutes: Error serving file", {
      userSlug,
      channelSlug,
      fileName,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime
    });
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

export default router;

