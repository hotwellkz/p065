#!/bin/bash

# ============================================
# Скрипт деплоя backend на Synology NAS
# ============================================
# Этот скрипт:
# 1. Собирает проект локально
# 2. Копирует файлы на Synology через SSH/rsync
# 3. Запускает docker compose на Synology
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

# Проверка, что скрипт запущен из правильной директории
if [ ! -f "package.json" ]; then
    error "Скрипт должен быть запущен из папки backend (где находится package.json)"
fi

# Переход в корень репозитория для загрузки .env.deploy
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR"

info "Корень репозитория: $REPO_ROOT"
info "Папка backend: $BACKEND_DIR"

# Загрузка переменных окружения из .env.deploy
ENV_DEPLOY_FILE="$REPO_ROOT/.env.deploy"

if [ ! -f "$ENV_DEPLOY_FILE" ]; then
    error "Файл .env.deploy не найден в корне репозитория ($ENV_DEPLOY_FILE)
Создайте его на основе .env.deploy.example:
  cp .env.deploy.example .env.deploy
  # Затем отредактируйте .env.deploy и заполните своими значениями"
fi

info "Загружаю переменные из $ENV_DEPLOY_FILE"
set -a  # Автоматически экспортировать все переменные
source "$ENV_DEPLOY_FILE"
set +a

# Проверка обязательных переменных
info "Проверяю обязательные переменные окружения..."

if [ -z "$SYNO_HOST" ]; then
    error "SYNO_HOST не задан в .env.deploy"
fi

if [ -z "$SYNO_USER" ]; then
    error "SYNO_USER не задан в .env.deploy"
fi

if [ -z "$SYNO_TARGET_PATH" ]; then
    error "SYNO_TARGET_PATH не задан в .env.deploy"
fi

if [ -z "$BACKEND_PORT" ]; then
    error "BACKEND_PORT не задан в .env.deploy"
fi

# Установка порта SSH по умолчанию, если не задан
SYNO_SSH_PORT=${SYNO_SSH_PORT:-22}

success "Все обязательные переменные заданы"
info "  SYNO_HOST: $SYNO_HOST"
info "  SYNO_USER: $SYNO_USER"
info "  SYNO_TARGET_PATH: $SYNO_TARGET_PATH"
info "  BACKEND_PORT: $BACKEND_PORT"
info "  SYNO_SSH_PORT: $SYNO_SSH_PORT"

# Формирование строки подключения SSH
SSH_CONNECTION="$SYNO_USER@$SYNO_HOST"
if [ -n "$SYNO_SSH_KEY_PATH" ]; then
    SSH_OPTS="-i $SYNO_SSH_KEY_PATH -p $SYNO_SSH_PORT"
else
    SSH_OPTS="-p $SYNO_SSH_PORT"
fi

# Проверка доступности Synology по SSH
info "Проверяю доступность Synology по SSH..."
if ! ssh $SSH_OPTS -o ConnectTimeout=5 -o BatchMode=yes "$SSH_CONNECTION" echo "SSH connection OK" 2>/dev/null; then
    error "Не удалось подключиться к Synology по SSH ($SSH_CONNECTION)
Проверьте:
  - Доступность NAS в сети
  - Правильность IP-адреса (SYNO_HOST)
  - Включен ли SSH на Synology (Control Panel → Terminal & SNMP → Enable SSH service)
  - Правильность логина и пароля/SSH-ключа"
fi

success "Подключение к Synology установлено"

# Сборка проекта локально
info "Собираю проект локально..."
cd "$BACKEND_DIR"

if [ ! -f "package.json" ]; then
    error "package.json не найден в папке backend"
fi

info "Устанавливаю зависимости..."
npm install

info "Компилирую TypeScript..."
npm run build

if [ ! -d "dist" ]; then
    error "Папка dist не создана после сборки. Проверьте ошибки компиляции."
fi

success "Проект успешно собран"

# Создание папки на Synology, если её нет
info "Создаю папку $SYNO_TARGET_PATH на Synology (если её нет)..."
ssh $SSH_OPTS "$SSH_CONNECTION" "mkdir -p $SYNO_TARGET_PATH" || error "Не удалось создать папку на Synology"

success "Папка на Synology готова"

# Копирование файлов на Synology через rsync (предпочтительно) или scp
info "Копирую файлы на Synology..."

