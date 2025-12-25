# Music Clips Pipeline - Итоги реализации

## Изменённые файлы

### 1. Типы и интерфейсы
- **`backend/src/types/channel.ts`**
  - Добавлен тип `ChannelType = "shorts" | "music_clips"`
  - Добавлен интерфейс `MusicClipsSettings`
  - Расширен интерфейс `Channel` полем `type?: ChannelType` и `musicClipsSettings?: MusicClipsSettings`

### 2. Storage Service
- **`backend/src/services/storageService.ts`**
  - Добавлено поле `musicClipsRoot` (отдельный от `videosRoot`)
  - Добавлены методы для работы с music_clips:
    - `getMusicClipsRoot()`
    - `resolveMusicClipsUserDir()`
    - `resolveMusicClipsChannelDir()`
    - `resolveMusicClipsTrackDir()`
    - `resolveMusicClipsSegmentsDir()`
    - `resolveMusicClipsRenderDir()`
    - `resolveMusicClipsFinalDir()`
    - `resolveMusicClipsUploadedDir()`
    - `resolveMusicClipsFailedDir()`
    - `resolveMusicClipsLogsDir()`
    - `ensureMusicClipsDirs()`

### 3. Новые сервисы
- **`backend/src/services/sunoClient.ts`** (новый)
  - Клиент для работы с Suno API
  - Методы: `createTrack()`, `downloadAudio()`

- **`backend/src/services/musicClipsPipeline.ts`** (новый)
  - Основной пайплайн обработки
  - Функция `processMusicClipsChannel()` - главная функция пайплайна

- **`backend/src/services/musicClipsScheduler.ts`** (новый)
  - Планировщик для каналов типа music_clips
  - Функции: `getMusicClipsChannels()`, `processMusicClipsTick()`

### 4. Утилиты
- **`backend/src/utils/ffmpegUtils.ts`** (новый)
  - Утилиты для работы с ffmpeg/ffprobe:
    - `getVideoInfo()` - информация о видео
    - `getAudioInfo()` - информация об аудио
    - `trimAudio()` - обрезка аудио
    - `loopAndTrimAudio()` - зацикливание и обрезка
    - `concatSegments()` - склейка сегментов
    - `overlayAudio()` - наложение аудио на видео
    - `checkFfmpegAvailable()` - проверка наличия ffmpeg

### 5. API Routes
- **`backend/src/routes/musicClipsRoutes.ts`** (новый)
  - `POST /api/music-clips/channels/:channelId/runOnce` - запуск пайплайна
  - `GET /api/music-clips/media/:userFolderKey/:channelFolderKey/:fileName` - отдача медиа-файлов

### 6. Интеграция
- **`backend/src/index.ts`**
  - Добавлен импорт `musicClipsRoutes`
  - Добавлен роут `app.use("/api/music-clips", musicClipsRoutes)`
  - Добавлен планировщик для music_clips (отдельный от shorts)

### 7. Docker
- **`backend/Dockerfile`**
  - Добавлена установка ffmpeg: `RUN apk add --no-cache ffmpeg`

## Структура папок

```
/app/storage/music_clips/
  users/
    {userFolderKey}/
      channels/
        {channelFolderKey}/
          inbox/
            track/          # track_raw.mp3, track_target.mp3
            segments/      # seg_000.mp4, seg_001.mp4, ...
            render/         # segments.txt, stitched.mp4
            final/          # final.mp4
          uploaded/         # final_{timestamp}.mp4, track_{timestamp}.mp3
          failed/           # (опционально)
          logs/              # (опционально)
```

## Переменные окружения

```env
# Music Clips Root (опционально)
MUSIC_CLIPS_ROOT=/app/storage/music_clips

# Suno API
SUNO_API_KEY=your_key_here
SUNO_API_BASE_URL=https://api.suno.ai

# Публичный URL (обязательно для Blotato)
PUBLIC_BASE_URL=https://api.shortsai.ru
```

## PowerShell команды

### Сборка и запуск
```powershell
cd backend
npm install
npm run build
npm start
```

### Docker
```powershell
docker-compose build
docker-compose up -d
docker-compose logs -f backend
```

### Тестирование API
```powershell
$body = @{ userId = "user123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
    -Method POST -Body $body -ContentType "application/json"
```

### Проверка структуры
```powershell
Get-ChildItem -Path ".\storage\music_clips" -Recurse
```

## Гарантии

✅ **Отдельное хранилище**: Все файлы music_clips лежат в `/app/storage/music_clips/...`, НЕ в `/app/storage/videos/...`

✅ **Отдельный планировщик**: Планировщик для music_clips работает независимо от shorts, логи помечены `[MusicClips]`

✅ **Изоляция**: Пайплайн не использует существующие папки shorts и их inbox/архивацию

## Известные ограничения

1. **Генерация видео-сегментов**: Требует интеграции с системой генерации видео (Telegram/Syntx). См. TODO в `generateVideoSegment()` функции.

2. **Suno API**: Структура API может отличаться от реализованной. Нужно адаптировать под реальный API Suno в `sunoClient.ts`.

3. **Публикация**: Требуется настройка `PUBLIC_BASE_URL` для доступа Blotato к медиа-файлам через `/api/music-clips/media/...`.

## Следующие шаги

1. Интегрировать генерацию видео-сегментов с существующей системой (Telegram/Syntx)
2. Адаптировать SunoClient под реальный API Suno
3. Добавить обработку ошибок и ретраи для всех этапов
4. Добавить мониторинг и метрики

