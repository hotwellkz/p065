# Отчет: Внедрение наблюдаемости и UX-прогресса для Music Clips

## Проблема

После клика "Запустить Music Clips" UI показывал "Генерация музыки запущена…" и мог висеть 4-5 минут без ошибок и без статуса. Пользователь не видел, на каком этапе процесс, жив ли он, какой taskId, и если завис — почему.

## Решение

Реализована система job tracking с разбивкой процесса на стадии, логированием, сохранением в БД и polling на frontend.

## Измененные файлы

### Backend

1. **`backend/src/services/musicClipsJobService.ts`** (новый)
   - Сервис для управления job'ами Music Clips
   - Функции: `createMusicClipsJob`, `updateMusicClipsJob`, `getMusicClipsJob`, `findJobBySunoTaskId`
   - Стадии: `STAGE_10_REQUEST_ACCEPTED`, `STAGE_20_SUNO_REQUEST_SENT`, `STAGE_30_SUNO_TASK_CREATED`, `STAGE_40_SUNO_PENDING`, `STAGE_50_SUNO_SUCCESS`, `STAGE_90_FAILED`, `STAGE_99_TIMEOUT`

2. **`backend/src/services/musicClipsPipeline.ts`**
   - Добавлена функция `processMusicClipsChannelWithJob()` для работы с job tracking
   - Добавлена функция `processMusicClipsChannelInternalWithJob()` с обновлением стадий
   - Добавлена функция `startServerSidePolling()` как fallback, если callback не придет
   - Добавлена функция `processAudioAndVideo()` для обработки после получения audioUrl
   - Обновление job на каждой стадии процесса

3. **`backend/src/routes/musicClipsRoutes.ts`**
   - Обновлен `POST /api/music-clips/channels/:channelId/runOnce`:
     - Создает job сразу
     - Возвращает 202 Accepted с `jobId` немедленно (< 2 сек)
     - Запускает пайплайн асинхронно
   - Добавлен `GET /api/music-clips/jobs/:jobId`:
     - Возвращает статус job'а с полями: `jobId`, `stage`, `progressText`, `sunoTaskId`, `audioUrl`, `error`, `heartbeat`

4. **`backend/src/routes/webhooksRoutes.ts`**
   - Обновлен `POST /api/webhooks/suno/music`:
     - Ищет job по `sunoTaskId`
     - Обновляет job при получении callback от Suno
     - Fallback на обновление канала (legacy)

### Frontend

5. **`src/api/musicClips.ts`**
   - Обновлен интерфейс `MusicClipsRunOnceResponse` для поддержки `jobId`
   - Добавлен интерфейс `MusicClipsJobStatusResponse`
   - Добавлена функция `getMusicClipsJobStatus(jobId)`

6. **`src/pages/ChannelList/ChannelListPage.tsx`**
   - Обновлен `handleMusicClipsRunOnce()`:
     - Работает с `jobId` вместо `taskId`
     - Начинает polling `GET /api/music-clips/jobs/:jobId` каждые 3 сек
     - Сохраняет прогресс в state `musicClipsProgress`
   - Добавлены функции:
     - `stopMusicClipsPolling()` - остановка polling
     - `copyToClipboard()` - копирование jobId/taskId

7. **`backend/scripts/test-music-clips-jobs.ps1`** (новый)
   - PowerShell скрипт для тестирования job tracking

## Примеры JSON ответов API

### POST /api/music-clips/channels/:channelId/runOnce

