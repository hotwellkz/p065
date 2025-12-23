#!/bin/bash
# Диагностика HTTP 500 ошибок
# Выполните на Synology

echo "=== ШАГ 1: Проверка контейнера ==="
docker ps | grep -E "backend|shorts"
echo ""

echo "=== ШАГ 2: Логи контейнера (последние 300 строк) ==="
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
echo "Контейнер: $CONTAINER_NAME"
echo ""
docker logs --tail 300 "$CONTAINER_NAME" --timestamps | tail -100
echo ""

echo "=== ШАГ 3: Проверка env переменных ==="
docker exec "$CONTAINER_NAME" sh -c 'env | sort | grep -E "OPENAI|FIREBASE|DATABASE|VITE|NODE_ENV|PORT|FRONTEND_ORIGIN"' || echo "Не удалось получить env"
echo ""

echo "=== ШАГ 4: Тестовые запросы ==="
echo "4.1 Health check:"
curl -i http://localhost:3000/health 2>&1 | head -20
echo ""

echo "4.2 /api/schedule/settings:"
curl -i http://localhost:3000/api/schedule/settings 2>&1 | head -30
echo ""

echo "4.3 /api/user-settings:"
curl -i http://localhost:3000/api/user-settings 2>&1 | head -30
echo ""

echo "4.4 /api/prompt/openai (POST):"
curl -i -X POST http://localhost:3000/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | head -30
echo ""

echo "=== ШАГ 5: Свежие логи после запросов ==="
docker logs --tail 50 "$CONTAINER_NAME" --timestamps | grep -E "ERROR|Error|error|500|Exception|at |stack" || echo "Нет явных ошибок в последних логах"
echo ""

echo "=== ШАГ 6: Проверка reverse proxy на Synology ==="
echo "Проверьте в DSM: Control Panel → Login Portal → Advanced → Reverse Proxy"
echo "Должно быть правило для api.hotwell.synology.me → localhost:3000"
echo ""


