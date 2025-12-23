# Настройка Google OAuth 2.0 для загрузки файлов в Google Drive

## Проблема

Service Accounts **не могут загружать файлы** в обычные папки Google Drive из-за ограничения квоты хранилища. Для загрузки файлов нужно использовать **OAuth токен пользователя**.

## Решение

Используйте OAuth 2.0 для получения токена пользователя и загрузки файлов от его имени.

## Шаг 1: Создание OAuth 2.0 Credentials

### Через Google Cloud Console:

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите проект `prompt-6a4fd`
3. Перейдите в **APIs & Services** → **Credentials**
4. Если появится запрос, настройте **OAuth consent screen**:
   - **User Type**: External
   - **App name**: Shorts AI Studio
   - **User support email**: ваш email
   - **Developer contact**: ваш email
   - **Scopes**: Добавьте `https://www.googleapis.com/auth/drive`
   - **Test users**: Добавьте ваш email (для тестирования)
5. Нажмите **Create Credentials** → **OAuth client ID**
6. **Application type**: Web application
7. **Name**: Shorts AI Studio Drive
8. **Authorized redirect URIs**:
   - Для разработки: `http://localhost:8080/api/auth/google/callback`
   - Для продакшена: `https://your-domain.com/api/auth/google/callback`
9. Нажмите **Create**
10. Скопируйте **Client ID** и **Client Secret**

### Через Google Cloud CLI (автоматизация):

```bash
# Установите необходимые компоненты
gcloud components install alpha

# Создайте OAuth client (требует интерактивного ввода)
gcloud alpha iap oauth-clients create \
  --display_name="Shorts AI Studio Drive" \
  --redirect_uris="http://localhost:8080/api/auth/google/callback"
```

**Примечание**: Создание OAuth credentials через CLI ограничено. Рекомендуется использовать веб-интерфейс.

## Шаг 2: Настройка переменных окружения

Добавьте в `backend/.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

Или используйте скрипт для настройки:

```bash
cd backend
node scripts/setup-google-oauth.js
```

## Шаг 3: Авторизация пользователя

1. Запустите backend сервер:
   ```bash
   cd backend
   npm run dev
   ```

2. Откройте в браузере:
   ```
   http://localhost:8080/api/auth/google
   ```

3. Авторизуйтесь через Google (используйте аккаунт, которому принадлежат папки Google Drive)

4. После авторизации вы будете перенаправлены на `/api/auth/google/callback`

5. Токены автоматически сохранятся в Firestore для вашего пользователя

## Шаг 4: Проверка

После авторизации токены сохраняются в Firestore в документе пользователя:
- `users/{userId}/googleDriveAccessToken`
- `users/{userId}/googleDriveRefreshToken`
- `users/{userId}/googleDriveTokenExpiry`

При загрузке файлов система автоматически:
1. Проверяет наличие OAuth токена
2. Обновляет токен, если он истёк (используя refresh token)
3. Использует токен для загрузки файлов

## API Endpoints

### GET /api/auth/google
Перенаправляет на страницу авторизации Google

### GET /api/auth/google/callback
Обрабатывает callback от Google и сохраняет токены

**Требует авторизации**: Да (через `authRequired` middleware)

### POST /api/auth/google/refresh
Обновляет access token используя refresh token

**Body**:
```json
{
  "refresh_token": "your-refresh-token"
}
```

## Как это работает

1. **Пользователь авторизуется** через `/api/auth/google`
2. **Google перенаправляет** на `/api/auth/google/callback` с authorization code
3. **Backend обменивает** code на access token и refresh token
4. **Токены сохраняются** в Firestore для пользователя
5. **При загрузке файлов** система:
   - Проверяет наличие OAuth токена
   - Обновляет токен, если истёк
   - Использует токен для загрузки файлов в Google Drive

## Обновление токенов

Access token истекает через 1 час. Система автоматически обновляет его используя refresh token при необходимости.

## Безопасность

- Токены хранятся в Firestore в документе пользователя
- Доступ к токенам имеет только сам пользователь
- Refresh token используется только для обновления access token
- Токены не передаются на frontend

## Troubleshooting

### Ошибка: "GOOGLE_OAUTH_NOT_CONFIGURED"
- Проверьте, что `GOOGLE_OAUTH_CLIENT_ID` и `GOOGLE_OAUTH_CLIENT_SECRET` установлены в `.env`

### Ошибка: "redirect_uri_mismatch"
- Убедитесь, что redirect URI в OAuth credentials совпадает с `GOOGLE_OAUTH_REDIRECT_URI` в `.env`

### Ошибка: "GOOGLE_DRIVE_OAUTH_INVALID"
- Токен истёк или недействителен
- Авторизуйтесь снова через `/api/auth/google`

### Токены не сохраняются
- Проверьте, что Firebase Admin настроен правильно
- Проверьте права доступа к Firestore


