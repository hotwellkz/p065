# 🚀 Быстрое исправление 404 для /api/telegram/fetchAndSaveToServer

## ✅ Что уже сделано:
1. ✅ VITE_BACKEND_URL обновлен локально на `https://api.shortsai.ru`
2. ✅ Nginx на VPS обновлен: `proxy_pass http://10.9.0.2:3000`
3. ✅ Маршрут существует в коде: `backend/src/routes/telegramRoutes.ts:997`

## ❌ Проблема:
Контейнер на Synology возвращает 404, значит код не обновлен в контейнере.

## 🔧 Решение: Обновить код на Synology

### Вариант 1: Быстрое обновление (вручную)

#### 1. Скопировать обновленный файл на Synology:
```powershell
# С вашего ПК (Windows PowerShell)
cd backend\src\routes
Get-Content telegramRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts"
```

#### 2. Пересобрать контейнер на Synology:
```bash
# На Synology (через SSH)
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

#### 3. Проверить логи:
```bash
sudo docker logs shorts-backend --tail 50
```

### Вариант 2: Полный деплой через скрипт

#### 1. Убедитесь, что есть `.env.deploy` в корне проекта:
```bash
# Проверьте наличие файла
cat .env.deploy
```

#### 2. Запустите скрипт деплоя:
```bash
cd backend
bash deploy_to_synology.sh
```

## ✅ Проверка после обновления

### 1. Проверить endpoint изнутри контейнера:
```bash
# На Synology
sudo docker exec shorts-backend curl -i http://localhost:3000/api/telegram/fetchAndSaveToServer
# Ожидаем: 401 Unauthorized (НЕ 404!)
```

### 2. Проверить с VPS на Synology:
```bash
# На VPS (159.255.37.158)
curl -i http://10.9.0.2:3000/api/telegram/fetchAndSaveToServer
# Ожидаем: 401 Unauthorized (НЕ 404!)
```

### 3. Проверить снаружи:
```bash
# С вашего ПК
curl -i -X POST https://api.shortsai.ru/api/telegram/fetchAndSaveToServer -H "Content-Type: application/json" -d "{\"channelId\":\"test\"}"
# Ожидаем: 401 Unauthorized (НЕ 404!)
```

## 📝 Если все еще 404:

### Проверить, что маршрут зарегистрирован в скомпилированном коде:
```bash
# На Synology
sudo docker exec shorts-backend cat /app/dist/routes/telegramRoutes.js | grep -i "fetchAndSaveToServer"
```

### Проверить, что маршруты подключены:
```bash
# На Synology
sudo docker exec shorts-backend cat /app/dist/index.js | grep -i "telegram"
```

### Проверить логи при старте:
```bash
# На Synology
sudo docker logs shorts-backend | grep -i "route\|telegram"
```

## 🎯 Ожидаемый результат:

После обновления:
- ✅ Endpoint `/api/telegram/fetchAndSaveToServer` возвращает `401 Unauthorized` (не 404)
- ✅ В логах видно: `fetchAndSaveToServer: REQUEST RECEIVED`
- ✅ Кнопка в браузере работает (401 или 200, но не 404)

