#!/bin/bash

# ============================================
# Скрипт деплоя backend на Synology NAS (Production)
# ============================================
# Этот скрипт:
# 1. Клонирует/обновляет репозиторий на Synology
# 2. Устанавливает зависимости
# 3. Настраивает .env для продакшена
# 4. Запускает backend через pm2
# 5. Настраивает автозапуск
# ============================================

set -e  # Остановка при любой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода ошибок
error() {
    echo -e "${RED}❌ Ошибка: $1${NC}" >&2
    exit 1
}

# Функция для вывода успешных сообщений
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Функция для вывода информационных сообщений
info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Константы
SYNO_APP_PATH="/volume1/shortsai/app"
SYNO_STORAGE_PATH="/volume1/shortsai/videos"
BACKEND_PORT=8080  # Порт, на котором слушает backend на Synology
VPS_PUBLIC_IP="185.104.248.130"
VPS_PUBLIC_PORT=5001  # Порт на VPS, который пробрасывается на Synology
SYNO_VPN_IP="10.8.0.2"  # IP Synology в VPN туннеле

# Проверка, что скрипт запущен на Synology
if [ ! -d "/volume1" ]; then
    error "Этот скрипт должен быть запущен на Synology NAS"
fi

info "============================================"
info "Деплой ShortsAI Studio Backend на Synology"
info "============================================"
echo ""

# 1. Создание директорий
info "Создаю директории..."
mkdir -p "$SYNO_APP_PATH"
mkdir -p "$SYNO_STORAGE_PATH"
success "Директории созданы"

# 2. Клонирование/обновление репозитория
info "Проверяю репозиторий..."
if [ -d "$SYNO_APP_PATH/.git" ]; then
    info "Репозиторий уже существует, исправляю права доступа..."
    sudo chown -R admin:users "$SYNO_APP_PATH"
    sudo chmod -R 755 "$SYNO_APP_PATH"
    info "Отменяю локальные изменения перед обновлением..."
    cd "$SYNO_APP_PATH"
    # Получаем последние изменения из репозитория
    git fetch origin main || true
    # Сбрасываем все локальные изменения и переходим на последнюю версию
    git reset --hard origin/main || true
    git clean -fd || true
    info "Репозиторий обновлён"
else
    info "Клонирую репозиторий..."
    cd /volume1/shortsai
    git clone https://github.com/hotwellkz/p041.git app || error "Не удалось клонировать репозиторий"
    sudo chown -R admin:users "$SYNO_APP_PATH"
    sudo chmod -R 755 "$SYNO_APP_PATH"
    success "Репозиторий клонирован"
fi

# 3. Переход в директорию backend
cd "$SYNO_APP_PATH/backend" || error "Директория backend не найдена"

# Исправление окончаний строк (CRLF -> LF) для скрипта деплоя
sed -i 's/\r$//' deploy_to_synology_production.sh 2>/dev/null || true

# Установка прав на выполнение для скрипта деплоя
chmod +x deploy_to_synology_production.sh 2>/dev/null || true

# 4. Проверка Node.js
info "Проверяю Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js не установлен. Установите Node.js LTS через Package Center или используйте Node.js v18+"
fi

NODE_VERSION=$(node -v)
info "Node.js версия: $NODE_VERSION"

# 5. Установка зависимостей (включая dev для компиляции)
info "Устанавливаю зависимости (включая dev для компиляции)..."
npm install || error "Не удалось установить зависимости"
success "Зависимости установлены"

# 6. Компиляция TypeScript
info "Компилирую TypeScript..."
npm run build || error "Не удалось скомпилировать TypeScript"
success "TypeScript скомпилирован"

# 7. Создание .env для продакшена
info "Настраиваю .env для продакшена..."
if [ ! -f ".env" ]; then
    info "Создаю .env из env.production.example (если есть) или env.example..."
    if [ -f "env.production.example" ]; then
        cp env.production.example .env
    else
        cp env.example .env
    fi
fi

# Обновление критичных переменных в .env
info "Обновляю переменные окружения..."

# Удаляем дубликаты и обновляем переменные
# Используем временный файл для безопасного обновления
TEMP_ENV=$(mktemp)
grep -v "^NODE_ENV=" .env | grep -v "^PORT=" | grep -v "^STORAGE_ROOT=" | grep -v "^BACKEND_URL=" > "$TEMP_ENV" 2>/dev/null || true

# Добавляем/обновляем критичные переменные
cat >> "$TEMP_ENV" << EOF

# ============================================
# Production Settings (Synology) - Auto-generated
# ============================================
NODE_ENV=production
PORT=$BACKEND_PORT
STORAGE_ROOT=$SYNO_STORAGE_PATH
BACKEND_URL=http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT
EOF

