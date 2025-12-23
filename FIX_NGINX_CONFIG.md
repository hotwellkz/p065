# Исправление конфигурации Nginx

## Проблема

Скрипт создал конфигурацию с HTTPS блоком, но SSL сертификаты еще не получены. Nginx не может запуститься с `listen 443 ssl` без сертификатов.

## Решение

Исправленный скрипт уже загружен. Выполните следующие команды на VPS:

### 1. Загрузите исправленный скрипт

```bash
# С Windows (в новом терминале PowerShell)
scp setup_vps_api.sh root@159.255.37.158:/root/
```

### 2. Или исправьте конфигурацию вручную на VPS

Если не хотите перезапускать скрипт, исправьте конфигурацию вручную:

```bash
# На VPS
nano /etc/nginx/sites-available/api.hotwell.synology.me
```

Замените содержимое на:

```nginx
# HTTP сервер для Let's Encrypt ACME challenge и проксирования
server {
    listen 80;
    listen [::]:80;
    server_name api.hotwell.synology.me;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Настройки для больших файлов/видео
    client_max_body_size 2g;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    sendfile on;
    tcp_nopush on;

    # CORS заголовки
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
    add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;

    # Обработка OPTIONS запросов
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Max-Age 1728000 always;
        add_header Content-Type "text/plain charset=UTF-8" always;
        add_header Content-Length 0 always;
        return 204;
    }

    # Проксирование на backend через VPN
    location / {
        proxy_pass http://10.8.0.2:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Поддержка Range запросов
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Специальный location для медиа файлов
    location /api/media/ {
        proxy_pass http://10.8.0.2:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Критично для Range запросов
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        
        # Дополнительные заголовки для видео
        proxy_hide_header Content-Length;
        proxy_hide_header Accept-Ranges;
    }
}

# HTTPS сервер будет автоматически добавлен certbot после получения сертификата
```

**Важно:** Замените `5000` на `5001` если ваш backend работает на порту 5001.

### 3. Проверьте конфигурацию и перезапустите Nginx

```bash
nginx -t
systemctl restart nginx
systemctl status nginx
```

### 4. Проверьте firewall

```bash
# Проверьте iptables
iptables -L -n | grep -E "(80|443)"

# Если порты заблокированы, откройте их:
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Сохраните правила (если используется iptables-persistent)
iptables-save > /etc/iptables/rules.v4
```

Или установите ufw:

```bash
apt install -y ufw
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

### 5. Проверьте работу HTTP

```bash
# С VPS
curl -I http://api.hotwell.synology.me/health

# Должно вернуть HTTP/1.1 200 или 301 (редирект)
```

### 6. Настройте DNS (если еще не настроено)

Создайте A-запись: `api.hotwell.synology.me` → `159.255.37.158`

Проверка:
```bash
dig +short api.hotwell.synology.me
```

### 7. Получите SSL сертификат

После того как DNS распространился:

```bash
apt install -y certbot python3-certbot-nginx

# Замените YOUR_EMAIL@example.com на ваш реальный email
certbot --nginx -d api.hotwell.synology.me \
  --non-interactive \
  --agree-tos \
  -m YOUR_EMAIL@example.com
```

Certbot автоматически:
- Получит SSL сертификат
- Добавит HTTPS блок в конфигурацию Nginx
- Настроит редирект с HTTP на HTTPS

### 8. Финальная проверка

```bash
# Проверка HTTPS
curl -I https://api.hotwell.synology.me/health

# Проверка Range запросов
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/user/channel/file.mp4
```

## Быстрое исправление (одна команда)

Если хотите быстро исправить конфигурацию, выполните на VPS:

```bash
cat > /etc/nginx/sites-available/api.hotwell.synology.me << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name api.hotwell.synology.me;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    client_max_body_size 2g;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
    add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;

    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Max-Age 1728000 always;
        add_header Content-Type "text/plain charset=UTF-8" always;
        add_header Content-Length 0 always;
        return 204;
    }

    location / {
        proxy_pass http://10.8.0.2:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    location /api/media/ {
        proxy_pass http://10.8.0.2:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_hide_header Content-Length;
        proxy_hide_header Accept-Ranges;
    }
}
EOF

nginx -t && systemctl restart nginx && echo "Nginx перезапущен успешно!"
```




