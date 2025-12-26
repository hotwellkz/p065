# Исправление CORS: добавление заголовка x-user-id

## Проблема

При вызове `POST /api/music-clips/channels/:channelId/runOnce` браузер блокировал запрос с ошибкой:

```
CORS error: Request header field x-user-id is not allowed by Access-Control-Allow-Headers in preflight response
```

**Причина**: Заголовок `x-user-id` не был добавлен в список разрешённых заголовков (`allowedHeaders`) в CORS конфигурации.

## Решение

### 1. Добавлен x-user-id в allowedHeaders

**Файл**: `backend/src/index.ts` (строки 131-141)

**Изменения**:
```typescript
allowedHeaders: [
  "Authorization",
  "Content-Type",
  "X-Requested-With",
  "Accept",
  "Origin",
  "Access-Control-Request-Method",
  "Access-Control-Request-Headers",
  "x-user-id",        // ← Добавлено
  "x-request-id"     // ← Добавлено для полноты
],
```

### 2. Проверка обработки OPTIONS

CORS middleware (`cors` пакет) автоматически обрабатывает OPTIONS preflight запросы. Не требуется явный обработчик `app.options()`.

**Порядок обработки**:
1. CORS middleware обрабатывает OPTIONS запросы автоматически
2. Возвращает правильные CORS заголовки в preflight ответе
3. Разрешает последующий POST/PUT/DELETE запрос

## Изменённые файлы

1. **backend/src/index.ts**
   - Добавлен `"x-user-id"` в `allowedHeaders` (строка 139)
   - Добавлен `"x-request-id"` в `allowedHeaders` (строка 140)

## Команды PowerShell для проверки

### Локальная проверка (если backend запущен локально)

```powershell
# Проверка OPTIONS preflight запроса
curl.exe -i -X OPTIONS "http://localhost:8080/api/music-clips/channels/test123/runOnce" `
  -H "Origin: https://shortsai.ru" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: x-user-id,content-type,authorization"

# Ожидаемый ответ:
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: https://shortsai.ru
# Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
# Access-Control-Allow-Headers: Authorization,Content-Type,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers,x-user-id,x-request-id
# Access-Control-Allow-Credentials: true
# Access-Control-Max-Age: 86400
```

### Проверка на production (api.shortsai.ru)

```powershell
# Проверка OPTIONS preflight запроса
curl.exe -i -X OPTIONS "https://api.shortsai.ru/api/music-clips/channels/test123/runOnce" `
  -H "Origin: https://shortsai.ru" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: x-user-id,content-type,authorization"

# Ожидаемый ответ должен содержать:
# Access-Control-Allow-Headers: ... x-user-id ...
```

### Проверка полного POST запроса (после исправления)

```powershell
# Тестовый POST запрос (нужен валидный токен и channelId)
$headers = @{
    "Authorization" = "Bearer YOUR_JWT_TOKEN"
    "Content-Type" = "application/json"
    "x-user-id" = "test-user-id"
    "Origin" = "https://shortsai.ru"
}

$body = @{
    userId = "test-user-id"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://api.shortsai.ru/api/music-clips/channels/test-channel-id/runOnce" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

## Ожидаемые заголовки в ответе OPTIONS

При успешном preflight запросе должны быть следующие заголовки:

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://shortsai.ru
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type,X-Requested-With,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers,x-user-id,x-request-id
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

**Ключевой момент**: В `Access-Control-Allow-Headers` должно быть `x-user-id`.

## Проверка на reverse proxy

Если используется reverse proxy (nginx, Synology Reverse Proxy, Cloudflare), убедитесь, что:

1. **OPTIONS запросы не блокируются** на уровне прокси
2. **CORS заголовки не перезаписываются** прокси (backend должен обрабатывать CORS)
3. **Заголовки передаются** от backend к клиенту

### Проверка через прокси

```powershell
# Если используется прокси (например, api.hotwell.synology.me)
curl.exe -i -X OPTIONS "https://api.hotwell.synology.me/api/music-clips/channels/test123/runOnce" `
  -H "Origin: https://shortsai.ru" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: x-user-id,content-type"
```

## Технические детали

### Почему x-user-id не был разрешён

1. **CORS preflight**: Браузер отправляет OPTIONS запрос перед POST, если:
   - Метод не GET/HEAD/POST (но POST с кастомными заголовками тоже требует preflight)
   - Есть кастомные заголовки (например, `x-user-id`)

2. **Проверка заголовков**: В preflight запросе браузер указывает `Access-Control-Request-Headers: x-user-id`, и сервер должен ответить `Access-Control-Allow-Headers: ..., x-user-id, ...`

3. **Блокировка**: Если заголовок не в списке разрешённых, браузер блокирует основной запрос

### Решение

- Добавлен `x-user-id` в `allowedHeaders` CORS middleware
- CORS middleware автоматически обрабатывает OPTIONS и возвращает правильные заголовки
- Все последующие POST/PUT/DELETE запросы с `x-user-id` будут разрешены

## Результат

✅ Заголовок `x-user-id` разрешён в CORS
✅ OPTIONS preflight запросы обрабатываются корректно
✅ POST запросы к `/api/music-clips/channels/:channelId/runOnce` не блокируются браузером
✅ Заголовок `x-request-id` также добавлен для полноты

