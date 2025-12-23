# Отладка Blotato API Key и CORS

## Проблема

Blotato API key задан в UI (account settings и channel settings), но система его "не читает", из-за чего Blotato upload падает 401 Unauthorized. В браузере DevTools видно:
- blocked by CORS policy
- No 'Access-Control-Allow-Origin' header
- Failed to fetch

## Решение

### 1. CORS исправлен

**Файл:** `backend/src/index.ts`

**Изменения:**
- Добавлены разрешенные origins: `https://shortsai.ru`, `https://www.shortsai.ru`, localhost для dev
- Расширены allowedHeaders: `Authorization`, `Content-Type`, `X-Requested-With`, `Accept`, `Origin`, и другие
- Добавлены exposedHeaders для диагностики

### 2. Получение Blotato API Key с приоритетом

**Файл:** `backend/src/utils/blottataApiKey.ts` (новый)

**Приоритет:**
1. `channel.blotataApiKey` (channel override)
2. `account default` (user-settings/defaultBlottataApiKeyEncrypted)
3. `process.env.BLOTATA_API_KEY` (env fallback)

**Функции:**
- `getBlottataApiKey(channel, userId)` - получает ключ с логированием источника
- `requireBlottataApiKey(channel, userId)` - fail-fast проверка перед запросами к Blotato

### 3. Обновлены сервисы

**Файлы:**
- `backend/src/services/blottataPublisherService.ts` - использует новую функцию получения ключа
- `backend/src/services/blottataLocalFileProcessor.ts` - передает userId в publisher
- `backend/src/services/blottataFileProcessor.ts` - передает userId в publisher

## Проверка (PowerShell)

### 1. Проверка CORS

```powershell
# Проверка preflight OPTIONS запроса
$headers = @{
    "Origin" = "https://shortsai.ru"
    "Access-Control-Request-Method" = "GET"
    "Access-Control-Request-Headers" = "Authorization,Content-Type"
}
Invoke-WebRequest -Uri "https://api.hotwell.synology.me/api/user-settings" -Method OPTIONS -Headers $headers

# Проверка GET запроса (нужен токен)
$token = "YOUR_FIREBASE_TOKEN"
$headers = @{
    "Origin" = "https://shortsai.ru"
    "Authorization" = "Bearer $token"
}
Invoke-WebRequest -Uri "https://api.hotwell.synology.me/api/user-settings" -Method GET -Headers $headers
```

**Ожидаемый результат:**
- OPTIONS: статус 204, заголовки `Access-Control-Allow-Origin: https://shortsai.ru`
- GET: статус 200, JSON с настройками

### 2. Проверка получения Blotato API Key

**В логах backend ищите:**
```
[BLOTTATA_API_KEY] Using channel override
[BLOTTATA_API_KEY] Using account default
[BLOTTATA_API_KEY] Using env fallback
[BLOTTATA_API_KEY] API key not found
```

**Проверка через скрипт (Node.js):**

```typescript
// backend/scripts/check-blottata-key.ts
import { getBlottataApiKey } from "../src/utils/blottataApiKey";
import { Channel } from "../src/types/channel";

async function checkKey() {
  const channel: Channel = {
    id: "test-channel-id",
    name: "Test Channel",
    platform: "youtube",
    language: "ru",
    targetDurationSec: 60,
    niche: "test",
    audience: "test",
    tone: "test",
    blockedTopics: "test"
  };
  
  const userId = "test-user-id";
  const result = await getBlottataApiKey(channel, userId);
  
  if (result) {
    console.log(`✅ Key found from: ${result.source}`);
    console.log(`   Masked: ${result.apiKey.substring(0, 4)}...${result.apiKey.substring(result.apiKey.length - 4)}`);
  } else {
    console.log("❌ Key not found");
  }
}

checkKey();
```

### 3. Проверка автопубликации

**В логах backend ищите:**
```
BlottataPublisherService: Publishing to YouTube
BlottataPublisherService: Published to YouTube successfully
```

**При ошибке 401:**
```
BlottataPublisherService: Failed to publish to YouTube
  status: 401
  apiKeySource: "channel" | "account" | "env"
  data: { message: "..." }
```

## Диагностика проблем

### Проблема: CORS ошибки в браузере

**Причина:** Backend не разрешает origin `https://shortsai.ru`

**Решение:**
1. Проверьте `FRONTEND_ORIGIN` в env backend
2. Проверьте, что `https://shortsai.ru` и `https://www.shortsai.ru` в списке allowedOrigins
3. Проверьте, что reverse proxy на Synology не удаляет CORS заголовки

### Проблема: 401 Unauthorized от Blotato

**Причина:** API key не найден или неверный

**Диагностика:**
1. Проверьте логи: `[BLOTTATA_API_KEY] API key not found`
2. Проверьте источник ключа: `apiKeySource: "channel" | "account" | "env"`
3. Проверьте, что ключ реально сохранен в Firestore:
   - Account: `users/{userId}/settings/account` -> `defaultBlottataApiKeyEncrypted`
   - Channel: `channels/{channelId}` -> `blotataApiKey`

**Решение:**
1. Убедитесь, что ключ сохранен в UI (account settings или channel settings)
2. Проверьте, что ключ расшифровывается (логи: `Failed to decrypt defaultBlottataApiKey`)
3. Проверьте, что `userId` передается в `publishToAllPlatforms`

### Проблема: Ключ есть в UI, но backend его не читает

**Причина:** CORS блокирует запросы, UI не может прочитать настройки

**Диагностика:**
1. Откройте DevTools -> Network
2. Проверьте запросы к `/api/user-settings`:
   - Статус должен быть 200
   - Не должно быть CORS ошибок
   - В ответе должно быть `hasDefaultBlottataApiKey: true`

**Решение:**
1. Исправьте CORS (см. выше)
2. Перезапустите backend
3. Проверьте, что ключ реально сохранен в Firestore

## Команды для проверки на Synology

```powershell
# SSH подключение
ssh shortsai

# Проверка логов backend
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker-compose logs -f shorts-backend | grep -i "blottata\|cors"

# Перезапуск backend (если нужно)
sudo /usr/local/bin/docker-compose restart shorts-backend

# Проверка env переменных
sudo /usr/local/bin/docker-compose exec shorts-backend env | grep -i "frontend_origin\|blotata"
```

## Измененные файлы

1. `backend/src/index.ts` - исправлен CORS
2. `backend/src/utils/blottataApiKey.ts` - новый файл, функция получения ключа
3. `backend/src/services/blottataPublisherService.ts` - использует новую функцию
4. `backend/src/services/blottataLocalFileProcessor.ts` - передает userId
5. `backend/src/services/blottataFileProcessor.ts` - передает userId

## Тест-план

1. **В браузере:**
   - Откройте `https://shortsai.ru/settings`
   - Проверьте, что нет CORS ошибок в DevTools
   - Проверьте, что user-settings загружаются (Network 200)

2. **Автопубликация:**
   - Запустите автопубликацию тестового видео
   - Проверьте логи: должен быть выбор ключа (channel/account/env)
   - Проверьте, что Blotato upload проходит без 401

3. **При ошибке 401:**
   - Проверьте логи: `apiKeySource`, `status`, `data`
   - Проверьте, что ключ реально существует в Firestore
   - Проверьте, что ключ расшифровывается


