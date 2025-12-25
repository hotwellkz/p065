# Где находятся скачанные видео

## ✅ Исправлено

Добавлен маппинг volume в `docker-compose.yml`:
```yaml
volumes:
  - ./videos:/data/shortsai/videos
```

## Где находятся файлы

### На Synology сервере (хост):
```
/volume1/docker/shortsai/backend/videos/
```

### Структура папок:
```
videos/
  └── hotwell-kz3-at-gmail-com/          # Email пользователя (slug)
      └── surprise-unbox-planet-njzssCxM/ # Канал (название + ID)
          └── Balloon_Party_Unboxing_Surprise.mp4
```

## Что нужно сделать

### 1. Создать папку videos на хосте

```bash
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
mkdir -p videos
chmod 777 videos
```

### 2. Перезапустить контейнер

```bash
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose up -d
```

### 3. Проверить, что файлы доступны

```bash
# Найти все видео файлы
find videos -type f -name "*.mp4"

# Показать структуру
ls -R videos/

# Проверить конкретный файл
ls -lh videos/hotwell-kz3-at-gmail-com/surprise-unbox-planet-njzssCxM/
```

## Доступ через File Station (Synology DSM)

1. Откройте **File Station** в DSM
2. Перейдите в `/volume1/docker/shortsai/backend/videos/`
3. Найдите папку с email пользователя (например: `hotwell-kz3-at-gmail-com`)
4. Войдите в папку канала (например: `surprise-unbox-planet-njzssCxM`)
5. Там должны быть видео файлы

## Важно

- ✅ Маппинг добавлен: `./videos:/data/shortsai/videos`
- ⚠️ Нужно создать папку `videos` на хосте
- ⚠️ Нужно перезапустить контейнер

После перезапуска все новые видео будут сохраняться в `/volume1/docker/shortsai/backend/videos/` на сервере.



