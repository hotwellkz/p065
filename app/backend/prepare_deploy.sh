#!/bin/bash

# ============================================
# Подготовка к деплою - финальная проверка
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

step() {
    echo -e "${BLUE}▶ $1${NC}"
}

info "============================================"
info "Финальная подготовка к деплою"
info "============================================"
echo ""

# Проверка, что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "Запустите скрипт из директории backend/"
    exit 1
fi

step "1. Проверка всех необходимых файлов..."
FILES=(
    "deploy_synology_auto.sh"
    "deploy_to_synology_production.sh"
    "vps/synology-port-forward.sh"
    "env.production.example"
    "src/index.ts"
    "package.json"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        success "$file найден"
    else
        echo "Ошибка: $file не найден"
        exit 1
    fi
done

step "2. Установка прав на выполнение..."
chmod +x deploy_synology_auto.sh
chmod +x deploy_to_synology_production.sh
chmod +x vps/synology-port-forward.sh 2>/dev/null || true
success "Права установлены"

step "3. Проверка изменений в коде..."
if grep -q "0.0.0.0" src/index.ts; then
    success "Backend настроен на прослушивание всех интерфейсов"
else
    echo "Предупреждение: проверьте настройку app.listen в src/index.ts"
fi

step "4. Проверка BACKEND_URL в env.example..."
if grep -q "185.104.248.130:5001" env.example; then
    success "BACKEND_URL документирован в env.example"
else
    echo "Предупреждение: проверьте документацию BACKEND_URL"
fi

step "5. Проверка структуры проекта..."
if [ -d "src" ] && [ -d "src/routes" ] && [ -d "src/services" ]; then
    success "Структура проекта корректна"
else
    echo "Ошибка: некорректная структура проекта"
    exit 1
fi

echo ""
success "============================================"
success "Подготовка завершена!"
success "============================================"
echo ""
info "Всё готово к деплою. Запустите:"
echo -e "${GREEN}  ./deploy_synology_auto.sh${NC}"
echo ""


