#!/bin/bash
# Применение исправлений для 500 ошибок на Synology
# Выполните на Synology через SSH

set -e

cd /volume1/docker/shortsai/backend || {
    echo "❌ Папка /volume1/docker/shortsai/backend не найдена!"
    exit 1
}

echo "=========================================="
echo "ПРИМЕНЕНИЕ ИСПРАВЛЕНИЙ ДЛЯ 500 ОШИБОК"
echo "=========================================="
echo ""

# 1. Резервная копия
echo "=== 1. СОЗДАНИЕ РЕЗЕРВНОЙ КОПИИ ==="
BACKUP_DIR="backups_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp src/routes/scheduleRoutes.ts "$BACKUP_DIR/"
cp src/routes/userSettingsRoutes.ts "$BACKUP_DIR/"
echo "✓ Резервные копии созданы в $BACKUP_DIR/"
echo ""

# 2. Применение исправлений через Python
echo "=== 2. ПРИМЕНЕНИЕ ИСПРАВЛЕНИЙ ==="
python3 << 'PYEOF'
import re

# Исправление scheduleRoutes.ts
print("Исправление scheduleRoutes.ts...")
with open('src/routes/scheduleRoutes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Заменяем req.user!.uid на req.user?.uid в catch блоках
content = re.sub(r'userId: req\.user!\.uid,', 'userId: req.user?.uid || "unknown",', content)

# Добавляем проверку req.user в GET /settings (если её нет)
if 'router.get("/settings", authRequired, async (req, res) => {' in content:
    # Проверяем, есть ли уже проверка
    get_settings_match = re.search(r'router\.get\("/settings", authRequired, async \(req, res\) => \{([\s\S]*?)(try \{)', content)
    if get_settings_match:
        before_try = get_settings_match.group(1)
        if 'if (!req.user?.uid)' not in before_try:
            # Добавляем проверку перед try
            pattern = r'(router\.get\("/settings", authRequired, async \(req, res\) => \{[\s\S]*?)(try \{[\s]*)(const userId = req\.user!\.uid;)'
            replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to get schedule settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2    const userId = req.user.uid;'
            content = re.sub(pattern, replacement, content)

# Добавляем проверку req.user в PATCH /settings (если её нет)
if 'router.patch("/settings", authRequired, async (req, res) => {' in content:
    pattern = r'(router\.patch\("/settings", authRequired, async \(req, res\) => \{[\s\S]*?)(try \{[\s]*)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to update schedule settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2    const userId = req.user.uid;'
    content = re.sub(pattern, replacement, content)

with open('src/routes/scheduleRoutes.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ scheduleRoutes.ts исправлен")

# Исправление userSettingsRoutes.ts
print("Исправление userSettingsRoutes.ts...")
with open('src/routes/userSettingsRoutes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Добавляем проверку req.user в GET / (если её нет)
if 'router.get("/", authRequired, async (req, res) => {' in content:
    pattern = r'(router\.get\("/", authRequired, async \(req, res\) => \{[\s\S]*?)(try \{[\s]*)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to get user settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        success: false,\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2    const userId = req.user.uid;'
    content = re.sub(pattern, replacement, content)

# Добавляем проверку req.user в PUT / (если её нет)
if 'router.put("/", authRequired, async (req, res) => {' in content:
    pattern = r'(router\.put\("/", authRequired, async \(req, res\) => \{[\s\S]*?)(try \{[\s]*)(const userId = req\.user!\.uid;)'
    replacement = r'\1    // Проверяем, что req.user установлен\n    if (!req.user?.uid) {\n      Logger.error("Failed to update user settings: req.user not set", {\n        hasUser: !!req.user,\n        path: req.path\n      });\n      return res.status(401).json({\n        success: false,\n        error: "Unauthorized",\n        message: "User not authenticated"\n      });\n    }\n\n    \2    const userId = req.user.uid;'
    content = re.sub(pattern, replacement, content)

with open('src/routes/userSettingsRoutes.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ userSettingsRoutes.ts исправлен")
PYEOF

echo ""
echo "=== 3. ПРОВЕРКА ИСПРАВЛЕНИЙ ==="
if grep -q "if (!req.user?.uid)" src/routes/scheduleRoutes.ts 2>/dev/null; then
    echo "✓ scheduleRoutes.ts: проверка req.user добавлена"
else
    echo "⚠️ scheduleRoutes.ts: проверка req.user не найдена (возможно уже была)"
fi

if grep -q "if (!req.user?.uid)" src/routes/userSettingsRoutes.ts 2>/dev/null; then
    echo "✓ userSettingsRoutes.ts: проверка req.user добавлена"
else
    echo "⚠️ userSettingsRoutes.ts: проверка req.user не найдена (возможно уже была)"
fi
echo ""

echo "=========================================="
echo "ИСПРАВЛЕНИЯ ПРИМЕНЕНЫ"
echo "=========================================="
echo ""
echo "Следующий шаг: пересобрать контейнер"
echo "  sudo docker-compose build && sudo docker-compose restart"
echo ""


