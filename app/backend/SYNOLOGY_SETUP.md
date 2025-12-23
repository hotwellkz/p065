# Настройка Synology перед деплоем

## Проблемы, которые нужно решить:

1. ❌ Git не установлен
2. ❌ Директория `/volume1/shortsai` не существует
3. ⚠️ Node.js может быть не установлен

## Шаг 1: Установка Git через Package Center

**На Synology (через веб-интерфейс):**

1. Откройте **Package Center**
2. Найдите **"Git Server"** или **"Git"**
3. Установите пакет
4. Или установите через **Community Packages** → **SynoCommunity** → **git**

**Или через SSH (если есть доступ к ipkg/opkg):**

```bash
# Проверьте, какой пакетный менеджер доступен
which ipkg
which opkg

# Если доступен ipkg (старые версии DSM):
sudo ipkg update
sudo ipkg install git

# Если доступен opkg (новые версии):
sudo opkg update
sudo opkg install git
```

## Шаг 2: Создание директорий

**На Synology через SSH:**

```bash
# Создайте директории
sudo mkdir -p /volume1/shortsai/app
sudo mkdir -p /volume1/shortsai/videos
sudo mkdir -p /volume1/shortsai/logs

# Установите права
sudo chown -R admin:users /volume1/shortsai
sudo chmod -R 755 /volume1/shortsai
```

## Шаг 3: Установка Node.js (если не установлен)

**Через Package Center:**
1. Откройте **Package Center**
2. Найдите **"Node.js v18"** или **"Node.js v20"**
3. Установите

**Проверка:**
```bash
node -v
npm -v
```

## Шаг 4: Деплой

После установки Git и создания директорий:

```bash
cd /volume1/shortsai
git clone https://github.com/hotwellkz/p041.git app
cd app/backend
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```

## Альтернатива: Копирование файлов вручную

Если Git установить не получается, можно скопировать файлы вручную:

**С вашего компьютера:**

```powershell
# Создайте архив проекта
cd C:\Users\studo\Downloads\p039-master\p039-master
tar -czf shortsai-backend.tar.gz backend/ --exclude=node_modules --exclude=.git --exclude=dist

# Скопируйте на Synology
scp shortsai-backend.tar.gz admin@192.168.100.222:/volume1/shortsai/
```

**На Synology:**

```bash
cd /volume1/shortsai
tar -xzf shortsai-backend.tar.gz
cd backend
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```


