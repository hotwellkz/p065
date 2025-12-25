#!/bin/bash
# Скрипт для пересборки контейнера с Music Clips изменениями

cd /volume1/docker/shortsai/backend

echo "Останавливаем контейнер..."
sudo /usr/local/bin/docker compose down

echo "Пересобираем образ..."
sudo /usr/local/bin/docker compose build --no-cache backend

echo "Запускаем контейнер..."
sudo /usr/local/bin/docker compose up -d

echo "Проверяем логи..."
sudo /usr/local/bin/docker compose logs backend --tail 30 | grep -i "MusicClips\|ffmpeg\|error\|Error\|started"

echo "Готово! Контейнер пересобран и запущен."

