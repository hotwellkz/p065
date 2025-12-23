#!/bin/bash
# Простые команды для исправления CORS на Synology
# Выполните в SSH сессии: cd /volume1/docker/shortsai/backend && bash <(cat << 'EOF'
# ... команды ...
# EOF

cd /volume1/docker/shortsai/backend || exit 1

# Резервная копия
cp src/index.ts src/index.ts.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Резервная копия создана"

# 1. Заменяем default frontendOrigin
sed -i 's|const frontendOrigin = normalizeOrigin(process\.env\.FRONTEND_ORIGIN) ?? "http://localhost:5173";|const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";|' src/index.ts

# 2. Удаляем комментарий про Nginx OPTIONS
sed -i '/\/\/ OPTIONS обрабатывается на уровне Nginx/d' src/index.ts
sed -i '/\/\/ Nginx возвращает 204 с CORS заголовками для OPTIONS запросов/d' src/index.ts

# 3. Удаляем кастомный middleware (от "// CORS middleware - настраиваем" до "app.use(")
# Сначала находим начало блока
sed -i '/\/\/ CORS middleware - настраиваем так, чтобы разрешать запросы через nginx/,/\/\/ Для прямых запросов (не через nginx) используем стандартный CORS/d' src/index.ts

# Удаляем сам middleware блок
sed -i '/app\.use((req, res, next) => {/,/^  });$/d' src/index.ts

# 4. Добавляем правильный комментарий перед cors()
if ! grep -q "CORS middleware - настраиваем ОДИН РАЗ" src/index.ts; then
    sed -i '/^const frontendOrigin/a\
\
// CORS middleware - настраиваем ОДИН РАЗ\
// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь
' src/index.ts
fi

# 5. Обновляем cors() - добавляем methods и allowedHeaders после credentials
# Проверяем, есть ли уже methods
if ! grep -q 'methods: \["GET", "POST"' src/index.ts; then
    # Находим строку с credentials: true и добавляем после неё
    sed -i '/credentials: true$/a\
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\
    allowedHeaders: ["Authorization", "Content-Type"]
' src/index.ts
fi

echo "✓ Файл обновлен"
echo ""
echo "Проверьте изменения:"
echo "  grep -A 5 'CORS middleware' src/index.ts"
echo "  grep -A 2 'methods:' src/index.ts"
echo ""
echo "Если все правильно:"
echo "  docker-compose build"
echo "  docker-compose restart"


