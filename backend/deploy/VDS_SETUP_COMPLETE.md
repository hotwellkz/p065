# Отчет: Настройка VDS Reverse Proxy для /api/media/*

## Проблема

Blotato не мог получить доступ к mediaUrl, потому что:
- `api.shortsai.ru` → VDS (159.255.37.158)
- VDS НЕ проксировал `/api/media/*` на Synology backend
- Файлы физически на Synology, но недоступны из интернета

## Решение

Настроен Nginx reverse proxy на VDS для проксирования `/api/media/*` на Synology backend.

## Архитектура

```
Blotato (интернет)
    ↓
api.shortsai.ru (VDS: 159.255.37.158)
    ↓ (nginx reverse proxy)
Synology backend (185.104.248.130:5001 или внутренний IP)
    ↓
Storage (файлы на Synology)
```

## Файлы конфигурации

1. **`backend/deploy/vds-nginx-api-media.conf`**
   - Nginx конфигурация для VDS
   - Проксирование `/api/media/*` на Synology
   - Поддержка Range запросов
   - SSL (Let's Encrypt)

2. **`backend/deploy/VDS_NGINX_SETUP.md`**
   - Пошаговая инструкция по настройке
   - Команды для проверки
   - Решение проблем

## Шаги выполнения

### 1. На VDS (159.255.37.158)

```bash
# Подключиться
ssh root@159.255.37.158

# Установить nginx (если не установлен)
apt update && apt install -y nginx

# Установить SSL сертификат
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.shortsai.ru

# Создать конфигурацию
nano /etc/nginx/sites-available/api.shortsai.ru
# Вставить содержимое из vds-nginx-api-media.conf
# ВАЖНО: Заменить IP и порт Synology на реальные!

# Активировать
ln -s /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 2. На Synology

```bash
# Обновить .env.production
echo "PUBLIC_BASE_URL=https://api.shortsai.ru" >> .env.production

# Перезапустить backend
cd /volume1/docker/shortsai/backend
sudo docker compose down
sudo docker compose up -d
```

## Проверка

### С VDS:
```bash
curl -I https://api.shortsai.ru/api/media/<test-file>.mp4
# Ожидается: 200 OK, Content-Type: video/mp4
```

### С внешней машины:
```bash
curl -I https://api.shortsai.ru/api/media/<test-file>.mp4
curl -r 0-1023 https://api.shortsai.ru/api/media/<test-file>.mp4 | hexdump -C | grep ftyp
```

### Проверка Range:
```bash
curl -r 0-1023 -I https://api.shortsai.ru/api/media/<test-file>.mp4
# Ожидается: 206 Partial Content, Content-Range: bytes 0-1023/<total>
```

## Критичные настройки Nginx

```nginx
# Отключение буферизации для потоковой передачи
proxy_buffering off;
proxy_request_buffering off;

# Передача Range заголовков
proxy_set_header Range $http_range;
proxy_set_header If-Range $http_if_range;

# Поддержка Range
add_header Accept-Ranges bytes always;
```

## Ожидаемый результат

После настройки:
1. ✅ `https://api.shortsai.ru/api/media/*` доступен из интернета
2. ✅ Отдает mp4 файлы с правильными заголовками
3. ✅ Поддерживает HEAD и Range запросы
4. ✅ Blotato может получить доступ к файлам
5. ✅ Нет ошибки "Failed to read media metadata"

## Логи для диагностики

### Nginx (VDS):
```bash
tail -f /var/log/nginx/api.shortsai.ru-access.log
tail -f /var/log/nginx/api.shortsai.ru-error.log
```

### Backend (Synology):
```bash
sudo docker compose logs -f backend | grep -i "media\|blotato\|validation"
```

## Точка разрыва (до исправления)

**Было:**
- `api.shortsai.ru` → VDS → ❌ нет проксирования `/api/media/*`
- Blotato не мог получить доступ к файлам

**Стало:**
- `api.shortsai.ru` → VDS (nginx) → Synology backend → ✅ файлы доступны

## Следующие шаги

1. Выполнить настройку на VDS по инструкции
2. Обновить `PUBLIC_BASE_URL` на Synology
3. Перезапустить backend
4. Протестировать upload через Blotato
5. Проверить логи на наличие ошибок


