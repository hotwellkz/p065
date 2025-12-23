#!/bin/bash
# Проверка env переменных и диагностика
# Выполните на Synology

cd /volume1/docker/shortsai/backend

echo "=========================================="
echo "ПРОВЕРКА ENV ПЕРЕМЕННЫХ И ДИАГНОСТИКА"
echo "=========================================="
echo ""

# 1. Контейнер
CONTAINER_NAME=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER_NAME" ]; then
    echo "Пробуем через docker-compose..."
    CONTAINER_NAME=$(docker-compose ps -q backend 2>/dev/null | head -1)
    if [ -z "$CONTAINER_NAME" ]; then
        echo "❌ Контейнер не найден!"
        echo "Попробуйте: docker ps"
        exit 1
    fi
fi
echo "✓ Контейнер: $CONTAINER_NAME"
echo ""

# 2. ENV переменные
echo "=== КРИТИЧЕСКИЕ ENV ПЕРЕМЕННЫЕ ==="
docker exec "$CONTAINER_NAME" sh -c 'env | sort | grep -E "TELEGRAM_SESSION_SECRET|OPENAI_API_KEY|FIREBASE_PROJECT_ID|FIREBASE_CLIENT_EMAIL|FIREBASE_PRIVATE_KEY|NODE_ENV|PORT|FRONTEND_ORIGIN"' 2>&1 | \
  sed 's/=.*/=***/' | head -15
echo ""

# 3. Проверка наличия переменных (без значений)
echo "=== ПРОВЕРКА НАЛИЧИЯ ПЕРЕМЕННЫХ ==="
docker exec "$CONTAINER_NAME" sh -c '
echo "TELEGRAM_SESSION_SECRET: $(if [ -n "$TELEGRAM_SESSION_SECRET" ]; then echo "SET (length: ${#TELEGRAM_SESSION_SECRET})"; else echo "NOT SET"; fi)"
echo "OPENAI_API_KEY: $(if [ -n "$OPENAI_API_KEY" ]; then echo "SET"; else echo "NOT SET"; fi)"
echo "FIREBASE_PROJECT_ID: $(if [ -n "$FIREBASE_PROJECT_ID" ]; then echo "SET"; else echo "NOT SET"; fi)"
echo "FIREBASE_CLIENT_EMAIL: $(if [ -n "$FIREBASE_CLIENT_EMAIL" ]; then echo "SET"; else echo "NOT SET"; fi)"
echo "FIREBASE_PRIVATE_KEY: $(if [ -n "$FIREBASE_PRIVATE_KEY" ]; then echo "SET"; else echo "NOT SET"; fi)"
' 2>&1
echo ""

# 4. Логи (последние 100 строк)
echo "=== ПОСЛЕДНИЕ ЛОГИ (100 строк) ==="
docker logs --tail 100 "$CONTAINER_NAME" 2>&1 | tail -50
echo ""

# 5. Ошибки в логах
echo "=== ОШИБКИ В ЛОГАХ ==="
docker logs --tail 500 "$CONTAINER_NAME" 2>&1 | \
  grep -iE "error|exception|500|typeerror|referenceerror|cannot read|failed|TELEGRAM_SESSION_SECRET|decrypt|encrypt" | \
  tail -30
echo ""

echo "=========================================="
echo "Если видите 'TELEGRAM_SESSION_SECRET is not set' -"
echo "нужно добавить эту переменную в docker-compose.yml или .env"
echo "=========================================="


