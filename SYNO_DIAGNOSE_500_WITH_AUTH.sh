#!/bin/bash
# Диагностика 500 ошибок С авторизацией
# Выполните на Synology с sudo

cd /volume1/docker/shortsai/backend

echo "=========================================="
echo "ДИАГНОСТИКА 500 ОШИБОК С АВТОРИЗАЦИЕЙ"
echo "=========================================="
echo ""

# 1. Контейнер (с sudo)
CONTAINER_NAME=$(sudo docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер не найден!"
    sudo docker ps
    exit 1
fi
echo "✓ Контейнер: $CONTAINER_NAME"
echo ""

# 2. Логи перед запросами
echo "=== ЛОГИ ПЕРЕД ЗАПРОСАМИ (последние 50 строк) ==="
sudo docker logs --tail 50 "$CONTAINER_NAME" --timestamps 2>&1 | tail -30
echo ""

# 3. ENV переменные
echo "=== ENV ПЕРЕМЕННЫЕ ==="
sudo docker exec "$CONTAINER_NAME" sh -c 'env | sort | grep -E "OPENAI|FIREBASE|NODE_ENV|PORT|FRONTEND_ORIGIN|JWT_SECRET"' 2>&1 | head -20
echo ""

# 4. Проверка Firestore
echo "=== ПРОВЕРКА FIRESTORE ==="
sudo docker exec "$CONTAINER_NAME" sh -c 'node -e "const admin = require(\"firebase-admin\"); console.log(\"Firebase apps:\", admin.apps.length); console.log(\"Available:\", admin.apps.length > 0);"' 2>&1
echo ""

# 5. Тестовые запросы БЕЗ авторизации (должны быть 401)
echo "=== ТЕСТЫ БЕЗ АВТОРИЗАЦИИ (должны быть 401) ==="
echo "1. GET /api/schedule/settings:"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" http://localhost:3000/api/schedule/settings
echo ""

echo "2. GET /api/user-settings:"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" http://localhost:3000/api/user-settings
echo ""

echo "3. POST /api/prompt/openai:"
curl -s -o /dev/null -w "  HTTP: %{http_code}\n" -X POST http://localhost:3000/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d '{}'
echo ""

# 6. Логи после запросов
echo "=== ЛОГИ ПОСЛЕ ЗАПРОСОВ (ищу ошибки) ==="
sudo docker logs --tail 100 "$CONTAINER_NAME" --timestamps 2>&1 | \
  grep -E "ERROR|Error|error|500|Exception|TypeError|ReferenceError|Cannot read|authRequired|Global error|Failed to|at |schedule|user-settings|prompt" | \
  tail -40
echo ""

# 7. Полные логи последних запросов
echo "=== ПОЛНЫЕ ЛОГИ ПОСЛЕДНИХ ЗАПРОСОВ ==="
sudo docker logs --tail 30 "$CONTAINER_NAME" --timestamps 2>&1
echo ""

echo "=========================================="
echo "ВНИМАНИЕ: Для воспроизведения 500 нужен"
echo "валидный Firebase токен из браузера"
echo "=========================================="
echo ""
echo "Чтобы получить токен из браузера:"
echo "1. Откройте https://shortsai.ru"
echo "2. F12 → Console"
echo "3. Выполните: await firebase.auth().currentUser?.getIdToken()"
echo "4. Скопируйте токен"
echo ""
echo "Затем выполните:"
echo "curl -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/schedule/settings"


