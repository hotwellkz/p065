# Исправление 404 для /api/telegram/fetchAndSaveToServer

## Проблема
Кнопка "Забрать видео из Syntx на сервер" возвращает 404 при запросе на `https://api.hotwell.synology.me/api/telegram/fetchAndSaveToServer`

## Диагностика

### 1. Локально (Windows PowerShell)

#### 1.1 Обновить VITE_BACKEND_URL в .env
```powershell
(Get-Content .env) -replace 'VITE_BACKEND_URL=.*', 'VITE_BACKEND_URL=https://api.shortsai.ru' | Set-Content .env
```

#### 1.2 Проверить, что изменилось
```powershell
Get-Content .env | Select-String -Pattern "VITE_BACKEND_URL"
```

### 2. Backend маршрут

Маршрут `/api/telegram/fetchAndSaveToServer` существует в `backend/src/routes/telegramRoutes.ts` (строка 997) и подключен в `backend/src/index.ts` (строка 111).

Добавлено диагностическое логирование для отслеживания запросов.

### 3. Проверка на Synology (SSH)

```bash
# Подключиться к Synology
ssh adminv@192.168.100.222

# Проверить контейнер
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose ps

# Проверить логи
sudo docker logs shorts-backend --tail 100 | grep -i "fetchAndSaveToServer"

# Проверить переменные окружения в контейнере
sudo docker exec shorts-backend env | grep -E "PORT|FRONTEND|BACKEND"

# Проверить endpoint изнутри контейнера
sudo docker exec shorts-backend curl -i http://localhost:3000/api/telegram/fetchAndSaveToServer
```

### 4. Проверка Nginx на VPS

```bash
# Подключиться к VPS
ssh root@159.255.37.158

# Проверить текущий конфиг
sudo cat /etc/nginx/sites-available/api.shortsai.ru

# Проверить, что proxy_pass указывает на WireGuard IP
sudo grep -A 5 "location /" /etc/nginx/sites-available/api.shortsai.ru

# Проверить синтаксис
sudo nginx -t

# Перезагрузить Nginx
sudo systemctl reload nginx
```

### 5. Исправление Nginx конфига

Если `proxy_pass` указывает на `127.0.0.1:3000`, нужно изменить на WireGuard IP Synology (обычно `10.9.0.2:3000` или `10.9.0.2:7777` в зависимости от PORT в .env.production).

## Команды для проверки

### Снаружи (с вашего ПК)
```powershell
# Проверить, что endpoint не 404
curl -i -X POST https://api.shortsai.ru/api/telegram/fetchAndSaveToServer -H "Content-Type: application/json" -d '{"channelId":"test"}'
# Ожидаем: 401 Unauthorized (не 404!)
```

### С VPS на Synology по WireGuard
```bash
# На VPS
curl -i http://10.9.0.2:3000/api/telegram/fetchAndSaveToServer
# Ожидаем: 401 Unauthorized (не 404!)
```

## Следующие шаги

1. Обновить VITE_BACKEND_URL в .env (локально)
2. Обновить VITE_BACKEND_URL в Netlify (для продакшена)
3. Проверить Nginx конфиг на VPS
4. Проверить контейнер на Synology
5. Протестировать запросы

