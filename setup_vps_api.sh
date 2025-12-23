#!/bin/bash
# Скрипт настройки публичного HTTPS API на VPS
# Выполнять на VPS с правами root

set -euo pipefail

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода ошибок
error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Функция для вывода успеха
success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# Функция для вывода предупреждений
warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo "=== Шаг 1: Проверка ОС и VPN ==="
uname -a
cat /etc/os-release | head -5

echo -e "\n=== Шаг 2: Проверка VPN интерфейсов ==="
ip a | grep -E "(tun|wg|ppp|vpn)" || echo "VPN интерфейсы не найдены в выводе ip a"

echo -e "\n=== Шаг 3: Проверка маршрутов ==="
ip route | grep -E "(10\.8\.0|vpn)" || echo "Маршруты VPN не найдены"

echo -e "\n=== Шаг 4: Проверка доступности backend ==="
BACKEND_PORT=""
BACKEND_IP="10.8.0.2"

echo "Проверка ping до ${BACKEND_IP}..."
if ping -c 2 -W 2 ${BACKEND_IP} &>/dev/null; then
    success "Ping до ${BACKEND_IP} успешен"
else
    error "Ping до ${BACKEND_IP} не прошел. Проверьте VPN подключение!"
    echo "Попытка найти VPN интерфейс и добавить маршрут..."
    VPN_IF=$(ip route | grep "10.8.0" | awk '{print $3}' | head -1)
    if [ -n "$VPN_IF" ]; then
        warning "Найден VPN интерфейс: $VPN_IF"
        echo "Попробуйте добавить маршрут: ip route add 10.8.0.0/24 dev $VPN_IF"
    fi
fi

echo -e "\nОпределение порта backend..."
for port in 5001 5000; do
    echo "Проверка порта $port..."
    if timeout 5 curl -s -f -o /dev/null http://${BACKEND_IP}:${port}/health 2>/dev/null; then
        BACKEND_PORT=$port
        success "Backend отвечает на порту $port"
        break
    elif timeout 5 curl -s -f -o /dev/null http://${BACKEND_IP}:${port}/ 2>/dev/null; then
        BACKEND_PORT=$port
        warning "Backend отвечает на порту $port, но /health не найден"
        break
    fi
done

if [ -z "$BACKEND_PORT" ]; then
    error "Backend не отвечает ни на порту 5001, ни на 5000!"
    echo "Проверьте:"
    echo "  1. VPN туннель активен"
    echo "  2. Backend запущен на Synology"
    echo "  3. Firewall на VPS разрешает исходящие соединения"
    echo "  4. Правильный IP адрес backend (может быть не 10.8.0.2)"
    exit 1
fi

success "Используется порт backend: $BACKEND_PORT"

echo -e "\n=== Шаг 5: Установка Nginx ==="
apt update
apt install -y nginx

echo -e "\n=== Шаг 6: Настройка firewall ==="
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    ufw status
else
    warning "ufw не найден, проверяю iptables/nftables..."
    # Проверяем iptables
    if command -v iptables &> /dev/null; then
        echo "Проверка правил iptables для портов 80 и 443..."
        iptables -L -n | grep -E "(80|443)" || echo "Правила для 80/443 не найдены в iptables"
        echo "Если порты заблокированы, выполните:"
        echo "  iptables -A INPUT -p tcp --dport 80 -j ACCEPT"
        echo "  iptables -A INPUT -p tcp --dport 443 -j ACCEPT"
    fi
    # Проверяем nftables
    if command -v nft &> /dev/null; then
        echo "Проверка правил nftables..."
        nft list ruleset | grep -E "(80|443)" || echo "Правила для 80/443 не найдены в nftables"
    fi
    warning "Убедитесь, что порты 80 и 443 открыты для входящих соединений!"
fi

echo -e "\n=== Шаг 7: Создание конфигурации Nginx ==="
# Используем найденный порт в конфигурации
# Создаем временный файл с плейсхолдерами
cat > /tmp/nginx_config.tmp << 'NGINX_CONFIG_TEMPLATE'
# HTTP сервер для Let's Encrypt ACME challenge
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

    # Обработка OPTIONS запросов (preflight)
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Max-Age 1728000 always;
        add_header Content-Type "text/plain charset=UTF-8" always;
        add_header Content-Length 0 always;
        return 204;
    }

    # Временно проксируем на backend через HTTP (до получения SSL сертификата)
    # После получения сертификата certbot автоматически добавит HTTPS блок
    location / {
        proxy_pass http://BACKEND_IP_PLACEHOLDER:BACKEND_PORT_PLACEHOLDER;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Поддержка Range запросов
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_buffering off;
        proxy_request_buffering off;
        
        # CORS заголовки
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;
    }

    # Специальный location для медиа файлов
    location /api/media/ {
        proxy_pass http://BACKEND_IP_PLACEHOLDER:BACKEND_PORT_PLACEHOLDER;
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
        
        # CORS заголовки для медиа
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET,POST,PUT,PATCH,DELETE,OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization,Content-Type,Range,Origin,Accept" always;
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range,Accept-Ranges" always;
    }
}

