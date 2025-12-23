#!/bin/bash

# ============================================
# Скрипт настройки проброса портов на VPS
# ============================================
# Пробрасывает порты с VPS на Synology через VPN туннель
# ============================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() {
    echo -e "${RED}❌ Ошибка: $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Константы
VPS_PUBLIC_IP="185.104.248.130"
SYNO_VPN_IP="10.8.0.2"
BACKEND_PORT=8080  # Порт на Synology, на котором слушает backend

# Порты на VPS, которые пробрасываются на Synology
# Формат: VPS_PORT:SYNO_PORT
PORTS=(
    "5001:$BACKEND_PORT"  # Backend API (публичный доступ)
    "5000:5000"           # Synology DSM (опционально)
    "6690:6690"           # Другой сервис (опционально)
    "3000:3000"           # Другой сервис (опционально)
)

# Интерфейс VPN (обычно tun0 для OpenVPN)
VPN_INTERFACE="tun0"

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root (sudo)"
fi

info "============================================"
info "Настройка проброса портов VPS → Synology"
info "============================================"
echo ""

# 1. Проверка наличия iptables
if ! command -v iptables &> /dev/null; then
    error "iptables не установлен. Установите: apt-get install iptables"
fi

# 2. Включение IP forwarding
info "Включаю IP forwarding..."
echo 1 > /proc/sys/net/ipv4/ip_forward
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p > /dev/null
success "IP forwarding включён"

# 3. Очистка старых правил (опционально, закомментируйте если нужно сохранить существующие)
info "Очищаю старые правила NAT..."
iptables -t nat -F PREROUTING 2>/dev/null || true
iptables -t nat -F POSTROUTING 2>/dev/null || true
iptables -F FORWARD 2>/dev/null || true
success "Старые правила очищены"

# 4. Создание цепочки для портов Synology
info "Создаю цепочку SYNOLOGY_PORTS..."
iptables -N SYNOLOGY_PORTS 2>/dev/null || iptables -F SYNOLOGY_PORTS
success "Цепочка создана"

# 5. Настройка проброса портов
info "Настраиваю проброс портов..."
for port_mapping in "${PORTS[@]}"; do
    IFS=':' read -r vps_port syno_port <<< "$port_mapping"
    info "  Пробрасываю $VPS_PUBLIC_IP:$vps_port → $SYNO_VPN_IP:$syno_port"
    
    # DNAT: перенаправление входящих соединений
    iptables -t nat -A PREROUTING \
        -i eth0 \
        -p tcp \
        --dport "$vps_port" \
        -j DNAT \
        --to-destination "$SYNO_VPN_IP:$syno_port" || error "Не удалось настроить DNAT для порта $vps_port"
    
    # Разрешение в цепочке SYNOLOGY_PORTS
    iptables -A SYNOLOGY_PORTS \
        -p tcp \
        --dport "$vps_port" \
        -j ACCEPT || error "Не удалось добавить правило для порта $vps_port"
done
success "Проброс портов настроен"

# 6. Настройка MASQUERADE для VPN сети
info "Настраиваю MASQUERADE для VPN сети..."
iptables -t nat -A POSTROUTING \
    -s 10.8.0.0/24 \
    -o eth0 \
    -j MASQUERADE || error "Не удалось настроить MASQUERADE"
success "MASQUERADE настроен"

# 7. Разрешение FORWARD для VPN интерфейса
info "Настраиваю FORWARD правила..."
iptables -A FORWARD \
    -i "$VPN_INTERFACE" \
    -o eth0 \
    -j ACCEPT || error "Не удалось настроить FORWARD (VPN → Internet)"
    
iptables -A FORWARD \
    -i eth0 \
    -o "$VPN_INTERFACE" \
    -m state \
    --state RELATED,ESTABLISHED \
    -j ACCEPT || error "Не удалось настроить FORWARD (Internet → VPN)"
success "FORWARD правила настроены"

# 8. Сохранение правил iptables
info "Сохраняю правила iptables..."
if command -v iptables-save &> /dev/null; then
    # Для Ubuntu/Debian
    if [ -d "/etc/iptables" ]; then
        mkdir -p /etc/iptables
    fi
    iptables-save > /etc/iptables/rules.v4 || {
        info "Не удалось сохранить в /etc/iptables/rules.v4, используем альтернативный метод"
    }
    
    # Альтернативный метод через netfilter-persistent
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save || {
            info "netfilter-persistent не доступен, правила нужно сохранить вручную"
        }
    fi
fi
success "Правила сохранены"

# 9. Создание скрипта автозапуска
info "Создаю скрипт автозапуска..."
cat > /etc/systemd/system/synology-port-forward.service << EOF
[Unit]
Description=Synology Port Forwarding
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/synology-port-forward.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Копирование скрипта в системную директорию
cp "$0" /usr/local/bin/synology-port-forward.sh
chmod +x /usr/local/bin/synology-port-forward.sh

# Включение автозапуска
systemctl daemon-reload
systemctl enable synology-port-forward.service
success "Автозапуск настроен"

# 10. Проверка правил
info "Текущие правила NAT:"
iptables -t nat -L PREROUTING -n -v | grep -E "DNAT|dpt" || true

echo ""
success "============================================"
success "Настройка завершена!"
success "============================================"
echo ""
info "Проброшенные порты:"
for port_mapping in "${PORTS[@]}"; do
    IFS=':' read -r vps_port syno_port <<< "$port_mapping"
    echo -e "${GREEN}  $VPS_PUBLIC_IP:$vps_port → $SYNO_VPN_IP:$syno_port${NC}"
done
echo ""
info "Проверка доступности:"
echo -e "${GREEN}  curl -I http://$VPS_PUBLIC_IP:5001/health${NC}"
echo ""
info "Просмотр логов:"
echo -e "${GREEN}  journalctl -u synology-port-forward.service -f${NC}"
echo ""


