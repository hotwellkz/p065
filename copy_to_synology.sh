#!/bin/bash
# Скрипт для копирования файлов на Synology
SYNOLOGY_HOST=10.9.0.2
SYNOLOGY_USER=admin
SYNOLOGY_PATH=/volume1/docker/shortsai/backend

# Копируем index.ts
echo "Copying index.ts to Synology..."
scp -o StrictHostKeyChecking=no /tmp/index.ts ${SYNOLOGY_USER}@${SYNOLOGY_HOST}:${SYNOLOGY_PATH}/src/index.ts

# Копируем telegramRoutes.ts
echo "Copying telegramRoutes.ts to Synology..."
scp -o StrictHostKeyChecking=no /tmp/telegramRoutes.ts ${SYNOLOGY_USER}@${SYNOLOGY_HOST}:${SYNOLOGY_PATH}/src/routes/telegramRoutes.ts

echo "Files copied successfully!"