mv "$TEMP_ENV" .env

info "⚠️  ВАЖНО: Проверьте и настройте следующие переменные в .env:"
info "   - FIREBASE_SERVICE_ACCOUNT (валидный JSON)"
info "   - TELEGRAM_SESSION_SECRET (64 hex символа)"
info "   - TELEGRAM_API_ID, TELEGRAM_API_HASH"
info "   - FRONTEND_ORIGIN (URL вашего фронтенда на Netlify)"

success ".env настроен (базовые переменные)"

# 8. Установка pm2 (если не установлен)
info "Проверяю pm2..."
PM2_CMD="pm2"
if ! command -v pm2 &> /dev/null; then
    info "Устанавливаю pm2 глобально (требуются права root)..."
    sudo npm install -g pm2 || error "Не удалось установить pm2"
    success "pm2 установлен"
    
    # На Synology pm2 может быть установлен в /usr/local/bin, но PATH может не включать его
    # Также нужен sudo для запуска pm2, установленного через sudo npm install -g
    if command -v pm2 &> /dev/null; then
        PM2_CMD="sudo pm2"
    elif [ -f "/usr/local/bin/pm2" ]; then
        PM2_CMD="sudo /usr/local/bin/pm2"
    elif [ -f "/volume1/@appstore/Node.js_v20/usr/local/bin/pm2" ]; then
        PM2_CMD="sudo /volume1/@appstore/Node.js_v20/usr/local/bin/pm2"
    else
        # Используем npm для запуска pm2
        PM2_CMD="sudo $(npm bin -g)/pm2"
    fi
else
    info "pm2 уже установлен"
    # Определяем путь к pm2 (нужен sudo, так как установлен через sudo)
    if command -v pm2 &> /dev/null; then
        PM2_CMD="sudo pm2"
    elif [ -f "/usr/local/bin/pm2" ]; then
        PM2_CMD="sudo /usr/local/bin/pm2"
    elif [ -f "/volume1/@appstore/Node.js_v20/usr/local/bin/pm2" ]; then
        PM2_CMD="sudo /volume1/@appstore/Node.js_v20/usr/local/bin/pm2"
    else
        PM2_CMD="sudo pm2"  # Fallback с sudo
    fi
fi

# 9. Остановка старого процесса (если запущен)
info "Останавливаю старый процесс (если запущен)..."
$PM2_CMD delete shortsai-backend 2>/dev/null || true
success "Старые процессы остановлены"

# 10. Запуск через pm2
info "Запускаю backend через pm2..."
# Создаём директорию для логов, если её нет
mkdir -p /volume1/shortsai/logs

# Запускаем через pm2 с правильным синтаксисом
$PM2_CMD start dist/index.js \
    --name shortsai-backend \
    --node-args="--max-old-space-size=2048" \
    --log-date-format="YYYY-MM-DD HH:mm:ss Z" \
    --merge-logs \
    --log /volume1/shortsai/logs/backend.log \
    || error "Не удалось запустить backend"

success "Backend запущен через pm2"

# 11. Сохранение конфигурации pm2
info "Сохраняю конфигурацию pm2..."
$PM2_CMD save || error "Не удалось сохранить конфигурацию pm2"

# 12. Настройка автозапуска pm2
info "Настраиваю автозапуск pm2..."
$PM2_CMD startup | grep -v PM2 || {
    info "Выполните команду, которую вывел pm2 startup, для настройки автозапуска"
}

success "Автозапуск настроен"

# 13. Проверка работоспособности
info "Проверяю работоспособность backend..."
sleep 3
if curl -f -s http://127.0.0.1:$BACKEND_PORT/health > /dev/null; then
    success "Backend отвечает на /health"
else
    error "Backend не отвечает на /health. Проверьте логи: $PM2_CMD logs shortsai-backend"
fi

# 14. Вывод информации
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
info "Полезные команды:"
echo -e "${GREEN}  pm2 status                    # Статус процессов${NC}"
echo -e "${GREEN}  pm2 logs shortsai-backend     # Просмотр логов${NC}"
echo -e "${GREEN}  pm2 restart shortsai-backend  # Перезапуск${NC}"
echo -e "${GREEN}  pm2 stop shortsai-backend     # Остановка${NC}"
echo ""
info "Проверка работоспособности:"
echo -e "${GREEN}  curl http://127.0.0.1:$BACKEND_PORT/health${NC}"
echo -e "${GREEN}  curl http://$VPS_PUBLIC_IP:$VPS_PUBLIC_PORT/health${NC}"
echo ""


