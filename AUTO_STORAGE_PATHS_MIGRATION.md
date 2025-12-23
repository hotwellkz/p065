# Миграция на автоматические пути к хранилищу

## Выполненные изменения

### Backend

1. **`backend/src/services/storage/userChannelStorage.ts`**
   - Изменен `archiveDir`: теперь использует `uploaded` вместо `Загруженные - {channelName}`
   - Обновлена документация

2. **`backend/src/services/channelDeletionService.ts`**
   - Добавлена защита от path traversal при удалении канала
   - Проверка что `channelDir` находится внутри `userDir` и `STORAGE_ROOT`

3. **`backend/src/routes/channelRoutes.ts`**
   - Убрана проверка `driveInputFolderId` при обновлении канала
   - Поля `driveInputFolderId` и `driveArchiveFolderId` больше не сохраняются (устанавливаются в `null`)
   - Убрана проверка `driveInputFolderId` в endpoint `test-blottata` (с комментарием)

### Frontend

1. **`src/utils/storagePaths.ts`** (новый файл)
   - Утилита для вычисления путей к хранилищу на frontend
   - Функции `makeSafeSlugFromEmail`, `makeSafeChannelSlug`, `computeChannelStoragePaths`

2. **`src/utils/blotatoStatus.ts`**
   - Убрана проверка `inputFolderId` и `archiveFolderId` из валидации
   - Теперь проверяется только `blotatoApiKey` и наличие хотя бы одного ID соцсети

3. **`src/pages/ChannelEdit/ChannelEditPage.tsx`**
   - Удалены поля ввода "ID входной папки на сервере" и "ID архивной папки на сервере"
   - Добавлен read-only блок с информацией о путях к хранилищу
   - Убрана валидация этих полей при сохранении
   - Обновлена логика формирования `BlotatoPublishSettings` (поля устанавливаются в `null`)
   - Убрана проверка `driveInputFolderId` при тестировании Blotato

## Структура путей

Пути вычисляются автоматически на основе:
- Email пользователя → `userSlug` (email преобразуется в безопасный slug)
- Название канала + ID канала → `channelSlug`

**Формула путей:**
```
STORAGE_ROOT = /app/storage/videos (или из env STORAGE_ROOT)
inputDir = STORAGE_ROOT/{userSlug}/{channelSlug}
archiveDir = STORAGE_ROOT/{userSlug}/{channelSlug}/uploaded
```

**Пример:**
- Email: `user@example.com` → `user-at-example-com`
- Канал: `Мой канал` (ID: `abc123`) → `мой-канал-abc123`
- Пути:
  - Входная: `/app/storage/videos/user-at-example-com/мой-канал-abc123`
  - Архивная: `/app/storage/videos/user-at-example-com/мой-канал-abc123/uploaded`

## Команды для проверки

### 1. Создание нового канала

**В UI:**
1. Создайте новый канал через интерфейс
2. Включите Blotato автопубликацию
3. Проверьте, что в настройках отображаются автоматические пути (read-only)

**На сервере (Synology):**
```bash
# Проверьте что папка создалась
ls -la /volume1/docker/shortsai/backend/storage/videos/

# Должна быть структура:
# {userSlug}/
#   └── {channelSlug}/
#       └── uploaded/
```

### 2. Проверка мониторинга

**Положите тестовый MP4 файл в inputDir:**
```bash
# Найдите путь к каналу
cd /volume1/docker/shortsai/backend/storage/videos
find . -name "*channel*" -type d

# Скопируйте тестовый файл
cp /path/to/test.mp4 /volume1/docker/shortsai/backend/storage/videos/{userSlug}/{channelSlug}/test.mp4
```

**Проверьте логи монитора:**
```bash
sudo /usr/local/bin/docker compose logs -f backend | grep -i "monitor\|storage\|archive\|ensure"
```

**Ожидаемое поведение:**
- Монитор должен обнаружить файл
- Файл должен быть обработан через Blotato
- После успешной публикации файл должен переместиться в `uploaded/`

### 3. Проверка перемещения в архив

**После успешной публикации:**
```bash
# Проверьте что файл переместился
ls -la /volume1/docker/shortsai/backend/storage/videos/{userSlug}/{channelSlug}/
ls -la /volume1/docker/shortsai/backend/storage/videos/{userSlug}/{channelSlug}/uploaded/
```

**Ожидаемое:**
- Файл должен исчезнуть из корневой папки канала
- Файл должен появиться в `uploaded/`

### 4. Удаление канала

**В UI:**
1. Удалите канал через интерфейс

**На сервере:**
```bash
# Проверьте что папка удалилась
ls -la /volume1/docker/shortsai/backend/storage/videos/{userSlug}/

# Папка {channelSlug} должна отсутствовать
```

**Проверьте логи:**
```bash
sudo /usr/local/bin/docker compose logs backend | grep -i "deletion\|storage\|channel"
```

**Ожидаемое:**
- В логах должно быть сообщение об удалении папки
- Папка канала должна быть удалена рекурсивно
- Если папка пользователя пуста, она также должна быть удалена

### 5. Проверка health и медиа роута

```bash
# Health endpoint
curl -I https://api.hotwell.synology.me/health

# Медиа роут (если файл существует)
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/test.mp4
```

**Ожидаемое:**
- Health: `200 OK`
- Медиа: `200 OK` или `206 Partial Content` (если файл существует)

## Удаленные/измененные поля

### Из UI удалены:
- `driveInputFolderId` (ID входной папки на сервере)
- `driveArchiveFolderId` (ID архивной папки на сервере)

### В БД:
- Поля остаются в схеме для обратной совместимости, но всегда устанавливаются в `null`
- Старые значения игнорируются

### В валидации:
- Убрана проверка наличия `inputFolderId` и `archiveFolderId` в `blotatoStatus.ts`
- Убрана проверка `driveInputFolderId` при сохранении канала
- Убрана проверка `driveInputFolderId` при тестировании Blotato

## Безопасность

1. **Path traversal защита:**
   - При удалении канала проверяется, что путь находится внутри `userDir` и `STORAGE_ROOT`
   - Используется `path.resolve()` для нормализации путей

2. **Slug безопасность:**
   - Email и название канала преобразуются в безопасные slug (только `a-z0-9-`)
   - Специальные символы заменяются на дефисы

## Обратная совместимость

- Старые каналы с заполненными `driveInputFolderId`/`driveArchiveFolderId` продолжат работать
- Эти значения игнорируются, пути вычисляются автоматически
- При следующем обновлении канала эти поля будут установлены в `null`

## Следующие шаги (опционально)

1. Обновить endpoint `test-blottata` для работы с локальным хранилищем вместо Google Drive
2. Добавить миграцию для удаления старых значений `driveInputFolderId`/`driveArchiveFolderId` из БД
3. Добавить feature flag для "advanced mode" с возможностью ручной настройки путей (если потребуется)





