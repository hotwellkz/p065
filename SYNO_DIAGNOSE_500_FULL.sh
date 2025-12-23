#!/bin/bash
# Полная диагностика 500 ошибок на Synology
# Выполните на Synology через SSH

set -e

echo "=========================================="
echo "ДИАГНОСТИКА 500 ОШИБОК - ПОЛНАЯ ПРОВЕРКА"
echo "=========================================="
echo ""

# 1. ПРОВЕРКА ПАПКИ И ФАЙЛОВ
echo "=== 1. ПРОВЕРКА ПАПКИ BACKEND ==="
BACKEND_DIR="/volume1/docker/shortsai/backend"
if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ Папка $BACKEND_DIR не найдена!"
    echo "Ищем альтернативные пути..."
    find /volume* -type d -name "backend" -path "*/shortsai/*" 2>/dev/null | head -5
    exit 1
fi
cd "$BACKEND_DIR"
echo "✓ Рабочая директория: $(pwd)"
echo ""

# 2. ПРОВЕРКА ИЗМЕНЕНИЙ В ФАЙЛАХ
echo "=== 2. ПРОВЕРКА ИСПРАВЛЕНИЙ В КОДЕ ==="
echo "scheduleRoutes.ts - проверка req.user:"
if grep -q "if (!req.user?.uid)" src/routes/scheduleRoutes.ts 2>/dev/null; then
    echo "✓ Проверка req.user добавлена"
    grep -n "if (!req.user?.uid)" src/routes/scheduleRoutes.ts | head -2
else
    echo "❌ Проверка req.user НЕ найдена!"
fi
echo ""

echo "userSettingsRoutes.ts - проверка req.user:"
if grep -q "if (!req.user?.uid)" src/routes/userSettingsRoutes.ts 2>/dev/null; then
    echo "✓ Проверка req.user добавлена"
    grep -n "if (!req.user?.uid)" src/routes/userSettingsRoutes.ts | head -2
else
    echo "❌ Проверка req.user НЕ найдена!"
fi
echo ""

# 3. ПОИСК КОНТЕЙНЕРА
echo "=== 3. ПОИСК КОНТЕЙНЕРА BACKEND ==="
CONTAINER_NAME=""
CONTAINER_ID=""

# Вариант 1: через docker ps
if command -v docker >/dev/null 2>&1; then
    CONTAINER_NAME=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "backend|shorts" | head -1)
    if [ -n "$CONTAINER_NAME" ]; then
        echo "✓ Контейнер найден через docker ps: $CONTAINER_NAME"
    fi
fi

# Вариант 2: через docker-compose
if [ -z "$CONTAINER_NAME" ] && [ -f "docker-compose.yml" ]; then
    if command -v docker-compose >/dev/null 2>&1; then
        CONTAINER_ID=$(docker-compose ps -q backend 2>/dev/null | head -1)
        if [ -n "$CONTAINER_ID" ]; then
            CONTAINER_NAME=$(docker inspect --format='{{.Name}}' "$CONTAINER_ID" 2>/dev/null | sed 's|^/||')
            echo "✓ Контейнер найден через docker-compose: $CONTAINER_NAME"
        fi
    fi
fi

# Вариант 3: через docker ps -a (все контейнеры)
if [ -z "$CONTAINER_NAME" ]; then
    CONTAINER_NAME=$(docker ps -a --format "{{.Names}}" 2>/dev/null | grep -E "backend|shorts" | head -1)
    if [ -n "$CONTAINER_NAME" ]; then
        echo "✓ Контейнер найден (остановлен): $CONTAINER_NAME"
    fi
fi

if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер не найден!"
    echo "Список всех контейнеров:"
    docker ps -a --format "{{.Names}}\t{{.Status}}" 2>/dev/null | head -10
    exit 1
fi

echo "Используемый контейнер: $CONTAINER_NAME"
echo ""

