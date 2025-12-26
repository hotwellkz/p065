# Отчёт о загрузке исправления CORS на Synology

## Выполнено

✅ **Файл загружен на сервер**
- Файл: `backend/src/index.ts`
- Путь на сервере: `/volume1/docker/shortsai/backend/src/index.ts`
- Изменения: Добавлены `"x-user-id"` и `"x-request-id"` в `allowedHeaders`

## Проверка загруженного файла

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && grep -A 10 'allowedHeaders' src/index.ts"
```

**Результат**: Файл содержит:
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
  "x-request-id"     // ← Добавлено
],
```

## Следующие шаги

### 1. Пересобрать и перезапустить контейнер

Поскольку это TypeScript проект, нужно пересобрать контейнер:

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose build backend"
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose up -d backend"
```

Или перезапустить (если изменения применяются без пересборки):

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose restart backend"
```

### 2. Проверить логи

```bash
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose logs --tail=50 backend | grep -i 'started\|listening\|cors\|error'"
```

### 3. Проверить CORS через curl

```powershell
# Проверка OPTIONS preflight
curl.exe -i -X OPTIONS "https://api.shortsai.ru/api/music-clips/channels/test123/runOnce" `
  -H "Origin: https://shortsai.ru" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: x-user-id,content-type,authorization"
```

**Ожидаемый ответ** должен содержать:
```
Access-Control-Allow-Headers: ..., x-user-id, ...
```

## Команды PowerShell для завершения деплоя

```powershell
# 1. Пересобрать контейнер (если нужно)
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose build --no-cache backend"

# 2. Перезапустить контейнер
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose up -d backend"

# 3. Проверить логи
ssh shortsai "cd /volume1/docker/shortsai/backend && /usr/local/bin/docker compose logs --tail=30 backend"

# 4. Проверить CORS
curl.exe -i -X OPTIONS "https://api.shortsai.ru/api/music-clips/channels/test123/runOnce" `
  -H "Origin: https://shortsai.ru" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: x-user-id,content-type"
```

## Статус

✅ Файл загружен на сервер  
⏳ Требуется пересборка/перезапуск контейнера  
⏳ Требуется проверка CORS после перезапуска

