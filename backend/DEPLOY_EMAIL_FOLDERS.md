# Команды для деплоя изменений email-based папок

## ✅ Файлы загружены на сервер

Все изменённые файлы успешно загружены:
- ✅ `backend/src/utils/fileUtils.ts`
- ✅ `backend/src/utils/userEmailUtils.ts`
- ✅ `backend/src/services/storageService.ts`
- ✅ `backend/src/services/videoDownloadService.ts`
- ✅ `backend/src/routes/telegramRoutes.ts`
- ✅ `backend/src/routes/diagRoutes.ts`
- ✅ `backend/src/scripts/migrateUserFolders.ts`

## 🚀 Следующие шаги

### 1. Пересобрать и перезапустить контейнер

Выполните через SSH:

```bash
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

### 2. Проверить логи после запуска

```bash
sudo /usr/local/bin/docker compose logs backend --tail=50 | grep -E "STORAGE|StorageService|userFolderKey"
```

**Ожидаемый вывод:**
```
[STORAGE] StorageService initialized {
  root: '/app/storage',
  videosRoot: '/app/storage/videos',
  ...
}
```

### 3. Запустить миграцию существующих папок

```bash
sudo /usr/local/bin/docker compose exec backend node dist/scripts/migrateUserFolders.js
```

### 4. Проверить отчёт миграции

```bash
sudo /usr/local/bin/docker compose exec backend cat /app/storage/videos/migration-users-report.json
```

### 5. Проверить структуру папок на хосте

```bash
# Посмотреть все папки пользователей
ls -la /volume1/docker/shortsai/backend/storage/videos/users/

# Найти все MP4 файлы
find /volume1/docker/shortsai/backend/storage/videos/users -name "*.mp4" -type f | head -10
```

## ✅ Проверка работы

### Тест: Создание нового видео
1. Откройте UI
2. Скачайте видео через кнопку "Забрать видео из SyntX на сервер"
3. Проверьте логи:
   ```bash
   sudo /usr/local/bin/docker compose logs backend --tail=100 | grep -E "userFolderKey|registrationEmail"
   ```
4. Проверьте файл на хосте:
   ```bash
   find /volume1/docker/shortsai/backend/storage/videos/users -name "*.mp4" -type f -newer /tmp -ls
   ```

**Ожидаемый результат:**
- В логах видно `userFolderKey: 'email-slug__userId'`
- Файл сохранён в папке формата `{emailSlug}__{userId}`

## 📋 Что проверить после деплоя

- [ ] Новые видео сохраняются в папки формата `{emailSlug}__{userId}`
- [ ] В логах видно `userFolderKey` и `registrationEmail`
- [ ] Миграция выполнена успешно (проверить отчёт)
- [ ] Старые папки `{userId}` переименованы или перемещены в `_orphaned`
- [ ] Диагностический endpoint `/api/diag/storage` показывает правильные пути


