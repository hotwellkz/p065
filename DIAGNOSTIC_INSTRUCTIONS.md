# Инструкция по диагностике CHANNEL_NOT_FOUND

## Выполненные изменения

### 1. Создан файл `backend/src/routes/diagRoutes.ts`
Диагностические эндпоинты:
- `GET /api/diag/whoami` - возвращает userId из токена
- `GET /api/diag/channels` - список channelId пользователя (лимит 20)
- `GET /api/diag/channel/:id` - проверка существования канала по ID

### 2. Улучшено логирование в `backend/src/routes/telegramRoutes.ts`
Добавлено логирование перед проверкой канала:
- userId
- channelId
- firestorePath (путь в Firestore)
- результат exists

### 3. Добавлен временный middleware в `backend/src/index.ts`
Логирование всех запросов к `/api/telegram/*` и `/api/diag/*` с userId.

## Команды для выполнения на Synology

### Шаг 1: Загрузить измененные файлы на Synology

```powershell
# В PowerShell на Windows
$NAS = "adminv@192.168.100.222"

# Скопировать измененные файлы
scp backend/src/routes/diagRoutes.ts ${NAS}:/volume1/docker/shortsai/backend/src/routes/
scp backend/src/routes/telegramRoutes.ts ${NAS}:/volume1/docker/shortsai/backend/src/routes/
scp backend/src/index.ts ${NAS}:/volume1/docker/shortsai/backend/src/
scp apply_diag_changes.sh ${NAS}:/volume1/docker/shortsai/backend/
```

### Шаг 2: Применить изменения на Synology

```bash
# SSH на Synology
ssh adminv@192.168.100.222

# Перейти в директорию backend
cd /volume1/docker/shortsai/backend

# Выполнить скрипт применения изменений
bash apply_diag_changes.sh
```

Или вручную:

```bash
cd /volume1/docker/shortsai/backend

# 1. Добавить DEBUG_DIAG в .env.production
echo "" >> .env.production
echo "# Диагностические эндпоинты" >> .env.production
echo "DEBUG_DIAG=true" >> .env.production

# 2. Пересобрать контейнер
sudo /usr/local/bin/docker-compose build backend

# 3. Перезапустить контейнер
sudo /usr/local/bin/docker-compose down backend
sudo /usr/local/bin/docker-compose up -d backend

# 4. Проверить что DEBUG_DIAG установлен
sudo /usr/local/bin/docker exec shorts-backend sh -c 'echo "DEBUG_DIAG: ${DEBUG_DIAG}"'
```

## Тестирование диагностических эндпоинтов

### Получить токен из браузера
1. Откройте DevTools (F12) → Network
2. Выполните любой запрос к API
3. Скопируйте значение заголовка `Authorization: Bearer <token>`

### Тестовые curl команды

```bash
# Замените <TOKEN> на реальный Bearer токен
TOKEN="<ваш_токен>"
API_URL="https://api.shortsai.ru"

# 1. Проверка userId из токена
curl -i -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/diag/whoami"

# 2. Список каналов пользователя
curl -i -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/diag/channels"

# 3. Проверка конкретного канала (замените <channelId>)
curl -i -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/diag/channel/<channelId>"

# 4. Воспроизведение запроса fetchAndSaveToServer
curl -i -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channelId":"<channelId>","videoTitle":"Test Video"}' \
  "$API_URL/api/telegram/fetchAndSaveToServer"
```

## Получение логов после запроса

```bash
# На Synology после выполнения запроса из браузера:
sudo /usr/local/bin/docker logs --tail 100 shorts-backend 2>&1 | grep -iE "fetchAndSaveToServer|CHANNEL_NOT_FOUND|diag|userId|channelId|firestorePath" | tail -50
```

## Ожидаемый результат

После применения изменений в логах должны появиться записи:
- `fetchAndSaveToServer: checking channel in Firestore` с userId, channelId, firestorePath
- `fetchAndSaveToServer: channel check result` с exists: true/false
- При CHANNEL_NOT_FOUND: `fetchAndSaveToServer: CHANNEL_NOT_FOUND` с полной диагностической информацией

Диагностические эндпоинты помогут проверить:
- Правильность userId из токена
- Список реальных channelId в базе
- Существование конкретного channelId по пути `users/{userId}/channels/{channelId}`

## Анализ результатов

После получения логов и результатов curl проверьте:

1. **userId совпадает?** - сравните userId из `/api/diag/whoami` с userId в логах fetchAndSaveToServer
2. **channelId существует?** - проверьте через `/api/diag/channel/:id`
3. **Путь Firestore правильный?** - должен быть `users/{userId}/channels/{channelId}`
4. **Каналы в базе?** - проверьте через `/api/diag/channels`

## Возможные причины CHANNEL_NOT_FOUND

1. **Неверный userId** - токен содержит другой userId, чем ожидается
2. **Неверный channelId** - канал не существует под этим userId
3. **Неправильный путь** - каналы лежат в другом месте (например, в другой коллекции)
4. **Рассинхрон после импорта/экспорта** - каналы созданы под другим userId или в другой структуре

