# Отчёт о загрузке исправлений асинхронного flow на Synology

## ✅ Файлы загружены

Все изменённые файлы успешно загружены на сервер `/volume1/docker/shortsai/backend/`:

1. ✅ `src/services/sunoClient.ts` (22K) - добавлены методы extractJobId, extractAudioUrl, getJobStatus
2. ✅ `src/services/musicClipsPipeline.ts` (19K) - добавлена функция saveMusicClipsJobId, обработка PROCESSING
3. ✅ `src/types/channel.ts` (3.5K) - добавлены поля lastJobId и lastJobStatus
4. ✅ `src/routes/musicClipsRoutes.ts` (15K) - добавлен endpoint GET /api/music-clips/jobs/:jobId
5. ✅ `scripts/test-music-clips-async.ps1` (4.7K) - новый тестовый скрипт
6. ✅ `SUNO_ASYNC_FLOW_REPORT.md` (9.3K) - новый отчёт с документацией

## Проверка загруженных файлов

Изменения подтверждены:
- ✅ Методы `extractJobId()` и `extractAudioUrl()` найдены в `sunoClient.ts`
- ✅ Метод `getJobStatus()` найден
- ✅ Код ошибки `SUNO_UNEXPECTED_RESPONSE` найден
- ✅ Endpoint `/api/music-clips/jobs/:jobId` добавлен в роуты

## Что изменилось

### До исправления:
- ❌ 500 ошибка при отсутствии `audioUrl` в первом ответе Suno
- ❌ Нет поддержки асинхронных job
- ❌ Нет способа проверить статус генерации
- ❌ Минимальное логирование ответа Suno

### После исправления:
- ✅ Поддержка асинхронного flow: если Suno вернул `jobId`, возвращается 202 PROCESSING
- ✅ Endpoint для проверки статуса: `GET /api/music-clips/jobs/:jobId`
- ✅ Улучшенный парсинг: поддержка различных форматов ответа Suno
- ✅ Подробное логирование: фиксация реального формата ответа (до 4KB)
- ✅ Правильная обработка ошибок: `SUNO_UNEXPECTED_RESPONSE` вместо 500

## Следующие шаги

### 1. Пересобрать и перезапустить контейнер

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose build --no-cache backend"
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose up -d backend"
```

### 2. Проверить логи

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -i '\[MusicClips\]\[Suno\]'"
```

**Ожидаемый результат:**
- `[MusicClips][Suno] SunoClient initialized`
- При запросах: `[MusicClips][Suno] Suno API response received` с полным body ответа
- При асинхронных job: `[MusicClips][Suno] Job created (async)` с `jobId`

### 3. Протестировать runOnce endpoint

```powershell
$body = @{ userId = "your-user-id" } | ConvertTo-Json
$response = Invoke-RestMethod -Uri "https://api.shortsai.ru/api/music-clips/channels/your-channel-id/runOnce" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "x-user-id" = "your-user-id"
  } `
  -Body $body

# Если получен 202 с jobId
if ($response.status -eq "PROCESSING") {
  $jobId = $response.jobId
  Write-Host "JobId: $jobId"
  
  # Проверить статус
  $status = Invoke-RestMethod -Uri "https://api.shortsai.ru/api/music-clips/jobs/$jobId" `
    -Method GET `
    -Headers @{ "x-user-id" = "your-user-id" }
  
  Write-Host "Status: $($status.status)"
}
```

### 4. Использовать тестовый скрипт

```powershell
.\scripts\test-music-clips-async.ps1 `
  -ChannelId "your-channel-id" `
  -UserId "your-user-id" `
  -BaseUrl "https://api.shortsai.ru" `
  -MaxPollAttempts 30 `
  -PollIntervalSec 5
```

## Формат ответов API

### POST /api/music-clips/channels/:channelId/runOnce

**Синхронный ответ (200 OK):**
```json
{
  "success": true,
  "trackPath": "/app/storage/music_clips/.../track/track_target.mp3",
  "finalVideoPath": "/app/storage/music_clips/.../final/final.mp4",
  "publishedPlatforms": ["youtube"]
}
```

**Асинхронный ответ (202 Accepted):**
```json
{
  "success": true,
  "status": "PROCESSING",
  "jobId": "job_abc123",
  "message": "Генерация запущена, используйте GET /api/music-clips/jobs/:jobId для проверки статуса"
}
```

### GET /api/music-clips/jobs/:jobId

**Статус: PROCESSING (200 OK):**
```json
{
  "success": true,
  "status": "PROCESSING",
  "jobId": "job_abc123",
  "message": "Генерация ещё выполняется"
}
```

**Статус: DONE (200 OK):**
```json
{
  "success": true,
  "status": "DONE",
  "jobId": "job_abc123",
  "audioUrl": "https://cdn.suno.ai/audio/abc123.mp3",
  "title": "Generated Track",
  "duration": 120
}
```

**Статус: FAILED (502 Bad Gateway):**
```json
{
  "success": false,
  "status": "FAILED",
  "jobId": "job_abc123",
  "error": "SUNO_FAILED",
  "message": "Suno вернул ошибку генерации",
  "details": "Error message from Suno"
}
```

## Команды PowerShell для полного деплоя

```powershell
# 1. Проверить, что файлы загружены
ssh shortsai "cd /volume1/docker/shortsai/backend && ls -lh src/services/sunoClient.ts src/services/musicClipsPipeline.ts src/types/channel.ts src/routes/musicClipsRoutes.ts"

# 2. Пересобрать контейнер
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose build --no-cache backend"

# 3. Перезапустить контейнер
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose up -d backend"

# 4. Проверить логи
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=30 backend | grep -i '\[MusicClips\]\[Suno\]'"

# 5. Проверить диагностику
curl.exe https://api.shortsai.ru/api/music-clips/diagnostics/suno
```

## Статус

✅ Все файлы загружены на сервер  
⏳ Требуется пересобрать и перезапустить контейнер  
⏳ Требуется проверить логи и протестировать endpoint после перезапуска

## Важные изменения для UI

После перезапуска контейнера UI должен быть обновлён для поддержки polling:

1. После вызова `runOnce`, если получен 202 с `jobId`:
   - Сохранить `jobId`
   - Начать polling `GET /api/music-clips/jobs/:jobId` каждые 5 секунд
   - Показывать индикатор загрузки

2. При получении статуса `DONE`:
   - Показать результат генерации
   - Обновить UI

3. При получении статуса `FAILED`:
   - Показать ошибку пользователю

Подробная документация в `SUNO_ASYNC_FLOW_REPORT.md`.

