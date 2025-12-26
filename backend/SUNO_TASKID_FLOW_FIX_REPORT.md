# Отчёт об исправлении асинхронного flow Music Clips (taskId-based)

## Проблема

POST `/api/music-clips/channels/:channelId/runOnce` возвращал 500 с ошибками:
- "Suno API did not return audio URL"
- "Suno API did not return audio URL or job ID"

Это происходило потому, что система ожидала синхронный ответ с `audioUrl` сразу после вызова `generate()`, но Suno API возвращает `taskId` и требует polling через `getRecordInfo()`.

## Решение

Реализован полноценный taskId-based flow с поддержкой:
1. **Асинхронных задач**: если Suno вернул `taskId` без `audioUrl`, сохраняем taskId и возвращаем 202 PROCESSING
2. **Polling endpoint**: `GET /api/music-clips/tasks/:taskId` для проверки статуса
3. **Улучшенный парсинг**: поддержка различных форматов ответа Suno (snake_case/camelCase)
4. **Проверка кредитов**: перед запуском проверяем кредиты, возвращаем 402 при отсутствии
5. **Подробное логирование**: фиксация реального формата ответа (до 4KB), requestId в логах
6. **Правильные статусы**: никогда не возвращаем 500 из-за отсутствия audioUrl на первом шаге

## Изменённые файлы

### 1. `backend/src/routes/musicClipsRoutes.ts`

**Изменено:**
- Добавлена проверка кредитов перед запуском пайплайна (402 Payment Required при отсутствии)
- Обновлена обработка результата `processMusicClipsChannel`:
  - `status: "PROCESSING"` + `taskId` → 202 Accepted
  - `status: "FAILED"` → 502 Bad Gateway
  - `success: true` + `status: "DONE"` → 200 OK
- Улучшена обработка ошибок в catch блоке:
  - `SUNO_NO_CREDITS` → 402 Payment Required
  - Все ошибки Suno → 502 (Bad Gateway), не 500
  - Добавлен `requestId` в ответы для трейсинга
- Обновлён эндпоинт `GET /api/music-clips/tasks/:taskId`:
  - Правильная обработка всех статусов (PROCESSING, DONE, FAILED)
  - Всегда возвращает 200 OK (даже для FAILED), но с `ok: false` в теле
  - Добавлен `requestId` в ответы

### 2. `backend/src/services/musicClipsPipeline.ts`

**Изменено:**
- Обновлена проверка кредитов: пробрасывает ошибку `SUNO_NO_CREDITS` дальше
- Обновлён интерфейс `MusicClipsPipelineResult`: `jobId` → `taskId`
- Исправлена обработка статуса PROCESSING: возвращает `success: true` (задача создана успешно)
- Улучшено логирование с `channelId` и `userId`
- Удалён дублирующийся код после блока try-catch

### 3. `backend/src/services/sunoClient.ts`

**Изменено:**
- Улучшено извлечение `audioUrl` в `getRecordInfo()`:
  - Поддержка различных форматов: `data.response.data[0].audio_url`, `data.data[0].audio_url`, и т.д.
  - Поддержка snake_case и camelCase: `audio_url`, `audioUrl`, `url`, `audio`
  - Добавлено предупреждение в логах, если `audioUrl` не найден в SUCCESS ответе
  - Улучшена обработка различных структур ответа Suno

### 4. `src/api/musicClips.ts`

**Изменено:**
- Обновлены интерфейсы: добавлено поле `ok?: boolean` для совместимости
- Обновлён `runMusicClipsOnce()`:
  - Правильная обработка 202 Accepted (PROCESSING)
  - Правильная обработка 200 OK (DONE)
  - Улучшена обработка ошибок
- Обновлён `getMusicClipsTaskStatus()`:
  - Правильная обработка 404 (задача не найдена)
  - Правильная обработка 502/503 (ошибка Suno API)
  - Правильная обработка 200 OK (любой статус)

### 5. `src/pages/ChannelList/ChannelListPage.tsx`

**Изменено:**
- Обновлён `handleMusicClipsRunOnce()`:
  - Правильная обработка 202 PROCESSING с `taskId`
  - Улучшен polling с правильной обработкой ошибок
  - Исправлена проблема с переменной `result` в блоке `finally`
  - Добавлена специальная обработка ошибки отсутствия кредитов
  - Улучшена обработка различных статусов ответа

## Формат ответов API

### POST /api/music-clips/channels/:channelId/runOnce

**Синхронный успех (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "status": "DONE",
  "trackPath": "/app/storage/music_clips/.../track/track_target.mp3",
  "finalVideoPath": "/app/storage/music_clips/.../final/final.mp4",
  "publishedPlatforms": ["youtube"]
}
```

**Асинхронный ответ (202 Accepted):**
```json
{
  "success": true,
  "ok": true,
  "status": "PROCESSING",
  "taskId": "suno_task_abc123",
  "message": "Генерация запущена, используйте GET /api/music-clips/tasks/:taskId для проверки статуса"
}
```

**Ошибка отсутствия кредитов (402 Payment Required):**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_NO_CREDITS",
  "message": "Недостаточно кредитов Suno для генерации. Пополните баланс.",
  "credits": 0,
  "requestId": "req_1234567890_abc123"
}
```

