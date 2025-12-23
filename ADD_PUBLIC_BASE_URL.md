# Добавление PUBLIC_BASE_URL на Synology

## Команды для выполнения на Synology:

```bash
ssh -p 777 admin@hotwell.synology.me
cd /volume1/docker/shortsai/backend

# Проверьте текущий .env.production
cat .env.production | grep -E "PUBLIC_BASE_URL|BACKEND_URL"

# Добавьте PUBLIC_BASE_URL (если его нет)
if ! grep -q "PUBLIC_BASE_URL" .env.production; then
  echo "" >> .env.production
  echo "# Public base URL for Blotato media uploads" >> .env.production
  echo "PUBLIC_BASE_URL=https://api.hotwell.synology.me" >> .env.production
fi

# Проверьте что добавилось
tail -3 .env.production
```

## Пересборка контейнера:

```bash
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -i "media\|public\|blotato"
```

## Проверка работы:

```bash
# 1. Health check
curl -I https://api.hotwell.synology.me/health

# 2. Проверка медиа роута (нужно заменить на реальные значения из логов)
# Сначала найдите пример файла в логах или storage
ls -la /volume1/docker/shortsai/backend/storage/videos/*/

# Затем проверьте (пример):
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4

# 3. Проверка Range-запроса
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4

# 4. Проверка скачивания
curl -r 0-1023 https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4 | wc -c
```





