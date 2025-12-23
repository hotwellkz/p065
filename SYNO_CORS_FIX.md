# Инструкция: Исправление CORS на Synology

## Выполните в SSH сессии на Synology:

```bash
cd /volume1/docker/shortsai/backend

# 1. Создаем резервную копию
cp src/index.ts src/index.ts.backup.$(date +%Y%m%d_%H%M%S)

# 2. Используем Python для точной замены
python3 << 'PYEOF'
import re

with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Заменяем default frontendOrigin
content = re.sub(
    r'const frontendOrigin = normalizeOrigin\(process\.env\.FRONTEND_ORIGIN\) \?\? "[^"]+";',
    'const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";',
    content
)

# Удаляем старый кастомный middleware (от комментария про Nginx до app.use(cors)
# Ищем и удаляем блок от "// OPTIONS обрабатывается" до "app.use("
lines = content.split('\n')
new_lines = []
skip = False
in_middleware = False

for i, line in enumerate(lines):
    if '// OPTIONS обрабатывается на уровне Nginx' in line:
        skip = True
        in_middleware = False
        continue
    if skip and 'app.use(' in line and 'cors' not in lines[max(0, i-5):i+1]:
        # Пропускаем кастомный middleware, но оставляем app.use(cors
        if 'cors' in line:
            skip = False
            new_lines.append('// CORS middleware - настраиваем ОДИН РАЗ')
            new_lines.append('// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь')
            new_lines.append(line)
        continue
    if skip and 'app.use((req, res, next) => {' in line:
        in_middleware = True
        continue
    if skip and in_middleware and line.strip() == '});':
        skip = False
        in_middleware = False
        continue
    if skip:
        continue
    
    # Обновляем cors() настройки - добавляем methods и allowedHeaders
    if 'credentials: true' in line and 'methods:' not in '\n'.join(new_lines[-10:]):
        new_lines.append(line)
        new_lines.append('    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],')
        new_lines.append('    allowedHeaders: ["Authorization", "Content-Type"]')
        continue
    
    new_lines.append(line)

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print('✓ Файл обновлен')
PYEOF

# 3. Проверяем результат
echo "Проверка изменений:"
grep -A 3 "CORS middleware" src/index.ts
grep -A 2 "methods:" src/index.ts

# 4. Пересобираем и перезапускаем контейнер
echo ""
echo "Пересборка контейнера..."
docker-compose build
docker-compose restart

echo "✓ Готово!"
```

## Альтернативный способ (если Python не работает):

Используйте `nano` или `vi` для ручного редактирования:

```bash
nano src/index.ts
```

Найдите и замените:

1. **Строка ~60**: Измените default значение:
   ```typescript
   const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";
   ```

2. **Удалите строки 62-83** (кастомный middleware с проверкой X-Forwarded-For)

3. **Найдите `app.use(cors({`** и добавьте перед ним:
   ```typescript
   // CORS middleware - настраиваем ОДИН РАЗ
   // Nginx больше не добавляет CORS заголовки, все обрабатывается здесь
   ```

4. **Внутри `cors({`** найдите `credentials: true` и добавьте после него:
   ```typescript
   credentials: true,
   methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
   allowedHeaders: ["Authorization", "Content-Type"]
   ```


