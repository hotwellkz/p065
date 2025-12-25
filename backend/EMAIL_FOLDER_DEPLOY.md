# Деплой изменений: Email-based структура папок

## ✅ Что сделано

1. ✅ Функция нормализации email (`emailToSlug`)
2. ✅ Утилиты для работы с registrationEmail
3. ✅ Обновлён StorageService (использует `userFolderKey`)
4. ✅ Обновлены все места использования (videoDownloadService, telegramRoutes, diagRoutes)
5. ✅ Скрипт миграции существующих папок
6. ✅ Fallback на старый формат при удалении

## 🚀 Шаги деплоя

### 1. Загрузить изменения на сервер

```powershell
# Загрузить основные файлы
Get-Content backend\src\utils\fileUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/fileUtils.ts"
Get-Content backend\src\utils\userEmailUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/userEmailUtils.ts"
Get-Content backend\src\services\storageService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/storageService.ts"
Get-Content backend\src\services\videoDownloadService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/videoDownloadService.ts"
Get-Content backend\src\routes\telegramRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts"
Get-Content backend\src\routes\diagRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/diagRoutes.ts"
Get-Content backend\src\scripts\migrateUserFolders.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/scripts/migrateUserFolders.ts"
```

### 2. Пересобрать и перезапустить контейнер

```powershell
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

### 3. Проверить логи после запуска

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml logs backend --tail=50 | grep -E 'STORAGE|StorageService'"
```

**Ожидаемый вывод:**
```
[STORAGE] StorageService initialized {
  root: '/app/storage',
  videosRoot: '/app/storage/videos',
  ...
}
```

### 4. Запустить миграцию существующих папок

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml exec backend node dist/scripts/migrateUserFolders.js"
```

### 5. Проверить отчёт миграции

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml exec backend cat /app/storage/videos/migration-users-report.json"
```

### 6. Проверить структуру папок на хосте

```powershell
# Посмотреть все папки пользователей
ssh adminv@192.168.100.222 "ls -la /volume1/docker/shortsai/backend/storage/videos/users/"

# Найти все MP4 файлы
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -name '*.mp4' -type f | head -10"
```

## ✅ Проверка работы

### Тест 1: Создание нового видео
1. Откройте UI
2. Скачайте видео через кнопку "Забрать видео из SyntX на сервер"
3. Проверьте логи:
   ```powershell
   ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml logs backend --tail=100 | grep -E 'userFolderKey|registrationEmail'"
   ```
4. Проверьте файл на хосте:
   ```powershell
   ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -name '*.mp4' -type f -newer /volume1/docker/shortsai/backend/storage/videos/users -ls"
   ```

**Ожидаемый результат:**
- В логах видно `userFolderKey: 'email-slug__userId'`
- Файл сохранён в папке формата `{emailSlug}__{userId}`

### Тест 2: Диагностический endpoint
```powershell
# Получите токен из браузера (DevTools -> Application -> Local Storage -> authToken)
$token = "YOUR_TOKEN"
Invoke-RestMethod -Uri "http://192.168.100.222:3000/api/diag/storage" -Headers @{Authorization="Bearer $token"} | ConvertTo-Json -Depth 10
```

**Ожидаемый результат:**
```json
{
  "testUser": {
    "userId": "...",
    "userFolderKey": "email-slug__userId",
    ...
  },
  "examplePaths": {
    "userDir": {
      "path": "/app/storage/videos/users/email-slug__userId",
      ...
    }
  }
}
```

## 📋 Что проверить после деплоя

- [ ] Новые видео сохраняются в папки формата `{emailSlug}__{userId}`
- [ ] В логах видно `userFolderKey` и `registrationEmail`
- [ ] Миграция выполнена успешно (проверить отчёт)
- [ ] Старые папки `{userId}` переименованы или перемещены в `_orphaned`
- [ ] Диагностический endpoint `/api/diag/storage` показывает правильные пути
- [ ] Удаление пользователя работает корректно

## 🔍 Логи для отладки

```powershell
# Все логи с userFolderKey
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml logs backend | grep -E 'userFolderKey|registrationEmail|STORAGE.*user'"

# Логи сохранения файлов
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml logs backend | grep -E 'save.*done|FILE_SAVED'"
```

## ⚠️ Важно

1. **Миграция необратима** - старые папки переименовываются атомарно
2. **Orphaned папки** - папки, которые не удалось мигрировать, перемещаются в `users/_orphaned/`
3. **registrationEmail** - создаётся автоматически при первом использовании, не меняется при смене email
4. **Fallback** - при удалении пользователя система проверяет оба формата (новый и старый)



