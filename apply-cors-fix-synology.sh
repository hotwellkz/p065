#!/bin/bash
# Выполните эти команды в SSH сессии на Synology

cd /volume1/docker/shortsai/backend

# 1. Создаем резервную копию
cp src/index.ts src/index.ts.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Резервная копия создана"

# 2. Заменяем default значение frontendOrigin
sed -i 's/const frontendOrigin = normalizeOrigin(process\.env\.FRONTEND_ORIGIN) ?? "http:\/\/localhost:5173";/const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https:\/\/shortsai.ru";/' src/index.ts

# 3. Удаляем старый кастомный middleware (строки 62-83)
# Удаляем от "// OPTIONS обрабатывается на уровне Nginx" до "app.use(" (но не сам app.use)
sed -i '/\/\/ OPTIONS обрабатывается на уровне Nginx/,/\/\/ Для прямых запросов (не через nginx) используем стандартный CORS/d' src/index.ts
sed -i '/app\.use((req, res, next) => {/,/^  });$/d' src/index.ts

# 4. Добавляем комментарий перед cors() если его нет
if ! grep -q "CORS middleware - настраиваем ОДИН РАЗ" src/index.ts; then
    sed -i '/^const frontendOrigin/a\
\
// CORS middleware - настраиваем ОДИН РАЗ\
// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь
' src/index.ts
fi

# 5. Обновляем cors() настройки - заменяем methods и allowedHeaders
# Заменяем credentials: true на новый блок с methods и allowedHeaders
sed -i '/credentials: true$/a\
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\
    allowedHeaders: ["Authorization", "Content-Type"]
' src/index.ts

# Удаляем дубликат credentials если он появился
sed -i '/credentials: true/{N;/credentials: true/d;}' src/index.ts

echo "✓ Файл обновлен"
echo ""
echo "Проверьте файл: cat src/index.ts | grep -A 5 'CORS middleware'"
echo ""
echo "Если все правильно, пересоберите контейнер:"
echo "  docker-compose build"
echo "  docker-compose restart"