# 4. ПРОВЕРКА ENV ПЕРЕМЕННЫХ
echo "=== 4. ПРОВЕРКА ENV ПЕРЕМЕННЫХ ==="
docker exec "$CONTAINER_NAME" sh -c '
echo "OPENAI_API_KEY: $(if [ -n "$OPENAI_API_KEY" ]; then echo "SET (длина: ${#OPENAI_API_KEY})"; else echo "❌ NOT SET"; fi)"
echo "TELEGRAM_SESSION_SECRET: $(if [ -n "$TELEGRAM_SESSION_SECRET" ]; then echo "SET (длина: ${#TELEGRAM_SESSION_SECRET})"; else echo "❌ NOT SET"; fi)"
echo "FIREBASE_PROJECT_ID: $(if [ -n "$FIREBASE_PROJECT_ID" ]; then echo "$FIREBASE_PROJECT_ID"; else echo "❌ NOT SET"; fi)"
echo "NODE_ENV: ${NODE_ENV:-not-set}"
echo "PORT: ${PORT:-not-set}"
' 2>&1 || echo "⚠️ Не удалось проверить env (контейнер может быть остановлен)"
echo ""

# 5. ПОЛУЧЕНИЕ ЛОГОВ ПЕРЕД ЗАПРОСАМИ
echo "=== 5. ТЕКУЩИЕ ЛОГИ (последние 50 строк) ==="
docker logs --tail 50 "$CONTAINER_NAME" 2>&1 | tail -30 || echo "⚠️ Не удалось получить логи"
echo ""

# 6. ВОСПРОИЗВЕДЕНИЕ ЗАПРОСОВ И ПОЛУЧЕНИЕ СТЕК ТРЕЙСА
echo "=== 6. ВОСПРОИЗВЕДЕНИЕ ЗАПРОСОВ ==="
echo ""

echo "Запрос 1: GET /api/schedule/settings"
curl -s -i https://api.shortsai.ru/api/schedule/settings 2>&1 | head -20
echo ""
echo "Логи после запроса 1:"
docker logs --tail 20 "$CONTAINER_NAME" 2>&1 | grep -iE "error|exception|500|typeerror|req\.user|schedule" | tail -10 || echo "Нет ошибок в логах"
echo ""

sleep 2

echo "Запрос 2: GET /api/user-settings"
curl -s -i https://api.hotwell.synology.me/api/user-settings 2>&1 | head -20
echo ""
echo "Логи после запроса 2:"
docker logs --tail 20 "$CONTAINER_NAME" 2>&1 | grep -iE "error|exception|500|typeerror|req\.user|user-settings" | tail -10 || echo "Нет ошибок в логах"
echo ""

sleep 2

echo "Запрос 3: POST /api/prompt/openai"
curl -s -i -X POST https://api.shortsai.ru/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d "{}" 2>&1 | head -20
echo ""
echo "Логи после запроса 3:"
docker logs --tail 20 "$CONTAINER_NAME" 2>&1 | grep -iE "error|exception|500|typeerror|openai|prompt" | tail -10 || echo "Нет ошибок в логах"
echo ""

# 7. ПОЛНЫЙ СТЕК ТРЕЙС ИЗ ЛОГОВ
echo "=== 7. ПОЛНЫЙ СТЕК ТРЕЙС (последние 200 строк) ==="
docker logs --tail 200 "$CONTAINER_NAME" 2>&1 | \
  grep -A 20 -iE "error|exception|500|typeerror|referenceerror|cannot read|failed|at \w+ \(" | \
  tail -50 || echo "Нет stack trace в логах"
echo ""

# 8. ПРОВЕРКА NGINX НА VPS (через curl заголовки)
echo "=== 8. ПРОВЕРКА МАРШРУТИЗАЦИИ ==="
echo "Заголовки от api.shortsai.ru:"
curl -s -I https://api.shortsai.ru/api/health 2>&1 | grep -iE "x-upstream|x-edge|server" | head -5
echo ""

echo "Заголовки от api.hotwell.synology.me:"
curl -s -I https://api.hotwell.synology.me/api/health 2>&1 | grep -iE "server|x-powered-by" | head -5
echo ""

echo "=========================================="
echo "ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "=========================================="
echo ""
echo "Следующие шаги:"
echo "1. Если в логах есть stack trace - исправить ошибку"
echo "2. Если env переменные не заданы - проверить .env.production"
echo "3. Если код не синхронизирован - применить исправления"
echo "4. Пересобрать контейнер: sudo docker-compose build && sudo docker-compose restart"


