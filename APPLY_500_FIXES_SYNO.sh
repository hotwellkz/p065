#!/bin/bash
# Применение исправлений для 500 ошибок на Synology
# Выполните в SSH сессии

cd /volume1/docker/shortsai/backend

echo "=========================================="
echo "ПРИМЕНЕНИЕ ИСПРАВЛЕНИЙ ДЛЯ 500 ОШИБОК"
echo "=========================================="
echo ""

# 1. Резервная копия
echo "=== Создание резервной копии ==="
cp src/routes/scheduleRoutes.ts src/routes/scheduleRoutes.ts.backup.$(date +%Y%m%d_%H%M%S)
cp src/routes/userSettingsRoutes.ts src/routes/userSettingsRoutes.ts.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Резервные копии созданы"
echo ""

# 2. Исправление scheduleRoutes.ts
echo "=== Исправление scheduleRoutes.ts ==="
python3 << 'PYEOF'
import re

file_path = 'src/routes/scheduleRoutes.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Исправление 1: Заменяем req.user!.uid на req.user?.uid в catch блоках
content = re.sub(
    r'userId: req\.user!\.uid,',
    'userId: req.user?.uid || "unknown",',
    content
)

# Исправление 2: Добавляем проверку req.user перед использованием
# В GET /settings
if 'const userId = req.user!.uid;' in content and 'if (!req.user?.uid)' not in content:
    # Находим строку с const userId = req.user!.uid; в GET /settings
    pattern = r'(router\.get\("/settings", authRequired, async \(req, res\) => \{[^}]*?if \(!isFirestoreAvailable\(\) \|\| !db\) \{[^}]*?\}[^}]*?try \{[^}]*?)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to get schedule settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# В PATCH /settings
if 'const userId = req.user!.uid;' in content.split('router.patch')[1] if 'router.patch' in content else '':
    pattern = r'(router\.patch\("/settings", authRequired, async \(req, res\) => \{[^}]*?if \(!isFirestoreAvailable\(\) \|\| !db\) \{[^}]*?\}[^}]*?try \{[^}]*?)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to update schedule settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Заменяем req.user!.uid на req.user.uid после проверки
content = re.sub(
    r'if \(!req\.user\?\.uid\) \{[^}]*?\}\s+const userId = req\.user!\.uid;',
    lambda m: m.group(0).replace('req.user!.uid', 'req.user.uid'),
    content,
    flags=re.DOTALL
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ scheduleRoutes.ts исправлен')
PYEOF

# 3. Исправление userSettingsRoutes.ts
echo "=== Исправление userSettingsRoutes.ts ==="
python3 << 'PYEOF'
import re

file_path = 'src/routes/userSettingsRoutes.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Исправление 1: Заменяем req.user!.uid на req.user?.uid в catch блоках (уже сделано, но проверим)
# Исправление 2: Добавляем проверку req.user перед использованием
# В GET /
if 'const userId = req.user!.uid;' in content.split('router.get("/"')[1] if 'router.get("/"' in content else '':
    pattern = r'(router\.get\("/", authRequired, async \(req, res\) => \{[^}]*?if \(!isFirestoreAvailable\(\) \|\| !db\) \{[^}]*?\}[^}]*?try \{[^}]*?)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to get user settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        success: false,\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# В PUT /
if 'const userId = req.user!.uid;' in content.split('router.put("/"')[1] if 'router.put("/"' in content else '':
    pattern = r'(router\.put\("/", authRequired, async \(req, res\) => \{[^}]*?if \(!isFirestoreAvailable\(\) \|\| !db\) \{[^}]*?\}[^}]*?try \{[^}]*?)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to update user settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        success: false,\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Заменяем req.user!.uid на req.user.uid после проверки
content = re.sub(
    r'if \(!req\.user\?\.uid\) \{[^}]*?\}\s+const userId = req\.user!\.uid;',
    lambda m: m.group(0).replace('req.user!.uid', 'req.user.uid'),
    content,
    flags=re.DOTALL
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ userSettingsRoutes.ts исправлен')
PYEOF

# 4. Проверка изменений
echo ""
echo "=== ПРОВЕРКА ИЗМЕНЕНИЙ ==="
echo "scheduleRoutes.ts:"
grep -n "req.user" src/routes/scheduleRoutes.ts | head -5
echo ""
echo "userSettingsRoutes.ts:"
grep -n "req.user" src/routes/userSettingsRoutes.ts | head -5
echo ""

# 5. Пересборка
echo "=== ПЕРЕСБОРКА КОНТЕЙНЕРА ==="
echo "Выполните: sudo docker-compose build && sudo docker-compose restart"
echo ""


