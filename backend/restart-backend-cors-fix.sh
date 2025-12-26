#!/bin/bash
# Скрипт для перезапуска backend после исправления CORS

cd /volume1/docker/shortsai/backend

echo "Пересборка backend контейнера..."
sudo /usr/local/bin/docker compose build --no-cache backend

echo "Перезапуск backend контейнера..."
sudo /usr/local/bin/docker compose up -d backend

echo "Проверка логов..."
sudo /usr/local/bin/docker compose logs --tail=30 backend | grep -i "started\|listening\|port\|error"

echo "Готово! Проверьте CORS через:"
echo "curl -i -X OPTIONS 'https://api.shortsai.ru/api/music-clips/channels/test123/runOnce' -H 'Origin: https://shortsai.ru' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: x-user-id,content-type'"

