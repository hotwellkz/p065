# Отчет: Добавление обязательного callBackUrl для Suno API

## Проблема

При вызове `POST /api/music-clips/channels/:channelId/runOnce` возникала ошибка:
```
"Suno API returned code 400: Please enter callBackUrl."
```

Suno API требует обязательный параметр `callBackUrl` в запросе генерации.

## Решение

### 1. Конфигурация через ENV

Добавлена поддержка переменных окружения:
- `PUBLIC_BASE_URL` - публичный HTTPS URL сервера (например: `https://api.shortsai.ru`)
- `SUNO_CALLBACK_PATH` - путь к callback endpoint (по умолчанию: `/api/webhooks/suno/music`)

Итоговый `callBackUrl` = `${PUBLIC_BASE_URL}${SUNO_CALLBACK_PATH}`

### 2. Валидация callBackUrl

- Должен быть HTTPS (не HTTP)
- Не может быть localhost или 127.0.0.1
- Не может быть пустым

### 3. Обязательный параметр

`callBackUrl` теперь всегда передается в запрос к Suno API, даже если не указан явно в опциях.

### 4. Endpoint для callback

Создан endpoint `POST /api/webhooks/suno/music` для обработки callback от Suno:
- Логирует входящий body (без секретов, до 8KB)
- Извлекает `taskId`, `status`, `audioUrl`, `title`, `duration`
- Сохраняет/обновляет статус задачи в Firestore
- Возвращает 200 {status:"received"}

## Измененные файлы

1. **`backend/src/services/sunoClient.ts`**
   - Добавлено поле `callBackUrl` в конструктор
   - Добавлен метод `getCallBackUrl()` с валидацией
   - `callBackUrl` теперь обязательный параметр в `generate()`
   - Валидация: HTTPS, не localhost, не пустой

2. **`backend/src/services/musicClipsPipeline.ts`**
   - Обновлен комментарий: `callBackUrl` берется автоматически из ENV

3. **`backend/src/routes/musicClipsRoutes.ts`**
   - Добавлена проверка `callBackUrl` перед запуском пайплайна
   - Добавлена обработка ошибок `CALLBACK_URL_NOT_CONFIGURED` и `CALLBACK_URL_INVALID`

4. **`backend/src/routes/webhooksRoutes.ts`** (новый)
   - Endpoint `POST /api/webhooks/suno/music` для обработки callback от Suno
   - Логирование, извлечение данных, сохранение в Firestore

5. **`backend/src/index.ts`**
   - Добавлен импорт и подключение `webhooksRoutes`

6. **`backend/scripts/test-suno-callback.ps1`** (новый)
   - PowerShell скрипт для тестирования `runOnce` и callback endpoint

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

### Ошибка: Callback URL не настроен (400)

**Ответ:**
```json
{
  "success": false,
  "error": "CALLBACK_URL_NOT_CONFIGURED",
  "message": "Callback URL not configured. Set PUBLIC_BASE_URL environment variable."
}
```

**HTTP Status:** 400 Bad Request

---

### Ошибка: Callback URL невалидный (400)

**Ответ:**
```json
{
  "success": false,
  "ok": false,
  "error": "CALLBACK_URL_INVALID",
  "message": "Callback URL must be HTTPS"
}
```

**HTTP Status:** 400 Bad Request

---

### Callback от Suno (200)

**Запрос:**
```
POST /api/webhooks/suno/music
```

**Body от Suno:**
```json
{
  "taskId": "suno_task_abc123",
  "status": "SUCCESS",
  "audio_url": "https://cdn.suno.ai/audio/abc123.mp3",
  "title": "Generated Track",
  "duration": 120
}
```

**Ответ:**
```json
{
  "status": "received",
  "taskId": "suno_task_abc123",
  "message": "Callback processed successfully",
  "requestId": "req_1234567890_abc123"
}
```

**HTTP Status:** 200 OK

---

## Пример payload для Suno API

**Запрос:**
```
POST https://api.sunoapi.org/api/v1/generate
```

**Headers:**
```
Authorization: Bearer <SUNO_API_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "prompt": "upbeat electronic music with synthesizers",
  "customMode": false,
  "instrumental": false,
  "model": "V4_5ALL",
  "callBackUrl": "https://api.shortsai.ru/api/webhooks/suno/music"
}
```

**Ответ:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "suno_task_abc123"
  }
}
```

---

## Настройка ENV

Добавьте в `.env` или переменные окружения:

```bash
PUBLIC_BASE_URL=https://api.shortsai.ru
SUNO_CALLBACK_PATH=/api/webhooks/suno/music
```

Или используйте дефолтный путь:
```bash
PUBLIC_BASE_URL=https://api.shortsai.ru
# SUNO_CALLBACK_PATH по умолчанию: /api/webhooks/suno/music
```

---

## Тестирование

### PowerShell скрипт

```powershell
# Установите переменные
$baseUrl = "https://api.shortsai.ru"
$token = "your-auth-token"
$channelId = "your-channel-id"
$userId = "your-user-id"

# Запустите скрипт
.\backend\scripts\test-suno-callback.ps1
```

### Ручной тест через curl

```bash
# 1. Запуск генерации
curl -X POST "https://api.shortsai.ru/api/music-clips/channels/{channelId}/runOnce" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"userId": "'$USER_ID'"}'

# 2. Тестовый callback
curl -X POST "https://api.shortsai.ru/api/webhooks/suno/music" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "suno_task_test123",
    "status": "SUCCESS",
    "audio_url": "https://cdn.suno.ai/audio/test123.mp3",
    "title": "Test Track",
    "duration": 120
  }'
```

---

## Workflow

1. **Клиент вызывает** `POST /api/music-clips/channels/:channelId/runOnce`

2. **Backend:**
   - Проверяет `callBackUrl` (должен быть настроен через ENV)
   - Вызывает `sunoClient.generate()` с обязательным `callBackUrl`
   - Получает `taskId` от Suno
   - Возвращает 202 PROCESSING с `taskId`

3. **Suno API:**
   - Генерирует музыку
   - Вызывает callback `POST /api/webhooks/suno/music` с результатом

4. **Backend (callback):**
   - Получает callback от Suno
   - Сохраняет статус и данные в Firestore
   - Возвращает 200 {status:"received"}

5. **Клиент (опционально):**
   - Может использовать polling `GET /api/music-clips/tasks/:taskId` для проверки статуса
   - Или полагаться на callback (данные уже в БД)

---

## Важные замечания

1. **PUBLIC_BASE_URL должен быть публичным HTTPS URL** - Suno должен иметь возможность достучаться до вашего сервера
2. **Не используйте localhost** - Suno не сможет достучаться до localhost
3. **Callback endpoint должен быть доступен без авторизации** - Suno не передает токены
4. **Всегда возвращаем 200 в callback** - даже при ошибках, чтобы Suno не повторял запрос

