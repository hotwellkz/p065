# Обновление Nginx на VDS для поддержки /api/media/*

## Текущая ситуация

VDS уже настроен и проксирует запросы на Synology через WireGuard (`10.9.0.2:3000`), но **не хватает поддержки Range запросов** для `/api/media/*`, которые использует Blotato.

## Что нужно добавить

В текущей конфигурации nginx на VDS нужно добавить специальный `location /api/media/` с поддержкой:
- Range заголовков (`proxy_set_header Range $http_range;`)
- If-Range заголовков
- Accept-Ranges заголовка
- Увеличенные таймауты для больших файлов

## Команды для обновления на VDS

### Вариант 1: Через SSH (если есть доступ)

```bash
# Подключиться к VDS
ssh root@159.255.37.158

# Создать backup текущей конфигурации
cp /etc/nginx/sites-available/api.shortsai.ru /etc/nginx/sites-available/api.shortsai.ru.backup.$(date +%Y%m%d)

# Обновить конфигурацию (вставить содержимое из nginx-api-shortsai-fixed.conf)
nano /etc/nginx/sites-available/api.shortsai.ru

# Проверить конфигурацию
nginx -t

# Если OK, перезагрузить nginx
systemctl reload nginx
```

### Вариант 2: Через PowerShell (загрузка файла)

```powershell
# Загрузить обновленную конфигурацию на VDS
Get-Content nginx-api-shortsai-fixed.conf | ssh root@159.255.37.158 "cat > /etc/nginx/sites-available/api.shortsai.ru"

# Затем на VDS выполнить:
ssh root@159.255.37.158 "nginx -t && systemctl reload nginx"
```

### Вариант 3: Использовать скрипт apply-nginx-config.sh

```bash
# Загрузить скрипт на VDS
Get-Content apply-nginx-config.sh | ssh root@159.255.37.158 "cat > /tmp/apply-nginx-config.sh"

# Выполнить скрипт
ssh root@159.255.37.158 "chmod +x /tmp/apply-nginx-config.sh && /tmp/apply-nginx-config.sh"
```

## Изменения в конфигурации

### Добавлено:

1. **Специальный location для /api/media/**: 
   ```nginx
   location /api/media/ {
       proxy_set_header Range $http_range;
       proxy_set_header If-Range $http_if_range;
       add_header Accept-Ranges bytes always;
       ...
   }
   ```

2. **Увеличенные лимиты**:
   - `client_max_body_size 500M;` (было 100M)
   - `send_timeout 300s;` (добавлено)

3. **Поддержка Range запросов**:
   - Передача Range заголовков на backend
   - Добавление Accept-Ranges в ответ

## Проверка после обновления

### 1. Проверка HEAD запроса:
```bash
curl -I https://api.shortsai.ru/api/media/<test-file>.mp4
```

**Ожидается:**
```
HTTP/1.1 200 OK
Content-Type: video/mp4
Content-Length: <размер>
Accept-Ranges: bytes
```

### 2. Проверка Range запроса:
```bash
curl -r 0-1023 -I https://api.shortsai.ru/api/media/<test-file>.mp4
```

**Ожидается:**
```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/<total>
Content-Type: video/mp4
Accept-Ranges: bytes
```

### 3. Проверка MP4 signature:
```bash
curl -r 0-1023 https://api.shortsai.ru/api/media/<test-file>.mp4 | hexdump -C | grep ftyp
```

**Ожидается:** Строка с "ftyp" (сигнатура MP4)

## Обновление backend на Synology

После обновления nginx на VDS, обновить `PUBLIC_BASE_URL` на Synology:

```bash
# На Synology
cd /volume1/docker/shortsai/backend

# Добавить или обновить PUBLIC_BASE_URL
echo "PUBLIC_BASE_URL=https://api.shortsai.ru" >> .env.production

# Перезапустить backend
sudo docker compose down
sudo docker compose up -d
```

## Проверка логов

### На VDS (nginx):
```bash
tail -f /var/log/nginx/access.log | grep "/api/media"
tail -f /var/log/nginx/error.log
```

### На Synology (backend):
```bash
sudo docker compose logs -f backend | grep -i "media\|blotato\|validation"
```

## Ожидаемый результат

После обновления:
1. ✅ `https://api.shortsai.ru/api/media/*` поддерживает Range запросы
2. ✅ Blotato может читать метаданные через Range запросы
3. ✅ Нет ошибки "Failed to read media metadata"
4. ✅ Файлы отдаются с правильными заголовками

## Точка разрыва (до исправления)

**Было:**
- Nginx на VDS проксировал `/api/media/*`, но **не передавал Range заголовки**
- Blotato не мог прочитать метаданные через Range запросы
- Ошибка: "Failed to read media metadata"

**Стало:**
- Nginx передает Range заголовки на backend
- Backend отдает файлы с поддержкой Range (206 Partial Content)
- Blotato может читать метаданные

