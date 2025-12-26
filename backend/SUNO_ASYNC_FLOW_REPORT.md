# Отчёт об исправлении асинхронного flow Music Clips

## Проблема

POST `/api/music-clips/channels/:channelId/runOnce` возвращал 500 с ошибкой "Suno API did not return audio URL". Это происходило потому, что Suno API может возвращать асинхронный ответ с `jobId` вместо сразу готового `audioUrl`, но система ожидала только синхронный ответ.

## Решение

Реализован полноценный асинхронный flow с поддержкой:
1. **Асинхронных job**: если Suno вернул `jobId` без `audioUrl`, сохраняем jobId и возвращаем 202 PROCESSING
2. **Polling endpoint**: `GET /api/music-clips/jobs/:jobId` для проверки статуса
3. **Улучшенный парсинг**: поддержка различных форматов ответа Suno
4. **Подробное логирование**: фиксация реального формата ответа (до 4KB)

## Изменённые файлы

### 1. `backend/src/services/sunoClient.ts`

**Добавлено:**
- Интерфейс `SunoJobResult` для работы с job
- Метод `extractJobId()` - извлечение jobId из различных полей ответа
- Метод `extractAudioUrl()` - извлечение audioUrl из различных форматов:
  - Прямые поля: `audio_url`, `audioUrl`, `url`, `audio`
  - В массиве `clips[0].audio_url`
  - В массиве `data[0].audio_url`
  - В объекте `result.audio_url`
  - В объекте `assets.audio`
- Метод `getJobStatus(jobId)` - получение статуса job по ID
- Улучшенное логирование ответа Suno (до 4KB body)

**Изменено:**
- `createTrack()` теперь обрабатывает как синхронные, так и асинхронные ответы
- Если получен `jobId` без `audioUrl`, возвращается результат с `jobId` в metadata
- Если нет ни `jobId`, ни `audioUrl`, выбрасывается ошибка `SUNO_UNEXPECTED_RESPONSE` (не 500)

### 2. `backend/src/services/musicClipsPipeline.ts`

**Добавлено:**
- Функция `saveMusicClipsJobId()` - сохранение jobId в Firestore
- Поле `jobId` и `status` в `MusicClipsPipelineResult`

**Изменено:**
- После вызова `sunoClient.createTrack()` проверяется наличие `jobId`
- Если есть `jobId` без `audioUrl`, сохраняется в канал и возвращается `PROCESSING`
- Если нет ни `audioUrl`, ни `jobId`, возвращается ошибка

### 3. `backend/src/types/channel.ts`

**Добавлено:**
- Поля `lastJobId` и `lastJobStatus` в `MusicClipsSettings` для хранения состояния job

### 4. `backend/src/routes/musicClipsRoutes.ts`

**Добавлено:**
- Endpoint `GET /api/music-clips/jobs/:jobId` для проверки статуса job
- Обработка статуса `PROCESSING` в `runOnce`: возвращает 202 Accepted
- Обработка ошибок `SUNO_UNEXPECTED_RESPONSE` и `SUNO_FAILED`

**Изменено:**
- `POST /channels/:channelId/runOnce` теперь возвращает 202 с `jobId` при асинхронном flow

### 5. `backend/scripts/test-music-clips-async.ps1` (новый)

Тестовый скрипт для проверки асинхронного flow:
- Запускает `runOnce`
- Если получен 202 с `jobId`, делает polling статуса
- Ожидает завершения или провала генерации

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

**Ошибка (502 Bad Gateway):**
```json
{
  "success": false,
  "error": "SUNO_UNEXPECTED_RESPONSE",
  "message": "Suno API вернул неожиданный формат ответа. Проверьте логи для деталей."
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
  "duration": 120,
  "metadata": { ... }
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

## Логирование

Все логи Suno помечены префиксом `[MusicClips][Suno]` и включают:
- Финальный URL запроса
- Method (POST/GET)
- Status code
- Response body (до 4KB)
- Безопасные заголовки (без Authorization)

**Пример лога:**
```
[MusicClips][Suno] Suno API response received {
  status: 200,
  statusText: "OK",
  responseBody: "{\"id\":\"job_abc123\",\"status\":\"queued\"}",
  responseKeys: ["id", "status"],
  attempt: 1
}
```

## Как работает UI

### После вызова runOnce:

1. **Если получен 202 PROCESSING:**
   - Сохранить `jobId` из ответа
   - Начать polling: `GET /api/music-clips/jobs/:jobId` каждые 5 секунд
   - Показывать индикатор загрузки

2. **Polling логика:**
   ```typescript
   const pollJobStatus = async (jobId: string) => {
     const maxAttempts = 30; // 2.5 минуты при интервале 5 сек
     let attempt = 0;
     
     while (attempt < maxAttempts) {
       const response = await fetch(`/api/music-clips/jobs/${jobId}`);
       const data = await response.json();
       
       if (data.status === "DONE") {
         // Генерация завершена, показать результат
         return data;
       } else if (data.status === "FAILED") {
         // Показать ошибку
         throw new Error(data.message);
       }
       
       // Продолжить polling
       await sleep(5000);
       attempt++;
     }
     
     throw new Error("Timeout waiting for job completion");
   };
   ```

3. **Если получен 200 OK:**
   - Генерация завершена синхронно, показать результат сразу

## Команды PowerShell для тестирования

### Локальный запуск:
```powershell
# Запустить backend
cd backend
$env:SUNO_API_KEY="your_key_here"
npm run dev

# В другом терминале: запустить тест
.\scripts\test-music-clips-async.ps1 `
  -ChannelId "channel123" `
  -UserId "user123" `
  -BaseUrl "http://localhost:8080" `
  -MaxPollAttempts 30 `
  -PollIntervalSec 5
```

### Проверка через curl:
```powershell
# 1. Запустить runOnce
$body = @{ userId = "user123" } | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json"; "x-user-id" = "user123" } `
  -Body $body

# 2. Если получен jobId, проверить статус
if ($response.status -eq "PROCESSING") {
  $jobId = $response.jobId
  Invoke-RestMethod -Uri "http://localhost:8080/api/music-clips/jobs/$jobId" `
    -Method GET `
    -Headers @{ "x-user-id" = "user123" }
}
```

## Результат

✅ Система корректно обрабатывает как синхронные, так и асинхронные ответы Suno  
✅ Нет 500 ошибок при отсутствии `audioUrl` в первом ответе  
✅ UI получает понятный статус и может делать polling  
✅ Подробное логирование для диагностики  
✅ Поддержка различных форматов ответа Suno

## Следующие шаги

1. Обновить UI для поддержки polling после получения 202
2. Добавить визуальный индикатор прогресса генерации
3. Опционально: реализовать WebSocket для real-time обновлений статуса

