#!/bin/bash
# Диагностика проблемы с CORS
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Проверка файла ==="
echo "1. Существует ли файл:"
ls -la src/index.ts
echo ""

echo "2. Размер файла:"
wc -l src/index.ts
echo ""

echo "3. Поиск всех упоминаний cors:"
grep -n -i "cors" src/index.ts | head -10
echo ""

echo "4. Поиск app.use:"
grep -n "app.use" src/index.ts | head -10
echo ""

echo "5. Строки вокруг frontendOrigin:"
grep -n -A 5 -B 5 "frontendOrigin" src/index.ts | head -15
echo ""

echo "6. Строки 60-120 (где должен быть cors):"
sed -n '60,120p' src/index.ts
echo ""

echo "=== Проверка через Python ==="
python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

print(f"Всего строк: {len(lines)}")
print(f"Размер файла: {len(content)} байт")

# Ищем cors разными способами
print("\nПоиск 'cors':")
for i, line in enumerate(lines):
    if 'cors' in line.lower():
        print(f"Строка {i+1}: {line[:80]}")

print("\nПоиск 'app.use':")
for i, line in enumerate(lines):
    if 'app.use' in line.lower():
        print(f"Строка {i+1}: {line[:80]}")

print("\nПоиск 'frontendOrigin':")
for i, line in enumerate(lines):
    if 'frontendOrigin' in line:
        print(f"Строка {i+1}: {line[:80]}")

# Показываем блок вокруг frontendOrigin
print("\nБлок вокруг frontendOrigin (строки 55-115):")
for i in range(54, min(115, len(lines))):
    print(f"{i+1:4d}: {lines[i]}")
PYEOF


