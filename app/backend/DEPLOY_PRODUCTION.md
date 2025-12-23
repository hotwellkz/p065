# Деплой ShortsAI Studio на Production (Synology + VPS)

## Архитектура

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────┐
│   Интернет      │         │     VPS      │         │   Synology  │
│                 │         │              │         │     NAS     │
│  Blotato API    │────────▶│ 185.104.     │────────▶│  10.8.0.2   │
│  Frontend       │         │ 248.130:5001 │  VPN    │  :8080      │
│                 │         │              │  Tunnel│             │
└─────────────────┘         └──────────────┘         └─────────────┘
```

### Компоненты:

1. **Synology NAS**:
   - Backend приложение (Node.js/Express)
   - Хранилище видео (`/volume1/shortsai/videos`)
   - Порт: `8080` (локально)

2. **VPS (Ubuntu)**:
   - Статический IP: `185.104.248.130`
   - Проброс портов через VPN туннель
   - Публичный порт: `5001` → Synology `:8080`

3. **Публичный доступ**:
   - URL: `http://185.104.248.130:5001`
   - Используется в `BACKEND_URL` для Blotato и других сервисов

## Предварительные требования

### На Synology:

1. **Node.js LTS** (v18+):
   - Установите через Package Center или вручную
   - Проверка: `node -v`

2. **Git**:
   - Установите через Package Center
   - Проверка: `git --version`

3. **SSH доступ**:
   - Control Panel → Terminal & SNMP → Enable SSH service
   - Порт: 22 (или другой, если настроен)

4. **VPN туннель**:
   - OpenVPN клиент настроен
   - IP в туннеле: `10.8.0.2`

### На VPS:

1. **Ubuntu Server** со статическим IP
2. **OpenVPN сервер** настроен
3. **iptables** установлен
4. **Root доступ** (sudo)

## Шаг 1: Настройка VPS (проброс портов)

### 1.1. Подключитесь к VPS по SSH

```bash
ssh root@185.104.248.130
```

### 1.2. Загрузите скрипт настройки портов

```bash
# Создайте директорию
mkdir -p /usr/local/bin

# Скопируйте скрипт synology-port-forward.sh на VPS
# (скопируйте содержимое из backend/vps/synology-port-forward.sh)
```

### 1.3. Запустите скрипт

```bash
chmod +x /usr/local/bin/synology-port-forward.sh
sudo /usr/local/bin/synology-port-forward.sh
```

### 1.4. Проверка

```bash
# Проверка правил iptables
sudo iptables -t nat -L PREROUTING -n -v

# Проверка доступности (должен вернуть 200 OK)
curl -I http://185.104.248.130:5001/health
```

## Шаг 2: Деплой на Synology

### 2.1. Подключитесь к Synology по SSH

```bash
ssh admin@hotwell.synology.me
# или
ssh admin@<synology-local-ip>
```

### 2.2. Загрузите скрипт деплоя

```bash
# Создайте директорию для скриптов
mkdir -p /volume1/shortsai/scripts

# Скопируйте скрипт deploy_to_synology_production.sh на Synology
# (скопируйте содержимое из backend/deploy_to_synology_production.sh)
```

### 2.3. Запустите скрипт деплоя

```bash
chmod +x /volume1/shortsai/scripts/deploy_to_synology_production.sh
sudo /volume1/shortsai/scripts/deploy_to_synology_production.sh
```

Скрипт выполнит:
- Клонирование/обновление репозитория
- Установку зависимостей
- Компиляцию TypeScript
- Настройку `.env`
- Запуск через pm2
- Настройку автозапуска

### 2.4. Ручная настройка .env (если нужно)

Если скрипт не настроил все переменные, отредактируйте `.env`:

```bash
cd /volume1/shortsai/app/backend
nano .env
```

Обязательные переменные:

```env
NODE_ENV=production
PORT=8080
STORAGE_ROOT=/volume1/shortsai/videos
BACKEND_URL=http://185.104.248.130:5001

# Firebase
FIREBASE_SERVICE_ACCOUNT={...}

# Telegram
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
SYNX_CHAT_ID=...
TELEGRAM_SESSION_SECRET=...
TELEGRAM_SESSION_ENCRYPTED=...
```

### 2.5. Проверка работоспособности

