#!/bin/bash
# Проверка и финальное исправление CORS
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=== Проверка текущего состояния ==="
echo "1. frontendOrigin:"
grep "frontendOrigin" src/index.ts | head -1
echo ""

echo "2. Блок app.use(cors:"
sed -n '/app.use(/,/});/p' src/index.ts | head -40
echo ""

echo "3. Поиск credentials:"
grep -n "credentials" src/index.ts
echo ""

# Проверяем реальное содержимое файла вокруг cors
echo "=== Детальная проверка cors() блока ==="
python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Находим app.use(cors
cors_start = -1
for i, line in enumerate(lines):
    if 'app.use(' in line and 'cors' in line:
        cors_start = i
        break

if cors_start == -1:
    print("❌ Не найден app.use(cors")
else:
    print(f"✓ Найден app.use(cors на строке {cors_start + 1}")
    print("\nБлок cors (первые 50 строк):")
    for i in range(cors_start, min(cors_start + 50, len(lines))):
        print(f"{i+1:4d}: {lines[i]}", end='')
        if '});' in lines[i] and i > cors_start + 5:
            break
    
    # Проверяем наличие methods
    cors_block = ''.join(lines[cors_start:cors_start+50])
    if 'methods:' in cors_block:
        print("\n✓ methods найден в блоке")
    else:
        print("\n❌ methods НЕ найден в блоке")
    
    if 'allowedHeaders:' in cors_block:
        print("✓ allowedHeaders найден в блоке")
    else:
        print("❌ allowedHeaders НЕ найден в блоке")
    
    if 'credentials: true' in cors_block:
        print("✓ credentials: true найден")
        # Показываем контекст вокруг credentials
        for i in range(cors_start, min(cors_start + 50, len(lines))):
            if 'credentials: true' in lines[i]:
                print(f"\nКонтекст вокруг credentials (строка {i+1}):")
                for j in range(max(0, i-2), min(i+5, len(lines))):
                    print(f"{j+1:4d}: {lines[j]}", end='')
                break
PYEOF

echo ""
echo "=== Если methods/allowedHeaders отсутствуют, исправляем ==="
python3 << 'PYEOF'
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

needs_fix = False

# Проверяем наличие methods
if 'methods: ["GET", "POST"' not in content:
    print("❌ methods отсутствует - добавляем...")
    needs_fix = True
    
    # Ищем credentials: true и добавляем после него
    import re
    # Более гибкий паттерн - ищем credentials: true с возможными пробелами и переносами
    pattern = r'(credentials:\s*true,?)(\s*\n\s*)(\}\);)'
    replacement = r'\1\2    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],\n    allowedHeaders: ["Authorization", "Content-Type"]\2\3'
    
    new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
    
    if new_content != content:
        with open('src/index.ts', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✓ methods и allowedHeaders добавлены")
    else:
        print("⚠ Не удалось добавить через regex, пробуем другой способ...")
        # Альтернативный способ - через строки
        lines = content.split('\n')
        new_lines = []
        added = False
        
        for i, line in enumerate(lines):
            new_lines.append(line)
            if 'credentials: true' in line and not added:
                # Проверяем следующие строки
                if i + 1 < len(lines) and 'methods:' not in lines[i + 1]:
                    new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],')
                    new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]')
                    added = True
        
        if added:
            with open('src/index.ts', 'w', encoding='utf-8') as f:
                f.write('\n'.join(new_lines))
            print("✓ methods и allowedHeaders добавлены (альтернативный способ)")
        else:
            print("❌ Не удалось добавить methods")
else:
    print("✓ methods уже присутствует")

# Проверяем комментарии
if 'CORS middleware - настраиваем ОДИН РАЗ' not in content:
    print("❌ Комментарии отсутствуют - добавляем...")
    lines = content.split('\n')
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
                new_lines.append('// CORS middleware - настраиваем ОДИН РАЗ')
                new_lines.append('// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь')
            comment_added = True
        new_lines.append(line)
    
    with open('src/index.ts', 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))
    print("✓ Комментарии добавлены")
else:
    print("✓ Комментарии уже присутствуют")
PYEOF

echo ""
echo "=== Финальная проверка ==="
grep -n "methods:" src/index.ts || echo "❌ methods не найден"
grep -n "allowedHeaders:" src/index.ts || echo "❌ allowedHeaders не найден"
grep -n "CORS middleware" src/index.ts || echo "❌ Комментарии не найдены"

echo ""
echo "Если все найдено, пересоберите контейнер:"
echo "  sudo docker-compose build && sudo docker-compose restart"


