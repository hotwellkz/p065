#!/bin/bash

# ============================================
# Автоматический деплой на Synology
# ============================================
# Этот скрипт можно запустить локально или на Synology
# Он автоматически определит окружение и выполнит нужные действия
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

# Константы
SYNO_APP_PATH="/volume1/shortsai/app"
SYNO_STORAGE_PATH="/volume1/shortsai/videos"
SYNO_LOGS_PATH="/volume1/shortsai/logs"
BACKEND_PORT=8080
VPS_PUBLIC_IP="185.104.248.130"
VPS_PUBLIC_PORT=5001
REPO_URL="https://github.com/hotwellkz/p041.git"

# Определение, запущен ли скрипт на Synology
IS_SYNOLOGY=false
if [ -d "/volume1" ]; then
    IS_SYNOLOGY=true
    info "Обнаружен Synology NAS"
else
    info "Запуск в режиме удалённого деплоя"
fi

info "============================================"
info "Автоматический деплой ShortsAI Studio"
info "============================================"
echo ""

# Если не на Synology, пытаемся подключиться по SSH
if [ "$IS_SYNOLOGY" = false ]; then
    step "Режим удалённого деплоя через SSH"
    
    # Проверка переменных окружения для SSH
    if [ -z "$SYNO_HOST" ]; then
        SYNO_HOST="hotwell.synology.me"
        info "SYNO_HOST не задан, используем: $SYNO_HOST"
    fi
    
    if [ -z "$SYNO_USER" ]; then
        SYNO_USER="admin"
        info "SYNO_USER не задан, используем: $SYNO_USER"
    fi
    
    SSH_CONNECTION="$SYNO_USER@$SYNO_HOST"
    SSH_OPTS=""
    
    if [ -n "$SYNO_SSH_KEY_PATH" ]; then
        SSH_OPTS="-i $SYNO_SSH_KEY_PATH"
    fi
    
    if [ -n "$SYNO_SSH_PORT" ]; then
        SSH_OPTS="$SSH_OPTS -p $SYNO_SSH_PORT"
    fi
    
    step "Проверка SSH подключения к $SSH_CONNECTION..."
    if ! ssh $SSH_OPTS -o ConnectTimeout=5 -o BatchMode=yes "$SSH_CONNECTION" echo "OK" 2>/dev/null; then
        error "Не удалось подключиться к Synology по SSH.
Проверьте:
  - Доступность NAS: ping $SYNO_HOST
  - SSH включен на Synology
  - Правильность логина/пароля или SSH ключа
  - Переменные: SYNO_HOST, SYNO_USER, SYNO_SSH_KEY_PATH (опционально)"
    fi
    success "SSH подключение установлено"
    
    # Копирование скрипта на Synology и запуск
    step "Копирую скрипт на Synology..."
    TEMP_SCRIPT="/tmp/deploy_synology_auto_$$.sh"
    cat > "$TEMP_SCRIPT" << 'REMOTE_SCRIPT_END'
#!/bin/bash
set -e
# Скрипт будет выполнен на Synology
REMOTE_SCRIPT_END
    cat "$0" >> "$TEMP_SCRIPT"
    
    scp $SSH_OPTS "$TEMP_SCRIPT" "$SSH_CONNECTION:/tmp/deploy_synology.sh" || error "Не удалось скопировать скрипт"
    rm -f "$TEMP_SCRIPT"
    
    step "Запускаю скрипт на Synology..."
    ssh $SSH_OPTS "$SSH_CONNECTION" "chmod +x /tmp/deploy_synology.sh && sudo /tmp/deploy_synology.sh" || error "Ошибка при выполнении скрипта на Synology"
    
    success "Деплой завершён!"
    exit 0
fi

# ============================================
# Выполнение на Synology
# ============================================

step "1. Создание директорий..."
mkdir -p "$SYNO_APP_PATH"
mkdir -p "$SYNO_STORAGE_PATH"
mkdir -p "$SYNO_LOGS_PATH"
success "Директории созданы"

step "2. Проверка Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js не установлен. Установите через Package Center (Node.js v18+)"
fi
NODE_VERSION=$(node -v)
info "Node.js: $NODE_VERSION"
success "Node.js установлен"

step "3. Проверка Git..."
if ! command -v git &> /dev/null; then
    error "Git не установлен. Установите через Package Center"
fi
success "Git установлен"

step "4. Клонирование/обновление репозитория..."
if [ -d "$SYNO_APP_PATH/.git" ]; then
    info "Репозиторий существует, обновляю..."
    cd "$SYNO_APP_PATH"
    git fetch origin || error "Не удалось получить обновления"
    git reset --hard origin/main || error "Не удалось обновить код"
    success "Репозиторий обновлён"
