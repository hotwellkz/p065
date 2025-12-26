# Отчёт о загрузке исправлений 503 Suno API на Synology

## ✅ Файлы загружены

Все изменённые файлы успешно загружены на сервер `/volume1/docker/shortsai/backend/`:

1. ✅ `src/services/sunoClient.ts` (14K) - retry логика, подробное логирование, метод ping()
2. ✅ `src/services/sunoQueue.ts` (2.7K) - **новый файл**, очередь для троттлинга
3. ✅ `src/services/musicClipsPipeline.ts` (17K) - использование очереди, таймаут пайплайна
4. ✅ `src/routes/musicClipsRoutes.ts` (11K) - правильная обработка ошибок, диагностический endpoint
5. ✅ `env.example` (8.0K) - добавлены новые переменные окружения
6. ✅ `MUSIC_CLIPS_SETUP.md` (11K) - обновлена документация
7. ✅ `SUNO_503_FIX_REPORT.md` (7.4K) - новый файл с отчётом

## Проверка загруженных файлов

Изменения подтверждены:
- ✅ Метод `isConfigured()` найден в `sunoClient.ts`
- ✅ Код ошибки `SUNO_UNAVAILABLE` найден
- ✅ Очередь `sunoQueue` найдена

## Следующие шаги

### 1. Установить новые переменные окружения в .env.production

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && nano .env.production"
```

Добавьте (если ещё не добавлены):
```env
# Suno API
SUNO_API_KEY=your_suno_api_key_here
SUNO_API_BASE_URL=https://api.suno.ai
SUNO_REQUEST_TIMEOUT_MS=90000

# Троттлинг Suno
MUSIC_CLIPS_SUNO_CONCURRENCY=1
MUSIC_CLIPS_SUNO_DELAY_MS=1500

# Таймаут пайплайна
MUSIC_CLIPS_PIPELINE_TIMEOUT_MS=1800000
```

Или через PowerShell:
```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_SUNO_CONCURRENCY' .env.production || echo 'MUSIC_CLIPS_SUNO_CONCURRENCY=1' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_SUNO_DELAY_MS' .env.production || echo 'MUSIC_CLIPS_SUNO_DELAY_MS=1500' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'SUNO_REQUEST_TIMEOUT_MS' .env.production || echo 'SUNO_REQUEST_TIMEOUT_MS=90000' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_PIPELINE_TIMEOUT_MS' .env.production || echo 'MUSIC_CLIPS_PIPELINE_TIMEOUT_MS=1800000' >> .env.production"
```

### 2. Пересобрать и перезапустить контейнер

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose build --no-cache backend"
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose up -d backend"
```

### 3. Проверить логи

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -i 'Suno\|MusicClips\|SUNO_API_KEY\|retry\|queue'"
```

**Ожидаемый результат:**
- `[SunoClient] Initialized` с параметрами timeout
- `[SunoQueue] Initialized` с параметрами concurrency и delay
- При ошибках: подробные логи с status, statusText, headers (без ключей)

### 4. Проверить диагностический endpoint

```powershell
curl.exe https://api.shortsai.ru/api/music-clips/diagnostics/suno
```

**Ожидаемый ответ (если ключ установлен и API доступен):**
```json
{
  "ok": true,
  "suno": {
    "configured": true,
    "available": true,
    "latency": 245,
    "status": 200
  },
  "timestamp": "2024-12-26T00:00:00.000Z"
}
```

### 5. Протестировать runOnce endpoint

```powershell
$body = @{ userId = "your-user-id" } | ConvertTo-Json
curl.exe -i -X POST "https://api.shortsai.ru/api/music-clips/channels/your-channel-id/runOnce" `
  -H "Content-Type: application/json" `
  -H "x-user-id: your-user-id" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -d $body
```

**Если Suno вернёт 503:**
- Система автоматически сделает до 5 retry с exponential backoff
- Если все попытки исчерпаны, вернётся 503 (не 500!) с JSON:
```json
{
  "success": false,
  "error": "SUNO_UNAVAILABLE",
  "message": "Suno is temporarily unavailable. Try later.",
  "retryAfterSec": 30
}
```

## Команды PowerShell для полного деплоя

```powershell
# 1. Проверить, что файлы загружены
ssh shortsai "cd /volume1/docker/shortsai/backend && ls -lh src/services/sunoClient.ts src/services/sunoQueue.ts"

# 2. Установить переменные окружения (если ещё не установлены)
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_SUNO_CONCURRENCY' .env.production || echo 'MUSIC_CLIPS_SUNO_CONCURRENCY=1' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_SUNO_DELAY_MS' .env.production || echo 'MUSIC_CLIPS_SUNO_DELAY_MS=1500' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'SUNO_REQUEST_TIMEOUT_MS' .env.production || echo 'SUNO_REQUEST_TIMEOUT_MS=90000' >> .env.production"
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -q 'MUSIC_CLIPS_PIPELINE_TIMEOUT_MS' .env.production || echo 'MUSIC_CLIPS_PIPELINE_TIMEOUT_MS=1800000' >> .env.production"

# 3. Пересобрать контейнер
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose build --no-cache backend"

# 4. Перезапустить контейнер
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose up -d backend"

# 5. Проверить логи
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=30 backend"

# 6. Проверить диагностику
curl.exe https://api.shortsai.ru/api/music-clips/diagnostics/suno
```

## Что изменилось

### До исправления:
- ❌ 503 от Suno → 500 Internal Server Error
- ❌ Нет retry логики
- ❌ Нет троттлинга (могли быть параллельные запросы)
- ❌ Минимальное логирование ошибок

### После исправления:
- ✅ 503 от Suno → 503 Service Unavailable (после 5 retry)
- ✅ Автоматический retry с exponential backoff
- ✅ Троттлинг (1 параллельный запрос, задержка 1.5s)
- ✅ Подробное логирование (status, headers, data, но БЕЗ ключей)
- ✅ Диагностический endpoint для проверки доступности

## Статус

✅ Все файлы загружены на сервер  
⏳ Требуется установить новые переменные окружения в `.env.production`  
⏳ Требуется пересобрать и перезапустить контейнер  
⏳ Требуется проверить диагностику и логи после перезапуска

