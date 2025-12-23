#!/bin/bash
# Быстрая проверка и исправление 500 ошибок на Synology
# Выполните на Synology через SSH

set -e

cd /volume1/docker/shortsai/backend || {
    echo "❌ Папка /volume1/docker/shortsai/backend не найдена!"
    exit 1
}

echo "=========================================="
echo "БЫСТРАЯ ДИАГНОСТИКА И ИСПРАВЛЕНИЕ 500"
echo "=========================================="
echo ""

# 1. Найти контейнер
echo "=== 1. ПОИСК КОНТЕЙНЕРА ==="
CONTAINER=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER" ]; then
    CONTAINER=$(docker-compose ps -q backend 2>/dev/null | head -1)
    if [ -n "$CONTAINER" ]; then
        CONTAINER=$(docker inspect --format='{{.Name}}' "$CONTAINER" 2>/dev/null | sed 's|^/||')
    fi
fi

if [ -z "$CONTAINER" ]; then
    echo "❌ Контейнер не найден!"
    docker ps -a --format "{{.Names}}\t{{.Status}}" 2>/dev/null | head -5
    exit 1
fi

echo "✓ Контейнер: $CONTAINER"
echo ""

# 2. Получить логи с 500 ошибками
echo "=== 2. ПОИСК 500 ОШИБОК В ЛОГАХ ==="
echo "Последние 300 строк логов:"
docker logs --tail 300 "$CONTAINER" 2>&1 | \
  grep -A 30 -iE "500|error|exception|typeerror|referenceerror|cannot read|req\.user" | \
  tail -80 || echo "Нет явных ошибок в последних логах"
echo ""

# 3. Воспроизвести запросы и получить stack trace
echo "=== 3. ВОСПРОИЗВЕДЕНИЕ ЗАПРОСОВ ==="
echo ""

echo "Запрос 1: GET /api/schedule/settings"
RESPONSE1=$(curl -s -w "\nHTTP_CODE:%{http_code}" https://api.shortsai.ru/api/schedule/settings 2>&1)
HTTP_CODE1=$(echo "$RESPONSE1" | grep "HTTP_CODE:" | cut -d: -f2)
echo "HTTP Status: $HTTP_CODE1"
echo ""

echo "Логи после запроса 1 (последние 30 строк):"
docker logs --tail 30 "$CONTAINER" 2>&1 | tail -20
echo ""

sleep 1

echo "Запрос 2: GET /api/user-settings"
RESPONSE2=$(curl -s -w "\nHTTP_CODE:%{http_code}" https://api.hotwell.synology.me/api/user-settings 2>&1)
HTTP_CODE2=$(echo "$RESPONSE2" | grep "HTTP_CODE:" | cut -d: -f2)
echo "HTTP Status: $HTTP_CODE2"
echo ""

echo "Логи после запроса 2 (последние 30 строк):"
docker logs --tail 30 "$CONTAINER" 2>&1 | tail -20
echo ""

sleep 1

echo "Запрос 3: POST /api/prompt/openai"
RESPONSE3=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://api.shortsai.ru/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d "{}" 2>&1)
HTTP_CODE3=$(echo "$RESPONSE3" | grep "HTTP_CODE:" | cut -d: -f2)
echo "HTTP Status: $HTTP_CODE3"
echo ""

echo "Логи после запроса 3 (последние 30 строк):"
docker logs --tail 30 "$CONTAINER" 2>&1 | tail -20
echo ""

# 4. Проверка исправлений в коде
echo "=== 4. ПРОВЕРКА ИСПРАВЛЕНИЙ В КОДЕ ==="
if grep -q "if (!req.user?.uid)" src/routes/scheduleRoutes.ts 2>/dev/null; then
    echo "✓ scheduleRoutes.ts: проверка req.user есть"
else
    echo "❌ scheduleRoutes.ts: проверка req.user ОТСУТСТВУЕТ!"
fi

if grep -q "if (!req.user?.uid)" src/routes/userSettingsRoutes.ts 2>/dev/null; then
    echo "✓ userSettingsRoutes.ts: проверка req.user есть"
else
    echo "❌ userSettingsRoutes.ts: проверка req.user ОТСУТСТВУЕТ!"
fi
echo ""

# 5. Проверка env переменных
echo "=== 5. ПРОВЕРКА ENV ПЕРЕМЕННЫХ ==="
docker exec "$CONTAINER" sh -c '
echo "OPENAI_API_KEY: $(if [ -n "$OPENAI_API_KEY" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
echo "TELEGRAM_SESSION_SECRET: $(if [ -n "$TELEGRAM_SESSION_SECRET" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
echo "FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID:-❌ NOT SET}"
' 2>&1 || echo "⚠️ Не удалось проверить env"
echo ""

echo "=========================================="
echo "РЕЗУЛЬТАТЫ:"
echo "  /api/schedule/settings: $HTTP_CODE1"
echo "  /api/user-settings: $HTTP_CODE2"
echo "  /api/prompt/openai: $HTTP_CODE3"
echo "=========================================="


