# 🚀 Деплой Backend на Google Cloud Run

## Предварительные требования

1. **Установите Google Cloud SDK (gcloud CLI)**
   ```bash
   # Windows (через Chocolatey)
   choco install gcloudsdk
   
   # macOS
   brew install google-cloud-sdk
   
   # Linux
   curl https://sdk.cloud.google.com | bash
   ```

2. **Авторизуйтесь в Google Cloud**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

3. **Установите проект**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

## Быстрый деплой

### Вариант 1: Использование скрипта (рекомендуется)

```bash
cd backend
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh [SERVICE_NAME] [REGION] [PROJECT_ID]
```

**Примеры:**
```bash
# С параметрами по умолчанию (shorts-backend, us-central1)
./deploy-cloud-run.sh

# С указанием имени сервиса
./deploy-cloud-run.sh my-backend

# С указанием региона
./deploy-cloud-run.sh my-backend europe-west1

# С указанием проекта
./deploy-cloud-run.sh my-backend us-central1 my-project-id
```

### Вариант 2: Ручной деплой через gcloud CLI

#### 1. Включите необходимые API

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

#### 2. Соберите Docker образ

```bash
cd backend
IMAGE_NAME="gcr.io/$(gcloud config get-value project)/shorts-backend"
gcloud builds submit --tag $IMAGE_NAME
```

#### 3. Задеплойте на Cloud Run

```bash
gcloud run deploy shorts-backend \
  --image $IMAGE_NAME \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10
```

## Настройка переменных окружения

### Через Cloud Console (рекомендуется для секретов)

1. Откройте [Cloud Console](https://console.cloud.google.com/run)
2. Выберите ваш сервис
3. Перейдите в **Edit & Deploy New Revision**
4. В разделе **Variables & Secrets** добавьте переменные:

**Обязательные переменные:**
- `FIREBASE_SERVICE_ACCOUNT` - JSON Service Account для Firebase (в одну строку)
- `TELEGRAM_API_ID` - ID Telegram API
- `TELEGRAM_API_HASH` - Hash Telegram API
- `TELEGRAM_SESSION_SECRET` - Секрет для шифрования сессий (64 символа hex)
- `TELEGRAM_SESSION_ENCRYPTED` - Зашифрованная Telegram сессия (см. [TELEGRAM_CLOUD_RUN_SETUP.md](./TELEGRAM_CLOUD_RUN_SETUP.md))
- `SYNX_CHAT_ID` - ID чата SyntX (например, `@syntxaibot`)
- `JWT_SECRET` - Секрет для JWT токенов
- `CRON_SECRET` - Секрет для cron jobs
- `FRONTEND_ORIGIN` - URL фронтенда (например, https://your-site.netlify.app)

**Опциональные:**
- `GOOGLE_DRIVE_CLIENT_EMAIL` - Email Service Account для Google Drive
- `GOOGLE_DRIVE_PRIVATE_KEY` - Приватный ключ для Google Drive
- `GOOGLE_DRIVE_DEFAULT_PARENT` - ID папки по умолчанию
- `PORT` - Порт (по умолчанию 8080)
- `ENABLE_CRON_SCHEDULER` - Включить cron планировщик (`false` для Cloud Run)

### ⚠️ Важно: Настройка Telegram сессии

**Перед деплоем необходимо настроить Telegram авторизацию:**

1. **Локально выполните логин:**
   ```bash
   cd backend
   npm run dev:login
   ```

2. **Экспортируйте сессию:**
   ```bash
   npm run export:telegram-session
   ```

3. **Добавьте значение `TELEGRAM_SESSION_ENCRYPTED` в Cloud Run**

Подробная инструкция: [TELEGRAM_CLOUD_RUN_SETUP.md](./TELEGRAM_CLOUD_RUN_SETUP.md)

### Через gcloud CLI

```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --update-env-vars \
    FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}',\
    TELEGRAM_API_ID=12345678,\
    TELEGRAM_API_HASH=your-hash,\
    FRONTEND_ORIGIN=https://your-site.netlify.app
```

### Использование Secret Manager (для секретов)

1. **Создайте секреты:**
```bash
echo -n "your-secret-value" | gcloud secrets create telegram-api-hash --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
```

2. **Добавьте секреты в Cloud Run:**
```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --update-secrets \
    TELEGRAM_API_HASH=telegram-api-hash:latest,\
    JWT_SECRET=jwt-secret:latest
```

## Проверка деплоя

### Проверка здоровья сервиса

```bash
SERVICE_URL=$(gcloud run services describe shorts-backend \
  --region us-central1 \
  --format 'value(status.url)')

curl $SERVICE_URL/health
```

Ожидаемый ответ:
```json
{"ok": true}
```

### Просмотр логов

```bash
gcloud run services logs read shorts-backend --region us-central1
```

### Просмотр информации о сервисе

```bash
gcloud run services describe shorts-backend --region us-central1
```

## Обновление сервиса

### После изменений в коде

```bash
cd backend
./deploy-cloud-run.sh
```

Или вручную:
```bash
IMAGE_NAME="gcr.io/$(gcloud config get-value project)/shorts-backend"
gcloud builds submit --tag $IMAGE_NAME
gcloud run deploy shorts-backend --image $IMAGE_NAME --region us-central1
```

### Обновление переменных окружения

```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --update-env-vars KEY=NEW_VALUE
```

## Настройка CORS

Убедитесь, что `FRONTEND_ORIGIN` установлен правильно:

```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --update-env-vars FRONTEND_ORIGIN=https://your-site.netlify.app
```

## Устранение проблем

### Ошибка: "Permission denied"

```bash
# Убедитесь, что у вас есть права на Cloud Run
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/run.admin"
```

### Ошибка: "Service account not found"

Убедитесь, что Firebase Service Account JSON правильно установлен в переменной `FIREBASE_SERVICE_ACCOUNT`.

### Проверка переменных окружения

```bash
gcloud run services describe shorts-backend \
  --region us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

## Стоимость

Cloud Run использует pay-per-use модель:
- **Бесплатный уровень:** 2 миллиона запросов в месяц, 360,000 ГБ-секунд памяти
- **После бесплатного уровня:** ~$0.40 за миллион запросов, ~$0.0000025 за ГБ-секунду

## Дополнительные ресурсы

- [Документация Cloud Run](https://cloud.google.com/run/docs)
- [Лучшие практики Cloud Run](https://cloud.google.com/run/docs/tips)
- [Настройка переменных окружения](https://cloud.google.com/run/docs/configuring/environment-variables)

