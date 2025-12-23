# Диагностика HTTP 500 ошибок на Synology

## Выполните на Synology (SSH):

```bash
cd /volume1/docker/shortsai/backend

# 1. Проверка контейнера
echo "=== Контейнер ==="
docker ps | grep -E "backend|shorts"
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
echo "Используется контейнер: $CONTAINER_NAME"
echo ""

# 2. Логи (последние 300 строк)
echo "=== Логи контейнера ==="
docker logs --tail 300 "$CONTAINER_NAME" --timestamps 2>&1 | tail -100
echo ""

# 3. Проверка env переменных
echo "=== ENV переменные ==="
docker exec "$CONTAINER_NAME" sh -c 'env | sort | grep -E "OPENAI|FIREBASE|DATABASE|VITE|NODE_ENV|PORT|FRONTEND_ORIGIN|JWT_SECRET"' || echo "Не удалось получить env"
echo ""

# 4. Тестовые запросы БЕЗ авторизации (должны вернуть 401, НЕ 500)
echo "=== Тест 1: /health (без авторизации) ==="
curl -i http://localhost:3000/health 2>&1 | head -15
echo ""

echo "=== Тест 2: /api/schedule/settings (без авторизации - должен быть 401) ==="
curl -i http://localhost:3000/api/schedule/settings 2>&1 | head -20
echo ""

echo "=== Тест 3: /api/user-settings (без авторизации - должен быть 401) ==="
curl -i http://localhost:3000/api/user-settings 2>&1 | head -20
echo ""

echo "=== Тест 4: /api/prompt/openai POST (без авторизации - должен быть 401) ==="
curl -i -X POST http://localhost:3000/api/prompt/openai \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | head -20
echo ""

# 5. Свежие логи после запросов
echo "=== Свежие логи (ошибки) ==="
docker logs --tail 50 "$CONTAINER_NAME" --timestamps 2>&1 | grep -E "ERROR|Error|error|500|Exception|at |stack|authRequired|Firebase|Firestore" | tail -30
echo ""

# 6. Проверка reverse proxy
echo "=== Проверка reverse proxy ==="
echo "Проверьте в DSM: Control Panel → Login Portal → Advanced → Reverse Proxy"
echo "Должно быть правило: api.hotwell.synology.me → localhost:3000"
echo ""
```

## После выполнения скрипта:

1. **Если запросы БЕЗ авторизации возвращают 500 вместо 401:**
   - Проблема в authRequired middleware или глобальном обработчике ошибок
   - Нужно исправить обработку ошибок в auth.ts

2. **Если в логах есть stack trace:**
   - Найти конкретную ошибку (TypeError, ReferenceError, etc.)
   - Исправить соответствующий код

3. **Если проблема в env переменных:**
   - Проверить docker-compose.yml или .env файл
   - Убедиться что переменные передаются в контейнер


