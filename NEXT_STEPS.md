# Следующие шаги на VPS

## Подключитесь к VPS и выполните исправление

### 1. Подключитесь к VPS

```powershell
# В PowerShell на Windows
ssh root@159.255.37.158
```

### 2. Исправьте конфигурацию Nginx (выполните на VPS)

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
    sendfile on;
    tcp_nopush on;

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
        
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;
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
        
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;
    }
}
EOF

ln -sf /etc/nginx/sites-available/api.hotwell.synology.me /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx && echo "✅ Nginx перезапущен успешно!"
```

### 3. Проверьте работу

```bash
# На VPS
curl -I http://api.hotwell.synology.me/health

# Или проверьте с внешнего устройства (4G)
# Откройте в браузере: http://api.hotwell.synology.me/health
```

### 4. Настройте firewall

```bash
# Установите ufw если еще не установлен
apt install -y ufw

# Откройте порты
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

### 5. Настройте DNS (если еще не настроено)

Создайте A-запись: `api.hotwell.synology.me` → `159.255.37.158`

Проверка:
```bash
dig +short api.hotwell.synology.me
```

### 6. Получите SSL сертификат

После того как DNS распространился:

```bash
apt install -y certbot python3-certbot-nginx

# Замените YOUR_EMAIL@example.com на ваш реальный email
certbot --nginx -d api.hotwell.synology.me \
  --non-interactive \
  --agree-tos \
  -m YOUR_EMAIL@example.com
```

Certbot автоматически добавит HTTPS блок в конфигурацию.

### 7. Финальная проверка

```bash
# Проверка HTTPS
curl -I https://api.hotwell.synology.me/health

# Проверка Range запросов
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/user/channel/file.mp4
```

## Важно

- Все команды с `nginx`, `systemctl`, `curl` выполняются **на VPS через SSH**, а не в PowerShell на Windows
- PowerShell используется только для `scp` (копирование файлов) и `ssh` (подключение к VPS)
- После подключения к VPS вы работаете в Linux терминале, а не в PowerShell




