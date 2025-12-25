# Миграция папок каналов на человекочитаемые имена

## Цель

Изменить структуру папок каналов с:
```
storage/videos/users/{emailSlug__userId}/channels/{channelId}/...
```

На:
```
storage/videos/users/{emailSlug__userId}/channels/{channelSlug__channelId}/...
```

Где `channelSlug` формируется из названия канала (например, "PostroimDom.kz" → "postroimdom-kz").

## Причина

Нужно видеть понятные папки на Synology (FileStation), где по имени сразу видно название канала.

## Реализованные изменения

### 1. Нормализация названия канала

Функция `channelNameToSlug(name: string)` в `backend/src/utils/fileUtils.ts`:
- trim, lower-case
- пробелы → '-'
- только [a-z0-9-_]
- обрезает до 60 символов
- Примеры:
  - "PostroimDom.kz" → "postroimdom-kz"
  - "Surprise Unbox Planet" → "surprise-unbox-planet"

### 2. Стабильный ключ папки канала

Формат: `{channelSlug}__{channelId}`

Чтобы не зависеть от переименований канала:
- При создании канала сохраняется `initialName` в Firestore
- `channelSlug` всегда строится из `initialName`, а не из текущего `name`
- При переименовании канала папка НЕ переименовывается автоматически

### 3. Утилиты для работы с каналами

`backend/src/utils/channelUtils.ts`:
- `getOrCreateChannelInitialName(userId, channelId)` - получает или создаёт `initialName`
- `buildChannelFolderKey(channelName, channelId)` - формирует `channelFolderKey`
- `getChannelFolderKey(userId, channelId)` - получает `channelFolderKey` для канала

### 4. Обновлён StorageService

Все методы теперь используют `channelFolderKey` вместо `channelId`:
- `resolveChannelDir(userFolderKey, channelFolderKey)`
- `resolveInboxPath(userFolderKey, channelFolderKey, videoId)`
- `resolveUploadedPath(userFolderKey, channelFolderKey, platform, videoId)`
- `ensureUserChannelDirs(userFolderKey, channelFolderKey)`
- `moveToUploaded(userFolderKey, channelFolderKey, platform, videoId)`
- `deleteChannel(userId, channelId)` - автоматически получает `channelFolderKey`

Добавлены вспомогательные методы:
- `resolveChannelFolderKey(userId, channelId)` - получает `channelFolderKey`
- `resolveChannelDirAsync(userId, channelId)` - асинхронно получает путь к каналу
- `ensureUserChannelDirsAsync(userId, channelId)` - асинхронно создаёт директории
- `findChannelDirWithFallback(userId, channelId)` - находит папку с fallback на старый формат

### 5. Fallback на старый формат

Все операции (поиск, перемещение, удаление) имеют fallback:
1. Сначала ищут в новом формате: `channels/{channelSlug__channelId}`
2. Если не найдено, ищут старый формат: `channels/{channelId}`
3. Если найдено в старом формате - автоматически мигрируют (rename) и продолжают

### 6. Сохранение initialName при создании

При создании канала через `/api/channels/import` автоматически сохраняется:
```typescript
initialName: finalName
```

### 7. Скрипт миграции

`backend/src/scripts/migrateChannelFolders.ts`:
- Сканирует все папки каналов
- Для каждого старого формата (`{channelId}`):
  - Получает `initialName` из Firestore
  - Формирует `channelFolderKey`
  - Переименовывает папку
- Если канал не найден → перемещает в `channels/_orphaned/`
- Генерирует отчёт `migration-channels-report.json`

## Запуск миграции

### На Synology через SSH:

```bash
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose exec backend node dist/scripts/migrateChannelFolders.js
```

### Проверка отчёта:

```bash
sudo /usr/local/bin/docker compose exec backend cat /app/storage/videos/users/migration-channels-report.json
```

## Проверка работы

### 1. Проверить структуру папок на хосте:

```bash
# Посмотреть все папки каналов
find /volume1/docker/shortsai/backend/storage/videos/users -type d -name "channels" -exec ls -la {} \;

# Найти все папки каналов
find /volume1/docker/shortsai/backend/storage/videos/users -type d -path "*/channels/*" | head -20
```

### 2. Проверить логи:

```bash
sudo /usr/local/bin/docker compose logs backend --tail=100 | grep -E "channelFolderKey|channelSlug|initialName"
```

### 3. Тест: Создание нового канала

1. Создать канал с названием "Test Channel"
2. Скачать видео
3. Проверить, что папка создана в формате `test-channel__{channelId}`

### 4. Тест: Переименование канала

1. Переименовать канал в UI
2. Скачать новое видео
3. Проверить, что новое видео сохраняется в ту же папку (по `initialName`)

## Важные замечания

1. **Не переименовывать папки вручную** - система использует `initialName` для стабильности
2. **Миграция безопасна** - старые папки переименовываются, данные не теряются
3. **Fallback работает** - если папка в старом формате, система найдёт её и мигрирует автоматически
4. **Удаление канала** - удаляет правильную папку независимо от формата

## Структура после миграции

```
storage/videos/users/
  {emailSlug__userId}/
    channels/
      {channelSlug__channelId}/     ← Новый формат
        inbox/
        uploaded/
        failed/
        tmp/
      _orphaned/                    ← Конфликтующие/неизвестные папки
        {oldChannelId}_conflict_...
```



