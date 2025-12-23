# Проверка и исправление конфигурации Nginx

## Шаг 1: Проверьте текущую конфигурацию

На VPS выполните:

```bash
cat /etc/nginx/sites-available/api.hotwell.synology.me | head -20
```

Это покажет первые 20 строк и вы увидите, что на строке 17.

## Шаг 2: Посмотрите всю конфигурацию

```bash
cat /etc/nginx/sites-available/api.hotwell.synology.me
```

## Шаг 3: Исправьте конфигурацию

Проблема в том, что `add_header` не может быть на уровне `server` вне `location` или `if` блоков. 

Выполните на VPS:

```bash
# Удаляем старую конфигурацию
rm -f /etc/nginx/sites-available/api.hotwell.synology.me
rm -f /etc/nginx/sites-enabled/api.hotwell.synology.me

# Создаем правильную конфигурацию через nano
nano /etc/nginx/sites-available/api.hotwell.synology.me
```

Вставьте эту конфигурацию (убедитесь, что нет add_header на уровне server):

```nginx
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
```

Сохраните (Ctrl+O, Enter) и выйдите (Ctrl+X).

Затем:

```bash
ln -sf /etc/nginx/sites-available/api.hotwell.synology.me /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```




