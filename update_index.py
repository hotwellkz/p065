#!/usr/bin/env python3
import re

with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Добавить импорт diagRoutes
if 'import diagRoutes' not in content:
    content = content.replace(
        'import debugRoutes from "./routes/debugRoutes";',
        'import debugRoutes from "./routes/debugRoutes";\nimport diagRoutes from "./routes/diagRoutes";'
    )

# Добавить роут /api/diag
if 'app.use("/api/diag", diagRoutes);' not in content:
    content = content.replace(
        'app.use("/api/debug", debugRoutes);',
        'app.use("/api/debug", debugRoutes);\napp.use("/api/diag", diagRoutes);'
    )

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK: index.ts updated')

