#!/bin/bash
# Ручное исправление CORS на Synology
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

# Проверяем текущее состояние
echo "Текущее состояние файла:"
echo "---"
grep -n "frontendOrigin\|CORS middleware\|credentials: true\|methods:" src/index.ts | head -10
echo "---"
echo ""

# Создаем патч-файл с правильным блоком CORS
cat > /tmp/cors_fix.py << 'PYEOF'
import re

file_path = 'src/index.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Заменяем default frontendOrigin
content = re.sub(
    r'const frontendOrigin = normalizeOrigin\(process\.env\.FRONTEND_ORIGIN\) \?\? "[^"]+";',
    'const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";',
    content
)

# 2. Удаляем все между frontendOrigin и app.use(cors
# Находим позицию frontendOrigin
frontend_pos = content.find('const frontendOrigin')
if frontend_pos != -1:
    # Находим следующую строку после frontendOrigin
    next_line = content.find('\n', frontend_pos) + 1
    # Находим app.use(cors
    cors_pos = content.find('app.use(', next_line)
    if cors_pos != -1:
        # Проверяем, есть ли cors в этой строке
        cors_line_end = content.find('\n', cors_pos)
        if 'cors' in content[cors_pos:cors_line_end]:
            # Удаляем все между next_line и cors_pos, но оставляем пустые строки
            between = content[next_line:cors_pos]
            # Удаляем старые комментарии и middleware
            lines_to_remove = [
                'OPTIONS обрабатывается на уровне Nginx',
                'Nginx возвращает 204',
                'CORS middleware - настраиваем так, чтобы',
                'app.use((req, res, next) => {',
                'Для прямых запросов (не через nginx)'
            ]
            
            new_between = ''
            for line in between.split('\n'):
                should_skip = False
                for pattern in lines_to_remove:
                    if pattern in line:
                        should_skip = True
                        break
                if not should_skip and 'res.setHeader("Access-Control' not in line:
                    # Пропускаем строки с setHeader для CORS
                    if 'app.use(' not in line or 'cors' in line:
                        new_between += line + '\n'
            
            # Заменяем блок
            content = content[:next_line] + '\n// CORS middleware - настраиваем ОДИН РАЗ\n// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n' + content[cors_pos:]

# 3. Добавляем methods и allowedHeaders после credentials: true
if 'methods: ["GET", "POST"' not in content:
    # Находим credentials: true и добавляем после него
    creds_pattern = r'(credentials: true,)(\s*\n\s*\}\);)'
    replacement = r'\1\n    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n    allowedHeaders: ["Authorization", "Content-Type"]\2'
    content = re.sub(creds_pattern, replacement, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ Файл обновлен')
PYEOF

python3 /tmp/cors_fix.py

# Проверяем результат
echo ""
echo "Проверка после исправления:"
grep -A 2 "CORS middleware" src/index.ts
grep "methods:" src/index.ts
grep "frontendOrigin.*shortsai" src/index.ts

echo ""
echo "Если все правильно, пересоберите контейнер:"
echo "  sudo docker-compose build"
echo "  sudo docker-compose restart"
echo ""
echo "Или через Synology Container Manager GUI"


