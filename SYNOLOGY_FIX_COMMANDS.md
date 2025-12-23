# Команды для исправления 404 на Synology

## Проблема
Endpoint `/api/telegram/fetchAndSaveToServer` возвращает 404 даже напрямую с VPS на Synology.

## Диагностика на Synology

### 1. Подключиться к Synology:
```bash
ssh adminv@192.168.100.222
```

### 2. Проверить статус контейнера:
```bash
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose ps
```

### 3. Проверить, на каком порту слушает backend:
```bash
sudo docker exec shorts-backend env | grep PORT
```

### 4. Проверить endpoint изнутри контейнера:
```bash
sudo docker exec shorts-backend curl -i http://localhost:3000/api/telegram/fetchAndSaveToServer
# ИЛИ если PORT=7777:
sudo docker exec shorts-backend curl -i http://localhost:7777/api/telegram/fetchAndSaveToServer
```

### 5. Проверить логи контейнера:
```bash
sudo docker logs shorts-backend --tail 100 | grep -i "fetchAndSaveToServer\|telegram\|route"
```

### 6. Проверить, что маршрут зарегистрирован (проверить код в контейнере):
```bash
sudo docker exec shorts-backend cat /app/dist/routes/telegramRoutes.js | grep -i "fetchAndSaveToServer" | head -5
```

### 7. Проверить, что маршруты подключены в index.js:
```bash
sudo docker exec shorts-backend cat /app/dist/index.js | grep -i "telegram" | head -5
```

## Исправление

### Если код не обновлен в контейнере:

1. **Обновить код на Synology:**
```bash
cd /volume1/docker/shortsai/backend
# Убедитесь, что файл backend/src/routes/telegramRoutes.ts содержит маршрут fetchAndSaveToServer
```

2. **Пересобрать контейнер:**
```bash
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

3. **Проверить логи после перезапуска:**
```bash
sudo docker logs shorts-backend --tail 50
```

### Если порт не совпадает:

Проверьте `.env.production` на Synology:
```bash
cd /volume1/docker/shortsai/backend
grep PORT .env.production
```

Если PORT=7777, но Nginx проксирует на 3000, нужно либо:
- Изменить PORT в .env.production на 3000
- ИЛИ изменить proxy_pass в Nginx на 7777

## Проверка после исправления

### С VPS на Synology:
```bash
# На VPS (159.255.37.158)
curl -i http://10.9.0.2:3000/api/telegram/fetchAndSaveToServer
# Ожидаем: 401 Unauthorized (НЕ 404!)
```

### Снаружи:
```bash
# С вашего ПК
curl -i -X POST https://api.shortsai.ru/api/telegram/fetchAndSaveToServer -H "Content-Type: application/json" -d "{\"channelId\":\"test\"}"
# Ожидаем: 401 Unauthorized (НЕ 404!)
```