**Успешный ответ (202 Accepted):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_10_REQUEST_ACCEPTED",
  "createdAt": "2024-12-26T21:00:00.000Z",
  "message": "Генерация запущена, используйте GET /api/music-clips/jobs/:jobId для проверки статуса"
}
```

**Ошибка: Callback URL не настроен (400):**
```json
{
  "success": false,
  "error": "CALLBACK_URL_NOT_CONFIGURED",
  "message": "Callback URL not configured. Set PUBLIC_BASE_URL environment variable."
}
```

**Ошибка: Нет кредитов (402):**
```json
{
  "success": false,
  "error": "SUNO_NO_CREDITS",
  "message": "Недостаточно кредитов Suno для генерации. Пополните баланс.",
  "credits": 0
}
```

### GET /api/music-clips/jobs/:jobId

**Стадия: STAGE_10_REQUEST_ACCEPTED (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_10_REQUEST_ACCEPTED",
  "progressText": "Запрос принят, отправляем запрос в Suno...",
  "sunoTaskId": null,
  "audioUrl": null,
  "error": null,
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:00:00.100Z",
  "heartbeat": {
    "secondsSinceUpdate": 0,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Стадия: STAGE_30_SUNO_TASK_CREATED (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_30_SUNO_TASK_CREATED",
  "progressText": "Задача создана в Suno, ожидаем генерацию...",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": null,
  "error": null,
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:00:05.200Z",
  "heartbeat": {
    "secondsSinceUpdate": 5,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Стадия: STAGE_40_SUNO_PENDING (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_40_SUNO_PENDING",
  "progressText": "Генерация музыки в процессе (PENDING/GENERATING)...",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": null,
  "error": null,
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:00:30.500Z",
  "heartbeat": {
    "secondsSinceUpdate": 30,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Стадия: STAGE_50_SUNO_SUCCESS (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_50_SUNO_SUCCESS",
  "progressText": "Музыка сгенерирована успешно!",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": "https://cdn.suno.ai/audio/xyz789.mp3",
  "error": null,
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:02:15.800Z",
  "heartbeat": {
    "secondsSinceUpdate": 0,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Стадия: STAGE_90_FAILED (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_90_FAILED",
  "progressText": "Ошибка при генерации",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": null,
  "error": "Suno generation failed: Insufficient credits",
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:01:20.300Z",
  "heartbeat": {
    "secondsSinceUpdate": 0,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Стадия: STAGE_99_TIMEOUT (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_99_TIMEOUT",
  "progressText": "Превышено время ожидания",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": null,
  "error": "Превышено время ожидания генерации (10 минут). Проверьте статус в Suno или попробуйте снова.",
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:10:00.000Z",
  "heartbeat": {
    "secondsSinceUpdate": 0,
    "isStale": false
  },
  "requestId": "req_1703616000000_def456"
}
```

**Job не найден (404):**
```json
{
  "success": false,
  "ok": false,
  "error": "JOB_NOT_FOUND",
  "message": "Job job_1703616000000_abc123 not found",
  "requestId": "req_1703616000000_def456"
}
```

**Heartbeat stale (job не обновлялся >60 сек):**
```json
{
  "success": true,
  "ok": true,
  "jobId": "job_1703616000000_abc123",
  "channelId": "channel_xyz",
  "stage": "STAGE_40_SUNO_PENDING",
  "progressText": "Генерация музыки в процессе (PENDING/GENERATING)...",
  "sunoTaskId": "suno_task_xyz789",
  "audioUrl": null,
  "error": null,
  "createdAt": "2024-12-26T21:00:00.000Z",
  "updatedAt": "2024-12-26T21:00:30.500Z",
  "heartbeat": {
    "secondsSinceUpdate": 75,
    "isStale": true
  },
  "requestId": "req_1703616000000_def456"
}
```

## PowerShell команды для тестирования

### 1. Запуск генерации

```powershell
$baseUrl = "https://api.shortsai.ru"
$token = "your-auth-token"
$channelId = "your-channel-id"
$userId = "your-user-id"

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
    "x-user-id" = $userId
}

$body = @{userId = $userId} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/music-clips/channels/$channelId/runOnce" -Headers $headers -Body $body

Write-Host "JobId: $($response.jobId)"
Write-Host "Stage: $($response.stage)"
```

### 2. Проверка статуса job

```powershell
$jobId = "job_1703616000000_abc123"

$jobResponse = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$jobId" -Headers @{
    "Authorization" = "Bearer $token"
}

Write-Host "Stage: $($jobResponse.stage)"
Write-Host "Progress: $($jobResponse.progressText)"
Write-Host "Suno TaskId: $($jobResponse.sunoTaskId)"
Write-Host "AudioUrl: $($jobResponse.audioUrl)"
Write-Host "Error: $($jobResponse.error)"
Write-Host "Heartbeat: $($jobResponse.heartbeat.secondsSinceUpdate) сек (stale: $($jobResponse.heartbeat.isStale))"
```

