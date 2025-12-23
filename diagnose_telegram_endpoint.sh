#!/bin/bash
# Диагностика endpoint /api/telegram/fetchAndSaveToServer
# Выполнить на Synology: bash diagnose_telegram_endpoint.sh

set -e

BACKEND_NAME="shorts-backend"

echo "=== ШАГ 1: Проверка контейнера backend ==="
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}" | grep -E "shorts|backend|3000" || echo "Контейнер не найден"

echo ""
echo "=== ШАГ 2: Проверка доступности эндпоинтов ==="
echo "2.1 Через домен (api.shortsai.ru):"
curl -sS -i https://api.shortsai.ru/api/telegram/status 2>&1 | head -15

echo ""
echo "2.2 Локально (127.0.0.1:3000):"
curl -sS -i http://127.0.0.1:3000/api/telegram/status 2>&1 | head -15

echo ""
echo "2.3 Через Wireguard IP (10.9.0.2:3000):"
curl -sS -i http://10.9.0.2:3000/api/telegram/status 2>&1 | head -15

echo ""
echo "=== ШАГ 3: Логи контейнера (последние 300 строк) ==="
sudo docker logs --tail 300 "$BACKEND_NAME" 2>&1 | grep -iE "fetchAndSaveToServer|CHANNEL_NOT_FOUND|channelId|telegram|save|download" | tail -50

echo ""
echo "=== ШАГ 4: Полные логи (последние 100 строк) ==="
sudo docker logs --tail 100 "$BACKEND_NAME" 2>&1 | tail -50

echo ""
echo "=== ШАГ 5: Проверка переменных окружения в контейнере ==="
sudo docker exec "$BACKEND_NAME" sh -c 'env | grep -E "FIREBASE|NODE_ENV|PORT|FRONTEND" | sort'

echo ""
echo "=== ШАГ 6: Проверка nginx reverse proxy (Synology DSM) ==="
echo "Проверьте в DSM: Control Panel → Login Portal → Reverse Proxy"
echo "Найдите запись для api.hotwell.synology.me и проверьте:"
echo "  - Destination: localhost:3000 или 127.0.0.1:3000"
echo "  - Container: shorts-backend"

echo ""
echo "=== ДИАГНОСТИКА ЗАВЕРШЕНА ==="
echo "Скопируйте вывод выше для анализа"

