#!/bin/bash
# Финальное исправление - добавление methods и allowedHeaders
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Проверка cors() блока ==="
grep -A 30 "app.use(" src/index.ts | grep -A 30 "cors(" | head -40
echo ""

# Добавляем methods и allowedHeaders
python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

content = ''.join(lines)

# Проверяем наличие methods
if 'methods: ["GET", "POST"' not in content:
    print("❌ methods отсутствует - добавляем...")
    
    # Ищем credentials: true и добавляем после него
    new_lines = []
    added = False
    
    for i, line in enumerate(lines):
        new_lines.append(line)
        if 'credentials: true' in line and not added:
            # Проверяем следующие строки
            if i + 1 < len(lines) and 'methods:' not in lines[i + 1]:
                # Добавляем methods и allowedHeaders
                new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n')
                new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]\n')
                added = True
                print(f"✓ Добавлены methods и allowedHeaders после строки {i+1}")
    
    if added:
        with open('src/index.ts', 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print("✓ Файл обновлен")
    else:
        print("❌ Не удалось найти credentials: true для добавления methods")
        # Показываем где находится credentials
        for i, line in enumerate(lines, 1):
            if 'credentials' in line.lower():
                print(f"  Строка {i}: {line.rstrip()}")
else:
    print("✓ methods уже присутствует в файле")

# Проверяем комментарии
if 'CORS middleware - настраиваем ОДИН РАЗ' not in content:
    print("❌ Комментарии отсутствуют - добавляем...")
    new_lines = []
    comment_added = False
    
    for i, line in enumerate(lines):
        if 'app.use(' in line and 'cors' in line and not comment_added:
            # Проверяем предыдущие строки
            has_comment = False
            for j in range(max(0, i-3), i):
                if 'CORS middleware' in lines[j]:
                    has_comment = True
                    break
            if not has_comment:
                new_lines.append('// CORS middleware - настраиваем ОДИН РАЗ\n')
                new_lines.append('// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь\n')
                print(f"✓ Добавлены комментарии перед строкой {i+1}")
            comment_added = True
        new_lines.append(line)
    
    if not comment_added:
        new_lines = lines
    
    with open('src/index.ts', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("✓ Комментарии добавлены")
else:
    print("✓ Комментарии уже присутствуют")
PYEOF

# Финальная проверка
echo ""
echo "=== Финальная проверка ==="
grep -n "methods:" src/index.ts
grep -n "allowedHeaders:" src/index.ts
grep -n "CORS middleware" src/index.ts

# Показываем cors блок
echo ""
echo "=== Блок cors() ==="
sed -n '/app.use(/,/});/p' src/index.ts | grep -A 5 "cors(" | head -20

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


