# Исправление Blotato mediaUrl - Итоговый отчет

## Измененные файлы

### Backend:
1. **`backend/src/services/blottataLocalFileProcessor.ts`**
   - Изменена логика формирования `mediaUrl`
   - Добавлена поддержка `PUBLIC_BASE_URL` (приоритет #1)
   - Добавлена проверка на HTTPS
   - Добавлена ошибка если URL не указан

### Конфигурация (нужно добавить):
2. **`.env.production`** (на Synology)
   - Нужно добавить: `PUBLIC_BASE_URL=https://api.hotwell.synology.me`

## Формирование mediaUrl

### До исправления:
```
http://185.104.248.130:5001/api/media/{userSlug}/{channelSlug}/{fileName}
```
❌ Недоступен извне, Blotato не может получить доступ

### После исправления:
```
https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}
```
✅ Публичный HTTPS URL, доступен извне

### Приоритет переменных:
1. `PUBLIC_BASE_URL` (новый, рекомендуется)
2. `BACKEND_URL` (fallback)
3. `FRONTEND_ORIGIN` с заменой порта (fallback)
4. Ошибка, если ничего не указано

## Проверка роута /api/media

### Статус: ✅ Настроен правильно

**Файл:** `backend/src/routes/mediaRoutes.ts`

**Поддерживает:**
- ✅ Range-запросы (206 Partial Content)
- ✅ Правильный Content-Type: video/mp4
- ✅ Защиту от path traversal
- ✅ Логирование запросов
- ✅ Проверку существования файла

**Регистрация:** `app.use("/api/media", mediaRoutes)` в `backend/src/index.ts`

## Команды проверки

### 1. Health check
```bash
curl -I https://api.hotwell.synology.me/health
```
**Ожидается:**
```
HTTP/1.1 200 OK
```

### 2. Проверка медиа роута
```bash
# Замените на реальные значения из вашего канала
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
```
**Ожидается:**
```
HTTP/1.1 200 OK
Content-Type: video/mp4
Content-Length: <размер файла>
Accept-Ranges: bytes
```

### 3. Проверка Range-запроса
```bash
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
```
**Ожидается:**
```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/<общий размер>
Content-Length: 1024
Content-Type: video/mp4
Accept-Ranges: bytes
```

### 4. Проверка скачивания первых 1024 байт
```bash
curl -r 0-1023 https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4 | wc -c
```
**Ожидается:** `1024`

## Шаги развертывания

### 1. Добавить PUBLIC_BASE_URL
```bash
ssh -p 777 admin@hotwell.synology.me
cd /volume1/docker/shortsai/backend
echo "PUBLIC_BASE_URL=https://api.hotwell.synology.me" >> .env.production
```

### 2. Пересобрать контейнер
```bash
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

### 3. Проверить логи
```bash
sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -i "media\|public\|blotato"
```

**Ожидаемые логи:**
```
BlottataLocalFileProcessor: Media URL generated {
  mediaUrl: "https://api.hotwell.synology.me/api/media/..."
}
BlottataPublisherService: Uploading media { mediaUrl: "https://..." }
BlottataPublisherService: Media uploaded successfully
```

## Проверка nginx/reverse proxy

Убедитесь что в Synology Reverse Proxy настроено:
- **Источник:** `https://api.hotwell.synology.me`
- **Назначение:** `http://localhost:3000` (или IP:порт backend)
- **Путь:** `/api/*` проксируется на backend
- **Особенно:** `/api/media/*` должен работать

Если `/api/media` возвращает 404 от nginx:
1. Проверьте правила Reverse Proxy
2. Убедитесь что путь `/api/*` проксируется на backend
3. Проверьте что backend слушает на правильном порту (3000)

## Ожидаемый результат после фикса

1. ✅ `mediaUrl` формируется как `https://api.hotwell.synology.me/api/media/...`
2. ✅ Blotato может получить доступ к файлу
3. ✅ Медиа успешно загружается в Blotato
4. ✅ Публикация проходит успешно
5. ✅ Файл перемещается в `uploaded/` после успешной публикации

## Результаты curl проверок

**Выполните после развертывания и пришлите результаты:**

```bash
# 1. Health
curl -I https://api.hotwell.synology.me/health

# 2. Media (замените на реальные значения)
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4

# 3. Range
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4

# 4. Download test
curl -r 0-1023 https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4 | wc -c
```





