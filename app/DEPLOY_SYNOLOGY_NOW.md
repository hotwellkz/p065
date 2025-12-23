# 🚀 Деплой на Synology - Следующий шаг

## ✅ Что уже сделано:

- ✅ VPS настроен (проброс портов работает)
- ✅ Порт 5001 → 10.8.0.2:8080 проброшен

## 📋 Следующий шаг: Деплой на Synology

У вас есть 3 варианта:

---

## Вариант 1: Через Git Bash (рекомендуется)

**1. Откройте Git Bash отдельно** (не через PowerShell):
   - Найдите "Git Bash" в меню Пуск
   - Или щёлкните правой кнопкой в папке проекта → "Git Bash Here"

**2. В Git Bash выполните:**

```bash
cd /c/Users/studo/Downloads/p039-master/p039-master/backend

export SYNO_HOST="hotwell.synology.me"
export SYNO_USER="admin"

chmod +x deploy_synology_auto.sh
./deploy_synology_auto.sh
```

**3. Введите пароль от Synology, когда попросит.**

---

## Вариант 2: Прямо на Synology (проще всего)

**1. Подключитесь к Synology:**

```powershell
ssh admin@hotwell.synology.me
```

**2. На Synology выполните:**

```bash
cd /volume1/shortsai
git clone https://github.com/hotwellkz/p041.git app
cd app/backend
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```

**Этот вариант проще, так как не требует bash на Windows!**

---

## Вариант 3: Через WSL (если установлен)

**В PowerShell:**

```powershell
wsl
cd /mnt/c/Users/studo/Downloads/p039-master/p039-master/backend
export SYNO_HOST="hotwell.synology.me"
export SYNO_USER="admin"
chmod +x deploy_synology_auto.sh
./deploy_synology_auto.sh
```

---

## 🎯 Рекомендация: Используйте Вариант 2

**Это самый простой способ - подключитесь к Synology и запустите скрипт там:**

```powershell
# В PowerShell на вашем компьютере
ssh admin@hotwell.synology.me

# На Synology (после подключения):
cd /volume1/shortsai
git clone https://github.com/hotwellkz/p041.git app
cd app/backend
chmod +x deploy_to_synology_production.sh
sudo ./deploy_to_synology_production.sh
```

Скрипт автоматически:
- ✅ Установит зависимости
- ✅ Скомпилирует TypeScript
- ✅ Настроит .env с правильным BACKEND_URL
- ✅ Запустит через pm2
- ✅ Настроит автозапуск

---

## После деплоя - проверка:

**На Synology:**

```bash
curl http://127.0.0.1:8080/health
pm2 status
```

**С вашего компьютера (через VPS):**

```powershell
curl http://185.104.248.130:5001/health
```

**Должен вернуть:** `{"ok":true}`


