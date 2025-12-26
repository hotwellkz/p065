# Music Clips Pipeline - Документация

## Обзор

Реализован отдельный пайплайн "Music Clips" для генерации музыкальных клипов:
1. Генерация музыки через Suno API
2. Генерация видео-сегментов (по 10 сек)
3. Склейка сегментов
4. Наложение музыки
5. Публикация через BlotatoPublisherService
6. Перенос в uploaded после успеха

## Структура хранения

Music Clips используют **отдельную** корневую директорию, не смешиваясь с shorts:

```
/app/storage/music_clips/
  users/
    {userFolderKey}/
      channels/
        {channelFolderKey}/
          inbox/
            track/          # Исходный и обработанный трек
            segments/      # Видео-сегменты (seg_000.mp4, seg_001.mp4, ...)
            render/        # Склеенное видео (stitched.mp4)
            final/         # Финальное видео с музыкой (final.mp4)
          uploaded/        # Опубликованные файлы
          failed/          # Ошибки (опционально)
          logs/            # Логи (опционально)
```

**ВАЖНО**: Файлы music_clips НЕ попадают в `/app/storage/videos/...`

## Переменные окружения

Добавьте в `.env`:

```env
# Music Clips Root (опционально, по умолчанию /app/storage/music_clips)
MUSIC_CLIPS_ROOT=/app/storage/music_clips

# Suno API (ОБЯЗАТЕЛЬНО для работы Music Clips)
# Без этого ключа Music Clips функциональность будет недоступна
# Получите API ключ на https://sunoapi.org
SUNO_API_KEY=your_suno_api_key_here
# Базовый URL API (по умолчанию https://api.sunoapi.org согласно документации)
SUNO_API_BASE_URL=https://api.sunoapi.org
# Таймаут для запросов к Suno (мс, по умолчанию 90000 = 90 секунд)
SUNO_REQUEST_TIMEOUT_MS=90000
# Ограничение параллельных запросов к Suno (по умолчанию 1, рекомендуется 1-2)
MUSIC_CLIPS_SUNO_CONCURRENCY=1
# Задержка между запросами к Suno (мс, по умолчанию 1500)
MUSIC_CLIPS_SUNO_DELAY_MS=1500
# Общий таймаут для пайплайна Music Clips (мс, по умолчанию 1800000 = 30 минут)
MUSIC_CLIPS_PIPELINE_TIMEOUT_MS=1800000

# Публичный URL для Blotato (обязательно для публикации)
PUBLIC_BASE_URL=https://api.shortsai.ru
# или
BACKEND_URL=https://api.shortsai.ru
```

### Валидация конфигурации

При старте приложения проверяется наличие `SUNO_API_KEY`. Если ключ не задан:
- В логах появится предупреждение: `[Startup] SUNO_API_KEY is not configured`
- Запросы к `/api/music-clips/channels/:id/runOnce` вернут `503` с ошибкой:
  ```json
  {
    "success": false,
    "error": "SUNO_API_KEY_NOT_CONFIGURED",
    "message": "Set SUNO_API_KEY in environment"
  }
  ```

### Health Check

Проверить конфигурацию Music Clips можно через health check endpoint:

```bash
GET /api/music-clips/health
```

**Ответ при правильной конфигурации (200):**
```json
{
  "ok": true,
  "suno": {
    "configured": true,
    "reason": null
  },
  "storage": {
    "root": "/app/storage/music_clips",
    "available": true
  },
  "timestamp": "2024-12-25T23:00:00.000Z"
}
```

**Ответ при отсутствии ключа (503):**
```json
{
  "ok": false,
  "suno": {
    "configured": false,
    "reason": "SUNO_API_KEY is not set in environment"
  },
  "storage": {
    "root": "/app/storage/music_clips",
    "available": true
  },
  "timestamp": "2024-12-25T23:00:00.000Z"
}
```

## Настройка канала в БД

Канал должен иметь:
- `type: "music_clips"`
- `musicClipsSettings` объект с настройками:

```typescript
{
  type: "music_clips",
  musicClipsSettings: {
    targetDurationSec: 60,        // Целевая длительность (сек)
    clipSec: 10,                  // Длительность сегмента (сек)
    segmentDelayMs: 30000,        // Задержка между сегментами (мс)
    maxParallelSegments: 1,       // Максимум параллельных сегментов
    maxRetries: 3,                // Максимум попыток
    retryDelayMs: 60000,          // Задержка между ретраями (мс)
    sunoPrompt: "Upbeat electronic music with catchy melody", // Промпт для Suno
    styleTags: ["electronic", "upbeat"], // Опциональные теги стиля
    platforms: {
      youtube: true,
      tiktok: false,
      instagram: false
    },
    language: "ru" // Опционально
  }
}
```

## Команды PowerShell

### 1. Сборка и запуск

