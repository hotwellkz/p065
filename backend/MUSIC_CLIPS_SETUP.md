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

# Suno API
SUNO_API_KEY=your_suno_api_key_here
SUNO_API_BASE_URL=https://api.suno.ai

# Публичный URL для Blotato (обязательно для публикации)
PUBLIC_BASE_URL=https://api.shortsai.ru
# или
BACKEND_URL=https://api.shortsai.ru
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
# Запустить пайплайн для канала (runOnce)
$channelId = "your-channel-id"
$userId = "your-user-id"
$body = @{
    userId = $userId
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/api/music-clips/channels/$channelId/runOnce" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -Headers @{
        "Authorization" = "Bearer YOUR_JWT_TOKEN"
    }
```

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

