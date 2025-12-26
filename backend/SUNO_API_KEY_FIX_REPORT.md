# Отчёт об исправлении ошибки SUNO_API_KEY

## Проблема

При нажатии "Запустить Music Clips" запрос `POST /api/music-clips/channels/:channelId/runOnce` возвращал 500 с ошибкой:
```
Error: SUNO_API_KEY is not configured
```

## Решение

Реализована полная валидация конфигурации Suno API с понятными сообщениями об ошибках и health check endpoint.

## Изменённые файлы

### 1. `backend/src/services/sunoClient.ts`
**Что было:**
- Ошибка выбрасывалась только при вызове `createTrack()` без кода ошибки
- Не было метода для проверки конфигурации

**Что стало:**
- Добавлен метод `isConfigured()` для проверки наличия API ключа
- Ошибка при отсутствии ключа теперь имеет код `SUNO_API_KEY_NOT_CONFIGURED`

### 2. `backend/src/routes/musicClipsRoutes.ts`
**Что было:**
- Ошибка конфигурации Suno возвращала 500 (Internal Server Error)
- Не было явной проверки перед запуском пайплайна

**Что стало:**
- Добавлена проверка `sunoClient.isConfigured()` перед запуском пайплайна
- При отсутствии ключа возвращается 503 (Service Unavailable) с понятным JSON:
  ```json
  {
    "success": false,
    "error": "SUNO_API_KEY_NOT_CONFIGURED",
    "message": "Set SUNO_API_KEY in environment"
  }
  ```
- Добавлен специальный обработчик для ошибок конфигурации Suno в catch блоке
- Добавлен health check endpoint `GET /api/music-clips/health`

### 3. `backend/src/index.ts`
**Что было:**
- Не было валидации конфигурации Music Clips при старте

**Что стало:**
- Добавлена валидация `SUNO_API_KEY` при старте приложения
- В логах появляется предупреждение, если ключ не задан
- Добавлен импорт `getSunoClient` для валидации

### 4. `backend/docker-compose.yml`
**Что было:**
- Переменные `SUNO_API_KEY` и `SUNO_API_BASE_URL` не передавались в контейнер

**Что стало:**
- Добавлены переменные окружения:
  ```yaml
  environment:
    - SUNO_API_KEY=${SUNO_API_KEY:-}
    - SUNO_API_BASE_URL=${SUNO_API_BASE_URL:-https://api.suno.ai}
  ```

### 5. `backend/env.example`
**Что было:**
- Не было примеров переменных для Suno API

**Что стало:**
- Добавлен раздел "Music Clips (Suno API)" с описанием:
  ```env
  SUNO_API_KEY=your_suno_api_key_here
  SUNO_API_BASE_URL=https://api.suno.ai
  ```

### 6. `backend/MUSIC_CLIPS_SETUP.md`
**Что было:**
- Не было информации о валидации и health check

**Что стало:**
- Добавлен раздел "Валидация конфигурации" с описанием поведения при отсутствии ключа
- Добавлен раздел "Health Check" с примерами ответов
- Обновлены команды PowerShell с указанием необходимости установки `SUNO_API_KEY`

## Новый функционал

### Health Check Endpoint

**GET `/api/music-clips/health`**

Проверяет конфигурацию Music Clips и возвращает статус.

**Ответ при правильной конфигурации (200):**
```json
{
  "ok": true,
  "suno": {
    "configured": true,
    "reason": null
  },
  "storage": {
    "root": "/app/storage/music_clips",
    "available": true
  },
  "timestamp": "2024-12-25T23:00:00.000Z"
}
```

**Ответ при отсутствии ключа (503):**
```json
{
  "ok": false,
  "suno": {
    "configured": false,
    "reason": "SUNO_API_KEY is not set in environment"
  },
  "storage": {
    "root": "/app/storage/music_clips",
    "available": true
  },
  "timestamp": "2024-12-25T23:00:00.000Z"
}
```

## Команды PowerShell для проверки

### Локальная разработка

```powershell
# Установить SUNO_API_KEY
$env:SUNO_API_KEY="your_suno_api_key_here"

# Запустить dev сервер
cd backend
npm run dev

# Проверить health check
curl.exe http://localhost:8080/api/music-clips/health

# Запустить Music Clips для канала
$body = @{ userId = "user123" } | ConvertTo-Json
curl.exe -i -X POST "http://localhost:8080/api/music-clips/channels/channel123/runOnce" `
  -H "Content-Type: application/json" `
  -H "x-user-id: user123" `
  -d $body
```

### Docker

```powershell
# Установить SUNO_API_KEY (или добавить в .env.production)
$env:SUNO_API_KEY="your_suno_api_key_here"

# Собрать и запустить
cd backend
docker-compose up -d --build

# Проверить health check
curl.exe http://localhost:8080/api/music-clips/health

# Проверить логи
docker-compose logs backend | Select-String "Suno\|MusicClips"
```

### Проверка на сервере (Synology)

```powershell
# Проверить health check
curl.exe https://api.shortsai.ru/api/music-clips/health

# Проверить, что ключ установлен (в логах не должно быть предупреждений)
ssh shortsai "cd /volume1/docker/shortsai/backend && docker compose logs backend | grep -i 'SUNO_API_KEY\|Music Clips configuration'"
```

## Безопасность

✅ **Ключ не логируется:**
- В логах проверяется только наличие ключа (`hasApiKey: true/false`), но не сам ключ
- В ошибках не выводится значение ключа

✅ **Ключ не хардкодится:**
- Все значения берутся из переменных окружения
- В коде нет захардкоженных ключей

## Результат

- ✅ Ошибка 500 заменена на 503 с понятным сообщением
- ✅ Добавлена валидация при старте приложения
- ✅ Добавлен health check endpoint
- ✅ Обновлена документация
- ✅ Обновлён docker-compose.yml
- ✅ Обновлён env.example

Теперь при отсутствии `SUNO_API_KEY` пользователь получает понятное сообщение об ошибке вместо внутренней ошибки сервера.

