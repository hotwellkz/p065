# 🚀 Деплой на Production (Synology + VPS)

## Быстрый старт - ОДНА КОМАНДА

### С вашего компьютера:

```bash
cd backend
chmod +x deploy_synology_auto.sh
./deploy_synology_auto.sh
```

Скрипт автоматически:
- ✅ Подключится к Synology по SSH
- ✅ Выполнит весь деплой
- ✅ Настроит всё необходимое

### На Synology напрямую:

```bash
cd /volume1/shortsai
git clone https://github.com/hotwellkz/p041.git app
cd app/backend
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```

## Архитектура

```
Internet → VPS (185.104.248.130:5001) → VPN → Synology (10.8.0.2:8080)
```

## Что нужно сделать ПЕРЕД деплоем:

### 1. Настройка VPS (один раз)

```bash
ssh root@185.104.248.130
# Скопируйте backend/vps/synology-port-forward.sh
chmod +x synology-port-forward.sh
sudo ./synology-port-forward.sh
```

### 2. Проверка на Synology:

- ✅ Node.js v18+ установлен (Package Center)
- ✅ Git установлен (Package Center)  
- ✅ SSH включён (Control Panel → Terminal & SNMP)
- ✅ VPN туннель работает

## После деплоя:

```bash
# Проверка локально
curl http://127.0.0.1:8080/health

# Проверка через VPS
curl http://185.104.248.130:5001/health
```

## Документация:

- **Быстрый старт**: `QUICK_START_PRODUCTION.md`
- **Подробная инструкция**: `DEPLOY_PRODUCTION.md`
- **Корневая инструкция**: `../DEPLOY_NOW.md`