# HTTPS сервер (будет автоматически добавлен certbot после получения сертификата)
# Раскомментируйте вручную если нужно настроить до certbot:
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name api.hotwell.synology.me;
#
#     # SSL сертификаты (будут добавлены certbot)
#     # ssl_certificate /etc/letsencrypt/live/api.hotwell.synology.me/fullchain.pem;
#     # ssl_certificate_key /etc/letsencrypt/live/api.hotwell.synology.me/privkey.pem;

NGINX_CONFIG_TEMPLATE

# Заменяем плейсхолдеры на реальные значения
sed "s/BACKEND_IP_PLACEHOLDER/${BACKEND_IP}/g; s/BACKEND_PORT_PLACEHOLDER/${BACKEND_PORT}/g" \
    /tmp/nginx_config.tmp > /etc/nginx/sites-available/api.hotwell.synology.me
rm -f /tmp/nginx_config.tmp

success "Конфигурация Nginx создана с портом $BACKEND_PORT"

# Включение сайта
ln -sf /etc/nginx/sites-available/api.hotwell.synology.me /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Удаляем старые конфигурации с HTTPS если есть
if grep -q "listen 443 ssl" /etc/nginx/sites-enabled/api.hotwell.synology.me 2>/dev/null; then
    warning "Обнаружен HTTPS блок в конфигурации, удаляем..."
    # Создаем временный файл без HTTPS блока
    grep -v "listen 443 ssl" /etc/nginx/sites-enabled/api.hotwell.synology.me | \
    grep -v "ssl_certificate" | \
    grep -v "ssl_protocols" | \
    grep -v "ssl_ciphers" > /tmp/nginx_config_no_ssl.tmp 2>/dev/null || true
    mv /tmp/nginx_config_no_ssl.tmp /etc/nginx/sites-available/api.hotwell.synology.me
    ln -sf /etc/nginx/sites-available/api.hotwell.synology.me /etc/nginx/sites-enabled/
fi

# Проверка конфигурации
if nginx -t; then
    success "Конфигурация Nginx валидна"
else
    error "Ошибка в конфигурации Nginx!"
    echo "Проверьте конфигурацию:"
    cat /etc/nginx/sites-available/api.hotwell.synology.me
    exit 1
fi

# Перезапуск Nginx
systemctl enable --now nginx
if systemctl restart nginx; then
    success "Nginx перезапущен"
else
    error "Не удалось перезапустить Nginx!"
    exit 1
fi

echo -e "\n=== Шаг 8: Проверка DNS ==="
DOMAIN="api.hotwell.synology.me"
EXPECTED_IP="159.255.37.158"

echo "Проверка DNS записи для $DOMAIN..."
DNS_IP=$(dig +short $DOMAIN 2>/dev/null | tail -1 || nslookup $DOMAIN 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | tail -1)

if [ -n "$DNS_IP" ]; then
    if [ "$DNS_IP" = "$EXPECTED_IP" ]; then
        success "DNS настроен правильно: $DOMAIN -> $DNS_IP"
    else
        warning "DNS указывает на другой IP: $DNS_IP (ожидается $EXPECTED_IP)"
        echo "Убедитесь, что A-запись настроена правильно!"
    fi
else
    error "DNS запись не найдена или не распространилась!"
    echo "Настройте A-запись: $DOMAIN -> $EXPECTED_IP"
    echo "Подождите несколько минут для распространения DNS"
fi

echo -e "\n=== Шаг 9: Установка Certbot ==="
apt install -y certbot python3-certbot-nginx

echo -e "\n=== Шаг 10: Выпуск SSL сертификата ==="
if [ -n "$DNS_IP" ] && [ "$DNS_IP" = "$EXPECTED_IP" ]; then
    warning "Перед получением SSL сертификата убедитесь, что DNS распространился!"
    echo "Выполните команду (замените YOUR_EMAIL@example.com на ваш email):"
    echo ""
    echo "certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m YOUR_EMAIL@example.com"
    echo ""
    echo "Или выполните интерактивно:"
    echo "certbot --nginx -d $DOMAIN"
else
    error "DNS не настроен! Настройте DNS перед получением SSL сертификата!"
fi

echo -e "\n=== Готово! ==="
success "Основная настройка завершена"
echo ""
echo "Следующие шаги:"
echo "1. Убедитесь, что DNS запись $DOMAIN указывает на $EXPECTED_IP"
echo "2. Получите SSL сертификат: certbot --nginx -d $DOMAIN -m YOUR_EMAIL@example.com"
echo "3. Проверьте работу: curl -I https://$DOMAIN/health"
echo ""
echo "Полезные команды:"
echo "  Проверка статуса: systemctl status nginx"
echo "  Логи ошибок: tail -f /var/log/nginx/error.log"
echo "  Логи доступа: tail -f /var/log/nginx/access.log"
echo "  Проверка конфигурации: nginx -t"
echo "  Перезагрузка: systemctl reload nginx"

