#!/bin/bash
# Ручное добавление methods после строки 116
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Показываем контекст вокруг строки 116 ==="
sed -n '110,125p' src/index.ts
echo ""

echo "=== Добавляем methods и allowedHeaders ==="

python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим строку с credentials: true (строка 116)
new_lines = []
added = False

for i, line in enumerate(lines):
    new_lines.append(line)
    
    # Если это строка 116 (индекс 115) с credentials: true
    if i == 115 and 'credentials: true' in line:
        # Проверяем, что следующая строка не methods
        if i + 1 < len(lines) and 'methods:' not in lines[i + 1]:
            # Добавляем methods и allowedHeaders
            new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n')
            new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]\n')
            added = True
            print(f"✓ Добавлены methods и allowedHeaders после строки {i+1} (credentials: true)")

if added:
    with open('src/index.ts', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"✓ Файл обновлен: {len(new_lines)} строк")
else:
    print("❌ Не удалось добавить")
    print("Проверяем строку 116:")
    if len(lines) > 115:
        print(f"  {lines[115].rstrip()}")
PYEOF

# Проверяем результат
echo ""
echo "=== Проверка ==="
grep -n "methods:" src/index.ts
grep -n "allowedHeaders:" src/index.ts

# Показываем cors блок полностью
echo ""
echo "=== Полный блок cors() ==="
sed -n '/app.use(/,/});/p' src/index.ts | grep -B 5 -A 30 "credentials" | head -40

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


