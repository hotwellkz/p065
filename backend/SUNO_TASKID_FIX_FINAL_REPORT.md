# Отчет: Исправление ошибки "Suno API did not return taskId"

## Проблема

При вызове `POST /api/music-clips/channels/:channelId/runOnce` возвращался статус 500 с ошибкой:
```
Error: "Suno API did not return taskId"
```

## Причина

1. **Неполная проверка ответа Suno**: Код проверял только HTTP статус `response.status !== 200`, но не проверял поле `code` в теле ответа. Suno может вернуть HTTP 200, но с `code != 200` в JSON.

2. **Недостаточное логирование**: Не было детального логирования структуры ответа для отладки.

3. **Неправильная обработка ошибок**: Ошибки Suno (401, 403, 429, 402) не всегда корректно обрабатывались и возвращали 500 вместо 502/409/401.

## Исправления

### 1. Улучшена проверка ответа Suno (`sunoClient.ts`)

**Было:**
```typescript
if (response.status !== 200) {
  // обработка ошибки
}
```

**Стало:**
```typescript
// Проверяем HTTP статус и code в теле ответа
const responseCode = response.data?.code;
const isHttpError = response.status !== 200;
const isCodeError = responseCode !== undefined && responseCode !== 200;

if (isHttpError || isCodeError) {
  // Обработка ошибки с правильным кодом
}
```

### 2. Улучшено логирование

Добавлено детальное логирование:
- HTTP статус и статус-текст
- Поле `code` из тела ответа
- Поле `msg`/`message` из тела ответа
- Полное тело ответа (до 8KB)
- Безопасные заголовки (без Authorization)

### 3. Улучшена обработка ошибок в routes (`musicClipsRoutes.ts`)

Добавлена обработка всех типов ошибок Suno:
- `SUNO_AUTH_ERROR` → 502 "Suno auth failed"
- `SUNO_RATE_LIMITED` → 502 "Suno rate limit exceeded"
- `SUNO_NO_CREDITS` → 402 "Недостаточно кредитов"
- `SUNO_NO_TASK_ID` → 502 "Suno API вернул неожиданный формат ответа"
- `SUNO_UNAVAILABLE` → 502/503 "Suno is temporarily unavailable"
- `SUNO_CLIENT_ERROR` → 502 "Suno API client error"

### 4. Улучшено извлечение taskId

Поддерживаются все возможные форматы ответа:
- `response.data.data.taskId` (основной формат)
- `response.data.data.task_id` (snake_case)
- `response.data.taskId`
- `response.data.task_id`

## Измененные файлы

1. **`backend/src/services/sunoClient.ts`**
   - Улучшена проверка ответа Suno (HTTP статус + code в теле)
   - Добавлено детальное логирование
   - Улучшена обработка ошибок

2. **`backend/src/routes/musicClipsRoutes.ts`**
   - Добавлена обработка всех типов ошибок Suno
   - Улучшены HTTP статусы ответов

3. **`backend/scripts/test-suno-generate-manual.ps1`** (новый)
   - PowerShell скрипт для ручного тестирования Suno API

## Примеры ответов API

### Успешный ответ (202 PROCESSING)

**Запрос:**
```
POST /api/music-clips/channels/{channelId}/runOnce
```

**Ответ:**
```json
{
  "success": true,
  "ok": true,
  "status": "PROCESSING",
  "taskId": "suno_task_abc123",
  "message": "Генерация запущена, используйте GET /api/music-clips/tasks/:taskId для проверки статуса"
}
```

**HTTP Status:** 202 Accepted

---

### Успешный ответ (200 DONE)

**Ответ:**
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

**HTTP Status:** 200 OK

---

### Ошибка: Нет кредитов (402)

**Ответ:**
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

**HTTP Status:** 402 Payment Required

---

### Ошибка: Auth failed (502)

**Ответ:**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_AUTH_ERROR",
  "message": "Suno auth failed. Проверьте SUNO_API_KEY.",
  "requestId": "req_1234567890_abc123"
}
```

**HTTP Status:** 502 Bad Gateway

---

### Ошибка: Rate limit (502)

**Ответ:**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_RATE_LIMITED",
  "message": "Suno rate limit exceeded. Попробуйте позже.",
  "retryAfterSec": 60,
  "requestId": "req_1234567890_abc123"
}
```

