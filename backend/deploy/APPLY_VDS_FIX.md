# Применение исправления Nginx на VDS

## Быстрая инструкция

VDS уже настроен, но нужно добавить поддержку Range запросов для `/api/media/*`.

## Шаг 1: Обновить nginx конфигурацию на VDS

### Вариант A: Через PowerShell (рекомендуется)

```powershell
# Загрузить обновленную конфигурацию
Get-Content nginx-api-shortsai-fixed.conf | ssh root@159.255.37.158 "cat > /etc/nginx/sites-available/api.shortsai.ru"

# Проверить и перезагрузить
ssh root@159.255.37.158 "nginx -t && systemctl reload nginx"
```

### Вариант B: Через скрипт

```powershell
# Загрузить скрипт
Get-Content apply-nginx-config.sh | ssh root@159.255.37.158 "cat > /tmp/apply-nginx.sh"

# Выполнить
ssh root@159.255.37.158 "chmod +x /tmp/apply-nginx.sh && /tmp/apply-nginx.sh"
```

### Вариант C: Вручную на VDS

```bash
ssh root@159.255.37.158

# Backup
cp /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-available/api.shortsai.ru.backup

# Редактировать
nano /etc/nginx/sites-available/api.shortsai.ru
# Вставить содержимое из nginx-api-shortsai-fixed.conf

# Проверить и перезагрузить
nginx -t
systemctl reload nginx
```

## Шаг 2: Обновить PUBLIC_BASE_URL на Synology

```powershell
# Подключиться к Synology
ssh shortsai

# Перейти в директорию проекта
cd /volume1/docker/shortsai/backend

# Обновить .env.production
echo "PUBLIC_BASE_URL=https://api.shortsai.ru" >> .env.production

# Или заменить существующий
sed -i 's|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://api.shortsai.ru|' .env.production

# Проверить
grep PUBLIC_BASE_URL .env.production

# Перезапустить backend
sudo docker compose down
sudo docker compose up -d
```

## Шаг 3: Проверка

### С VDS (локально):
```bash
curl -I https://api.shortsai.ru/api/media/<test-file>.mp4
curl -r 0-1023 -I https://api.shortsai.ru/api/media/<test-file>.mp4
```

### С внешней машины:
```powershell
curl.exe -I https://api.shortsai.ru/api/media/<test-file>.mp4
curl.exe -r 0-1023 -I https://api.shortsai.ru/api/media/<test-file>.mp4
```

**Ожидается:**
- HEAD: `200 OK`, `Accept-Ranges: bytes`
- Range: `206 Partial Content`, `Content-Range: bytes 0-1023/<total>`

## Что изменилось

### В nginx конфигурации:

1. **Добавлен специальный location для /api/media/**:
   ```nginx
   location /api/media/ {
       proxy_set_header Range $http_range;
       proxy_set_header If-Range $http_if_range;
       add_header Accept-Ranges bytes always;
   }
   ```

2. **Увеличены лимиты**:
   - `client_max_body_size 500M;` (было 100M)
   - `send_timeout 300s;` (добавлено)

### В backend:

- Обновлен комментарий: рекомендуется использовать `https://api.shortsai.ru`

## Проверка логов

### На VDS:
```bash
tail -f /var/log/nginx/access.log | grep "/api/media"
```

### На Synology:
```bash
sudo docker compose logs -f backend | grep -i "media\|blotato\|validation"
```

## Ожидаемый результат

После применения:
1. ✅ Nginx передает Range заголовки на backend
2. ✅ Backend отдает 206 Partial Content для Range запросов
3. ✅ Blotato может читать метаданные через Range запросы
4. ✅ Нет ошибки "Failed to read media metadata"

