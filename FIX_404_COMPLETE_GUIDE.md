# 🔧 Полное руководство по исправлению 404 для /api/telegram/fetchAndSaveToServer

## 📋 Проблема
Кнопка "Забрать видео из Syntx на сервер" возвращает 404 при запросе на `https://api.hotwell.synology.me/api/telegram/fetchAndSaveToServer`

## 🔍 Корневые причины

1. **Фронтенд использует старый домен** `api.hotwell.synology.me` вместо `api.shortsai.ru`
2. **Nginx на VPS проксирует на неправильный адрес** (`127.0.0.1:3000` вместо `10.9.0.2:3000`)
3. **Переменная окружения VITE_BACKEND_URL** не обновлена в Netlify

---

## ✅ ШАГ 1: Обновить VITE_BACKEND_URL локально

### Windows PowerShell:
```powershell
# Обновить .env в корне проекта
(Get-Content .env) -replace 'VITE_BACKEND_URL=.*', 'VITE_BACKEND_URL=https://api.shortsai.ru' | Set-Content .env

# Проверить
Get-Content .env | Select-String -Pattern "VITE_BACKEND_URL"
```

**Ожидаемый результат:** `VITE_BACKEND_URL=https://api.shortsai.ru`

---

## ✅ ШАГ 2: Обновить VITE_BACKEND_URL в Netlify