**HTTP Status:** 502 Bad Gateway

---

### Ошибка: Нет taskId (502)

**Ответ:**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_NO_TASK_ID",
  "message": "Suno API вернул неожиданный формат ответа (отсутствует taskId). Проверьте логи для деталей.",
  "requestId": "req_1234567890_abc123"
}
```

**HTTP Status:** 502 Bad Gateway

---

### Ошибка: Suno unavailable (502/503)

**Ответ:**
```json
{
  "success": false,
  "ok": false,
  "error": "SUNO_UNAVAILABLE",
  "message": "Suno is temporarily unavailable. Try later.",
  "retryAfterSec": 30,
  "requestId": "req_1234567890_abc123"
}
```

**HTTP Status:** 502 Bad Gateway или 503 Service Unavailable

---

## Тестирование

### PowerShell скрипт для ручного тестирования

```powershell
# Установите переменную окружения
$env:SUNO_API_KEY = "your-api-key-here"

# Запустите скрипт
.\backend\scripts\test-suno-generate-manual.ps1
```

Скрипт выполняет:
1. **POST /api/v1/generate** - создание задачи генерации
2. **GET /api/v1/generate/record-info?taskId=...** - проверка статуса
3. **GET /api/v1/get-credits** - проверка кредитов

### Ручной тест через curl

```bash
# 1. Создание задачи
curl -X POST "https://api.sunoapi.org/api/v1/generate" \
  -H "Authorization: Bearer $SUNO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "test music generation",
    "customMode": false,
    "instrumental": false,
    "model": "V4_5ALL"
  }'

# 2. Проверка статуса (замените TASK_ID)
curl -X GET "https://api.sunoapi.org/api/v1/generate/record-info?taskId=TASK_ID" \
  -H "Authorization: Bearer $SUNO_API_KEY"

# 3. Проверка кредитов
curl -X GET "https://api.sunoapi.org/api/v1/get-credits" \
  -H "Authorization: Bearer $SUNO_API_KEY"
```

## Workflow

### Новый асинхронный flow

1. **Клиент вызывает** `POST /api/music-clips/channels/:channelId/runOnce`

2. **Backend:**
   - Проверяет кредиты (опционально)
   - Вызывает `sunoClient.generate()` → получает `taskId`
   - Пытается дождаться результата (30 сек)
   - Если успел → возвращает 200 DONE
   - Если не успел → возвращает 202 PROCESSING с `taskId`

3. **Клиент (если получил 202):**
   - Начинает polling `GET /api/music-clips/tasks/:taskId` каждые 5 сек
   - При DONE → показывает результат
   - При FAILED → показывает ошибку
   - При TIMEOUT (5 минут) → показывает таймаут

4. **Backend (polling endpoint):**
   - Вызывает `sunoClient.getRecordInfo(taskId)`
   - Возвращает статус: PROCESSING / DONE / FAILED

## Логирование

Все логи помечены префиксом `[MusicClips][Suno]` и включают:
- HTTP статус и статус-текст
- Поле `code` из тела ответа
- Поле `msg`/`message` из тела ответа
- Полное тело ответа (до 8KB, безопасно)
- Безопасные заголовки (без Authorization)

**Пример лога:**
```
[MusicClips][Suno] Generate response received {
  httpStatus: 200,
  httpStatusText: "OK",
  code: 200,
  msg: "success",
  responseBody: "{ \"code\": 200, \"msg\": \"success\", \"data\": { \"taskId\": \"suno_task_abc123\" } }"
}
```

## Проверка запроса к Suno

Запрос формируется правильно:
- **URL:** `https://api.sunoapi.org/api/v1/generate`
- **Method:** POST
- **Headers:**
  - `Authorization: Bearer <SUNO_API_KEY>`
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "prompt": "...",
    "customMode": false,
    "instrumental": false,
    "model": "V4_5ALL"
  }
  ```

**Примечание:** Если `customMode: true`, должны передаваться `style` и `title`. В текущей реализации используется `customMode: false`.

## Следующие шаги

1. ✅ Исправлена проверка ответа Suno
2. ✅ Улучшено логирование
3. ✅ Улучшена обработка ошибок
4. ✅ Добавлен PowerShell скрипт для тестирования
5. ⏳ Протестировать на реальном API
6. ⏳ При необходимости добавить поддержку `customMode: true` с `style` и `title`

