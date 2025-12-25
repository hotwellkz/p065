# Отчет: Исправление проблемы с mediaUrl для Blotato

## Проблема

Blotato API возвращал ошибку 500:
```
Failed to read media metadata. Is the file accessible and a valid media file?
```

**Причина:** 
1. URL генерировался как `https://185.104.248.130:5001/api/media/...` (IP адрес с портом)
2. Blotato не может получить доступ к IP адресу извне (проблемы с TLS/сертификатом или недоступность)
3. Отсутствовала валидация доступности mediaUrl перед отправкой в Blotato

## Решение

### 1. Добавлена валидация mediaUrl перед отправкой в Blotato

**Файл:** `backend/src/services/blottataLocalFileProcessor.ts`

**Функция:** `validateMediaUrl(mediaUrl, channelId, fileName)`

**Проверки:**
- HEAD запрос для проверки заголовков (статус 200/206, Content-Type, Content-Length, Accept-Ranges)
- Range запрос (bytes=0-1023) для проверки первых байтов файла
- Проверка MP4 signature ("ftyp" на позиции 4-8)
- Детальное логирование всех проверок

**Результат:** Если mediaUrl недоступен или файл невалидный, ошибка `MEDIA_URL_INVALID` выбрасывается ДО вызова Blotato, что экономит время и дает понятную диагностику.

### 2. Добавлена поддержка HEAD запросов в mediaRoutes

**Файл:** `backend/src/routes/mediaRoutes.ts`

**Изменение:** Добавлен обработчик `router.head()` для поддержки HEAD запросов.

**Результат:** Blotato и валидация могут использовать HEAD для проверки доступности файла без скачивания.

### 3. Улучшена проверка IP адресов в URL

**Файл:** `backend/src/services/blottataLocalFileProcessor.ts`

**Изменение:** Добавлена проверка на использование IP адресов вместо доменов.

**Логирование:** Критическое предупреждение, если используется IP адрес:
```
IP addresses are not recommended for public access. Use a domain name with valid SSL certificate (e.g., https://api.hotwell.synology.me)
```

## Измененные файлы

1. **`backend/src/services/blottataLocalFileProcessor.ts`**
   - Добавлена функция `validateMediaUrl()`
   - Добавлен импорт `axios`
   - Добавлена проверка IP адресов в URL
   - Вызов `validateMediaUrl()` перед отправкой в Blotato

2. **`backend/src/routes/mediaRoutes.ts`**
   - Добавлен обработчик `router.head()` для поддержки HEAD запросов

## Требования к конфигурации

### Критично: Установить PUBLIC_BASE_URL

В `.env.production` на Synology должен быть установлен:

```bash
PUBLIC_BASE_URL=https://api.hotwell.synology.me
```

**Приоритет переменных:**
1. `PUBLIC_BASE_URL` (рекомендуется)
2. `BACKEND_URL` (fallback)
3. `FRONTEND_ORIGIN` с заменой порта (fallback)

**Важно:** URL должен быть:
- Публичным (доступен из интернета)
- HTTPS (не HTTP)
- Доменным именем (не IP адрес)
- С валидным SSL сертификатом

## Команды для перезапуска

### PowerShell (с локальной машины):

```powershell
# 1. Подключиться к серверу
ssh shortsai

# 2. Перейти в директорию проекта
cd /volume1/docker/shortsai/backend

# 3. Пересобрать и перезапустить контейнер
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d

# 4. Проверить логи
sudo /usr/local/bin/docker compose logs --tail=100 -f backend
```

### Или одной командой (SSH):

```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose build --no-cache && sudo /usr/local/bin/docker compose up -d"
```

## Проверка работы

### 1. Проверить логи валидации

После перезапуска в логах должны появиться:
```
BlottataLocalFileProcessor: Validating media URL
BlottataLocalFileProcessor: HEAD response received
BlottataLocalFileProcessor: Range response received
BlottataLocalFileProcessor: Media URL validation successful
```

### 2. Проверить, что используется правильный URL

В логах должно быть:
```
BlottataLocalFileProcessor: Media URL generated
  mediaUrl: 'https://api.hotwell.synology.me/api/media/...'
```

**НЕ должно быть:**
- `http://185.104.248.130:5001` (IP адрес)
- `https://185.104.248.130:5001` (IP адрес с HTTPS)
- `localhost` или `127.0.0.1`

### 3. Если валидация падает

В логах будет:
```
BlottataLocalFileProcessor: Media URL validation failed
  error: 'MEDIA_URL_INVALID: ...'
```

**Возможные причины:**
- Файл не найден (404)
- Endpoint недоступен (500, timeout)
- Неправильный Content-Type
- Файл не является MP4 (нет "ftyp" signature)

## Ожидаемое поведение

### До исправления:
1. MediaUrl генерировался как `https://185.104.248.130:5001/api/media/...`
2. Blotato пытался получить доступ → 500 ошибка
3. Ошибка была неясной: "Failed to read media metadata"

### После исправления:
1. MediaUrl генерируется как `https://api.hotwell.synology.me/api/media/...` (если установлен PUBLIC_BASE_URL)
2. Перед отправкой в Blotato выполняется валидация:
   - HEAD запрос → проверка доступности
   - Range запрос → проверка MP4 signature
3. Если валидация успешна → отправка в Blotato
4. Если валидация падает → понятная ошибка `MEDIA_URL_INVALID` с деталями

## Первопричина

**Основная проблема:** Использование IP адреса (`185.104.248.130:5001`) вместо публичного домена.

**Почему это не работало:**
1. Blotato работает на внешнем сервере и не может получить доступ к внутреннему IP
2. IP адреса часто блокируются или требуют специальной настройки
3. TLS сертификаты обычно выдаются для доменов, а не IP адресов

**Решение:** Использовать публичный домен `https://api.hotwell.synology.me` через reverse proxy с валидным SSL сертификатом.

## Дополнительные улучшения

1. **Self-check перед Blotato:** Теперь система проверяет доступность файла ДО отправки в Blotato
2. **Детальное логирование:** Все этапы валидации логируются для диагностики
3. **HEAD поддержка:** Endpoint поддерживает HEAD запросы для оптимизации проверок
4. **Проверка IP адресов:** Система предупреждает, если используется IP вместо домена



