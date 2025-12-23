#!/bin/bash
# Удаление старого кастомного CORS middleware
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Удаление старого кастомного middleware ==="

python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_middleware = False
in_middleware = False
depth = 0

for i, line in enumerate(lines):
    # Находим начало старого кастомного middleware
    if 'app.use((req, res, next) => {' in line and '// Если запрос идет через nginx' in '\n'.join(lines[max(0, i-5):i+1]):
        skip_middleware = True
        in_middleware = True
        depth = 1
        print(f"Найден старый middleware на строке {i+1} - удаляем...")
        continue
    
    if skip_middleware and in_middleware:
        # Считаем вложенность скобок
        if '{' in line:
            depth += line.count('{')
        if '}' in line:
            depth -= line.count('}')
        
        # Если дошли до конца middleware
        if depth == 0 and '});' in line:
            in_middleware = False
            skip_middleware = False
            print(f"Удален блок до строки {i+1}")
            continue
        
        # Пропускаем строки внутри middleware
        continue
    
    # Заменяем старый комментарий на новый
    if 'CORS middleware - настраиваем так, чтобы разрешать запросы через nginx' in line:
        new_lines.append('// CORS middleware - настраиваем ОДИН РАЗ\n')
        new_lines.append('// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n')
        print(f"Заменен комментарий на строке {i+1}")
        continue
    
    new_lines.append(line)

# Проверяем, что methods и allowedHeaders есть в cors()
content = ''.join(new_lines)
if 'methods: ["GET", "POST"' not in content:
    print("❌ methods отсутствует в cors() - добавляем...")
    # Ищем credentials: true в cors блоке
    final_lines = []
    added = False
    
    for i, line in enumerate(new_lines):
        final_lines.append(line)
        if 'credentials: true' in line and not added:
            # Проверяем, что это внутри cors()
            # Ищем назад до app.use(cors
            is_in_cors = False
            for j in range(max(0, i-50), i):
                if 'app.use(' in new_lines[j] and 'cors' in new_lines[j]:
                    is_in_cors = True
                    break
            
            if is_in_cors and i + 1 < len(new_lines) and 'methods:' not in new_lines[i + 1]:
                final_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n')
                final_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]\n')
                added = True
                print(f"✓ Добавлены methods и allowedHeaders после строки {i+1}")
    
    new_lines = final_lines
else:
    print("✓ methods уже присутствует")

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"✓ Файл обновлен: {len(new_lines)} строк")
PYEOF

# Проверяем результат
echo ""
echo "=== Проверка результата ==="
echo "1. Старый middleware удален:"
grep -c "Если запрос идет через nginx" src/index.ts || echo "✓ Удален"
echo ""

echo "2. Новый комментарий:"
grep "CORS middleware - настраиваем ОДИН РАЗ" src/index.ts
echo ""

echo "3. methods и allowedHeaders:"
grep -n "methods:" src/index.ts
grep -n "allowedHeaders:" src/index.ts
echo ""

echo "4. Блок cors() (без старого middleware):"
sed -n '/app.use(/,/});/p' src/index.ts | grep -A 20 "cors(" | head -25

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


