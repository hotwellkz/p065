# Проверка исправлений авто-сохранения

## Что было исправлено

1. **`titleGenerator.ts`**: Исправлена ошибка с регулярным выражением для кириллицы
2. **`blottataLocalMonitor.ts`**: Обновлён для использования нового `StorageService` вместо старого `userChannelStorage.ts`
3. **`blottataLocalFileProcessor.ts`**: Обновлён для работы с новыми путями через `StorageService`
4. **`videoDownloadService.ts`**: Добавлен маркер `AUTO_SAVE_PIPELINE_MARKER v2` для проверки деплоя

## Команды для проверки деплоя

### 1. Пересборка и перезапуск контейнера

```powershell
# Подключение к Synology
ssh adminv@192.168.100.222

# Переход в директорию проекта
cd /volume1/docker/shortsai/backend

# Пересборка контейнера
sudo /usr/local/bin/docker compose build backend

# Перезапуск контейнера
sudo /usr/local/bin/docker compose restart backend

# Просмотр логов
sudo /usr/local/bin/docker compose logs -f backend | Select-String "AUTO_SAVE_PIPELINE_MARKER"
```

### 2. Проверка маркера в логах (должен появиться при авто-сохранении)

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose logs backend | grep 'AUTO_SAVE_PIPELINE_MARKER v2' | tail -n 20"
```

**Ожидаемо**: Должны появиться логи с маркером `AUTO_SAVE_PIPELINE_MARKER v2` при каждом авто-сохранении.

### 3. Проверка отсутствия лишних папок (без /users)

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && ls -la storage/videos"
```

**Ожидаемо**: Должна быть только папка `users` (и возможно `tmp`, если используется). НЕ должно быть папок типа `hotwell-kz-at-gmail-com` на одном уровне с `users`.

### 4. Проверка отсутствия JSON файлов (если SAVE_VIDEO_JSON=false)

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -name '*.json' -type f | head -n 20"
```

**Ожидаемо**: Пусто (или только системные файлы, но не рядом с mp4).

### 5. Проверка имён файлов (должны быть slug, а не цифры)

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -name '*.mp4' -type f -printf '%TY-%Tm-%Td %TH:%TM:%TS %p\n' | sort -r | head -n 10"
```

**Ожидаемо**: Имена файлов должны быть человекочитаемыми (slug), например:
- `Babushka_pytaetsya_samim_postroit_novyy_dom_iz_SIP_paneley.mp4`
- НЕ `1766511463094_176651.mp4`

### 6. Проверка структуры папок (правильный путь с /users)

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos/users -type d -name 'inbox' | head -n 5"
```

**Ожидаемо**: Пути должны быть вида:
```
storage/videos/users/hotwell-kz-at-gmail-com__wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/postroimdom-kz__zyt00D2jzJQCp2olEpeK/inbox
```

### 7. Проверка логов генерации названий

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose logs backend | grep -E 'TITLE_GEN|AUTO_SAVE.*generating|makeSafeBaseName' | tail -n 30"
```

**Ожидаемо**: Должны быть логи успешной генерации названий через OpenAI или fallback, но НЕ ошибки с регулярными выражениями.

## Критерии успешного исправления

✅ **Маркер появляется в логах**: `AUTO_SAVE_PIPELINE_MARKER v2` виден при авто-сохранении  
✅ **Нет лишних папок**: В `storage/videos/` нет папок типа `<email-slug>` без `/users`  
✅ **Нет JSON файлов**: Рядом с mp4 нет `.json` файлов (если `SAVE_VIDEO_JSON=false`)  
✅ **Человекочитаемые имена**: Файлы называются slug, а не timestamp  
✅ **Правильная структура**: Все файлы в `storage/videos/users/{userFolderKey}/channels/{channelFolderKey}/inbox/`

## Если что-то не работает

1. **Маркер не появляется**: Проверьте, что контейнер пересобран и перезапущен
2. **Всё ещё создаются лишние папки**: Проверьте, что `blottataLocalMonitor.ts` использует новый `StorageService`
3. **Имена всё ещё цифры**: Проверьте логи `TITLE_GEN` - возможно, OpenAI недоступен или есть ошибка в `makeSafeBaseName`
4. **JSON всё ещё создаётся**: Проверьте, что `SAVE_VIDEO_JSON` не установлен в `true` в `.env` или `docker-compose.yml`

## Дополнительные команды для диагностики

### Проверка переменных окружения в контейнере

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose exec backend env | grep -E 'SAVE_VIDEO_JSON|STORAGE_ROOT|OPENAI_API_KEY'"
```

### Проверка структуры файлов в контейнере

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose exec backend ls -la /app/src/services/ | grep -E 'blottataLocalMonitor|titleGenerator|videoDownloadService'"
```

### Просмотр последних логов авто-сохранения

```powershell
ssh adminv@192.168.100.222 "sudo /usr/local/bin/docker compose logs backend --tail 500 | grep -E 'downloadAndSaveToLocal|AUTO_SAVE|TITLE_GEN' | tail -n 50"
```


