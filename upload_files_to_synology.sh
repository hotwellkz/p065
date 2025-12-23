#!/bin/bash
# Скрипт для загрузки файлов на Synology через SSH heredoc

SYNO_HOST="192.168.100.222"
SYNO_USER="admin"
SYNO_PATH="/volume1/docker/shortsai/backend"

echo "Загрузка urlDownloader.ts..."
ssh ${SYNO_USER}@${SYNO_HOST} "cd ${SYNO_PATH} && cat > src/services/urlDownloader.ts" < backend/src/services/urlDownloader.ts

echo "Загрузка telegramRoutes.ts..."
ssh ${SYNO_USER}@${SYNO_HOST} "cd ${SYNO_PATH} && cat > src/routes/telegramRoutes.ts" < backend/src/routes/telegramRoutes.ts

echo "Загрузка test_download_url.ts..."
ssh ${SYNO_USER}@${SYNO_HOST} "cd ${SYNO_PATH} && cat > src/scripts/test_download_url.ts" < backend/src/scripts/test_download_url.ts

echo "Все файлы загружены!"



