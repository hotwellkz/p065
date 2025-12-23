# Команды для проверки исправлений авто-сохранения

## Изменения

1. ✅ Ограничение длины имени файла до 50 символов
2. ✅ Генерация короткого названия через OpenAI для авто-режима
3. ✅ Отключение создания JSON файлов в авто-режиме (по умолчанию)
4. ✅ Улучшенная обработка длинных кириллических текстов

## Команды для проверки (PowerShell)

### 1. Проверить, что нет лишних папок верхнего уровня

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos -maxdepth 1 -type d -printf '%f\n'"
```

**Ожидаемо:** только `users` (и возможно `tmp`, если реально используется)

### 2. Проверить, что нет пустых email-папок

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos -maxdepth 1 -type d ! -name 'users' ! -name 'tmp' -print"
```

**Ожидаемо:** пустой вывод (нет папок)

### 3. Проверить последние созданные mp4 и имена

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -type f -name '*.mp4' -printf '%TY-%Tm-%Td %TH:%TM:%TS %p\n' | sort -r | head -n 20"
```

**Ожидаемо:** имена файлов должны быть человекочитаемыми (не `1766509360991_176650.mp4`)

### 4. Проверить что json не создаётся (в авто-режиме)

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -type f -name '*.json' | head -n 20"
```

**Ожидаемо:** JSON файлы не должны создаваться (или только если `SAVE_VIDEO_JSON=true`)

### 5. Проверить логи авто-сохранения

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs backend | grep -E 'AUTO_SAVE|TITLE_GEN|downloadAndSaveToLocal.*auto' | tail -n 50"
```

**Ожидаемо:** должны быть логи:
- `[AUTO_SAVE] generating short title from prompt`
- `[TITLE_GEN] generated for auto save`
- `downloadAndSaveToLocal [auto]: generated file name` с `effectiveTitle`

### 6. Проверить структуру папок

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -type d | head -n 30"
```

**Ожидаемо:** структура должна быть `storage/videos/users/{emailSlug__userId}/channels/{channelSlug__channelId}/inbox`

### 7. Проверить длину имён файлов

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -type f -name '*.mp4' -exec basename {} \; | awk '{print length(\$0), \$0}' | sort -rn | head -n 20"
```

**Ожидаемо:** длина имени файла (без расширения) должна быть <= 50 символов

## Настройка флага SAVE_VIDEO_JSON

Если нужно включить создание JSON файлов для отладки:

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && echo 'SAVE_VIDEO_JSON=true' >> .env.production"
```

Затем перезапустить контейнер:

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose restart backend"
```


