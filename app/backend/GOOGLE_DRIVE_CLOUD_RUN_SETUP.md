# 🔧 Настройка Google Drive для Cloud Run

## Проблема

Ошибка при загрузке файлов в Google Drive:
```
GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED: Google Drive credentials are not configured. 
Please set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY in backend/.env
```

## Решение

Нужно добавить переменные окружения в Cloud Run.

### Требуемые переменные

1. **GOOGLE_DRIVE_CLIENT_EMAIL** - Email сервисного аккаунта
2. **GOOGLE_DRIVE_PRIVATE_KEY** - Приватный ключ сервисного аккаунта (многострочный)
3. **GOOGLE_DRIVE_DEFAULT_PARENT** - ID папки по умолчанию (опционально)

## Способ 1: Через Cloud Console (рекомендуется)

1. Откройте [Cloud Console](https://console.cloud.google.com/run/detail/us-central1/shorts-backend)
2. Нажмите **Edit & Deploy New Revision**
3. В разделе **Variables & Secrets** → **Variables**:
   - Нажмите **Add Variable**
   - **Key**: `GOOGLE_DRIVE_CLIENT_EMAIL`
   - **Value**: `drive-access@videobot-478618.iam.gserviceaccount.com`
   - Нажмите **Add Variable** снова
   - **Key**: `GOOGLE_DRIVE_DEFAULT_PARENT`
   - **Value**: `1IYDSfMaPIjj-yqAhRMYM63j9Z0o3AcNo`
4. В разделе **Variables & Secrets** → **Secrets**:
   - Нажмите **Reference a secret**
   - **Name**: `GOOGLE_DRIVE_PRIVATE_KEY`
   - **Secret**: Создайте новый секрет или используйте существующий
   - **Version**: `latest`
5. Нажмите **Deploy**

## Способ 2: Через Secret Manager + gcloud CLI

### Шаг 1: Создайте секрет для приватного ключа

```bash
# Прочитайте приватный ключ из .env (уберите кавычки и \n)
# Затем создайте секрет:
echo -n "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDOZQQR7NPTJOWL
...
-----END PRIVATE KEY-----" | gcloud secrets create google-drive-private-key --data-file=-
```

### Шаг 2: Добавьте переменные в Cloud Run

```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --update-env-vars \
    GOOGLE_DRIVE_CLIENT_EMAIL=drive-access@videobot-478618.iam.gserviceaccount.com,\
    GOOGLE_DRIVE_DEFAULT_PARENT=1IYDSfMaPIjj-yqAhRMYM63j9Z0o3AcNo \
  --update-secrets \
    GOOGLE_DRIVE_PRIVATE_KEY=google-drive-private-key:latest
```

## Способ 3: Через файл конфигурации

Создайте файл `google-drive-env.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: google-drive-config
data:
  GOOGLE_DRIVE_CLIENT_EMAIL: "drive-access@videobot-478618.iam.gserviceaccount.com"
  GOOGLE_DRIVE_DEFAULT_PARENT: "1IYDSfMaPIjj-yqAhRMYM63j9Z0o3AcNo"
```

Затем используйте Secret Manager для приватного ключа.

## Проверка

После добавления переменных:

1. Проверьте логи Cloud Run:
```bash
gcloud run services logs read shorts-backend --region us-central1 --limit 50
```

2. Попробуйте загрузить файл через фронтенд

3. Ошибка `GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED` должна исчезнуть

## Важные замечания

1. **Формат приватного ключа**: В Cloud Run переменных окружения приватный ключ должен быть в одной строке с `\n` для переносов:
   ```
   "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDOZQQR7NPTJOWL\n...\n-----END PRIVATE KEY-----\n"
   ```

2. **Права доступа**: Убедитесь, что сервисный аккаунт имеет доступ к папке Google Drive:
   - Откройте папку в Google Drive
   - Нажмите "Поделиться"
   - Добавьте email сервисного аккаунта (`drive-access@videobot-478618.iam.gserviceaccount.com`)
   - Дайте права "Редактор"

3. **API включен**: Убедитесь, что Google Drive API включен в проекте:
   ```bash
   gcloud services enable drive.googleapis.com
   ```

## Устранение проблем

### Ошибка: "Service account email not found or invalid"

- Проверьте, что `GOOGLE_DRIVE_CLIENT_EMAIL` правильный
- Убедитесь, что сервисный аккаунт существует в проекте

### Ошибка: "GOOGLE_DRIVE_EMAIL and GOOGLE_DRIVE_CLIENT_ID mismatch"

- Эта ошибка не должна появляться при использовании Service Account
- Если появляется, проверьте, что не используются OAuth credentials вместо Service Account

### Ошибка: "Could not authorize Google Drive client"

- Проверьте формат приватного ключа (должны быть `\n` для переносов строк)
- Убедитесь, что ключ не повреждён
- Проверьте, что Google Drive API включен



