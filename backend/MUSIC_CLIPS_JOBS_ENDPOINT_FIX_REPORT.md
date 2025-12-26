# Отчет: Исправление endpoint GET /api/music-clips/jobs/:jobId

## Проблема

Frontend делал polling на `GET /api/music-clips/jobs/{jobId}` и получал 404 Not Found с сообщением:
```
"Route GET /api/music-clips/jobs/{jobId} not found"
```

## Причина

Endpoint `GET /api/music-clips/jobs/:jobId` был описан в документации и использовался в коде, но не был реализован в роутере `musicClipsRoutes.ts`.

## Решение

### 1. Добавлен endpoint в роутер

**Файл:** `backend/src/routes/musicClipsRoutes.ts`

**Endpoint:** `GET /api/music-clips/jobs/:jobId`

**Реализация:**
- Получает job из Firestore через `getMusicClipsJob(jobId)`
- Возвращает 404 с `JOB_NOT_FOUND` если job не найден
- Возвращает 200 с полным статусом job'а:
  - `jobId`, `channelId`, `stage`, `progressText`
  - `sunoTaskId`, `audioUrl`, `error`
  - `createdAt`, `updatedAt`
  - `heartbeat` (secondsSinceUpdate, isStale)

### 2. Обновлен frontend для обработки 404

**Файл:** `src/api/musicClips.ts`
- Обновлена обработка 404: добавляет `code` и `status` в ошибку

**Файл:** `src/pages/ChannelList/ChannelListPage.tsx`
- Добавлена специальная обработка 404 в polling
- При 404 останавливает polling и показывает понятное сообщение
- Логирует `jobId` и URL в консоль

### 3. Регистрация роутера

**Файл:** `backend/src/index.ts`
- Роутер подключен: `app.use("/api/music-clips", musicClipsRoutes)`
- Endpoint доступен по пути: `GET /api/music-clips/jobs/:jobId`

## Измененные файлы

1. **`backend/src/routes/musicClipsRoutes.ts`**
   - Добавлен endpoint `GET /jobs/:jobId` перед `/tasks/:taskId`

2. **`src/api/musicClips.ts`**
   - Обновлена обработка 404: добавляет `code: "JOB_NOT_FOUND"` и `status: 404`

3. **`src/pages/ChannelList/ChannelListPage.tsx`**
   - Добавлена обработка 404 в polling с остановкой и понятным сообщением
   - Добавлено логирование `jobId` и URL

4. **`backend/scripts/test-music-clips-jobs-endpoint.ps1`** (новый)
   - PowerShell скрипт для проверки endpoint

## Примеры JSON ответов

### Успешный ответ (200 OK) - STAGE_40_SUNO_PENDING

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

### Успешный ответ (200 OK) - STAGE_50_SUNO_SUCCESS

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

### Успешный ответ (200 OK) - STAGE_90_FAILED

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

### Ошибка: Job не найден (404 Not Found)

```json
{
  "success": false,
  "ok": false,
  "error": "JOB_NOT_FOUND",
  "message": "Job job_1703616000000_abc123 not found",
  "requestId": "req_1703616000000_def456"
}
```

## PowerShell команды для проверки

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
$jobId = $response.jobId

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

### 3. Проверка 404 для несуществующего job

```powershell
$fakeJobId = "job_9999999999999_fake"

try {
    Invoke-RestMethod -Method Get -Uri "$baseUrl/api/music-clips/jobs/$fakeJobId" -Headers @{
        "Authorization" = "Bearer $token"
    }
    Write-Host "ОШИБКА: Должен был вернуть 404!"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "✓ Корректно вернул 404"
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host ($errorBody | ConvertTo-Json -Depth 10)
    }
}
```

**Полный скрипт:** см. `backend/scripts/test-music-clips-jobs-endpoint.ps1`

## Регистрация роутера

**Файл:** `backend/src/index.ts`

```typescript
import musicClipsRoutes from "./routes/musicClipsRoutes";
// ...
app.use("/api/music-clips", musicClipsRoutes);
```

**Итоговый путь:** `GET /api/music-clips/jobs/:jobId`

## Структура endpoint'а

```typescript
router.get("/jobs/:jobId", async (req, res) => {
  const { jobId } = req.params;
  // ...
  const job = await getMusicClipsJob(jobId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      ok: false,
      error: "JOB_NOT_FOUND",
      message: `Job ${jobId} not found`,
      requestId
    });
  }
  
  return res.json({
    success: true,
    ok: true,
    jobId: job.jobId,
    // ... остальные поля
  });
});
```

## Frontend обработка 404

**Файл:** `src/pages/ChannelList/ChannelListPage.tsx`

```typescript
} catch (error: any) {
  // Обработка 404 - job не найден
  if (error?.status === 404 || error?.code === "JOB_NOT_FOUND") {
    setToast({
      message: `Job ID ${jobId} не найден на сервере. Вероятно, бэкенд не сохранил job или роут не задеплоен.`,
      type: "error"
    });
    // Останавливаем polling
    if (pollingInterval) clearInterval(pollingInterval);
    return;
  }
}
```

## Проверка деплоя

После деплоя проверьте:

1. **Endpoint доступен:**
   ```powershell
   Invoke-RestMethod -Method Get -Uri "https://api.shortsai.ru/api/music-clips/jobs/test" -Headers @{Authorization="Bearer $token"}
   ```
   Должен вернуть 404 с `JOB_NOT_FOUND` (не 404 "Route not found")

2. **Job сохраняется:**
   - Запустите `POST /api/music-clips/channels/:channelId/runOnce`
   - Получите `jobId`
   - Проверьте `GET /api/music-clips/jobs/:jobId`
   - Должен вернуть 200 с данными job'а

3. **Логи backend:**
   - Ищите `[MusicClipsAPI] getJobStatus requested` в логах
   - При 404 должно быть `[MusicClipsAPI] Job not found`

## Статус

- ✅ Endpoint добавлен в роутер
- ✅ Роутер подключен в `app.use("/api/music-clips", musicClipsRoutes)`
- ✅ Frontend обновлен для обработки 404
- ✅ Добавлено логирование jobId и URL
- ✅ Изменения закоммичены и запушены в GitHub

Endpoint готов к использованию после деплоя.