1. Откройте [Netlify Dashboard](https://app.netlify.com/)
2. Выберите ваш сайт (shortsai.ru)
3. Перейдите в **Site settings** → **Environment variables**
4. Найдите `VITE_BACKEND_URL`
5. Измените значение на: `https://api.shortsai.ru`
6. Сохраните изменения
7. **Пересоберите сайт** (Deploys → Trigger deploy → Clear cache and deploy site)

---

## ✅ ШАГ 3: Исправить Nginx конфиг на VPS

### 3.1 Подключиться к VPS:
```bash
ssh root@159.255.37.158
```

### 3.2 Проверить текущий конфиг:
```bash
sudo cat /etc/nginx/sites-available/api.shortsai.ru
```

### 3.3 Создать резервную копию:
```bash
sudo cp /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-available/api.shortsai.ru.backup
```

### 3.4 Обновить конфиг:
```bash
sudo nano /etc/nginx/sites-available/api.shortsai.ru
```

**Замените `proxy_pass http://127.0.0.1:3000;` на `proxy_pass http://10.9.0.2:3000;`**

Или используйте готовый конфиг из файла `nginx-api-shortsai-fixed.conf`:
```bash
# Скопируйте содержимое nginx-api-shortsai-fixed.conf на VPS
sudo nano /etc/nginx/sites-available/api.shortsai.ru
# Вставьте содержимое из nginx-api-shortsai-fixed.conf
```

### 3.5 Проверить синтаксис:
```bash
sudo nginx -t
```

**Ожидаемый результат:** `syntax is ok` и `test is successful`

### 3.6 Перезагрузить Nginx:
```bash
sudo systemctl reload nginx
```

---

## ✅ ШАГ 4: Проверить контейнер на Synology

### 4.1 Подключиться к Synology:
```bash
ssh adminv@192.168.100.222
```

### 4.2 Проверить статус контейнера:
```bash
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose ps
```

**Ожидаемый результат:** Контейнер `shorts-backend` в статусе `Up`

### 4.3 Проверить порт:
```bash
sudo docker exec shorts-backend env | grep PORT
```

**Ожидаемый результат:** `PORT=3000` или `PORT=7777` (проверьте актуальный)

### 4.4 Проверить endpoint изнутри контейнера:
```bash
sudo docker exec shorts-backend curl -i http://localhost:3000/api/telegram/fetchAndSaveToServer
```

**Ожидаемый результат:** `401 Unauthorized` (НЕ 404!)

### 4.5 Проверить логи:
```bash
sudo docker logs shorts-backend --tail 50 | grep -i "fetchAndSaveToServer"
```

---

## ✅ ШАГ 5: Проверить WireGuard туннель

### 5.1 На VPS:
```bash
# Проверить статус WireGuard
sudo wg show

# Проверить связность с Synology
curl -I http://10.9.0.2:3000/health
```

**Ожидаемый результат:** `200 OK`

### 5.2 На Synology:
```bash
# Проверить статус WireGuard контейнера
sudo docker ps | grep wireguard

# Проверить IP адрес
ip addr show wg0
```

**Ожидаемый результат:** IP адрес `10.9.0.2/24`

---

## ✅ ШАГ 6: Финальные проверки

### 6.1 Снаружи (с вашего ПК):
```powershell
# Проверить, что endpoint не 404
curl -i -X POST https://api.shortsai.ru/api/telegram/fetchAndSaveToServer `
  -H "Content-Type: application/json" `
  -d '{"channelId":"test"}'
```

**Ожидаемый результат:** `401 Unauthorized` (НЕ 404!)

### 6.2 С VPS на Synology по WireGuard:
```bash
# На VPS
curl -i http://10.9.0.2:3000/api/telegram/fetchAndSaveToServer
```

**Ожидаемый результат:** `401 Unauthorized` (НЕ 404!)

### 6.3 В браузере (DevTools):
1. Откройте https://shortsai.ru
2. Откройте DevTools (F12) → Network
3. Нажмите кнопку "Забрать видео из SyntX на сервер"
4. Проверьте запрос:
   - **URL:** `https://api.shortsai.ru/api/telegram/fetchAndSaveToServer`
   - **Status:** `401 Unauthorized` (если нет токена) или `200 OK` (если есть токен)
   - **НЕ 404!**

---

## 📝 Список изменений

### Файлы, которые были изменены:

1. **`.env`** (локально) - обновлен `VITE_BACKEND_URL=https://api.shortsai.ru`
2. **`backend/src/routes/telegramRoutes.ts`** - добавлено диагностическое логирование
3. **`/etc/nginx/sites-available/api.shortsai.ru`** (на VPS) - изменен `proxy_pass` на `http://10.9.0.2:3000`
4. **Netlify Environment Variables** - нужно обновить `VITE_BACKEND_URL=https://api.shortsai.ru`

---

## 🔄 Команды для повторной проверки (если сломается снова)

### Проверить Nginx:
```bash
# На VPS
sudo nginx -t
sudo systemctl status nginx
sudo cat /etc/nginx/sites-available/api.shortsai.ru | grep proxy_pass
```

### Проверить контейнер:
```bash
# На Synology
sudo docker ps | grep shorts-backend
sudo docker logs shorts-backend --tail 20
sudo docker exec shorts-backend curl -i http://localhost:3000/api/telegram/fetchAndSaveToServer
```

### Проверить WireGuard:
```bash
# На VPS
sudo wg show
ping -c 3 10.9.0.2

# На Synology
sudo docker ps | grep wireguard
ip addr show wg0
```

### Проверить endpoint:
```bash
# Снаружи
curl -i https://api.shortsai.ru/api/telegram/fetchAndSaveToServer

# С VPS
curl -i http://10.9.0.2:3000/api/telegram/fetchAndSaveToServer
```

---

## ✅ Ожидаемый результат

После всех исправлений:
- ✅ Фронтенд отправляет запросы на `https://api.shortsai.ru`
- ✅ Nginx на VPS проксирует на `http://10.9.0.2:3000`
- ✅ Backend на Synology отвечает на `/api/telegram/fetchAndSaveToServer`
- ✅ При отсутствии токена возвращается `401 Unauthorized` (НЕ 404!)
- ✅ При наличии валидного токена запрос обрабатывается и видео сохраняется

---

## 🆘 Если проблема осталась

1. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/error.log`
2. Проверьте логи backend: `sudo docker logs shorts-backend --tail 100`
3. Проверьте, что WireGuard туннель активен: `sudo wg show` на VPS
4. Проверьте, что порт 3000 открыт на Synology: `sudo netstat -tlnp | grep 3000`

