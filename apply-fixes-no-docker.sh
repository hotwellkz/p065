#!/bin/bash
# Применение исправлений БЕЗ использования Docker
# Выполните на Synology

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
with open('src/routes/scheduleRoutes.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0

while i < len(lines):
    line = lines[i]
    
    # Заменяем req.user!.uid на req.user?.uid в catch блоках
    if 'userId: req.user!.uid,' in line:
        new_lines.append(line.replace('req.user!.uid,', 'req.user?.uid || "unknown",'))
        i += 1
        continue
    
    # Добавляем проверку req.user перед использованием в GET /settings
    if 'router.get("/settings", authRequired, async (req, res) => {' in line:
        new_lines.append(line)
        i += 1
        # Пропускаем проверку Firestore
        while i < len(lines) and 'try {' not in lines[i]:
            new_lines.append(lines[i])
            i += 1
        # Добавляем проверку req.user перед const userId
        if i < len(lines) and 'try {' in lines[i]:
            new_lines.append(lines[i])  # try {
            i += 1
            # Ищем const userId = req.user!.uid;
            if i < len(lines) and 'const userId = req.user!.uid;' in lines[i]:
                # Добавляем проверку перед этой строкой
                new_lines.append('    // Проверяем, что req.user установлен\n')
                new_lines.append('    if (!req.user?.uid) {\n')
                new_lines.append('      Logger.error("Failed to get schedule settings: req.user not set", {\n')
                new_lines.append('        hasUser: !!req.user,\n')
                new_lines.append('        path: req.path\n')
                new_lines.append('      });\n')
                new_lines.append('      return res.status(401).json({\n')
                new_lines.append('        error: "Unauthorized",\n')
                new_lines.append('        message: "User not authenticated"\n')
                new_lines.append('      });\n')
                new_lines.append('    }\n')
                new_lines.append('\n')
                # Заменяем req.user!.uid на req.user.uid
                new_lines.append('    const userId = req.user.uid;\n')
                i += 1
                continue
    
    # Аналогично для PATCH /settings
    if 'router.patch("/settings", authRequired, async (req, res) => {' in line:
        new_lines.append(line)
        i += 1
        while i < len(lines) and 'try {' not in lines[i]:
            new_lines.append(lines[i])
            i += 1
        if i < len(lines) and 'try {' in lines[i]:
            new_lines.append(lines[i])
            i += 1
            if i < len(lines) and 'const userId = req.user!.uid;' in lines[i]:
                new_lines.append('    // Проверяем, что req.user установлен\n')
                new_lines.append('    if (!req.user?.uid) {\n')
                new_lines.append('      Logger.error("Failed to update schedule settings: req.user not set", {\n')
                new_lines.append('        hasUser: !!req.user,\n')
                new_lines.append('        path: req.path\n')
                new_lines.append('      });\n')
                new_lines.append('      return res.status(401).json({\n')
                new_lines.append('        error: "Unauthorized",\n')
                new_lines.append('        message: "User not authenticated"\n')
                new_lines.append('      });\n')
                new_lines.append('    }\n')
                new_lines.append('\n')
                new_lines.append('    const userId = req.user.uid;\n')
                i += 1
                continue
    
    new_lines.append(line)
    i += 1

with open('src/routes/scheduleRoutes.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('✓ scheduleRoutes.ts исправлен')
PYEOF

# 3. Исправление userSettingsRoutes.ts
echo "=== Исправление userSettingsRoutes.ts ==="
python3 << 'PYEOF'
with open('src/routes/userSettingsRoutes.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0

while i < len(lines):
    line = lines[i]
    
    # Добавляем проверку req.user в GET /
    if 'router.get("/", authRequired, async (req, res) => {' in line:
        new_lines.append(line)
        i += 1
        while i < len(lines) and 'try {' not in lines[i]:
            new_lines.append(lines[i])
            i += 1
        if i < len(lines) and 'try {' in lines[i]:
            new_lines.append(lines[i])
            i += 1
            if i < len(lines) and 'const userId = req.user!.uid;' in lines[i]:
                new_lines.append('    // Проверяем, что req.user установлен\n')
                new_lines.append('    if (!req.user?.uid) {\n')
                new_lines.append('      Logger.error("Failed to get user settings: req.user not set", {\n')
                new_lines.append('        hasUser: !!req.user,\n')
                new_lines.append('        path: req.path\n')
                new_lines.append('      });\n')
                new_lines.append('      return res.status(401).json({\n')
                new_lines.append('        success: false,\n')
                new_lines.append('        error: "Unauthorized",\n')
                new_lines.append('        message: "User not authenticated"\n')
                new_lines.append('      });\n')
                new_lines.append('    }\n')
                new_lines.append('\n')
                new_lines.append('    const userId = req.user.uid;\n')
                i += 1
                continue
    
    # Добавляем проверку req.user в PUT /
    if 'router.put("/", authRequired, async (req, res) => {' in line:
        new_lines.append(line)
        i += 1
        while i < len(lines) and 'try {' not in lines[i]:
            new_lines.append(lines[i])
            i += 1
        if i < len(lines) and 'try {' in lines[i]:
            new_lines.append(lines[i])
            i += 1
            if i < len(lines) and 'const userId = req.user!.uid;' in lines[i]:
                new_lines.append('    // Проверяем, что req.user установлен\n')
                new_lines.append('    if (!req.user?.uid) {\n')
                new_lines.append('      Logger.error("Failed to update user settings: req.user not set", {\n')
                new_lines.append('        hasUser: !!req.user,\n')
                new_lines.append('        path: req.path\n')
                new_lines.append('      });\n')
                new_lines.append('      return res.status(401).json({\n')
                new_lines.append('        success: false,\n')
                new_lines.append('        error: "Unauthorized",\n')
                new_lines.append('        message: "User not authenticated"\n')
                new_lines.append('      });\n')
                new_lines.append('    }\n')
                new_lines.append('\n')
                new_lines.append('    const userId = req.user.uid;\n')
                i += 1
                continue
    
    new_lines.append(line)
    i += 1

with open('src/routes/userSettingsRoutes.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('✓ userSettingsRoutes.ts исправлен')
PYEOF

# 4. Проверка
echo ""
echo "=== ПРОВЕРКА ==="
echo "scheduleRoutes.ts - проверка req.user:"
grep -n "req.user" src/routes/scheduleRoutes.ts | head -8
echo ""
echo "userSettingsRoutes.ts - проверка req.user:"
grep -n "req.user" src/routes/userSettingsRoutes.ts | head -8
echo ""

echo "=========================================="
echo "ИСПРАВЛЕНИЯ ПРИМЕНЕНЫ"
echo "=========================================="
echo ""
echo "Теперь пересоберите контейнер:"
echo "  sudo docker-compose build && sudo docker-compose restart"
echo ""
echo "Или через Synology Container Manager GUI:"
echo "  1. Откройте Container Manager"
echo "  2. Найдите контейнер shorts-backend"
echo "  3. Остановите → Пересоберите → Запустите"


