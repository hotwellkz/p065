#!/bin/bash
# Финальное исправление - добавление methods и allowedHeaders
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

# Проверяем текущее состояние cors() блока
echo "=== Проверка cors() блока ==="
grep -A 20 "app.use(" src/index.ts | grep -A 20 "cors(" | head -25
echo ""

# Используем Python для добавления methods и allowedHeaders
python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Ищем credentials: true и добавляем после него methods и allowedHeaders
new_lines = []
i = 0
found_credentials = False

while i < len(lines):
    line = lines[i]
    
    # Находим credentials: true в cors() блоке
    if 'credentials: true' in line and not found_credentials:
        new_lines.append(line)
        # Проверяем следующие строки - есть ли уже methods?
        has_methods = False
        for j in range(i+1, min(i+5, len(lines))):
            if 'methods:' in lines[j]:
                has_methods = True
                break
        
        if not has_methods:
            # Добавляем methods и allowedHeaders
            new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n')
            new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]\n')
            found_credentials = True
        
        i += 1
        continue
    
    new_lines.append(line)
    i += 1

# Добавляем комментарии перед app.use(cors если их нет
final_lines = []
i = 0
cors_comment_added = False

while i < len(final_lines if final_lines else new_lines):
    line = (final_lines if final_lines else new_lines)[i]
    
    # Если нашли app.use( и cors в следующей строке или в этой
    if 'app.use(' in line and 'cors' in line and not cors_comment_added:
        # Проверяем, есть ли уже комментарий
        has_comment = False
        for j in range(max(0, i-3), i):
            if 'CORS middleware' in (final_lines if final_lines else new_lines)[j]:
                has_comment = True
                break
        
        if not has_comment:
            final_lines.insert(i, '// CORS middleware - настраиваем ОДИН РАЗ\n')
            final_lines.insert(i+1, '// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n')
            cors_comment_added = True
            i += 2
            continue
    
    if not final_lines:
        final_lines = new_lines[:]
    
    i += 1

# Если не добавили комментарий выше, добавляем перед app.use(cors
if not cors_comment_added:
    for i, line in enumerate(new_lines):
        if 'app.use(' in line and 'cors' in line:
            # Проверяем предыдущие строки
            has_comment = False
            for j in range(max(0, i-3), i):
                if 'CORS middleware' in new_lines[j]:
                    has_comment = True
                    break
            if not has_comment:
                new_lines.insert(i, '// CORS middleware - настраиваем ОДИН РАЗ\n')
                new_lines.insert(i+1, '// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n')
            break

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('✓ Файл обновлен')
PYEOF

# Проверяем результат
echo ""
echo "=== Проверка после исправления ==="
grep -B 2 -A 15 "app.use(" src/index.ts | grep -A 15 "cors(" | head -20
echo ""
grep "methods:" src/index.ts
echo ""
grep "allowedHeaders:" src/index.ts

echo ""
echo "Если methods и allowedHeaders добавлены, пересоберите контейнер:"
echo "  sudo docker-compose build && sudo docker-compose restart"


