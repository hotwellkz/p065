# Инструкция по настройке публичного HTTPS API на VPS

## Архитектура решения

```
Интернет (4G/любой) 
    ↓
VPS (159.255.37.158) - Nginx + Let's Encrypt
    ↓ HTTPS (443)
VPN туннель (10.8.0.1 → 10.8.0.2)
    ↓ HTTP (5001)
Synology DSM Backend (10.8.0.2:5001)
```

## Предварительные требования

1. **DNS запись**: `api.hotwell.synology.me` → `159.255.37.158` (A-запись)
2. **VPN туннель**: Должен быть настроен и активен между VPS и Synology
3. **Backend**: Должен слушать на `10.8.0.2:5001` (или `5000`)

## Шаги выполнения

### 1. Подключение к VPS

```bash
ssh root@159.255.37.158
```

### 2. Загрузка и выполнение скрипта настройки

```bash
# Загрузите setup_vps_api.sh на VPS (через scp или создайте вручную)
scp setup_vps_api.sh root@159.255.37.158:/root/

# Или создайте файл вручную на VPS
nano /root/setup_vps_api.sh
# Вставьте содержимое скрипта

# Сделайте исполняемым и запустите
chmod +x /root/setup_vps_api.sh
/root/setup_vps_api.sh
```

### 3. Ручная проверка VPN подключения

Если скрипт показал проблемы с VPN:

```bash
# Проверка интерфейсов
ip a

# Проверка маршрутов
ip route

# Если маршрута до 10.8.0.0/24 нет, добавьте:
# Для WireGuard (обычно tun0 или wg0):
ip route add 10.8.0.0/24 dev tun0

# Для OpenVPN (обычно tun0):
ip route add 10.8.0.0/24 dev tun0

# Сделайте постоянным (добавьте в /etc/network/interfaces или systemd-networkd)
```

### 4. Проверка доступности backend

```bash
# Проверка ping
ping -c 3 10.8.0.2

# Проверка портов
curl -v http://10.8.0.2:5001/health
curl -v http://10.8.0.2:5000/health

# Если не отвечает, проверьте firewall на VPS:
ufw status
# Убедитесь, что исходящие соединения разрешены
```

### 5. Настройка DNS

**Важно**: DNS запись должна быть настроена ДО получения SSL сертификата!

Если у вас есть доступ к DNS панели (например, через Synology DDNS или внешний DNS провайдер):

1. Создайте A-запись:
   - Имя: `api.hotwell`
   - Тип: `A`
   - Значение: `159.255.37.158`
   - TTL: `300` (или по умолчанию)

2. Проверьте распространение:
   ```bash
   dig +short api.hotwell.synology.me
   # Должно вернуть: 159.255.37.158
   ```

### 6. Выпуск SSL сертификата

После того как DNS распространился (может занять несколько минут):

```bash
# Замените YOUR_EMAIL@example.com на ваш реальный email
certbot --nginx -d api.hotwell.synology.me \
  --non-interactive \
  --agree-tos \
  -m YOUR_EMAIL@example.com
```

Certbot автоматически обновит конфигурацию Nginx и добавит SSL сертификаты.

### 7. Проверка работы

```bash
# Проверка /health endpoint
curl -I https://api.hotwell.synology.me/health

# Детальная проверка
curl -v https://api.hotwell.synology.me/health

# Проверка Range запросов (для видео)
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/user/channel/file.mp4
# Должно вернуть: HTTP/1.1 206 Partial Content
# И заголовок: Accept-Ranges: bytes
```

### 8. Проверка с внешнего устройства (4G)

Откройте в браузере на телефоне:
- `https://api.hotwell.synology.me/health`

Должен вернуться статус 200.

## Устранение неполадок

### Проблема: ERR_CONNECTION_TIMED_OUT

**Причины и решения:**

1. **Firewall блокирует порты 80/443:**
   ```bash
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw reload
   ```

2. **DNS не настроен или не распространился:**
   ```bash
   dig +short api.hotwell.synology.me
   # Если не возвращает 159.255.37.158 - проверьте DNS настройки
   ```

3. **Nginx не запущен:**
   ```bash
   systemctl status nginx
   systemctl start nginx
   ```

