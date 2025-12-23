#!/bin/bash
# Проверка логов с sudo
# Выполните на Synology

cd /volume1/docker/shortsai/backend

# Находим контейнер
CONTAINER_NAME=$(sudo docker ps --format "{{.Names}}" | grep -E "backend|shorts" | head -1)
echo "Контейнер: $CONTAINER_NAME"
echo ""

# Логи (последние 200 строк)
echo "=== ПОСЛЕДНИЕ ЛОГИ (200 строк) ==="
sudo docker logs --tail 200 "$CONTAINER_NAME" --timestamps 2>&1 | tail -100
echo ""

# Ищем ошибки
echo "=== ОШИБКИ (ERROR/Exception/500) ==="
sudo docker logs --tail 500 "$CONTAINER_NAME" --timestamps 2>&1 | \
  grep -iE "error|exception|500|typeerror|referenceerror|cannot read|failed|at " | \
  tail -50
echo ""

# ENV переменные
echo "=== ENV ПЕРЕМЕННЫЕ ==="
sudo docker exec "$CONTAINER_NAME" sh -c 'env | sort | grep -E "OPENAI|FIREBASE|NODE_ENV|PORT"' 2>&1
echo ""