### 3. Полный скрипт с polling

См. файл `backend/scripts/test-music-clips-jobs.ps1`

## Workflow

1. **Клиент вызывает** `POST /api/music-clips/channels/:channelId/runOnce`
2. **Backend (< 2 сек):**
   - Создает job в Firestore
   - Возвращает 202 Accepted с `jobId`
   - Запускает пайплайн асинхронно
3. **Backend (асинхронно):**
   - Обновляет job: `STAGE_20_SUNO_REQUEST_SENT`
   - Вызывает Suno API
   - Обновляет job: `STAGE_30_SUNO_TASK_CREATED` (с `sunoTaskId`)
   - Обновляет job: `STAGE_40_SUNO_PENDING`
   - Запускает server-side polling (fallback)
4. **Suno API (callback или polling):**
   - Callback: `POST /api/webhooks/suno/music` → обновляет job
   - Или server-side polling обновляет job
   - Обновляет job: `STAGE_50_SUNO_SUCCESS` (с `audioUrl`) или `STAGE_90_FAILED`
5. **Клиент (polling каждые 3 сек):**
   - Вызывает `GET /api/music-clips/jobs/:jobId`
   - Отображает прогресс: stage, progressText, sunoTaskId, таймер
   - Останавливает polling при `STAGE_50_SUNO_SUCCESS`, `STAGE_90_FAILED`, `STAGE_99_TIMEOUT`

## Диагностика

### Если процесс завис

1. **Проверьте job статус:**
   ```powershell
   Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$jobId" -Headers @{"Authorization" = "Bearer $token"}
   ```

2. **Проверьте heartbeat:**
   - Если `heartbeat.isStale = true` → job не обновлялся >60 сек
   - Возможные причины: сервер упал, callback не пришел, polling не работает

3. **Проверьте логи backend:**
   - Ищите `[MusicClipsJob]` и `[MusicClips]` в логах
   - Проверьте стадии: должна быть последовательность `STAGE_10` → `STAGE_20` → `STAGE_30` → ...

4. **Проверьте Suno taskId:**
   - Если есть `sunoTaskId`, проверьте статус напрямую в Suno:
   ```powershell
   $headers = @{Authorization = "Bearer $env:SUNO_API_KEY"}
   Invoke-RestMethod -Method Get -Uri "https://api.sunoapi.org/api/v1/generate/record-info?taskId=$sunoTaskId" -Headers $headers
   ```

5. **Проверьте callback endpoint:**
   - Убедитесь, что `PUBLIC_BASE_URL` настроен правильно
   - Проверьте доступность `POST /api/webhooks/suno/music` извне

6. **Проверьте server-side polling:**
   - Должен запускаться автоматически как fallback
   - Проверьте логи на наличие `[MusicClips] Starting server-side polling`

### Рекомендации

- **Всегда показывайте jobId и sunoTaskId** пользователю для диагностики
- **Добавьте кнопку "Показать детали"** с jobId, taskId, errorMessage
- **Добавьте таймер** "идёт X:YY" для визуального подтверждения, что процесс жив
- **Проверяйте heartbeat.isStale** и показывайте предупреждение, если >60 сек

## Структура данных в Firestore

**Коллекция: `musicClipsJobs`**

```typescript
{
  jobId: string;              // "job_1703616000000_abc123"
  channelId: string;          // "channel_xyz"
  userId: string;             // "user_123"
  stage: string;              // "STAGE_30_SUNO_TASK_CREATED"
  sunoTaskId: string | null;  // "suno_task_xyz789"
  audioUrl: string | null;    // "https://cdn.suno.ai/audio/xyz789.mp3"
  errorMessage: string | null; // "Error message"
  progressText: string;        // "Задача создана в Suno..."
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Важные замечания

1. **runOnce должен отвечать < 2 сек** - не ждем audio_url, сразу возвращаем jobId
2. **Job всегда создается** - даже при ошибках, для отслеживания
3. **Server-side polling** - fallback на случай, если callback не придет
4. **Heartbeat** - проверка, что job обновляется (не завис)
5. **Не логируем секреты** - API ключи и токены не попадают в логи
6. **jobId уникальный** - генерируется как `job_${timestamp}_${random}`

