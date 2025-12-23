# Миграция структуры папок пользователей на email-based формат

## ✅ Что изменено

### 1. Новая структура папок
**Было:**
```
storage/videos/users/{userId}/channels/{channelId}/...
```

**Стало:**
```
storage/videos/users/{emailSlug__userId}/channels/{channelId}/...
```

**Пример:**
- Email: `HotWell.kz@gmail.com`
- userId: `wJVWf7qvuoXYaVJSZbEGpNHUtva2`
- Папка: `hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2`

### 2. Реализованные компоненты

#### Функция нормализации email
- Файл: `backend/src/utils/fileUtils.ts`
- Функция: `emailToSlug(email: string): string`
- Правила:
  - trim, lower-case
  - `@` → `-at-`
  - `.` → `-`
  - Все не-ASCII символы → `-`
  - Сжатие повторяющихся `-`
  - Обрезка до 80 символов

#### Утилиты для работы с registrationEmail
- Файл: `backend/src/utils/userEmailUtils.ts`
- Функции:
  - `getOrCreateRegistrationEmail(userId)` - получает/создаёт registrationEmail в Firestore
  - `buildUserFolderKey(email, userId)` - формирует `{emailSlug}__{userId}`
  - `getUserFolderKey(userId)` - автоматически получает registrationEmail и формирует ключ

#### Обновлённый StorageService
- Все методы теперь используют `userFolderKey` вместо `userId`
- Добавлен метод `resolveUserFolderKey(userId)` для получения ключа
- Методы `deleteUser` и `deleteChannel` имеют fallback на старый формат

#### Скрипт миграции
- Файл: `backend/src/scripts/migrateUserFolders.ts`
- Мигрирует существующие папки из старого формата в новый
- Перемещает неопознанные папки в `users/_orphaned/`
- Создаёт отчёт `migration-users-report.json`

## 🚀 Запуск миграции

### 1. Скомпилировать TypeScript
```bash
cd /volume1/docker/shortsai/backend
npm run build
```

### 2. Запустить миграцию
```bash
sudo /usr/local/bin/docker compose exec backend node dist/scripts/migrateUserFolders.js
```

### 3. Проверить отчёт
```bash
sudo /usr/local/bin/docker compose exec backend cat /app/storage/videos/migration-users-report.json
```

## 📋 Команды PowerShell для проверки

### 1. Посмотреть дерево папок на Synology
```powershell
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -type d -maxdepth 2 | sort"
```

### 2. Найти все MP4 файлы
```powershell
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -name '*.mp4' -type f | head -20"
```

### 3. Проверить последние логи backend
```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose -f /volume1/docker/shortsai/backend/docker-compose.yml logs backend --tail=100 | grep -E 'STORAGE|userFolderKey|registrationEmail'"
```

### 4. Проверить структуру папок конкретного пользователя
```powershell
# Замените {emailSlug__userId} на реальный ключ
ssh adminv@192.168.100.222 "ls -la /volume1/docker/shortsai/backend/storage/videos/users/{emailSlug__userId}/channels/"
```

### 5. Проверить диагностический endpoint
```powershell
# Получите токен авторизации из браузера
$token = "YOUR_AUTH_TOKEN"
Invoke-RestMethod -Uri "http://192.168.100.222:3000/api/diag/storage" -Headers @{Authorization="Bearer $token"} | ConvertTo-Json -Depth 10
```

## ✅ Тест-план

### 1. Создание нового пользователя
1. Зарегистрируйте нового пользователя с email
2. Скачайте видео через UI
3. Проверьте, что папка создана в формате `{emailSlug}__{userId}`

**Ожидаемый результат:**
```
storage/videos/users/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/...
```

### 2. Смена email
1. Поменяйте email пользователя в профиле
2. Скачайте новое видео
3. Проверьте, что новое видео сохраняется в ту же папку (по registrationEmail)

**Ожидаемый результат:**
- Новые файлы сохраняются в папку, созданную при регистрации
- registrationEmail не меняется

### 3. Удаление пользователя
1. Удалите пользователя через админку
2. Проверьте, что папка `{emailSlug}__{userId}` удалена

**Ожидаемый результат:**
- Папка пользователя полностью удалена

### 4. Миграция существующих данных
1. Запустите скрипт миграции
2. Проверьте отчёт `migration-users-report.json`
3. Проверьте, что старые папки `{userId}` переименованы в `{emailSlug}__{userId}`

**Ожидаемый результат:**
- Все папки мигрированы
- Неопознанные папки перемещены в `users/_orphaned/`

## 🔍 Логирование

Все операции логируются с указанием `userFolderKey`:

```
[STORAGE] userFolderKey resolved {
  userId: 'wJVWf7qvuoXYaVJSZbEGpNHUtva2',
  userFolderKey: 'hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2',
  registrationEmail: 'HotWell.kz@gmail.com'
}
```

## ⚠️ Важные замечания

1. **registrationEmail не меняется** - это первичный email при регистрации, хранится в Firestore
2. **Fallback на старый формат** - при удалении пользователя система проверяет оба формата
3. **Миграция атомарна** - используется `fs.rename()`, что гарантирует целостность данных
4. **Orphaned папки** - папки, которые не удалось мигрировать, перемещаются в `users/_orphaned/`

## 📝 Структура registrationEmail в Firestore

```typescript
users/{userId} {
  registrationEmail: string,  // Первичный email при регистрации
  registrationEmailSetAt: Timestamp  // Когда был установлен
}
```

Если `registrationEmail` отсутствует, он создаётся автоматически из текущего email пользователя.


