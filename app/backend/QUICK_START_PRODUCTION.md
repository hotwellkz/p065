# Быстрый старт: Production деплой

## Краткая схема

```
Internet → VPS (185.104.248.130:5001) → VPN → Synology (10.8.0.2:8080)
```

## Шаг 1: Настройка VPS (5 минут)

```bash
# 1. Подключитесь к VPS
ssh root@185.104.248.130

# 2. Скопируйте скрипт на VPS
# (скопируйте backend/vps/synology-port-forward.sh)

# 3. Запустите скрипт
chmod +x synology-port-forward.sh
sudo ./synology-port-forward.sh
```

## Шаг 2: Деплой на Synology (10 минут)

```bash
# 1. Подключитесь к Synology
ssh admin@hotwell.synology.me

# 2. Скопируйте скрипт на Synology
# (скопируйте backend/deploy_to_synology_production.sh)

# 3. Запустите скрипт
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```

## Шаг 3: Проверка

```bash
# Локально на Synology
curl http://127.0.0.1:8080/health

# Через VPS (публичный доступ)
curl http://185.104.248.130:5001/health
```

## Важные файлы

- **Скрипт деплоя**: `backend/deploy_to_synology_production.sh`
- **Скрипт проброса портов**: `backend/vps/synology-port-forward.sh`
- **Документация**: `backend/DEPLOY_PRODUCTION.md`
- **Пример .env**: `backend/env.production.example`

## Константы

- **Backend порт на Synology**: `8080`
- **Публичный порт на VPS**: `5001`
- **VPS IP**: `185.104.248.130`
- **Synology VPN IP**: `10.8.0.2`
- **BACKEND_URL**: `http://185.104.248.130:5001`

## Управление

```bash
# Статус
pm2 status

# Логи
pm2 logs shortsai-backend

# Перезапуск
pm2 restart shortsai-backend
```

Подробная документация: см. `DEPLOY_PRODUCTION.md`


