# 🚀 Деплой обновления с поддержкой URL-скачивания на Synology

## ✅ Что сделано локально:

1. ✅ Создана ветка `feature/url-download`
2. ✅ Создан сервис `urlDownloader.ts`
3. ✅ Интегрирован в endpoint `/fetchLatestVideoToDrive`
4. ✅ Создан тестовый скрипт
5. ✅ Коммит сделан: `a40b4cd`

## 📋 Деплой на Synology

### Вариант 1: Через скрипт деплоя (рекомендуется)

**Выполните в PowerShell:**

```powershell
cd backend
bash deploy_to_synology.sh
```

**Примечание:** Скрипт требует файл `.env.deploy` в корне репозитория. Если его нет, используйте Вариант 2.

### Вариант 2: Ручной деплой через SSH

**Шаг 1: Подключитесь к Synology**

```powershell
ssh admin@hotwell.synology.me -p 777
# или
ssh admin@<SYNOLOGY_IP>
```

**Шаг 2: Перейдите в директорию проекта**

```bash
cd /volume1/docker/shortsai/backend
# или
cd /volume1/Hotwell/Backends/shortsai-backend
```

**Шаг 3: Обновите код из git**

```bash
git fetch origin
git checkout feature/url-download
# или если хотите слить в main:
git checkout main
git merge feature/url-download
```

**Шаг 4: Установите зависимости (если нужно)**

```bash
npm install
```

**Шаг 5: Соберите проект**

```bash
npm run build
```

**Шаг 6: Добавьте новые ENV переменные (если нужно)**

Отредактируйте `.env.production` или `.env`:

```bash
nano .env.production
```

Добавьте (опционально, есть значения по умолчанию):

```env
DOWNLOAD_TIMEOUT_MS=60000
DOWNLOAD_MAX_MB=500
DOWNLOAD_MAX_REDIRECTS=10
DOWNLOAD_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
TMP_DIR=/app/tmp
PLAYWRIGHT_FALLBACK=false
```

**Шаг 7: Перезапустите контейнер**

Если используете Docker Compose:

```bash
docker compose down
docker compose up -d --build
```

Или если используете PM2:

```bash
pm2 restart shortsai-backend
```

**Шаг 8: Проверьте логи**

```bash
# Docker
docker logs -f shorts-backend

# PM2
pm2 logs shortsai-backend
```

## 🧪 Тестирование после деплоя

### 1. Проверьте, что backend запущен:

```bash
curl http://localhost:3000/health
# или
curl https://api.shortsai.ru/health
```

### 2. Протестируйте новый endpoint:

```bash
curl -X POST https://api.shortsai.ru/api/telegram/fetchLatestVideoToDrive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "channelId": "test_channel",
    "url": "https://example.com/video.mp4"
  }'
```

### 3. Проверьте логи на ошибки:

```bash
# На Synology
docker logs shorts-backend | grep -i "url\|download\|error"
```

## 📝 Важные замечания

1. **Playwright опционален**: Если `PLAYWRIGHT_FALLBACK=false` (по умолчанию), Playwright не нужен.

2. **TMP_DIR**: Убедитесь, что директория существует и доступна для записи:
   ```bash
   mkdir -p /app/tmp
   chmod 777 /app/tmp
   ```

3. **Storage**: Файлы сохраняются в `STORAGE_ROOT/${userSlug}/${channelSlug}/` (как раньше).

4. **Обратная совместимость**: Старый способ (без `url`) работает как раньше.

## 🔄 Откат изменений

Если нужно откатить:

```bash
# На Synology
cd /volume1/docker/shortsai/backend
git checkout main
npm run build
docker compose restart
```

## 📚 Дополнительная документация

- `backend/CHANGELOG_URL_DOWNLOAD.md` - полное описание изменений
- `backend/src/services/urlDownloader.ts` - код сервиса
- `backend/src/scripts/test_download_url.ts` - тестовый скрипт



