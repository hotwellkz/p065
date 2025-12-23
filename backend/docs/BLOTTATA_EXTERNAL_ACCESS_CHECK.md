# Проверка внешней доступности mediaUrl для Blotato

## Проблема

Валидация mediaUrl проходит успешно (файл доступен изнутри сервера), но Blotato все еще возвращает 500:
```
Failed to read media metadata. Is the file accessible and a valid media file?
```

## Диагностика

### 1. Проверка доступности URL из интернета

Выполните из **внешней машины** (не с сервера):

```bash
# Проверка HEAD запроса
curl -I https://api.hotwell.synology.me/api/media/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/postroimdom-kz__zyt00D2jzJQCp2olEpeK/video_9vu4db.mp4

# Ожидается:
# HTTP/1.1 200 OK
# Content-Type: video/mp4
# Content-Length: 6454926
# Accept-Ranges: bytes

# Проверка Range запроса
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/postroimdom-kz__zyt00D2jzJQCp2olEpeK/video_9vu4db.mp4

# Ожидается:
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 0-1023/6454926
# Content-Type: video/mp4
```

### 2. Проверка SSL сертификата

```bash
# Проверка сертификата
openssl s_client -connect api.hotwell.synology.me:443 -servername api.hotwell.synology.me < /dev/null

# Проверка с помощью curl
curl -vI https://api.hotwell.synology.me/api/media/... 2>&1 | grep -i "SSL\|certificate"
```

### 3. Проверка Reverse Proxy на Synology

Убедитесь, что в **Synology Reverse Proxy** настроено:

1. **Источник:**
   - Протокол: HTTPS
   - Hostname: `api.hotwell.synology.me`
   - Порт: 443

2. **Назначение:**
   - Протокол: HTTP
   - Hostname: `localhost` (или IP backend)
   - Порт: `3000` (или порт backend)

3. **Путь:**
   - `/api/*` должен проксироваться на backend
   - **Особенно:** `/api/media/*` должен работать

4. **Дополнительные настройки:**
   - Включить "WebSocket" (если нужно)
   - Включить "HSTS" (рекомендуется)
   - Проверить, что заголовки не обрезаются

### 4. Проверка Firewall

Убедитесь, что:
- Порт 443 открыт для входящих соединений
- Нет блокировки по IP для Blotato
- Нет rate limiting, который блокирует Blotato

### 5. Проверка User-Agent и заголовков

Blotato может использовать специфичный User-Agent. Проверьте логи nginx/reverse proxy на наличие блокировок.

## Возможные решения

### Решение 1: Проверить доступность извне

Если URL недоступен извне, проблема в reverse proxy или firewall.

### Решение 2: Использовать публичный CDN/Storage

Вместо отдачи файлов через backend, можно использовать:
- Google Cloud Storage (публичные bucket)
- AWS S3 (публичные bucket)
- Cloudflare R2
- Другие CDN сервисы

### Решение 3: Временная ссылка с токеном

Создать временную публичную ссылку с подписанным токеном (HMAC) для Blotato.

### Решение 4: Проверить требования Blotato

Убедитесь, что:
- Blotato поддерживает ваш формат URL
- Нет ограничений на размер файла
- Нет требований к заголовкам

## Команды для проверки на Synology

```bash
# Проверить конфигурацию reverse proxy
cat /usr/syno/etc/nginx/sites-enabled/* | grep -A 20 "api.hotwell.synology.me"

# Проверить логи nginx
tail -f /var/log/nginx/access.log | grep "/api/media"

# Проверить доступность из контейнера
docker exec shorts-backend curl -I https://api.hotwell.synology.me/api/media/...

# Проверить доступность с хоста
curl -I https://api.hotwell.synology.me/api/media/...
```

## Следующие шаги

1. Проверить доступность URL извне (не из контейнера)
2. Проверить reverse proxy конфигурацию
3. Проверить SSL сертификат
4. Проверить firewall правила
5. Связаться с поддержкой Blotato, если проблема сохраняется

