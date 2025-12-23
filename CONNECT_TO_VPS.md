# Подключение к VPS и выполнение команд

## ⚠️ ВАЖНО: Разница между PowerShell и VPS

- **PowerShell (Windows)** - это ваш локальный компьютер
  - Здесь выполняются: `scp`, `ssh` (для подключения)
  - Здесь НЕ выполняются: `nginx`, `systemctl`, `cat`, `ln` и другие Linux команды

- **VPS (Linux)** - это удаленный сервер
  - После подключения через `ssh` вы работаете в Linux терминале
  - Здесь выполняются ВСЕ команды для настройки Nginx

## Шаг 1: Подключитесь к VPS

В PowerShell выполните:

```powershell
ssh root@159.255.37.158
```

После ввода пароля вы увидите приглашение:
```
root@vm3737624:~#
```

**Это означает, что вы теперь на VPS!**

## Шаг 2: Выполните команды на VPS

Теперь, когда вы на VPS (видите `root@vm3737624:~#`), выполните:

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

## Шаг 3: Проверьте работу

На VPS выполните:

```bash
curl -I http://api.hotwell.synology.me/health
```

## Визуальная схема

```
┌─────────────────────────────────────────┐
│  PowerShell (Windows)                   │
│  PS C:\Users\...>                       │
│                                         │
│  ✅ scp file.sh root@VPS:/root/        │
│  ✅ ssh root@159.255.37.158            │
│  ❌ nginx -t  (НЕ РАБОТАЕТ!)            │
└─────────────────────────────────────────┘
                    │
                    │ ssh подключение
                    ↓
┌─────────────────────────────────────────┐
│  VPS (Linux Ubuntu)                     │
│  root@vm3737624:~#                      │
│                                         │
│  ✅ nginx -t                            │
│  ✅ systemctl restart nginx            │
│  ✅ curl http://...                     │
│  ✅ cat, ln, и другие Linux команды    │
└─────────────────────────────────────────┘
```

## Быстрая проверка: где вы находитесь?

- **Если видите `PS C:\Users\...>`** → вы в PowerShell (Windows)
  - Выполните: `ssh root@159.255.37.158`

- **Если видите `root@vm3737624:~#`** → вы на VPS (Linux)
  - Теперь можно выполнять Linux команды!

## Альтернатива: Используйте готовый скрипт

Если у вас уже есть исправленный `setup_vps_api.sh` на VPS:

```bash
# На VPS
chmod +x /root/setup_vps_api.sh
/root/setup_vps_api.sh
```

Но скрипт все еще может иметь проблемы, поэтому лучше использовать команду выше.




