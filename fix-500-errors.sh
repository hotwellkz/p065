#!/bin/bash
# Скрипт для диагностики и исправления 500 ошибок
# Выполните на Synology

cd /volume1/docker/shortsai/backend

echo "=== ДИАГНОСТИКА 500 ОШИБОК ==="
echo ""

# 1. Проверка контейнера
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер не найден!"
    exit 1
fi
echo "✓ Контейнер: $CONTAINER_NAME"
echo ""

# 2. Тестовые запросы
echo "=== Тест 1: /health ==="
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000/health
echo ""

echo "=== Тест 2: /api/schedule/settings (без авторизации) ==="
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/schedule/settings)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY" | head -5
echo ""

echo "=== Тест 3: /api/user-settings (без авторизации) ==="
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/user-settings)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY" | head -5
echo ""

echo "=== Тест 4: /api/prompt/openai POST (без авторизации) ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY" | head -5
echo ""

# 3. Логи после запросов
echo "=== Последние ошибки в логах ==="
docker logs --tail 100 "$CONTAINER_NAME" --timestamps 2>&1 | \
  grep -E "ERROR|Error|error|500|Exception|TypeError|ReferenceError|Cannot read|authRequired|Global error" | \
  tail -20
echo ""

# 4. ENV переменные
echo "=== Критические ENV переменные ==="
docker exec "$CONTAINER_NAME" sh -c 'env | grep -E "OPENAI_API_KEY|FIREBASE|NODE_ENV|PORT" | sed "s/=.*/=***/"' || echo "Не удалось получить env"
echo ""

echo "=== Если видите HTTP 500, проверьте логи выше для stack trace ==="


