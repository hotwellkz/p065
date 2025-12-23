#!/bin/bash
# Скрипт для применения диагностических изменений на Synology
# Выполнить на Synology: bash apply_diag_changes.sh

set -e

BACKEND_DIR="/volume1/docker/shortsai/backend"
BACKEND_NAME="shorts-backend"

echo "=== ШАГ 1: Добавление DEBUG_DIAG в .env.production ==="
cd "$BACKEND_DIR"

# Проверяем, есть ли уже DEBUG_DIAG
if grep -q "^DEBUG_DIAG=" .env.production 2>/dev/null; then
  echo "DEBUG_DIAG уже существует, обновляем..."
  sudo sed -i 's/^DEBUG_DIAG=.*/DEBUG_DIAG=true/' .env.production
else
  echo "Добавляем DEBUG_DIAG=true в .env.production..."
  echo "" >> .env.production
  echo "# Диагностические эндпоинты (включить для отладки)" >> .env.production
  echo "DEBUG_DIAG=true" >> .env.production
fi

echo "Проверка DEBUG_DIAG:"
grep DEBUG_DIAG .env.production || echo "ОШИБКА: DEBUG_DIAG не найден!"

echo ""
echo "=== ШАГ 2: Пересборка контейнера ==="
sudo /usr/local/bin/docker-compose build backend

echo ""
echo "=== ШАГ 3: Перезапуск контейнера (down/up для перечитывания env) ==="
sudo /usr/local/bin/docker-compose down backend
sudo /usr/local/bin/docker-compose up -d backend

echo ""
echo "=== ШАГ 4: Проверка что контейнер запущен ==="
sleep 3
sudo /usr/local/bin/docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$BACKEND_NAME" || echo "ОШИБКА: Контейнер не запущен!"

echo ""
echo "=== ШАГ 5: Проверка DEBUG_DIAG в контейнере ==="
sudo /usr/local/bin/docker exec "$BACKEND_NAME" sh -c 'echo "DEBUG_DIAG: ${DEBUG_DIAG}"' || echo "Не удалось проверить env в контейнере"

echo ""
echo "=== ГОТОВО ==="
echo "Теперь можно тестировать диагностические эндпоинты:"
echo "  GET /api/diag/whoami"
echo "  GET /api/diag/channels"
echo "  GET /api/diag/channel/:id"

