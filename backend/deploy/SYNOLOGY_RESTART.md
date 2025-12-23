# Перезапуск backend на Synology

## Статус файлов

✅ **Файлы загружены на Synology:**
- `src/services/blottataLocalFileProcessor.ts` (546 строк, обновлен 24 Dec 03:10)
- `src/routes/mediaRoutes.ts` (315 строк, обновлен 24 Dec 02:57)
- HEAD обработчик присутствует
- validateMediaUrl функция присутствует
- PUBLIC_BASE_URL=https://api.shortsai.ru установлен

## Команды для перезапуска

### Вариант 1: Через SSH (требует пароль для sudo)

```powershell
ssh shortsai
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
sudo /usr/local/bin/docker compose logs --tail=50 -f backend
```

### Вариант 2: Через DSM UI

1. Открыть **Docker** в DSM
2. Найти контейнер `shorts-backend`
3. Остановить контейнер
4. Пересобрать образ (если нужно)
5. Запустить контейнер

### Вариант 3: Только перезапуск (без пересборки)

```powershell
ssh shortsai
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose restart backend
```

## Проверка после перезапуска

### 1. Проверить логи:
```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -i 'media\|blotato\|validation\|PUBLIC_BASE_URL'"
```

### 2. Проверить с реальным файлом из логов:

Из предыдущих логов видно файл:
- `video_9vu4db.mp4`
- `video_fmy0s3.mp4`

```powershell
# Проверить доступность реального файла
curl.exe -I https://api.shortsai.ru/api/media/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/postroimdom-kz__zyt00D2jzJQCp2olEpeK/video_9vu4db.mp4

# Проверить Range запрос
curl.exe -r 0-1023 -I https://api.shortsai.ru/api/media/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/postroimdom-kz__zyt00D2jzJQCp2olEpeK/video_9vu4db.mp4
```

**Ожидается:**
- HEAD: `200 OK`, `Content-Type: video/mp4`, `Accept-Ranges: bytes`
- Range: `206 Partial Content`, `Content-Range: bytes 0-1023/<total>`

## Что проверить в логах после перезапуска

1. **PUBLIC_BASE_URL загружен:**
   ```
   BlottataLocalFileProcessor: Media URL generated
     mediaUrl: 'https://api.shortsai.ru/api/media/...'
   ```

2. **Валидация работает:**
   ```
   BlottataLocalFileProcessor: Validating media URL
   BlottataLocalFileProcessor: HEAD response received
   BlottataLocalFileProcessor: Range response received
   BlottataLocalFileProcessor: Media URL validation successful
   ```

3. **Нет ошибок валидации:**
   - Нет `MEDIA_URL_INVALID`
   - Нет ошибок Range запросов

## Если нужен пароль для sudo

Используйте DSM UI для перезапуска контейнера, или настройте passwordless sudo для docker команд (как было сделано ранее).


