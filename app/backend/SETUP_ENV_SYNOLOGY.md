# 🔧 Настройка .env файла на Synology

## ❌ Текущие ошибки

Из логов видно две критические ошибки:

1. **`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON`** - невалидный JSON
2. **`TELEGRAM_SESSION_SECRET must be 32 bytes hex (64 hex chars)`** - отсутствует или неправильный формат

## ✅ Решение

### 1. Откройте .env файл для редактирования

```bash
cd /volume1/shortsai/app/backend
nano .env
# или
vi .env
```

### 2. Исправьте FIREBASE_SERVICE_ACCOUNT

**Вариант A: Полный JSON (рекомендуется)**

Найдите строку с `FIREBASE_SERVICE_ACCOUNT` и замените на валидный JSON:

```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"prompt-6a4fd","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

**Важно:** 
- JSON должен быть в **одной строке**
- Используйте **одинарные кавычки** снаружи, чтобы защитить двойные кавычки внутри JSON
- Или экранируйте кавычки: `FIREBASE_SERVICE_ACCOUNT="{\"type\":\"service_account\",...}"`

**Вариант B: Отдельные переменные**

Если JSON не работает, используйте отдельные переменные:

```bash
FIREBASE_PROJECT_ID=prompt-6a4fd
FIREBASE_CLIENT_EMAIL=your-service-account@prompt-6a4fd.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Где получить:**
1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект `prompt-6a4fd`
3. Project Settings → Service Accounts
4. Нажмите "Generate new private key"
5. Скачайте JSON и скопируйте значения

### 3. Сгенерируйте и установите TELEGRAM_SESSION_SECRET

```bash
# На Synology выполните:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Скопируйте вывод (64 символа) и добавьте в `.env`:

```bash
TELEGRAM_SESSION_SECRET=ваш-64-символьный-hex-ключ-здесь
```

### 4. Настройте Telegram переменные

```bash
TELEGRAM_API_ID=ваш-api-id
TELEGRAM_API_HASH=ваш-api-hash
SYNX_CHAT_ID=ваш-syntx-chat-id
```

**Где получить:**
- [my.telegram.org/apps](https://my.telegram.org/apps) - для API_ID и API_HASH
- SYNX_CHAT_ID - ID чата с ботом SyntX (например, @SyntaxAI)

### 5. Настройте FRONTEND_ORIGIN

```bash
FRONTEND_ORIGIN=https://your-site.netlify.app
```

Замените на ваш реальный домен Netlify.

### 6. Удалите дубликаты

В `.env` файле есть дубликаты `PORT`, `STORAGE_ROOT`, `BACKEND_URL`. Оставьте только последние значения:

```bash
# Должно быть только одно значение каждой переменной:
NODE_ENV=production
PORT=8080
STORAGE_ROOT=/volume1/shortsai/videos
BACKEND_URL=http://185.104.248.130:5001
```

### 7. Сохраните и перезапустите

```bash
# Сохраните .env файл (в nano: Ctrl+O, Enter, Ctrl+X)
# Перезапустите бэкенд
sudo /usr/local/bin/pm2 restart shortsai-backend

# Проверьте логи
sudo /usr/local/bin/pm2 logs shortsai-backend --lines 20

# Проверьте работоспособность
curl http://127.0.0.1:8080/health
```

## 📋 Минимальный набор переменных для работы

```bash
# Обязательные для запуска
NODE_ENV=production
PORT=8080
STORAGE_ROOT=/volume1/shortsai/videos
BACKEND_URL=http://185.104.248.130:5001

# Firebase (обязательно)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
# ИЛИ
FIREBASE_PROJECT_ID=prompt-6a4fd
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="..."

# Telegram (обязательно для работы с SyntX)
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_SESSION_SECRET=64-символьный-hex-ключ
SYNX_CHAT_ID=...

# Frontend (для CORS)
FRONTEND_ORIGIN=https://your-site.netlify.app
```

## 🔍 Проверка после настройки

```bash
# Проверьте, что бэкенд запустился без ошибок
sudo /usr/local/bin/pm2 logs shortsai-backend --err --lines 10

# Проверьте health endpoint
curl http://127.0.0.1:8080/health

# Проверьте доступность извне
curl http://185.104.248.130:5001/health
```

