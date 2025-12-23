# Инструкция по пересборке контейнера на Synology

## Файлы уже загружены ✅
- `/volume1/docker/shortsai/backend/src/utils/telegramDownload.ts` (36K, обновлен 05:52)
- `/volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts` (70K, обновлен 05:53)

## Вариант 1: Через веб-интерфейс Synology Container Manager (РЕКОМЕНДУЕТСЯ)

1. Откройте **Synology DSM** → **Container Manager**
2. Найдите контейнер с проектом `shortsai` или `backend`
3. Остановите контейнер (Stop)
4. Перейдите в **Image** → найдите образ `backend`
5. Удалите старый образ (Remove)
6. Откройте терминал в Container Manager или через SSH выполните:
   ```bash
   cd /volume1/docker/shortsai/backend
   sudo /usr/local/bin/docker compose build --no-cache
   sudo /usr/local/bin/docker compose up -d
   ```

## Вариант 2: Через SSH с паролем sudo

Выполните команды по очереди (потребуется ввод пароля для sudo):

```bash
ssh adminv@192.168.100.222

# Затем выполните:
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
sudo /usr/local/bin/docker compose logs --tail=50
```

## Вариант 3: Добавить пользователя в группу docker (для будущего)

```bash
ssh adminv@192.168.100.222
sudo usermod -aG docker adminv
# Затем перелогиниться или выполнить:
newgrp docker
```

После этого можно будет выполнять docker команды без sudo.

## Проверка после пересборки

```bash
# Проверить статус
sudo /usr/local/bin/docker compose ps

# Проверить логи
sudo /usr/local/bin/docker compose logs --tail=100

# Проверить, что новые изменения загружены
sudo /usr/local/bin/docker compose exec backend cat /app/src/utils/telegramDownload.ts | head -20
```

## Что изменилось

1. **Детальное логирование Telegram updates** - теперь логируется ВСЁ, что приходит из Telegram
2. **Новый эндпоинт** `/api/telegram/importVideo` - для прямого импорта mp4 по URL
3. **Критический вывод** - автоматически определяется, есть ли URL в Telegram update или нет

## После пересборки

1. Проверьте логи при следующем запросе на скачивание видео
2. Ищите в логах: `[TELEGRAM_UPDATE_ANALYSIS] КРИТИЧЕСКИЙ ВЫВОД`
3. Это покажет, есть ли URL в Telegram update или нет