**Ошибка Suno API (502 Bad Gateway):**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_FAILED",
  "message": "Suno вернул ошибку генерации",
  "requestId": "req_1234567890_abc123"
}
```

### GET /api/music-clips/tasks/:taskId

**Статус: PROCESSING (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "status": "PROCESSING",
  "taskId": "suno_task_abc123",
  "message": "Генерация ещё выполняется",
  "requestId": "req_1234567890_abc123"
}
```

**Статус: DONE (200 OK):**
```json
{
  "success": true,
  "ok": true,
  "status": "DONE",
  "taskId": "suno_task_abc123",
  "audioUrl": "https://cdn.suno.ai/audio/abc123.mp3",
  "title": "Generated Track",
  "duration": 120,
  "metadata": { ... },
  "requestId": "req_1234567890_abc123"
}
```

**Статус: FAILED (200 OK, но ok: false):**
```json
{
  "success": false,
  "ok": false,
  "status": "FAILED",
  "taskId": "suno_task_abc123",
  "error": "SUNO_FAILED",
  "message": "Suno вернул ошибку генерации",
  "errorMessage": "Error message from Suno",
  "requestId": "req_1234567890_abc123"
}
```

**Задача не найдена (404 Not Found):**
```json
{
  "success": false,
  "ok": false,
  "error": "TASK_NOT_FOUND",
  "message": "Task suno_task_abc123 not found",
  "requestId": "req_1234567890_abc123"
}
```

## Новый workflow по шагам

### Backend Flow

1. **Пользователь нажимает "Запустить Music Clips"**
   - Frontend вызывает `POST /api/music-clips/channels/:channelId/runOnce`

2. **Backend проверяет конфигурацию**
   - Проверяет наличие `SUNO_API_KEY` → 503 если нет
   - Проверяет кредиты через `getCredits()` → 402 если 0

3. **Backend создаёт задачу**
   - Вызывает `sunoClient.generate()` → получает `taskId`
   - Сохраняет `taskId` в канал (опционально)

4. **Backend пытается дождаться результата (короткий таймаут)**
   - Вызывает `waitForResult(taskId, { timeoutMs: 30000 })` (30 сек по умолчанию)
   - Если получили SUCCESS → продолжаем пайплайн, возвращаем 200 DONE
   - Если получили FAILED → возвращаем 502 FAILED
   - Если timeout или PROCESSING → возвращаем 202 PROCESSING с `taskId`

5. **Frontend начинает polling**
   - Если получили 202 → вызывает `GET /api/music-clips/tasks/:taskId` каждые 5 сек
   - Продолжает до получения DONE или FAILED (максимум 5 минут)

6. **Backend проверяет статус**
   - `GET /api/music-clips/tasks/:taskId` вызывает `sunoClient.getRecordInfo(taskId)`
   - Возвращает текущий статус (PROCESSING, DONE, FAILED)

### Frontend Flow

1. **Пользователь нажимает кнопку**
   - Показывается индикатор загрузки
   - Вызывается `runMusicClipsOnce(channelId, userId)`

2. **Обработка ответа**
   - **202 PROCESSING**: начинается polling, индикатор остаётся активным
   - **200 DONE**: показывается успех, индикатор скрывается
   - **402/502/503**: показывается ошибка, индикатор скрывается

3. **Polling (если 202)**
   - Каждые 5 секунд вызывается `getMusicClipsTaskStatus(taskId, userId)`
   - **DONE**: показывается успех, polling останавливается
   - **FAILED**: показывается ошибка, polling останавливается
   - **PROCESSING**: продолжается polling
   - **Timeout (5 минут)**: показывается предупреждение, polling останавливается

## Логирование

Все логи теперь включают:
- `requestId` для трейсинга запросов
- `channelId` и `userId` для контекста
- URL и status code Suno API
- Response body Suno (обрезано до 4KB)
- Безопасные заголовки (без Authorization/Bearer)

**Пример лога:**
```
[MusicClipsAPI] runOnce requested { requestId: "req_1234567890_abc123", channelId: "channel123", userId: "user456" }
[MusicClips][Suno] Generating track { promptLength: 50, finalUrl: "https://api.sunoapi.org/api/v1/generate" }
[MusicClips][Suno] Generate response { status: 200, responseBody: "{\"code\":200,\"msg\":\"success\",\"data\":{\"taskId\":\"suno_task_abc123\"}}" }
[MusicClips] Task created { taskId: "suno_task_abc123", channelId: "channel123" }
[MusicClipsAPI] Returning PROCESSING status { channelId: "channel123", userId: "user456", taskId: "suno_task_abc123" }
```

## Тестирование

См. `backend/scripts/test-suno-taskid-flow.ps1` для PowerShell команд ручной проверки.

## Важные замечания

1. **Никогда не возвращаем 500 из-за отсутствия audioUrl** на первом шаге
2. **Всегда возвращаем 202 PROCESSING** если задача создана, но ещё не готова
3. **Правильные HTTP статусы**: 402 для кредитов, 502 для ошибок Suno, 200/202 для успеха
4. **Поддержка различных форматов ответа Suno**: snake_case и camelCase
5. **Безопасное логирование**: никогда не логируем API ключи

