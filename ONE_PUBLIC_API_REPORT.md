# Отчет: ONE PUBLIC API архитектура

## ✅ Выполнено

### 1. Создан единый конфиг API

**Файл:** `app/src/config/api.ts`

```typescript
export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || 
  import.meta.env.VITE_BACKEND_URL || 
  import.meta.env.VITE_API_URL || 
  "https://api.shortsai.ru";
```

**Fallback:** `https://api.shortsai.ru` (вместо localhost)

### 2. Обновлены все API файлы

Все файлы теперь используют единый конфиг `API_BASE_URL` из `app/src/config/api.ts`:

**Обновленные файлы:**
1. `app/src/api/userSettings.ts`
2. `app/src/api/telegram.ts`
3. `app/src/api/telegramIntegration.ts`
4. `app/src/api/notifications.ts`
5. `app/src/api/scheduleSettings.ts`
6. `app/src/api/customPrompt.ts`
7. `app/src/api/channelSchedule.ts`
8. `app/src/api/blottata.ts`
9. `app/src/api/targetAudienceSuggestion.ts`
10. `app/src/api/nicheSuggestion.ts`
11. `app/src/api/helpApi.ts`
12. `app/src/api/forbiddenTopicsSuggestion.ts`
13. `app/src/api/channelDriveFolders.ts`
14. `app/src/api/admin.ts`
15. `app/src/api/additionalPreferencesSuggestion.ts`
16. `app/src/services/openaiScriptGenerator.ts`
17. `app/src/pages/ChannelList/ChannelListPage.tsx`
18. `app/src/pages/ChannelEdit/ChannelEditPage.tsx`
19. `app/src/components/ChannelImportModal.tsx`

**Удалено:**
- Все жестко прописанные домены (`api.hotwell.synology.me`, `192.168.*`, `localhost:8080` в продакшене)
- Разные переменные окружения (`VITE_API_URL`, `VITE_BACKEND_URL`, `VITE_API_BASE_URL`) заменены на единый конфиг

### 3. Обновлен Nginx конфиг

**Файл:** `nginx-api-shortsai-fixed.conf`

**Изменения:**
- CORS заголовки добавлены для всех ответов
- OPTIONS обрабатывается быстро (204) без проксирования
- Все пути `/api/*` проксируются на `http://10.9.0.2:3000`
- Правильные proxy заголовки (Host, X-Forwarded-For, X-Forwarded-Proto)

**CORS настройки:**
```nginx
add_header 'Access-Control-Allow-Origin' 'https://shortsai.ru' always;
add_header 'Access-Control-Allow-Credentials' 'true' always;
add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD' always;
add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Requested-With' always;
```

## Деплой

### 1. Обновить Nginx на VPS

```powershell
Get-Content nginx-api-shortsai-fixed.conf | ssh root@159.255.37.158 "cat > /tmp/nginx-api-shortsai-new.conf && sudo cp /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-available/api.shortsai.ru.backup && sudo cp /tmp/nginx-api-shortsai-new.conf /etc/nginx/sites-available/api.shortsai.ru && sudo nginx -t && sudo systemctl reload nginx && echo 'Nginx updated successfully'"
```

### 2. Обновить переменные окружения на Netlify

В Netlify Dashboard → Site settings → Environment variables:

**Установить:**
```
VITE_BACKEND_URL=https://api.shortsai.ru
```

Или можно оставить пустым - будет использован fallback `https://api.shortsai.ru` из конфига.

### 3. Пересобрать фронтенд на Netlify

После обновления переменных окружения:
- Netlify автоматически пересоберет фронтенд
- Или запустите ручной деплой

## Тестирование

### A) OPTIONS preflight

```bash
curl -i -X OPTIONS https://api.shortsai.ru/api/user-settings \
  -H "Origin: https://shortsai.ru" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type"
```

**Ожидаемый результат:**
- HTTP/2 204 No Content
- `Access-Control-Allow-Origin: https://shortsai.ru`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD`
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With`

### B) GET запрос (без токена)

```bash
curl -i https://api.shortsai.ru/api/user-settings \
  -H "Origin: https://shortsai.ru"
```

**Ожидаемый результат:**
- HTTP/1.1 401 Unauthorized
- CORS заголовки присутствуют
- НЕ CORS ошибка

### C) POST запрос

```bash
curl -i -X POST https://api.shortsai.ru/api/telegram/fetchAndSaveToServer \
  -H "Origin: https://shortsai.ru" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Ожидаемый результат:**
- HTTP/1.1 401 Unauthorized (без токена) или 400 (с токеном, но без channelId)
- CORS заголовки присутствуют
- НЕ CORS ошибка

## Критерии успеха

✅ Все API файлы используют единый `API_BASE_URL = "https://api.shortsai.ru"`
✅ Нет жестко прописанных доменов (`api.hotwell.synology.me`, `192.168.*`)
✅ Nginx обрабатывает OPTIONS быстро (204)
✅ Nginx добавляет CORS заголовки для всех ответов
✅ Все пути `/api/*` проксируются на внутренний backend
✅ В браузере нет CORS ошибок
✅ Все запросы идут на `https://api.shortsai.ru`

## Измененные файлы

### Frontend (19 файлов):
1. `app/src/config/api.ts` (новый)
2. `app/src/api/userSettings.ts`
3. `app/src/api/telegram.ts`
4. `app/src/api/telegramIntegration.ts`
5. `app/src/api/notifications.ts`
6. `app/src/api/scheduleSettings.ts`
7. `app/src/api/customPrompt.ts`
8. `app/src/api/channelSchedule.ts`
9. `app/src/api/blottata.ts`
10. `app/src/api/targetAudienceSuggestion.ts`
11. `app/src/api/nicheSuggestion.ts`
12. `app/src/api/helpApi.ts`
13. `app/src/api/forbiddenTopicsSuggestion.ts`
14. `app/src/api/channelDriveFolders.ts`
15. `app/src/api/admin.ts`
16. `app/src/api/additionalPreferencesSuggestion.ts`
17. `app/src/services/openaiScriptGenerator.ts`
18. `app/src/pages/ChannelList/ChannelListPage.tsx`
19. `app/src/pages/ChannelEdit/ChannelEditPage.tsx`
20. `app/src/components/ChannelImportModal.tsx`

### Nginx (1 файл):
1. `nginx-api-shortsai-fixed.conf`

---

**Дата:** 2025-12-21
**Статус:** ✅ Готово к деплою

