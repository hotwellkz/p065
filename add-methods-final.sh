#!/bin/bash
# Финальное добавление methods и allowedHeaders
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Добавление methods и allowedHeaders ==="

python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим credentials: true в cors блоке
new_lines = []
added = False
in_cors = False

for i, line in enumerate(lines):
    # Отслеживаем, находимся ли мы в cors блоке
    if 'app.use(' in line and 'cors' in line:
        in_cors = True
    
    new_lines.append(line)
    
    # Если нашли credentials: true и мы в cors блоке
    if 'credentials: true' in line and in_cors and not added:
        # Проверяем, что следующая строка не methods
        if i + 1 < len(lines) and 'methods:' not in lines[i + 1]:
            # Добавляем methods и allowedHeaders
            new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n')
            new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]\n')
            added = True
            print(f"✓ Добавлены methods и allowedHeaders после строки {i+1}")
    
    # Выходим из cors блока при закрывающей скобке
    if in_cors and '});' in line:
        in_cors = False

if not added:
    print("❌ Не удалось найти credentials: true в cors блоке")
    # Показываем все места с credentials
    print("Найденные credentials:")
    for i, line in enumerate(lines, 1):
        if 'credentials' in line.lower():
            print(f"  Строка {i}: {line.rstrip()}")
else:
    with open('src/index.ts', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"✓ Файл обновлен: {len(new_lines)} строк")
PYEOF

# Проверяем результат
echo ""
echo "=== Проверка ==="
grep -n "methods:" src/index.ts
grep -n "allowedHeaders:" src/index.ts

# Показываем cors блок
echo ""
echo "=== Блок cors() с methods ==="
sed -n '/app.use(/,/});/p' src/index.ts | grep -A 25 "cors(" | head -30

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


