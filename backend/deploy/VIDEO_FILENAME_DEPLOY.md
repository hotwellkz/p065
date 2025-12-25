# Развертывание исправления имен файлов видео

## ✅ Файлы загружены на Synology

Все измененные файлы успешно загружены на сервер:

- ✅ `src/utils/videoFilename.ts` (851 строка, 31K)
- ✅ `src/services/videoDownloadService.ts` (1925 строк, 76K)
- ✅ `src/routes/telegramRoutes.ts` (1927 строк, 73K)
- ✅ `src/services/blottataLocalMonitor.ts` (648 строк, 23K)
- ✅ `src/utils/__tests__/videoFilename.test.ts`
- ✅ `VIDEO_FILENAME_FIX_REPORT.md`

## Команды для перезапуска

### Вариант 1: Пересборка и перезапуск (рекомендуется)

```powershell
ssh shortsai
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache backend
sudo /usr/local/bin/docker compose up -d
```

### Вариант 2: Только перезапуск (если TypeScript компилируется автоматически)

```powershell
ssh shortsai
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose restart backend
```

### Вариант 3: Через одну команду SSH

```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose restart backend"
```

## Проверка после перезапуска

### 1. Проверить логи на наличие новых функций:

```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -i 'FILENAME\|generateVideoFilename\|normalizeIncomingFilename'"
```

**Ожидаемые логи:**
- `[FILENAME] Generated video filename for automation`
- `[FILENAME] Using unified format for automation`
- `[FILENAME][WARN] Title-based filename detected, normalizing`

### 2. Проверить, что контейнер запустился без ошибок:

```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose ps"
```

### 3. Проверить компиляцию TypeScript:

```powershell
ssh shortsai "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose exec backend npm run build 2>&1 | tail -20"
```

## Что изменилось

### Для автоматизации (mode === "auto"):

**До:**
- Имена файлов: `fierce_showdown_between_jaguar_caiman.mp4` (title-based)

**После:**
- Имена файлов: `video_76sgbi.mp4` (единый формат)

### Автоматическая нормализация:

Если файл уже попал в inbox с "плохим" именем, он автоматически переименовывается при обработке монитором.

## Тестирование

После перезапуска:

1. **Создайте новое видео через автоматизацию** (inbox-monitor)
2. **Проверьте имя файла** - должно быть `video_<shortId>.mp4`
3. **Проверьте логи** - должны быть записи `[FILENAME] Generated video filename for automation`

## Откат (если что-то пошло не так)

Если нужно откатить изменения:

```powershell
ssh shortsai
cd /volume1/docker/shortsai/backend
git checkout HEAD -- src/utils/videoFilename.ts src/services/videoDownloadService.ts src/routes/telegramRoutes.ts src/services/blottataLocalMonitor.ts
sudo /usr/local/bin/docker compose restart backend
```

## Дополнительная информация

Подробный отчет об исправлении сохранен в:
- `/volume1/docker/shortsai/backend/VIDEO_FILENAME_FIX_REPORT.md`


