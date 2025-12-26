# Отчёт об исправлении ошибки 404 Suno API

## Проблема

При вызове `POST /api/music-clips/channels/:channelId/runOnce` backend возвращал 500 с ошибкой:
```
"Suno API error: Request failed with status code 404"
```

## Причина

1. **Неверный baseURL**: По умолчанию использовался `https://api.suno.ai` вместо `https://api.sunoapi.org`
2. **Неверный endpoint**: Использовался `/v1/generate` вместо `/api/v1/generate`
3. **Неправильная обработка ошибок**: 404 от Suno возвращался как 500 (Internal Server Error)
4. **Недостаточное логирование**: Не было информации о финальном URL и response body

## Решение

Исправлены baseURL, endpoint и обработка ошибок согласно документации sunoapi.org.

## Изменённые файлы

### 1. `backend/src/services/sunoClient.ts`
**Что было:**
- baseURL по умолчанию: `https://api.suno.ai`
- Endpoint: `/v1/generate`
- Логирование без префикса `[MusicClips][Suno]`
- 404 обрабатывался как общая ошибка клиента

**Что стало:**
- ✅ baseURL по умолчанию: `https://api.sunoapi.org`
- ✅ Endpoint: `/api/v1/generate`
- ✅ Логирование с префиксом `[MusicClips][Suno]`
- ✅ Специальная обработка 404 с кодом `SUNO_ENDPOINT_NOT_FOUND`
- ✅ Подробное логирование: финальный URL, method, status, response body (до 4KB)
- ✅ Обработка 401/403 как `SUNO_AUTH_ERROR`
- ✅ Улучшенный метод `ping()` с логированием

### 2. `backend/src/routes/musicClipsRoutes.ts`
**Что было:**
- Все ошибки Suno возвращали 500

**Что стало:**
- ✅ `SUNO_ENDPOINT_NOT_FOUND` → 502 с понятным сообщением
- ✅ `SUNO_AUTH_ERROR` → 502 с сообщением о проверке ключа
- ✅ Остальные ошибки Suno → 502 (Bad Gateway), не 500

### 3. `backend/env.example`
**Что было:**
- `SUNO_API_BASE_URL=https://api.suno.ai`

**Что стало:**
- ✅ `SUNO_API_BASE_URL=https://api.sunoapi.org`

### 4. `backend/MUSIC_CLIPS_SETUP.md`
**Что было:**
- Упоминание `https://suno.ai`

**Что стало:**
- ✅ Упоминание `https://sunoapi.org` и правильного baseURL

## Используемый endpoint

**До исправления:**
- BaseURL: `https://api.suno.ai`
- Endpoint: `/v1/generate`
- Финальный URL: `https://api.suno.ai/v1/generate` ❌ (404)

**После исправления:**
- BaseURL: `https://api.sunoapi.org` (или из env `SUNO_API_BASE_URL`)
- Endpoint: `/api/v1/generate`
- Финальный URL: `https://api.sunoapi.org/api/v1/generate` ✅

## Обработка ошибок

### 404 - Endpoint Not Found
```json
{
  "success": false,
  "error": "SUNO_ENDPOINT_NOT_FOUND",
  "message": "Неверный endpoint Suno (проверь SUNO_API_BASE_URL и пути)",
  "code": "SUNO_ENDPOINT_NOT_FOUND",
  "status": 404
}
```
Статус: 502 (Bad Gateway)

### 401/403 - Authentication Error
```json
{
  "success": false,
  "error": "SUNO_AUTH_ERROR",
  "message": "Suno API authentication failed. Check SUNO_API_KEY.",
  "status": 401
}
```
Статус: 502 (Bad Gateway)

## Логирование

Все логи Suno теперь помечены префиксом `[MusicClips][Suno]` и включают:
- Финальный URL запроса
- Method (POST/GET)
- Status code
- Response body (до 4KB)
- Безопасные заголовки (без Authorization)

**Пример лога при 404:**
```
[MusicClips][Suno] Failed to create track (attempt 1/6)
{
  "error": "Request failed with status code 404",
  "status": 404,
  "statusText": "Not Found",
  "finalUrl": "https://api.sunoapi.org/api/v1/generate",
  "method": "POST",
  "responseBody": "{...}",
  "baseURL": "https://api.sunoapi.org",
  "endpoint": "/api/v1/generate"
}
```

## Команды PowerShell для проверки

### Локальная разработка

```powershell
# Установить переменные окружения
$env:SUNO_API_KEY="your_key_here"
$env:SUNO_API_BASE_URL="https://api.sunoapi.org"

# Запустить dev сервер
cd backend
npm run dev

# Проверить диагностику
curl.exe http://localhost:8080/api/music-clips/diagnostics/suno

# Запустить Music Clips
$body = @{ userId = "user123" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "x-user-id" = "user123"
  } `
  -Body $body
```

### Docker

```powershell
# Добавить в .env.production
SUNO_API_KEY=your_key_here
SUNO_API_BASE_URL=https://api.sunoapi.org

# Пересобрать и запустить
docker-compose up -d --build

# Проверить логи
docker-compose logs backend | Select-String "\[MusicClips\]\[Suno\]"
```

### Тестовый вызов через curl

```powershell
$body = @{ userId = "user123" } | ConvertTo-Json
curl.exe -i -X POST "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
  -H "Content-Type: application/json" `
  -H "x-user-id: user123" `
  -d $body
```

## Результат

✅ **404 ошибка исправлена:**
- Правильный baseURL: `https://api.sunoapi.org`
- Правильный endpoint: `/api/v1/generate`
- Правильная обработка 404 → 502 с кодом `SUNO_ENDPOINT_NOT_FOUND`

✅ **Улучшенная диагностика:**
- Подробное логирование с финальным URL
- Response body в логах (до 4KB)
- Префикс `[MusicClips][Suno]` для всех логов

✅ **Правильные статусы:**
- Ошибки Suno → 502 (Bad Gateway), не 500
- 404 → понятное сообщение о проверке baseURL/endpoint
- 401/403 → сообщение о проверке ключа

Теперь система корректно обрабатывает ошибки Suno API и предоставляет понятные сообщения для диагностики.

