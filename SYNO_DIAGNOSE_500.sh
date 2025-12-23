#!/bin/bash
# Диагностика 500 ошибок на Synology
# Выполните в SSH сессии на Synology

cd /volume1/docker/shortsai/backend

echo "=========================================="
echo "ДИАГНОСТИКА HTTP 500 ОШИБОК"
echo "=========================================="
echo ""

# 1. Контейнер
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер не найден!"
    docker ps
    exit 1
fi
echo "✓ Контейнер: $CONTAINER_NAME"
echo ""

# 2. Тестовые запросы
echo "=== ТЕСТОВЫЕ ЗАПРОСЫ ==="
echo ""

echo "1. GET /health (должен быть 200):"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" http://localhost:3000/health
echo ""

echo "2. GET /api/schedule/settings (без авторизации, должен быть 401, НЕ 500):"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:3000/api/schedule/settings 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")
echo "  HTTP: $HTTP_CODE"
if [ "$HTTP_CODE" = "500" ]; then
    echo "  ❌ ОШИБКА: Возвращает 500 вместо 401!"
    echo "  Response: $BODY" | head -3
else
    echo "  ✓ Правильный статус: $HTTP_CODE"
fi
echo ""

echo "3. GET /api/user-settings (без авторизации, должен быть 401, НЕ 500):"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" http://localhost:3000/api/user-settings 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")
echo "  HTTP: $HTTP_CODE"
if [ "$HTTP_CODE" = "500" ]; then
    echo "  ❌ ОШИБКА: Возвращает 500 вместо 401!"
    echo "  Response: $BODY" | head -3
else
    echo "  ✓ Правильный статус: $HTTP_CODE"
fi
echo ""

echo "4. POST /api/prompt/openai (без авторизации, должен быть 401, НЕ 500):"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")
echo "  HTTP: $HTTP_CODE"
if [ "$HTTP_CODE" = "500" ]; then
    echo "  ❌ ОШИБКА: Возвращает 500 вместо 401!"
    echo "  Response: $BODY" | head -3
else
    echo "  ✓ Правильный статус: $HTTP_CODE"
fi
echo ""

# 3. Логи после запросов
echo "=== ПОСЛЕДНИЕ ОШИБКИ В ЛОГАХ ==="
echo "Ищу ошибки за последние 2 минуты..."
docker logs --since 2m "$CONTAINER_NAME" --timestamps 2>&1 | \
  grep -E "ERROR|Error|error|500|Exception|TypeError|ReferenceError|Cannot read|authRequired|Global error|Failed to|at " | \
  tail -30
echo ""

# 4. ENV переменные
echo "=== КРИТИЧЕСКИЕ ENV ПЕРЕМЕННЫЕ ==="
docker exec "$CONTAINER_NAME" sh -c 'env | grep -E "OPENAI_API_KEY|FIREBASE_PROJECT_ID|FIREBASE_CLIENT_EMAIL|NODE_ENV|PORT|JWT_SECRET" | sed "s/=.*/=***/"' 2>&1 | head -10
echo ""

# 5. Проверка reverse proxy
echo "=== REVERSE PROXY ==="
echo "Проверьте в DSM: Control Panel → Login Portal → Advanced → Reverse Proxy"
echo "Должно быть правило: api.hotwell.synology.me → localhost:3000"
echo ""

echo "=========================================="
echo "ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "=========================================="
echo ""
echo "Если видите HTTP 500:"
echo "1. Скопируйте логи выше (строки с ERROR/Exception/stack)"
echo "2. Найдите stack trace с конкретной ошибкой"
echo "3. Исправьте код согласно ошибке"


