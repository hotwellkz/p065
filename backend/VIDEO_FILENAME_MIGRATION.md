# Миграция на именование файлов по названию ролика

## Цель

Изменить систему именования файлов видео с:
```
{timestamp}_{random}.mp4
{timestamp}_{random}.json
```

На:
```
{title_slug}.mp4
{title_slug}.json
```

Где `title_slug` формируется из названия ролика из UI (например, "SipPani_Stroitelstvo_s_yumorom").

## Реализованные изменения

### 1. Функция санитайза и транслитерации

`makeSafeBaseName(title: string)` в `backend/src/utils/fileUtils.ts`:
- Транслитерация кириллицы в латиницу
- Пробелы → '_'
- Удаление запрещённых символов: `<>:"/\|?*` и управляющие
- Разрешены: латиница, цифры, '-', '_'
- Убрать повторяющиеся '_' и '-'
- Ограничить до 80 символов
- Fallback на "video" если пусто

Примеры:
- "SipPani Stroitelstvo s yumorom" → "SipPani_Stroitelstvo_s_yumorom"
- "ПостройДом юмор" → "PostroiDom_yumor"
- "Test<>File" → "TestFile"

### 2. Генерация уникального имени файла

`generateUniqueVideoFileName(title, targetDir, shortId?)`:
- Генерирует безопасное базовое имя из title
- Проверяет существование файла в targetDir
- Если файл существует → добавляет суффикс `__2`, `__3`, и т.д.
- Если title отсутствует → fallback на `{timestamp}_{shortId}`

### 3. Обновлён StorageService

Методы `resolveInboxPath` и `resolveInboxMetaPath` теперь принимают `fileName` вместо `videoId`:
- Автоматически добавляют расширения (.mp4, .json)
- Поддерживают как с расширением, так и без

### 4. Обновлены метаданные JSON

Добавлены поля:
```json
{
  "originalTitle": "SipPani Stroitelstvo s yumorom",
  "safeFileBase": "SipPani_Stroitelstvo_s_yumorom",
  "finalFileBase": "SipPani_Stroitelstvo_s_yumorom__2",
  "mp4File": "SipPani_Stroitelstvo_s_yumorom__2.mp4",
  "jsonFile": "SipPani_Stroitelstvo_s_yumorom__2.json",
  "videoId": "...",
  ...
}
```

### 5. Обновлён videoDownloadService

- Использует `generateUniqueVideoFileName` вместо `generateVideoId` для имени файла
- Сохраняет `videoId` только для метаданных и БД
- Логирует `originalTitle`, `safeBaseName`, `fileBaseName`

### 6. Обновлён telegramRoutes

- Использует новую систему именования
- Передаёт `videoTitle` из запроса в `downloadAndSaveToLocal`
- Сохраняет `fileBaseName` и `originalTitle` в Firestore

## Обратная совместимость

- Старые файлы по `{timestamp}_{random}` остаются без изменений
- При отсутствии `title` используется fallback на старый формат
- UI может отображать `originalTitle` из метаданных, если доступно

## Логирование

Добавлены логи:
```
[STORAGE] saving video: title="..." -> base="..." -> final="..." -> path="..."
[STORAGE] title missing, fallback to timestamp_random
```

## Тест-план

1. ✅ Создать видео с title "SipPani_Stroitelstvo_s_yumorom" → сохраняется как `SipPani_Stroitelstvo_s_yumorom.mp4`
2. ✅ Сохранить второе видео с тем же title → `SipPani_Stroitelstvo_s_yumorom__2.mp4`
3. ✅ Title с кириллицей → корректная транслитерация
4. ✅ Title с запрещёнными символами → чистится без ошибок
5. ✅ Старые файлы по timestamp_random остаются читаемыми
6. ✅ При отсутствии title → fallback на timestamp_random

## Команды проверки (PowerShell)

```powershell
# Проверить наличие файлов в папке inbox
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -name '*.mp4' -path '*/inbox/*' | head -20"

# Вывести последние STORAGE логи из docker
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs backend --tail=100 | grep -E 'STORAGE|fileBaseName|originalTitle'"
```



