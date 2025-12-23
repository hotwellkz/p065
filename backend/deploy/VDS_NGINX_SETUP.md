# Настройка Nginx на VDS для проксирования /api/media/*

## Цель
Настроить reverse proxy на VDS (159.255.37.158), чтобы URL `https://api.shortsai.ru/api/media/*` был доступен из интернета и отдавал mp4 файлы с Synology backend.

## Шаг 1: Подключение к VDS

```bash
ssh root@159.255.37.158
# или
ssh user@159.255.37.158
```

## Шаг 2: Проверка текущего состояния

```bash
# Проверить, установлен ли nginx
nginx -v

# Проверить текущую конфигурацию
nginx -T

# Проверить, какие сервисы слушают порты
netstat -tlnp | grep -E ':(80|443|3000|5001)'

# Проверить, есть ли уже конфигурация для api.shortsai.ru
ls -la /etc/nginx/sites-available/ | grep api.shortsai
ls -la /etc/nginx/sites-enabled/ | grep api.shortsai
```

## Шаг 3: Установка Nginx (если не установлен)

```bash
apt update
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

## Шаг 4: Установка SSL сертификата (Let's Encrypt)

```bash
# Установить certbot
apt install -y certbot python3-certbot-nginx

# Получить сертификат для api.shortsai.ru
certbot --nginx -d api.shortsai.ru

# Или вручную (если certbot не может автоматически настроить nginx)
certbot certonly --nginx -d api.shortsai.ru
```

## Шаг 5: Создание конфигурации Nginx

```bash
# Создать файл конфигурации
nano /etc/nginx/sites-available/api.shortsai.ru
```

Вставить содержимое из `backend/deploy/vds-nginx-api-media.conf`

**ВАЖНО:** Заменить `185.104.248.130:5001` на реальный IP и порт Synology backend.

Если backend доступен через:
- **QuickConnect/VPN:** использовать внутренний IP (например, `192.168.100.222:3000`)
- **Публичный IP:** использовать публичный IP и порт (например, `185.104.248.130:5001`)

## Шаг 6: Активация конфигурации

```bash
# Создать симлинк
ln -s /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-enabled/

# Проверить конфигурацию
nginx -t

# Если OK, перезагрузить nginx
systemctl reload nginx
# или
nginx -s reload
```

## Шаг 7: Проверка доступности

### С VDS (локально):
```bash
curl -I http://localhost/api/media/test.mp4
curl -I https://localhost/api/media/test.mp4
```

### С внешней машины:
```bash
curl -I https://api.shortsai.ru/api/media/test.mp4
```

### Проверка Range запроса:
```bash
curl -r 0-1023 -I https://api.shortsai.ru/api/media/test.mp4
```

**Ожидается:**
- HTTP/1.1 200 OK или 206 Partial Content
- Content-Type: video/mp4
- Accept-Ranges: bytes
- Content-Length: <размер файла>

## Шаг 8: Проверка MP4 signature

```bash
curl -L --range 0-1023 https://api.shortsai.ru/api/media/<real-file>.mp4 | hexdump -C | head -5
```

**Ожидается:** В выводе должно быть `ftyp` (сигнатура MP4 файла)

## Шаг 9: Обновление backend для использования api.shortsai.ru

В `.env.production` на Synology установить:

```bash
PUBLIC_BASE_URL=https://api.shortsai.ru
```

Или в `docker-compose.yml`:

```yaml
environment:
  - PUBLIC_BASE_URL=https://api.shortsai.ru
```

## Шаг 10: Перезапуск backend на Synology

```bash
cd /volume1/docker/shortsai/backend
sudo docker compose down
sudo docker compose up -d
```

## Шаг 11: Проверка логов

### На VDS (nginx):
```bash
tail -f /var/log/nginx/api.shortsai.ru-access.log
tail -f /var/log/nginx/api.shortsai.ru-error.log
```

### На Synology (backend):
```bash
sudo docker compose logs -f backend | grep -i "media\|blotato"
```

## Возможные проблемы

### 1. 502 Bad Gateway
**Причина:** Backend на Synology недоступен с VDS
**Решение:** 
- Проверить доступность: `curl -I http://<SYNOLOGY_IP>:<PORT>/health`
- Проверить firewall на Synology
- Использовать VPN или QuickConnect для доступа

### 2. 404 Not Found
**Причина:** Путь `/api/media/*` не проксируется правильно
**Решение:**
- Проверить `proxy_pass` в nginx конфиге
- Убедиться, что путь заканчивается на `/api/media/` (со слешем)

### 3. SSL ошибки
**Причина:** Сертификат не установлен или невалидный
**Решение:**
- Проверить: `certbot certificates`
- Обновить: `certbot renew`

### 4. Range запросы не работают
**Причина:** Заголовки Range не передаются
**Решение:**
- Убедиться, что в nginx конфиге есть:
  ```
  proxy_set_header Range $http_range;
  proxy_set_header If-Range $http_if_range;
  proxy_buffering off;
  ```

## Финальная проверка

После настройки выполнить:

```bash
# 1. Проверка HEAD запроса
curl -I https://api.shortsai.ru/api/media/<real-file>.mp4

# 2. Проверка Range запроса
curl -r 0-1023 https://api.shortsai.ru/api/media/<real-file>.mp4 | wc -c
# Ожидается: 1024

# 3. Проверка MP4 signature
curl -r 0-1023 https://api.shortsai.ru/api/media/<real-file>.mp4 | hexdump -C | grep ftyp
# Ожидается: строка с "ftyp"
```

## Автоматическое обновление SSL

```bash
# Добавить в crontab для автоматического обновления
crontab -e
# Добавить:
0 0 * * * certbot renew --quiet && systemctl reload nginx
```