4. **SSL сертификат не получен:**
   ```bash
   certbot certificates
   # Если нет сертификата, запустите certbot снова
   ```

### Проблема: 502 Bad Gateway

**Причины:**
- Backend недоступен через VPN
- Неправильный порт в конфигурации Nginx

**Решение:**
```bash
# Проверьте доступность backend
curl -v http://10.8.0.2:5001/health

# Если не работает, проверьте порт:
curl -v http://10.8.0.2:5000/health

# Если другой порт работает, обновите конфигурацию:
nano /etc/nginx/sites-available/api.hotwell.synology.me
# Замените 5001 на правильный порт
nginx -t
systemctl reload nginx
```

### Проблема: Range запросы не работают (206 не возвращается)

**Решение:**
Убедитесь, что в конфигурации Nginx есть:
```nginx
proxy_buffering off;
proxy_request_buffering off;
```

И проверьте логи:
```bash
tail -f /var/log/nginx/error.log
```

### Проблема: VPN маршрут пропадает после перезагрузки

**Решение:**
Добавьте маршрут в системную конфигурацию:

**Для systemd-networkd:**
```bash
# Создайте файл /etc/systemd/network/10-vpn-route.network
[Route]
Destination=10.8.0.0/24
Gateway=10.8.0.1
```

**Для NetworkManager:**
```bash
nmcli connection modify <VPN_CONNECTION_NAME> ipv4.routes "10.8.0.0/24 10.8.0.1"
```

**Для /etc/network/interfaces:**
```bash
# Добавьте в /etc/network/interfaces:
up ip route add 10.8.0.0/24 dev tun0
```

## Файлы конфигурации

### Основные файлы:
- `/etc/nginx/sites-available/api.hotwell.synology.me` - конфигурация Nginx
- `/etc/letsencrypt/live/api.hotwell.synology.me/` - SSL сертификаты
- `/var/log/nginx/access.log` - логи доступа
- `/var/log/nginx/error.log` - логи ошибок

### Команды для проверки:

```bash
# Статус сервисов
systemctl status nginx
systemctl status certbot.timer

# Проверка конфигурации
nginx -t

# Просмотр логов
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# Проверка SSL сертификата
certbot certificates
openssl s_client -connect api.hotwell.synology.me:443 -servername api.hotwell.synology.me
```

## Автоматическое обновление сертификатов

Certbot автоматически настраивает таймер для обновления сертификатов:

```bash
# Проверка таймера
systemctl status certbot.timer

# Ручное обновление (если нужно)
certbot renew --dry-run
```

## Итоговая схема

```
┌─────────────────────────────────────────────────────────┐
│                    Интернет (4G/любой)                   │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS (443)
                        │ DNS: api.hotwell.synology.me
                        ↓
┌─────────────────────────────────────────────────────────┐
│  VPS Ubuntu 24.04 (159.255.37.158)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Nginx Reverse Proxy                             │   │
│  │  - SSL/TLS (Let's Encrypt)                       │   │
│  │  - CORS заголовки                                │   │
│  │  - Range поддержка (206 Partial Content)         │   │
│  └───────────────────┬──────────────────────────────┘   │
│                      │ HTTP (5001)                       │
│                      │ VPN туннель                       │
└──────────────────────┼──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│  VPN Network (10.8.0.0/24)                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  VPS Gateway: 10.8.0.1                           │   │
│  └───────────────────┬──────────────────────────────┘   │
│                      │                                    │
│                      ↓                                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Synology DSM Backend: 10.8.0.2:5001             │   │
│  │  - /health endpoint                              │   │
│  │  - /api/media/... (видео файлы)                 │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Безопасность

- ✅ Порт 80/443 открыт только на VPS
- ✅ Домашний роутер НЕ открывает порты
- ✅ Все соединения идут через VPN туннель
- ✅ Используется валидный SSL сертификат (Let's Encrypt)
- ⚠️ CORS настроен на "*" - при необходимости ограничьте для production

## Поддержка после настройки

Если что-то перестало работать:

1. Проверьте статус VPN: `ping -c 2 10.8.0.2`
2. Проверьте статус Nginx: `systemctl status nginx`
3. Проверьте логи: `tail -50 /var/log/nginx/error.log`
4. Проверьте SSL: `certbot certificates`
5. Проверьте firewall: `ufw status`




