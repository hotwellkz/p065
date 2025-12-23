#!/bin/bash
# Финальное исправление конфигурации Nginx

# Удаляем старую конфигурацию
rm -f /etc/nginx/sites-available/api.hotwell.synology.me
rm -f /etc/nginx/sites-enabled/api.hotwell.synology.me

# Создаем правильную конфигурацию
cat > /etc/nginx/sites-available/api.hotwell.synology.me << 'NGINX_EOF'
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
NGINX_EOF

# Включаем сайт
ln -sf /etc/nginx/sites-available/api.hotwell.synology.me /etc/nginx/sites-enabled/

# Проверяем и перезапускаем
if nginx -t; then
    systemctl restart nginx
    echo "✅ Nginx успешно перезапущен!"
    echo "Проверьте: curl -I http://api.hotwell.synology.me/health"
else
    echo "❌ Ошибка в конфигурации!"
    nginx -t
    exit 1
fi




