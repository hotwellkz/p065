#!/bin/bash
# Исправление ошибки - добавление запятой после credentials: true
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Исправление синтаксической ошибки ==="

python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим строку с credentials: true и добавляем запятую
new_lines = []
fixed = False

for i, line in enumerate(lines):
    # Если это credentials: true без запятой
    if 'credentials: true' in line and 'credentials: true,' not in line:
        # Заменяем на credentials: true,
        new_lines.append('    credentials: true,\n')
        fixed = True
        print(f"✓ Добавлена запятая после credentials: true на строке {i+1}")
    else:
        new_lines.append(line)

if fixed:
    with open('src/index.ts', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"✓ Файл исправлен: {len(new_lines)} строк")
else:
    print("⚠ Запятая уже есть или credentials: true не найден")
    # Показываем строку 116
    if len(lines) > 115:
        print(f"Строка 116: {lines[115].rstrip()}")
PYEOF

# Проверяем результат
echo ""
echo "=== Проверка ==="
sed -n '115,120p' src/index.ts

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


