#!/bin/bash

# ============================================
# Первоначальная настройка Synology
# ============================================
# Этот скрипт нужно запустить ПЕРЕД деплоем
# Он создаст директории и проверит зависимости
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

step() {
    echo -e "${BLUE}▶ $1${NC}"
}

# Проверка, что скрипт запущен на Synology
if [ ! -d "/volume1" ]; then
    error "Этот скрипт должен быть запущен на Synology NAS"
fi

info "============================================"
info "Первоначальная настройка Synology"
info "============================================"
echo ""

# Константы
SYNO_APP_PATH="/volume1/shortsai/app"
SYNO_STORAGE_PATH="/volume1/shortsai/videos"
SYNO_LOGS_PATH="/volume1/shortsai/logs"

# 1. Создание директорий
step "1. Создание директорий..."
sudo mkdir -p "$SYNO_APP_PATH"
sudo mkdir -p "$SYNO_STORAGE_PATH"
sudo mkdir -p "$SYNO_LOGS_PATH"
success "Директории созданы"

# 2. Установка прав
step "2. Установка прав доступа..."
sudo chown -R admin:users /volume1/shortsai
sudo chmod -R 755 /volume1/shortsai
success "Права установлены"

# 3. Проверка Git
step "3. Проверка Git..."
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    success "Git установлен: $GIT_VERSION"
else
    error "Git не установлен!
    
Установите Git через Package Center:
  1. Откройте Package Center
  2. Найдите 'Git Server' или установите через Community Packages
  3. Или используйте альтернативный метод копирования файлов"
fi

# 4. Проверка Node.js
step "4. Проверка Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    success "Node.js установлен: $NODE_VERSION"
    
    # Проверка версии (нужна v18+)
    NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        error "Node.js версия слишком старая ($NODE_VERSION). Нужна v18 или выше.
        
Установите Node.js v18+ через Package Center"
    fi
else
    error "Node.js не установлен!
    
Установите Node.js через Package Center:
  1. Откройте Package Center
  2. Найдите 'Node.js v18' или 'Node.js v20'
  3. Установите"
fi

# 5. Проверка npm
step "5. Проверка npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    success "npm установлен: $NPM_VERSION"
else
    error "npm не найден. Переустановите Node.js через Package Center"
fi

# 6. Проверка pm2 (будет установлен при деплое, если нужно)
step "6. Проверка pm2..."
if command -v pm2 &> /dev/null; then
    success "pm2 уже установлен"
else
    info "pm2 будет установлен при деплое"
fi

echo ""
success "============================================"
success "Настройка завершена!"
success "============================================"
echo ""
info "Теперь можно выполнить деплой:"
echo ""
echo "cd /volume1/shortsai"
echo "git clone https://github.com/hotwellkz/p041.git app"
echo "cd app/backend"
echo "chmod +x deploy_to_synology_production.sh"
echo "sudo ./deploy_to_synology_production.sh"
echo ""


