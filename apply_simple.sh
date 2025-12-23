#!/bin/bash
cd /volume1/docker/shortsai/backend

# 1. Обновить index.ts - добавить импорт
if ! grep -q "import diagRoutes" src/index.ts; then
    sed -i '38a import diagRoutes from "./routes/diagRoutes";' src/index.ts
    echo "Added diagRoutes import"
fi

# 2. Добавить роут
if ! grep -q 'app.use("/api/diag"' src/index.ts; then
    sed -i '/app.use("\/api\/debug", debugRoutes);/a app.use("/api/diag", diagRoutes);' src/index.ts
    echo "Added /api/diag route"
fi

# 3. Добавить DEBUG_DIAG в .env.production
if ! grep -q "^DEBUG_DIAG=" .env.production 2>/dev/null; then
    echo "" >> .env.production
    echo "# Диагностические эндпоинты" >> .env.production
    echo "DEBUG_DIAG=true" >> .env.production
    echo "Added DEBUG_DIAG=true"
else
    sed -i 's/^DEBUG_DIAG=.*/DEBUG_DIAG=true/' .env.production
    echo "Updated DEBUG_DIAG=true"
fi

echo "=== Changes applied ==="
echo "Next: sudo docker-compose build backend && sudo docker-compose down backend && sudo docker-compose up -d backend"