else
    info "Клонирую репозиторий..."
    cd /volume1/shortsai
    rm -rf app 2>/dev/null || true
    git clone "$REPO_URL" app || error "Не удалось клонировать репозиторий"
    success "Репозиторий клонирован"
fi

step "5. Переход в директорию backend..."
cd "$SYNO_APP_PATH/backend" || error "Директория backend не найдена"
success "В директории backend"

step "6. Установка зависимостей..."
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    info "Устанавливаю зависимости..."
    npm install --production || error "Не удалось установить зависимости"
    success "Зависимости установлены"
else
    info "Зависимости уже установлены"
fi

step "7. Компиляция TypeScript..."
npm run build || error "Не удалось скомпилировать TypeScript"
if [ ! -d "dist" ]; then
    error "Папка dist не создана после сборки"
fi
success "TypeScript скомпилирован"

step "8. Настройка .env..."
if [ ! -f ".env" ]; then
    info "Создаю .env из env.production.example..."
    if [ -f "env.production.example" ]; then
        cp env.production.example .env
    elif [ -f "env.example" ]; then
        cp env.example .env
    else
        error "Файл env.example не найден"
    fi
fi

# Обновление критичных переменных
info "Обновляю переменные окружения..."
# Удаляем старые значения и добавляем новые
sed -i '/^NODE_ENV=/d' .env 2>/dev/null || true
sed -i '/^PORT=/d' .env 2>/dev/null || true
sed -i '/^STORAGE_ROOT=/d' .env 2>/dev/null || true
sed -i '/^BACKEND_URL=/d' .env 2>/dev/null || true

cat >> .env << EOF

# ============================================
# Production Settings (Synology) - Auto-generated
# ============================================
NODE_ENV=production
PORT=$BACKEND_PORT
STORAGE_ROOT=$SYNO_STORAGE_PATH
BACKEND_URL=http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT
EOF

success ".env настроен"
info "BACKEND_URL: http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT"

step "9. Установка pm2..."
if ! command -v pm2 &> /dev/null; then
    info "Устанавливаю pm2 глобально..."
    npm install -g pm2 || error "Не удалось установить pm2"
    success "pm2 установлен"
else
    info "pm2 уже установлен"
fi

step "10. Остановка старого процесса..."
pm2 delete shortsai-backend 2>/dev/null || true
success "Старые процессы остановлены"

step "11. Запуск backend через pm2..."
pm2 start dist/index.js \
    --name shortsai-backend \
    --node-args="--max-old-space-size=2048" \
    --log-date-format="YYYY-MM-DD HH:mm:ss Z" \
    --merge-logs \
    --error-log "$SYNO_LOGS_PATH/backend-error.log" \
    --out-log "$SYNO_LOGS_PATH/backend-out.log" \
    || error "Не удалось запустить backend"

success "Backend запущен через pm2"

step "12. Сохранение конфигурации pm2..."
pm2 save || error "Не удалось сохранить конфигурацию pm2"
success "Конфигурация сохранена"

step "13. Настройка автозапуска..."
STARTUP_CMD=$(pm2 startup | grep -o "sudo.*" || echo "")
if [ -n "$STARTUP_CMD" ]; then
    info "Выполняю команду автозапуска..."
    eval "$STARTUP_CMD" || info "Автозапуск уже настроен"
    success "Автозапуск настроен"
else
    info "Автозапуск уже настроен"
fi

step "14. Проверка работоспособности..."
sleep 5
if curl -f -s http://127.0.0.1:$BACKEND_PORT/health > /dev/null; then
    success "Backend отвечает на /health"
else
    error "Backend не отвечает на /health. Проверьте логи: pm2 logs shortsai-backend"
fi

# Финальный вывод
echo ""
success "============================================"
success "Деплой завершён успешно!"
success "============================================"
echo ""
info "Backend слушает на:"
echo -e "${GREEN}  127.0.0.1:$BACKEND_PORT (локально на Synology)${NC}"
echo ""
info "Публичный URL (через VPS):"
echo -e "${GREEN}  http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT${NC}"
echo ""
info "Проверка:"
echo -e "${GREEN}  curl http://127.0.0.1:$BACKEND_PORT/health${NC}"
echo -e "${GREEN}  curl http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT/health${NC}"
echo ""
info "Управление:"
echo -e "${GREEN}  pm2 status${NC}"
echo -e "${GREEN}  pm2 logs shortsai-backend${NC}"
echo -e "${GREEN}  pm2 restart shortsai-backend${NC}"
echo ""