# Проверка наличия rsync
if command -v rsync &> /dev/null; then
    info "Использую rsync для копирования файлов..."
    
    # Формирование строки rsync
    RSYNC_OPTS="-avz --delete"
    if [ -n "$SYNO_SSH_KEY_PATH" ]; then
        RSYNC_OPTS="$RSYNC_OPTS -e 'ssh -i $SYNO_SSH_KEY_PATH -p $SYNO_SSH_PORT'"
    else
        RSYNC_OPTS="$RSYNC_OPTS -e 'ssh -p $SYNO_SSH_PORT'"
    fi
    
    # Исключаем ненужные файлы и папки
    EXCLUDE_PATTERNS=(
        "--exclude=node_modules"
        "--exclude=.git"
        "--exclude=.gitignore"
        "--exclude=.env"
        "--exclude=.env.local"
        "--exclude=.env.development"
        "--exclude=tmp"
        "--exclude=*.log"
        "--exclude=.DS_Store"
        "--exclude=dist"  # Исключаем dist, т.к. он будет пересобран в Docker
    )
    
    # Копируем файлы
    rsync $RSYNC_OPTS "${EXCLUDE_PATTERNS[@]}" "$BACKEND_DIR/" "$SSH_CONNECTION:$SYNO_TARGET_PATH/" || \
        error "Ошибка при копировании файлов через rsync"
    
    success "Файлы успешно скопированы через rsync"
else
    info "rsync не найден, использую scp..."
    
    # Создаём временный архив для передачи
    TEMP_ARCHIVE="/tmp/shorts-backend-deploy-$$.tar.gz"
    info "Создаю временный архив..."
    
    tar -czf "$TEMP_ARCHIVE" \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=.env \
        --exclude=.env.local \
        --exclude=.env.development \
        --exclude=tmp \
        --exclude="*.log" \
        --exclude=.DS_Store \
        --exclude=dist \
        -C "$BACKEND_DIR" . || error "Ошибка при создании архива"
    
    # Копируем архив на Synology
    info "Копирую архив на Synology..."
    if [ -n "$SYNO_SSH_KEY_PATH" ]; then
        scp -i "$SYNO_SSH_KEY_PATH" -P "$SYNO_SSH_PORT" "$TEMP_ARCHIVE" "$SSH_CONNECTION:/tmp/" || \
            error "Ошибка при копировании архива"
    else
        scp -P "$SYNO_SSH_PORT" "$TEMP_ARCHIVE" "$SSH_CONNECTION:/tmp/" || \
            error "Ошибка при копировании архива"
    fi
    
    # Распаковываем архив на Synology
    ARCHIVE_NAME=$(basename "$TEMP_ARCHIVE")
    ssh $SSH_OPTS "$SSH_CONNECTION" "cd $SYNO_TARGET_PATH && tar -xzf /tmp/$ARCHIVE_NAME && rm /tmp/$ARCHIVE_NAME" || \
        error "Ошибка при распаковке архива на Synology"
    
    # Удаляем временный архив локально
    rm -f "$TEMP_ARCHIVE"
    
    success "Файлы успешно скопированы через scp"
fi

# Копирование .env.production на Synology, если он существует
if [ -f "$BACKEND_DIR/.env.production" ]; then
    info "Копирую .env.production на Synology..."
    if [ -n "$SYNO_SSH_KEY_PATH" ]; then
        scp -i "$SYNO_SSH_KEY_PATH" -P "$SYNO_SSH_PORT" "$BACKEND_DIR/.env.production" "$SSH_CONNECTION:$SYNO_TARGET_PATH/" || \
            error "Ошибка при копировании .env.production"
    else
        scp -P "$SYNO_SSH_PORT" "$BACKEND_DIR/.env.production" "$SSH_CONNECTION:$SYNO_TARGET_PATH/" || \
            error "Ошибка при копировании .env.production"
    fi
    success ".env.production скопирован"
else
    info ".env.production не найден, пропускаю (убедитесь, что переменные окружения настроены)"
fi

# Запуск docker compose на Synology
info "Запускаю docker compose на Synology..."

# Проверка наличия docker compose на Synology
ssh $SSH_OPTS "$SSH_CONNECTION" "command -v docker-compose >/dev/null 2>&1 || command -v docker >/dev/null 2>&1" || \
    error "Docker не установлен на Synology. Установите Container Manager через Package Center."

# Выполняем docker compose up на Synology
info "Выполняю docker compose up -d --build в $SYNO_TARGET_PATH..."
ssh $SSH_OPTS "$SSH_CONNECTION" "cd $SYNO_TARGET_PATH && docker compose up -d --build" || \
    error "Ошибка при запуске docker compose на Synology"

success "Docker контейнер успешно запущен на Synology"

# Вывод информации о доступности
echo ""
success "============================================"
success "Деплой завершён успешно!"
success "============================================"
echo ""
info "Backend доступен по адресу:"
echo -e "${GREEN}http://$SYNO_HOST:$BACKEND_PORT${NC}"
echo ""
info "Проверка работоспособности:"
echo -e "${GREEN}curl http://$SYNO_HOST:$BACKEND_PORT/health${NC}"
echo ""
info "Просмотр логов контейнера:"
echo -e "${GREEN}ssh $SSH_CONNECTION 'docker logs -f shorts-backend'${NC}"
echo ""

