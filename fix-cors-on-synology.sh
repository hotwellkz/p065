#!/bin/bash
# Скрипт для исправления CORS в backend на Synology
# Выполните в SSH сессии на Synology

cd /volume1/docker/shortsai/backend

# Создаем резервную копию
cp src/index.ts src/index.ts.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Резервная копия создана"

# Используем Python для точной замены
python3 << 'PYTHON_EOF'
import re
import sys

file_path = 'src/index.ts'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Заменяем default значение frontendOrigin
    content = re.sub(
        r"const frontendOrigin = normalizeOrigin\(process\.env\.FRONTEND_ORIGIN\) \?\? \"[^\"]+\";",
        'const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";',
        content
    )
    
    # Удаляем старый кастомный middleware (строки между комментарием про Nginx и app.use(cors)
    # Ищем блок от "OPTIONS обрабатывается на уровне Nginx" до "app.use("
    pattern = r'// OPTIONS обрабатывается на уровне Nginx.*?// Nginx возвращает 204 с CORS заголовками для OPTIONS запросов\s*// CORS middleware.*?// Nginx уже обрабатывает CORS.*?app\.use\(\(req, res, next\) => \{.*?// Для прямых запросов \(не через nginx\) используем стандартный CORS\s*next\(\);\s*\}\);\s*'
    content = re.sub(pattern, '', content, flags=re.DOTALL)
    
    # Обновляем cors() настройки - заменяем старый блок на новый
    # Ищем блок cors() и заменяем его
    cors_pattern = r'app\.use\(\s*cors\(\{.*?credentials: true\s*\}\)\s*\);'
    
    new_cors = '''app.use(
  cors({
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (например, Postman, curl, прямые запросы)
      if (!origin) {
        return callback(null, true);
      }
      
      // Нормализуем origin (убираем завершающий слеш)
      const normalizedOrigin = origin.replace(/\\/+$/, "");
      const normalizedFrontendOrigin = frontendOrigin.replace(/\\/+$/, "");
      
      // Поддержка wildcard для Netlify доменов (*.netlify.app)
      if (normalizedFrontendOrigin.includes("*")) {
        const pattern = normalizedFrontendOrigin.replace(/\\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(normalizedOrigin)) {
          return callback(null, true);
        }
      }
      
      // Разрешаем запросы с нормализованного origin
      if (normalizedOrigin === normalizedFrontendOrigin) {
        return callback(null, true);
      }
      
      // Также разрешаем запросы с завершающим слешом для совместимости
      if (normalizedOrigin + "/" === normalizedFrontendOrigin || 
          normalizedOrigin === normalizedFrontendOrigin + "/") {
        return callback(null, true);
      }
      
      // Поддержка множественных доменов через запятую
      if (normalizedFrontendOrigin.includes(",")) {
        const allowedOrigins = normalizedFrontendOrigin.split(",").map(o => o.trim());
        if (allowedOrigins.some(allowed => {
          const normalizedAllowed = allowed.replace(/\\/+$/, "");
          return normalizedOrigin === normalizedAllowed || 
                 normalizedOrigin + "/" === normalizedAllowed ||
                 normalizedAllowed + "/" === normalizedOrigin;
        })) {
          return callback(null, true);
        }
      }
      
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"]
  })
);'''
    
    # Добавляем комментарий перед cors() если его нет
    if '// CORS middleware - настраиваем ОДИН РАЗ' not in content:
        new_cors = '// CORS middleware - настраиваем ОДИН РАЗ\n// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n' + new_cors
    
    content = re.sub(cors_pattern, new_cors, content, flags=re.DOTALL)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✓ Файл успешно обновлен")
    sys.exit(0)
    
except Exception as e:
    print(f"✗ Ошибка: {e}")
    sys.exit(1)
PYTHON_EOF

if [ $? -eq 0 ]; then
    echo "✓ CORS настройки обновлены"
    echo ""
    echo "Теперь пересоберите и перезапустите контейнер:"
    echo "  docker-compose build"
    echo "  docker-compose restart"
else
    echo "✗ Ошибка при обновлении файла"
    echo "Восстановите из резервной копии если нужно"
fi


