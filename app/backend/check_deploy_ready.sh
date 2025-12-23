#!/bin/bash

# ============================================
# Проверка готовности к деплою
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

error() {
    echo -e "${RED}❌ $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

step() {
    echo -e "${BLUE}▶ $1${NC}"
}

ALL_OK=true

info "============================================"
info "Проверка готовности к деплою"
info "============================================"
echo ""

# Проверка файлов
step "Проверка файлов скриптов..."
if [ -f "deploy_synology_auto.sh" ]; then
    success "deploy_synology_auto.sh найден"
else
    error "deploy_synology_auto.sh не найден"
    ALL_OK=false
fi

if [ -f "deploy_to_synology_production.sh" ]; then
    success "deploy_to_synology_production.sh найден"
else
    error "deploy_to_synology_production.sh не найден"
    ALL_OK=false
fi

if [ -f "vps/synology-port-forward.sh" ]; then
    success "vps/synology-port-forward.sh найден"
else
    error "vps/synology-port-forward.sh не найден"
    ALL_OK=false
fi

if [ -f "env.production.example" ]; then
    success "env.production.example найден"
else
    error "env.production.example не найден"
    ALL_OK=false
fi

# Проверка прав на выполнение
step "Проверка прав на выполнение..."
chmod +x deploy_synology_auto.sh 2>/dev/null || true
chmod +x deploy_to_synology_production.sh 2>/dev/null || true
chmod +x vps/synology-port-forward.sh 2>/dev/null || true
success "Права установлены"

# Проверка подключения к Synology
step "Проверка подключения к Synology..."
SYNO_HOST=${SYNO_HOST:-"hotwell.synology.me"}
SYNO_USER=${SYNO_USER:-"admin"}

if command -v ssh &> /dev/null; then
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "$SYNO_USER@$SYNO_HOST" echo "OK" 2>/dev/null; then
        success "SSH подключение к Synology работает"
    else
        info "SSH подключение к Synology не работает (это нормально, если ключи не настроены)"
        info "При деплое будет запрошен пароль"
    fi
else
    info "SSH не найден (это нормально для Windows)"
fi

# Проверка подключения к VPS
step "Проверка подключения к VPS..."
VPS_IP="185.104.248.130"

if command -v ssh &> /dev/null; then
    if ssh -o ConnectTimeout=5 -o BatchMode=yes "root@$VPS_IP" echo "OK" 2>/dev/null; then
        success "SSH подключение к VPS работает"
    else
        info "SSH подключение к VPS не работает (это нормально, если ключи не настроены)"
    fi
else
    info "SSH не найден (это нормально для Windows)"
fi

# Проверка репозитория
step "Проверка репозитория..."
if [ -d ".git" ]; then
    success "Git репозиторий найден"
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    info "Текущая ветка: $CURRENT_BRANCH"
    
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [[ "$REMOTE_URL" == *"hotwellkz/p041"* ]]; then
        success "Удалённый репозиторий настроен правильно"
    else
        info "Удалённый репозиторий: $REMOTE_URL"
    fi
else
    info "Git репозиторий не найден (это нормально, если запускаете на Synology)"
fi

# Проверка package.json
step "Проверка package.json..."
if [ -f "package.json" ]; then
    success "package.json найден"
    if grep -q "\"build\"" package.json; then
        success "Скрипт build найден в package.json"
    else
        error "Скрипт build не найден в package.json"
        ALL_OK=false
    fi
else
    error "package.json не найден"
    ALL_OK=false
fi

# Итоговая проверка
echo ""
if [ "$ALL_OK" = true ]; then
    success "============================================"
    success "Всё готово к деплою!"
    success "============================================"
    echo ""
    info "Следующие шаги:"
    echo ""
    echo "1. Настройка VPS (если ещё не сделано):"
    echo -e "${GREEN}   ssh root@185.104.248.130${NC}"
    echo -e "${GREEN}   # Скопируйте backend/vps/synology-port-forward.sh${NC}"
    echo -e "${GREEN}   chmod +x synology-port-forward.sh${NC}"
    echo -e "${GREEN}   sudo ./synology-port-forward.sh${NC}"
    echo ""
    echo "2. Деплой на Synology:"
    echo -e "${GREEN}   cd backend${NC}"
    echo -e "${GREEN}   ./deploy_synology_auto.sh${NC}"
    echo ""
    exit 0
else
    error "============================================"
    error "Обнаружены проблемы!"
    error "============================================"
    echo ""
    info "Проверьте ошибки выше и исправьте их перед деплоем"
    exit 1
fi


