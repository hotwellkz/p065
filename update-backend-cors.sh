#!/bin/bash
# Скрипт для обновления CORS настроек в backend на Synology

BACKEND_DIR="/volume1/docker/shortsai/backend"
INDEX_FILE="$BACKEND_DIR/src/index.ts"

# Проверяем, что файл существует
if [ ! -f "$INDEX_FILE" ]; then
    echo "Ошибка: файл $INDEX_FILE не найден"
    exit 1
fi

# Создаем резервную копию
cp "$INDEX_FILE" "${INDEX_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✓ Создана резервная копия: ${INDEX_FILE}.backup.*"

# Используем sed для замены старого CORS кода на новый
# Удаляем старый кастомный middleware (строки 62-83) и обновляем cors() настройки

# Сначала удаляем старый кастомный middleware (если он есть)
sed -i '/OPTIONS обрабатывается на уровне Nginx/,/Для прямых запросов (не через nginx)/d' "$INDEX_FILE"

# Заменяем frontendOrigin default значение
sed -i "s/const frontendOrigin = normalizeOrigin(process\.env\.FRONTEND_ORIGIN) ?? \".*\";/const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? \"https:\/\/shortsai.ru\";/" "$INDEX_FILE"

# Обновляем cors() настройки - заменяем старый блок cors() на новый
# Это сложнее сделать через sed, поэтому лучше использовать Python или создать патч

echo "⚠ Для полной замены CORS настроек используйте команды ниже вручную"
echo ""
echo "Или используйте Python скрипт для точной замены..."


