# Итоговый отчет: Обновление Nginx на VDS для /api/media/*

## Проблема

Blotato не мог получить доступ к mediaUrl через `api.shortsai.ru`, потому что:
- Nginx на VDS проксировал запросы, но **не передавал Range заголовки**
- Blotato использует Range запросы для чтения метаданных MP4 файлов
- Без Range заголовков Blotato получал ошибку "Failed to read media metadata"

## Решение

Обновлена конфигурация nginx на VDS для поддержки Range запросов в `/api/media/*`.

## Изменения в конфигурации

### Файлы:
1. **`nginx-api-shortsai-fixed.conf`** - обновлена конфигурация
2. **`apply-nginx-config.sh`** - обновлен скрипт применения
3. **`backend/deploy/UPDATE_VDS_NGINX.md`** - инструкция по обновлению

### Добавлено в nginx:

```nginx
# Специальный location для /api/media/*
location /api/media/ {
    proxy_pass http://10.9.0.2:3000;
    
    # КРИТИЧНО: Передача Range заголовков
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    
    # Поддержка Range в ответе
    add_header Accept-Ranges bytes always;
    
    # Отключение буферизации
    proxy_buffering off;
    proxy_request_buffering off;
    
    # Увеличенные таймауты
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

### Увеличены лимиты:
- `client_max_body_size 500M;` (было 100M)
- `send_timeout 300s;` (добавлено)

## Команды для применения

### На VDS (159.255.37.158):

```bash
# 1. Backup текущей конфигурации
cp /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-available/api.shortsai.ru.backup

# 2. Обновить конфигурацию (загрузить nginx-api-shortsai-fixed.conf)
# Или использовать скрипт apply-nginx-config.sh

# 3. Проверить
nginx -t

# 4. Перезагрузить
systemctl reload nginx
```

### На Synology:

```bash
# Обновить PUBLIC_BASE_URL
echo "PUBLIC_BASE_URL=https://api.shortsai.ru" >> .env.production

# Перезапустить backend
cd /volume1/docker/shortsai/backend
sudo docker compose down
sudo docker compose up -d
```

## Проверка

### 1. HEAD запрос:
```bash
curl -I https://api.shortsai.ru/api/media/<file>.mp4
# Ожидается: 200 OK, Accept-Ranges: bytes
```

### 2. Range запрос:
```bash
curl -r 0-1023 -I https://api.shortsai.ru/api/media/<file>.mp4
# Ожидается: 206 Partial Content, Content-Range: bytes 0-1023/<total>
```

### 3. MP4 signature:
```bash
curl -r 0-1023 https://api.shortsai.ru/api/media/<file>.mp4 | hexdump -C | grep ftyp
# Ожидается: строка с "ftyp"
```

## Точка разрыва

**До исправления:**
- Nginx проксировал `/api/media/*`, но не передавал Range заголовки
- Backend не получал Range заголовки → не мог отдать 206 Partial Content
- Blotato не мог прочитать метаданные

**После исправления:**
- Nginx передает Range заголовки на backend
- Backend отдает 206 Partial Content с правильными заголовками
- Blotato может читать метаданные через Range запросы

## Следующие шаги

1. ✅ Обновить nginx конфигурацию на VDS
2. ✅ Обновить PUBLIC_BASE_URL на Synology
3. ⏳ Проверить доступность из интернета
4. ⏳ Протестировать upload через Blotato
5. ⏳ Проверить логи на наличие ошибок

## Файлы для применения

- `nginx-api-shortsai-fixed.conf` - обновленная конфигурация
- `apply-nginx-config.sh` - скрипт для автоматического применения
- `backend/deploy/UPDATE_VDS_NGINX.md` - подробная инструкция


