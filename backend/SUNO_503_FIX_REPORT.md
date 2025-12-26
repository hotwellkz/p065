# Отчёт об исправлении ошибок 503 Suno API

## Проблема

При нажатии "Запустить Music Clips" запрос `POST /api/music-clips/channels/:channelId/runOnce` возвращал 500 с ошибкой:
```
"Suno API error: Request failed with status code 503"
```

## Причина

1. **Отсутствие retry логики**: При получении 503 от Suno API система сразу возвращала ошибку без повторных попыток
2. **Неправильная обработка ошибок**: 503 от внешнего API возвращался как 500 (Internal Server Error)
3. **Отсутствие троттлинга**: Не было ограничения на параллельные запросы к Suno, что могло приводить к rate limiting
4. **Недостаточное логирование**: Не было подробной информации об ошибках для диагностики

## Решение

Реализована устойчивая интеграция с Suno API с retry, троттлингом и правильной обработкой ошибок.

## Изменённые файлы

### 1. `backend/src/services/sunoClient.ts`
**Что было:**
- Простой try-catch без retry
- Минимальное логирование ошибок
- Фиксированный таймаут 300 секунд

**Что стало:**
- ✅ Retry с exponential backoff + jitter (5 попыток, базовая задержка 1s, максимум 30s)
- ✅ Подробное логирование ошибок (status, statusText, response.data, headers, но БЕЗ ключей)
- ✅ Настраиваемый таймаут через `SUNO_REQUEST_TIMEOUT_MS` (по умолчанию 90s)
- ✅ Правильная обработка 503/502/504/429 с учётом `Retry-After` заголовка
- ✅ Коды ошибок: `SUNO_UNAVAILABLE`, `SUNO_RATE_LIMITED`, `SUNO_CLIENT_ERROR`
- ✅ Метод `ping()` для диагностики доступности API

### 2. `backend/src/services/sunoQueue.ts` (новый)
**Что добавлено:**
- ✅ Очередь для ограничения concurrency запросов к Suno
- ✅ Настраиваемые параметры: `MUSIC_CLIPS_SUNO_CONCURRENCY` (по умолчанию 1) и `MUSIC_CLIPS_SUNO_DELAY_MS` (по умолчанию 1500ms)
- ✅ Предотвращение перегрузки API и rate limiting

### 3. `backend/src/services/musicClipsPipeline.ts`
**Что было:**
- Прямой вызов `sunoClient.createTrack()` без очереди

**Что стало:**
- ✅ Использование очереди для ограничения concurrency
- ✅ Общий таймаут пайплайна через `MUSIC_CLIPS_PIPELINE_TIMEOUT_MS` (по умолчанию 30 минут)

### 4. `backend/src/routes/musicClipsRoutes.ts`
**Что было:**
- Все ошибки возвращали 500

**Что стало:**
- ✅ Правильная обработка ошибок Suno:
  - `SUNO_UNAVAILABLE` → 503 с `retryAfterSec`
  - `SUNO_RATE_LIMITED` → 429 с `retryAfterSec`
  - `SUNO_API_KEY_NOT_CONFIGURED` → 503
- ✅ Добавлен диагностический endpoint `GET /api/music-clips/diagnostics/suno`

### 5. `backend/env.example`
**Что добавлено:**
- `SUNO_REQUEST_TIMEOUT_MS=90000`
- `MUSIC_CLIPS_SUNO_CONCURRENCY=1`
- `MUSIC_CLIPS_SUNO_DELAY_MS=1500`
- `MUSIC_CLIPS_PIPELINE_TIMEOUT_MS=1800000`

### 6. `backend/MUSIC_CLIPS_SETUP.md`
**Что добавлено:**
- Описание новых переменных окружения
- Документация диагностического endpoint
- Описание обработки ошибок 503/429

## Как теперь работает система

### Retry логика

1. **При получении 503/502/504/429:**
   - Система автоматически делает до 5 попыток
   - Задержка между попытками: exponential backoff + jitter
   - Базовая задержка: 1 секунда
   - Максимальная задержка: 30 секунд
   - Если Suno вернул `Retry-After` заголовок, используется он (но не больше 30s)

2. **При получении 4xx (кроме 429):**
   - Retry НЕ делается (ошибка клиента)

3. **При сетевых ошибках:**
   - Делается retry (до 5 попыток)

### Троттлинг

- По умолчанию: только 1 параллельный запрос к Suno
- Задержка между запросами: 1.5 секунды
- Настраивается через env переменные

### Обработка ошибок

**503 от Suno после всех retry:**
```json
{
  "success": false,
  "error": "SUNO_UNAVAILABLE",
  "message": "Suno is temporarily unavailable. Try later.",
  "retryAfterSec": 30
}
```
Статус: 503 (не 500!)

**429 от Suno:**
```json
{
  "success": false,
  "error": "SUNO_RATE_LIMITED",
  "message": "Suno rate limit exceeded. Try later.",
  "retryAfterSec": 60
}
```
Статус: 429

## Команды PowerShell для проверки

### Локальная разработка

```powershell
# Установить переменные окружения
$env:SUNO_API_KEY="your_key_here"
$env:MUSIC_CLIPS_SUNO_CONCURRENCY="1"
$env:MUSIC_CLIPS_SUNO_DELAY_MS="1500"

# Запустить dev сервер
cd backend
npm run dev

# Проверить диагностику Suno
curl.exe http://localhost:8080/api/music-clips/diagnostics/suno

# Запустить Music Clips
$body = @{ userId = "user123" } | ConvertTo-Json
curl.exe -i -X POST "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
  -H "Content-Type: application/json" `
  -H "x-user-id: user123" `
  -d $body
```

### Docker

```powershell
# Добавить в .env.production
SUNO_API_KEY=your_key_here
MUSIC_CLIPS_SUNO_CONCURRENCY=1
MUSIC_CLIPS_SUNO_DELAY_MS=1500

# Пересобрать и запустить
docker-compose up -d --build

# Проверить диагностику
curl.exe http://localhost:8080/api/music-clips/diagnostics/suno
```

## Результат

✅ **503 от Suno обрабатывается корректно:**
- Автоматический retry (до 5 попыток)
- Правильный статус ответа (503 вместо 500)
- Понятное сообщение с `retryAfterSec`

✅ **Троттлинг предотвращает rate limiting:**
- Ограничение параллельных запросов
- Задержка между запросами

✅ **Улучшенная диагностика:**
- Подробное логирование ошибок (без ключей)
- Диагностический endpoint для проверки доступности

✅ **Настраиваемые параметры:**
- Таймауты
- Concurrency
- Задержки

Теперь система устойчива к временным сбоям Suno API и правильно обрабатывает ошибки.

