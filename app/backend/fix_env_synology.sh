#!/bin/bash

# Скрипт для исправления .env файла на Synology
# Удаляет дубликаты и добавляет недостающие переменные

set -e

ENV_FILE="/volume1/shortsai/app/backend/.env"
TEMP_ENV=$(mktemp)

if [ ! -f "$ENV_FILE" ]; then
    echo "Ошибка: .env файл не найден: $ENV_FILE"
    exit 1
fi

echo "Исправляю .env файл..."

# Удаляем дубликаты PORT, STORAGE_ROOT, BACKEND_URL, NODE_ENV
# Оставляем только последние значения
awk '
BEGIN { 
    port=""; storage=""; backend=""; node_env=""
}
/^PORT=/ { port=$0; next }
/^STORAGE_ROOT=/ { storage=$0; next }
/^BACKEND_URL=/ { backend=$0; next }
/^NODE_ENV=/ { node_env=$0; next }
{ print }
END {
    if (node_env) print node_env
    if (port) print port
    if (storage) print storage
    if (backend) print backend
}
' "$ENV_FILE" > "$TEMP_ENV"

# Проверяем, есть ли TELEGRAM_SESSION_SECRET
if ! grep -q "^TELEGRAM_SESSION_SECRET=" "$TEMP_ENV"; then
    echo "" >> "$TEMP_ENV"
    echo "# TELEGRAM_SESSION_SECRET (сгенерируйте: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")" >> "$TEMP_ENV"
    echo "TELEGRAM_SESSION_SECRET=7e6051ed8bb52d148af77220fb25d03284608c5dccc1b4ed0cb45f422c1ff533" >> "$TEMP_ENV"
    echo "✅ Добавлен TELEGRAM_SESSION_SECRET"
fi

# Проверяем, что FIREBASE_SERVICE_ACCOUNT или отдельные переменные есть
if ! grep -q "^FIREBASE_SERVICE_ACCOUNT=" "$TEMP_ENV" && \
   ! (grep -q "^FIREBASE_PROJECT_ID=" "$TEMP_ENV" && grep -q "^FIREBASE_CLIENT_EMAIL=" "$TEMP_ENV"); then
    echo "" >> "$TEMP_ENV"
    echo "# ⚠️  ВАЖНО: Настройте Firebase credentials!" >> "$TEMP_ENV"
    echo "# FIREBASE_SERVICE_ACCOUNT='{\"type\":\"service_account\",...}'" >> "$TEMP_ENV"
    echo "# ИЛИ" >> "$TEMP_ENV"
    echo "# FIREBASE_PROJECT_ID=prompt-6a4fd" >> "$TEMP_ENV"
    echo "# FIREBASE_CLIENT_EMAIL=..." >> "$TEMP_ENV"
    echo "# FIREBASE_PRIVATE_KEY=\"...\"" >> "$TEMP_ENV"
fi

# Создаём резервную копию
cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

# Заменяем файл
mv "$TEMP_ENV" "$ENV_FILE"

echo "✅ .env файл исправлен"
echo "📋 Резервная копия: ${ENV_FILE}.backup.*"
echo ""
echo "⚠️  ВАЖНО: Проверьте и настройте следующие переменные:"
echo "   - FIREBASE_SERVICE_ACCOUNT (валидный JSON)"
echo "   - TELEGRAM_API_ID, TELEGRAM_API_HASH"
echo "   - SYNX_CHAT_ID"
echo "   - FRONTEND_ORIGIN (URL вашего фронтенда на Netlify)"