```bash
# Локально на Synology
curl http://127.0.0.1:8080/health

# Через VPS (из интернета)
curl http://185.104.248.130:5001/health

# Проверка медиа-роута (Range-запросы)
curl -I -H "Range: bytes=0-1023" http://185.104.248.130:5001/api/media/test/test/test.mp4
```

## Шаг 3: Управление сервисом

### Команды pm2:

```bash
# Статус
pm2 status

# Логи
pm2 logs shortsai-backend

# Перезапуск
pm2 restart shortsai-backend

# Остановка
pm2 stop shortsai-backend

# Мониторинг
pm2 monit
```

### Автозапуск:

```bash
# Сохранить текущую конфигурацию
pm2 save

# Настроить автозапуск (выполните команду, которую выведет pm2)
pm2 startup
```

## Шаг 4: Обновление кода

### Автоматическое обновление:

```bash
cd /volume1/shortsai/app
git pull origin main
cd backend
npm install --production
npm run build
pm2 restart shortsai-backend
```

### Или используйте скрипт деплоя повторно:

```bash
/volume1/shortsai/scripts/deploy_to_synology_production.sh
```

## Шаг 5: Настройка Frontend

В настройках фронтенда укажите:

```env
VITE_BACKEND_URL=http://185.104.248.130:5001
```

## Проверка интеграции с Blotato

### 1. Проверка медиа-URL:

```bash
# Должен вернуть 200 OK или 206 Partial Content
curl -I http://185.104.248.130:5001/api/media/<userSlug>/<channelSlug>/<fileName>.mp4
```

### 2. Проверка Range-запросов:

```bash
# Должен вернуть 206 Partial Content с заголовками Content-Range
curl -I -H "Range: bytes=0-1023" http://185.104.248.130:5001/api/media/<userSlug>/<channelSlug>/<fileName>.mp4
```

### 3. Проверка в логах:

```bash
pm2 logs shortsai-backend | grep "Media URL generated"
```

Должен быть URL вида: `http://185.104.248.130:5001/api/media/...`

## Устранение неполадок

### Backend не отвечает:

1. Проверьте статус pm2:
   ```bash
   pm2 status
   ```

2. Проверьте логи:
   ```bash
   pm2 logs shortsai-backend --lines 100
   ```

3. Проверьте порт:
   ```bash
   netstat -tuln | grep 8080
   ```

### Проброс портов не работает:

1. Проверьте VPN туннель:
   ```bash
   # На VPS
   ping 10.8.0.2
   ```

2. Проверьте правила iptables:
   ```bash
   # На VPS
   sudo iptables -t nat -L PREROUTING -n -v
   ```

3. Проверьте firewall на Synology:
   - Control Panel → Security → Firewall
   - Убедитесь, что порт 8080 разрешён для VPN сети

### Blotato не может получить доступ к медиа:

1. Проверьте `BACKEND_URL`:
   ```bash
   # На Synology
   grep BACKEND_URL /volume1/shortsai/app/backend/.env
   ```

2. Проверьте доступность из интернета:
   ```bash
   # С любого внешнего хоста
   curl -I http://185.104.248.130:5001/health
   ```

3. Проверьте логи Blotato в backend:
   ```bash
   pm2 logs shortsai-backend | grep "BlottataLocalFileProcessor"
   ```

## Безопасность

### Рекомендации:

1. **Firewall на VPS**: Откройте только необходимые порты (SSH, 5001)
2. **HTTPS**: Рассмотрите настройку nginx с SSL на VPS
3. **Аутентификация**: Убедитесь, что все API endpoints защищены
4. **Логи**: Регулярно проверяйте логи на подозрительную активность

### Настройка HTTPS (опционально):

1. Установите nginx на VPS
2. Настройте SSL через Let's Encrypt
3. Проксифицируйте на `127.0.0.1:5001`
4. Обновите `BACKEND_URL` на `https://api.yourdomain.com`

## Мониторинг

### Логи:

- Backend: `pm2 logs shortsai-backend`
- System: `/var/log/syslog` (на VPS)
- Port forwarding: `journalctl -u synology-port-forward.service`

### Метрики:

- Использование диска: `df -h /volume1/shortsai`
- Использование памяти: `free -h`
- Процессы: `pm2 monit`

## Контакты и поддержка

При возникновении проблем проверьте:
1. Логи backend (`pm2 logs`)
2. Логи VPS (`journalctl`)
3. Статус VPN туннеля
4. Правила iptables на VPS


