# Диагностика проблемы: "found users { count: 0 }"

## Проблема

В логах видно:
```
getChannelsWithAutoSendEnabled: found users { count: 0 }
```

Это означает, что Firebase Admin не может найти пользователей в Firestore.

## Возможные причины

### 1. Firebase Admin не инициализирован

**Проверка:**
- При старте backend должны быть логи:
  ```
  Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env variable
  ```
  или
  ```
  Firebase Admin initialized from individual env variables
  ```

**Если видите:**
```
Firebase Admin not initialized: no credentials provided
```

**Решение:**
1. Проверьте файл `backend/.env`
2. Убедитесь, что установлены ОДИН из вариантов:

   **Вариант 1 (рекомендуется):**
   ```env
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"prompt-6a4fd",...}
   ```

   **Вариант 2:**
   ```env
   FIREBASE_PROJECT_ID=prompt-6a4fd
   FIREBASE_CLIENT_EMAIL=your-service-account@prompt-6a4fd.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. Перезапустите backend

### 2. Backend смотрит в другую БД, чем frontend

**Проверка:**
1. Frontend использует: `VITE_FIREBASE_PROJECT_ID` (из `src/.env` или `src/.env.local`)
2. Backend использует: `FIREBASE_PROJECT_ID` (из `backend/.env`)

**Решение:**
1. Проверьте `src/.env` или `src/.env.local`:
   ```
   VITE_FIREBASE_PROJECT_ID=prompt-6a4fd
   ```

2. Проверьте `backend/.env`:
   ```
   FIREBASE_PROJECT_ID=prompt-6a4fd
   ```

3. **ОНИ ДОЛЖНЫ СОВПАДАТЬ!**

### 3. Service Account не имеет прав на чтение Firestore

**Проверка:**
1. Откройте Firebase Console: https://console.firebase.google.com/
2. Выберите проект `prompt-6a4fd`
3. Перейдите в Firestore Database → Rules
4. Убедитесь, что правила позволяют чтение (для Service Account это не требуется, но проверьте)

**Решение:**
1. Откройте Google Cloud Console: https://console.cloud.google.com/
2. Выберите проект `prompt-6a4fd`
3. Перейдите в IAM & Admin → Service Accounts
4. Найдите Service Account, который используется в `FIREBASE_CLIENT_EMAIL`
5. Убедитесь, что у него есть роль:
   - `Firebase Admin SDK Administrator Service Agent`
   - или `Cloud Datastore User`
   - или `Firebase Admin`

### 4. Коллекция "users" действительно пустая

**Проверка:**
1. Откройте Firebase Console
2. Перейдите в Firestore Database
3. Проверьте, есть ли коллекция `users`
4. Проверьте, есть ли в ней документы

**Решение:**
- Если коллекции нет или она пустая, это нормально для нового проекта
- Но тогда каналы должны быть созданы через frontend
- Проверьте, что каналы действительно создаются

## Диагностика

### Шаг 1: Проверьте логи при старте backend

После запуска `npm run dev` в `backend/` должны быть логи:

```
[INFO] Firebase Admin initialized from individual env variables
[INFO] Backend startup: Firebase Admin status {
  isFirestoreAvailable: true,
  firestoreInfo: { initialized: true, projectId: 'prompt-6a4fd' },
  env: {
    FIREBASE_PROJECT_ID: 'prompt-6a4fd',
    FIREBASE_CLIENT_EMAIL: 'set',
    FIREBASE_PRIVATE_KEY: 'set',
    FIREBASE_SERVICE_ACCOUNT: 'not set'
  }
}
```

**Если `isFirestoreAvailable: false`:**
- Firebase Admin не инициализирован
- Проверьте переменные окружения в `backend/.env`

### Шаг 2: Проверьте debug-эндпоинт

```bash
# Получите токен из браузера (F12 -> Application -> Local Storage)
# Или используйте токен из запросов в Network tab

curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/debug/auto-send-channels
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "env": {
    "NODE_ENV": "development",
    "FIREBASE_PROJECT_ID": "prompt-6a4fd"
  },
  "totalChannels": 3,
  "channelsWithAutoSendEnabled": 1,
  "channels": [...]
}
```

**Если `totalChannels: 0`:**
- Либо каналов действительно нет
- Либо backend не может их прочитать (проблема с правами)

### Шаг 3: Проверьте логи cron

В логах cron должны быть:

```
[INFO] getChannelsWithAutoSendEnabled: Firestore check {
  isFirestoreAvailable: true,
  dbExists: true,
  firestoreInfo: { initialized: true, projectId: 'prompt-6a4fd' },
  env: {
    FIREBASE_PROJECT_ID: 'prompt-6a4fd',
    FIREBASE_CLIENT_EMAIL: 'set',
    FIREBASE_PRIVATE_KEY: 'set',
    FIREBASE_SERVICE_ACCOUNT: 'not set'
  }
}
[INFO] getChannelsWithAutoSendEnabled: attempting to fetch users collection
[INFO] getChannelsWithAutoSendEnabled: found users { 
  count: 1,
  userIds: ['user123']
}
```

**Если `count: 0`:**
- Либо пользователей действительно нет
- Либо backend не может их прочитать

## Решение

### Вариант 1: Проверьте переменные окружения

1. Откройте `backend/.env`
2. Убедитесь, что установлены:
   ```env
   FIREBASE_PROJECT_ID=prompt-6a4fd
   FIREBASE_CLIENT_EMAIL=your-service-account@prompt-6a4fd.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. Перезапустите backend:
   ```bash
   cd backend
   npm run dev
   ```

### Вариант 2: Используйте Service Account JSON

1. Откройте Firebase Console
2. Project Settings → Service Accounts
3. Нажмите "Generate new private key"
4. Скопируйте весь JSON
5. В `backend/.env` установите:
   ```env
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"prompt-6a4fd",...}
   ```
   (весь JSON в одну строку, в кавычках)

6. Перезапустите backend

### Вариант 3: Проверьте права Service Account

1. Откройте Google Cloud Console
2. IAM & Admin → Service Accounts
3. Найдите Service Account
4. Убедитесь, что у него есть роль `Firebase Admin SDK Administrator Service Agent`

## Проверка после исправления

После исправления переменных окружения и перезапуска backend:

1. Проверьте логи при старте - должно быть `isFirestoreAvailable: true`
2. Проверьте логи cron - должно быть `found users { count: > 0 }`
3. Проверьте debug-эндпоинт - должен вернуть каналы

## Если проблема сохраняется

1. Проверьте, что `FIREBASE_PROJECT_ID` в backend совпадает с `VITE_FIREBASE_PROJECT_ID` в frontend
2. Проверьте, что Service Account имеет права на чтение Firestore
3. Проверьте, что коллекция `users` существует и содержит документы
4. Проверьте логи на наличие ошибок подключения к Firestore


