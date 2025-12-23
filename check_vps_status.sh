#!/bin/bash
# Скрипт проверки состояния VPS и VPN подключения

echo "=== Проверка VPN подключения ==="
echo "Интерфейсы:"
ip a | grep -E "(tun|wg|ppp|vpn|10\.8\.0)" || echo "VPN интерфейсы не найдены"

echo -e "\nМаршруты:"
ip route | grep -E "(10\.8\.0|vpn)" || echo "Маршруты VPN не найдены"

echo -e "\n=== Проверка доступности backend ==="
echo "Ping 10.8.0.2:"
ping -c 2 10.8.0.2 2>&1

echo -e "\nПроверка порта 5001:"
timeout 5 curl -v http://10.8.0.2:5001/health 2>&1 | head -30 || echo "Не удалось подключиться к 5001"

echo -e "\nПроверка порта 5000:"
timeout 5 curl -v http://10.8.0.2:5000/health 2>&1 | head -30 || echo "Не удалось подключиться к 5000"

echo -e "\n=== Проверка Nginx ==="
systemctl status nginx --no-pager | head -10

echo -e "\n=== Проверка firewall ==="
if command -v ufw &> /dev/null; then
    ufw status
else
    echo "Проверка iptables:"
    iptables -L -n | grep -E "(80|443)" || echo "Правила для 80/443 не найдены"
fi

echo -e "\n=== Проверка DNS ==="
dig +short api.hotwell.synology.me || nslookup api.hotwell.synology.me || echo "DNS не настроен"

echo -e "\n=== Проверка SSL сертификата ==="
if [ -f /etc/letsencrypt/live/api.hotwell.synology.me/fullchain.pem ]; then
    echo "Сертификат найден:"
    openssl x509 -in /etc/letsencrypt/live/api.hotwell.synology.me/fullchain.pem -noout -dates
else
    echo "Сертификат не найден"
fi

echo -e "\n=== Тест внешнего доступа ==="
echo "Тест /health:"
curl -I https://api.hotwell.synology.me/health 2>&1 | head -10

echo -e "\n=== Последние ошибки Nginx ==="
tail -20 /var/log/nginx/error.log