```powershell
# Перейти в директорию backend
cd backend

# Установить зависимости (если нужно)
npm install

# Собрать проект
npm run build

# Запустить в dev режиме
npm run dev

# Или запустить собранную версию
npm start
```

### 2. Docker (рекомендуется)

```powershell
# Собрать образ
docker build -t shorts-backend .

# Запустить контейнер
docker-compose up -d

# Просмотр логов
docker-compose logs -f backend

# Остановить
docker-compose down
```

### 3. Проверка ffmpeg

```powershell
# В контейнере
docker exec -it shorts-backend sh
ffmpeg -version
ffprobe -version

# Или локально (если установлен)
ffmpeg -version
ffprobe -version
```

### 4. Тестирование API

```powershell
# Проверить диагностику Suno (не тратит кредиты)
curl.exe http://localhost:8080/api/music-clips/diagnostics/suno

# Запустить пайплайн для канала (runOnce)
$channelId = "your-channel-id"
$userId = "your-user-id"
$body = @{
    userId = $userId
} | ConvertTo-Json

curl.exe -i -X POST "http://localhost:8080/api/music-clips/channels/$channelId/runOnce" `
  -H "Content-Type: application/json" `
  -H "x-user-id: $userId" `
  -d $body
```

**Возможные ошибки:**

**503 - SUNO_UNAVAILABLE:**
```json
{
  "success": false,
  "error": "SUNO_UNAVAILABLE",
  "message": "Suno is temporarily unavailable. Try later.",
  "retryAfterSec": 30
}
```
Система автоматически делает retry (до 5 попыток). Если все попытки исчерпаны, вернётся этот ответ.

**429 - SUNO_RATE_LIMITED:**
```json
{
  "success": false,
  "error": "SUNO_RATE_LIMITED",
  "message": "Suno rate limit exceeded. Try later.",
  "retryAfterSec": 60
}
```
Превышен лимит запросов. Система учитывает `Retry-After` заголовок от Suno.

**503 - SUNO_API_KEY_NOT_CONFIGURED:**
```json
{
  "success": false,
  "error": "SUNO_API_KEY_NOT_CONFIGURED",
  "message": "Set SUNO_API_KEY in environment"
}
```
Решение: Установите `SUNO_API_KEY` в переменных окружения.

### 5. Проверка структуры папок

```powershell
# На хосте (если volume примонтирован)
Get-ChildItem -Path ".\storage\music_clips" -Recurse

# В контейнере
docker exec -it shorts-backend ls -la /app/storage/music_clips
```

### 6. Просмотр логов

```powershell
# Docker logs
docker-compose logs -f backend | Select-String "MusicClips"

# Или через grep (если установлен)
docker-compose logs backend | Select-String "\[MusicClips\]"
```

## API Endpoints

### POST /api/music-clips/channels/:channelId/runOnce

Запускает пайплайн для одного канала (без расписания).

**Параметры:**
- `channelId` (URL) - ID канала
- `userId` (body или header `x-user-id`) - ID пользователя

**Ответ:**
```json
{
  "success": true,
  "trackPath": "/app/storage/music_clips/.../uploaded/track_1234567890.mp3",
  "finalVideoPath": "/app/storage/music_clips/.../uploaded/final_1234567890.mp4",
  "publishedPlatforms": ["youtube"]
}
```

### GET /api/music-clips/media/:userFolderKey/:channelFolderKey/:fileName

Отдаёт медиа-файлы из music_clips хранилища (для Blotato).

**Пример:**
```
GET /api/music-clips/media/user123__abc/channel456__def/final.mp4
```

## Планировщик

Планировщик запускается автоматически каждую минуту (если `ENABLE_CRON_SCHEDULER !== "false"`).

Он:
1. Находит все каналы с `type: "music_clips"`
2. Проверяет расписание (`autoSendSchedule`)
3. Запускает пайплайн для каналов по расписанию

Логи помечены префиксом `[MusicClips]` для отличия от shorts.

## Известные ограничения

1. **Генерация видео-сегментов**: Требует интеграции с системой генерации видео (Telegram/Syntx). См. TODO в `generateVideoSegment()`.

2. **Suno API**: Структура API может отличаться от реализованной. Нужно адаптировать под реальный API Suno.

3. **Публикация**: Требуется настройка `PUBLIC_BASE_URL` для доступа Blotato к медиа-файлам.

## Гарантии

✅ Music Clips файлы лежат **ТОЛЬКО** в `/app/storage/music_clips/...`  
✅ Не используются пути `/app/storage/videos/...`  
✅ Отдельный планировщик, не смешивается с shorts  
✅ Все логи помечены `[MusicClips]`

## Следующие шаги

1. Интегрировать генерацию видео-сегментов с существующей системой
2. Адаптировать SunoClient под реальный API Suno
3. Добавить обработку ошибок и ретраи для всех этапов
4. Добавить мониторинг и метрики

