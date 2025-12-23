# Быстрый старт диагностики

## 1. Скопировать файлы на Synology (PowerShell)

```powershell
$NAS = "adminv@192.168.100.222"

# Копируем измененные файлы
scp backend/src/routes/diagRoutes.ts ${NAS}:/volume1/docker/shortsai/backend/src/routes/
scp backend/src/routes/telegramRoutes.ts ${NAS}:/volume1/docker/shortsai/backend/src/routes/
scp backend/src/index.ts ${NAS}:/volume1/docker/shortsai/backend/src/
scp apply_diag_changes.sh ${NAS}:/volume1/docker/shortsai/backend/
```

## 2. Применить изменения на Synology

```powershell
# SSH и выполнить скрипт
ssh -t adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && bash apply_diag_changes.sh"
```

Или вручную:

```powershell
ssh -t adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && echo 'DEBUG_DIAG=true' >> .env.production && sudo /usr/local/bin/docker-compose build backend && sudo /usr/local/bin/docker-compose down backend && sudo /usr/local/bin/docker-compose up -d backend"
```

## 3. Проверить что DEBUG_DIAG включен

```powershell
ssh -t adminv@192.168.100.222 "sudo /usr/local/bin/docker exec shorts-backend sh -c 'echo DEBUG_DIAG: \${DEBUG_DIAG}'"
```

Должно вывести: `DEBUG_DIAG: true`

## 4. Получить токен из браузера

1. Откройте `https://shortsai.ru`
2. F12 → Network
3. Выполните любой запрос к API
4. Скопируйте `Authorization: Bearer <token>` из заголовков

## 5. Тестировать диагностические эндпоинты

```powershell
# Замените <TOKEN> на реальный токен
$TOKEN = "<ваш_токен>"
$API = "https://api.shortsai.ru"

# Проверка userId
curl -H "Authorization: Bearer $TOKEN" "$API/api/diag/whoami"

# Список каналов
curl -H "Authorization: Bearer $TOKEN" "$API/api/diag/channels"

# Проверка канала (замените <channelId>)
curl -H "Authorization: Bearer $TOKEN" "$API/api/diag/channel/<channelId>"
```

## 6. Воспроизвести ошибку и получить логи

```powershell
# В браузере нажмите "Забрать видео из Syntx на сервер"
# Затем получите логи:
ssh -t adminv@192.168.100.222 "sudo /usr/local/bin/docker logs --tail 200 shorts-backend 2>&1 | grep -iE 'fetchAndSaveToServer|CHANNEL_NOT_FOUND|userId|channelId|firestorePath' | tail -50"
```

## Что искать в логах

1. **userId** - должен совпадать с `/api/diag/whoami`
2. **channelId** - должен быть в списке `/api/diag/channels`
3. **firestorePath** - должен быть `users/{userId}/channels/{channelId}`
4. **exists: false** - означает что канал не найден по этому пути

## Возможные причины

- userId не совпадает → проблема с токеном/авторизацией
- channelId нет в списке → канал не существует под этим userId
- exists: false при правильном пути → каналы в другом месте (миграция/импорт)
