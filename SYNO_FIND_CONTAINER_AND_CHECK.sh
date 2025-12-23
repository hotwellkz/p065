#!/bin/bash
# Поиск контейнера и проверка
# Выполните на Synology

cd /volume1/docker/shortsai/backend

echo "=========================================="
echo "ПОИСК КОНТЕЙНЕРА И ДИАГНОСТИКА"
echo "=========================================="
echo ""

# 1. Все контейнеры
echo "=== ВСЕ КОНТЕЙНЕРЫ ==="
docker ps -a 2>&1 | head -10
echo ""

# 2. Через docker-compose
echo "=== ЧЕРЕЗ DOCKER-COMPOSE ==="
docker-compose ps 2>&1
echo ""

# 3. Поиск по имени
echo "=== ПОИСК ПО ИМЕНИ ==="
CONTAINER_NAME=$(docker ps -a --format "{{.Names}}" 2>&1 | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER_NAME" ]; then
    echo "Пробуем через docker-compose..."
    CONTAINER_ID=$(docker-compose ps -q backend 2>&1 | head -1)
    if [ -n "$CONTAINER_ID" ]; then
        CONTAINER_NAME=$(docker inspect --format='{{.Name}}' "$CONTAINER_ID" 2>&1 | sed 's|^/||')
        echo "Найден через docker-compose: $CONTAINER_NAME"
    fi
fi

if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер не найден!"
    echo ""
    echo "Попробуйте вручную:"
    echo "  docker ps -a"
    echo "  docker-compose ps"
    exit 1
fi

echo "✓ Контейнер: $CONTAINER_NAME"
echo ""

# 4. ENV переменные
echo "=== ENV ПЕРЕМЕННЫЕ ==="
docker exec "$CONTAINER_NAME" sh -c '
echo "TELEGRAM_SESSION_SECRET: $(if [ -n "$TELEGRAM_SESSION_SECRET" ]; then echo "SET (length: ${#TELEGRAM_SESSION_SECRET})"; else echo "❌ NOT SET"; fi)"
echo "OPENAI_API_KEY: $(if [ -n "$OPENAI_API_KEY" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
echo "FIREBASE_PROJECT_ID: $(if [ -n "$FIREBASE_PROJECT_ID" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
echo "FIREBASE_CLIENT_EMAIL: $(if [ -n "$FIREBASE_CLIENT_EMAIL" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
echo "FIREBASE_PRIVATE_KEY: $(if [ -n "$FIREBASE_PRIVATE_KEY" ]; then echo "SET"; else echo "❌ NOT SET"; fi)"
' 2>&1
echo ""

# 5. Логи
echo "=== ЛОГИ (последние 100 строк) ==="
docker logs --tail 100 "$CONTAINER_NAME" 2>&1 | tail -60
echo ""

# 6. Ошибки
echo "=== ОШИБКИ В ЛОГАХ ==="
docker logs --tail 500 "$CONTAINER_NAME" 2>&1 | \
  grep -iE "error|exception|500|typeerror|referenceerror|cannot read|failed|TELEGRAM_SESSION_SECRET|decrypt|encrypt|at |stack" | \
  tail -40
echo ""


