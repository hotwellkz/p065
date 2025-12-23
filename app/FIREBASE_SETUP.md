# 🔥 Инструкция по настройке Firebase

## ⚠️ Важно

Вы предоставили **Service Account credentials** (для серверной части), но для клиентского приложения нужны **Web App credentials**.

## 📋 Шаги для получения Web App credentials:

### 1. Откройте Firebase Console
Перейдите на https://console.firebase.google.com/ и выберите проект **prompt-6a4fd**

### 2. Создайте Web App (если ещё нет)
- Нажмите на иконку **Web (</>)** или **Add app** > **Web**
- Зарегистрируйте приложение (можно любое название, например "Shorts AI Studio")
- **НЕ** включайте Firebase Hosting (не обязательно)

### 3. Скопируйте конфигурацию
После создания Web app вы увидите блок с конфигурацией:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "prompt-6a4fd.firebaseapp.com",
  projectId: "prompt-6a4fd",
  storageBucket: "prompt-6a4fd.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 4. Заполните .env файл

Скопируйте значения из конфигурации в файл `.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSyCtAg7fTGY7EsyEQf1WXl0ei7HUO5ls0sQ
VITE_FIREBASE_AUTH_DOMAIN=prompt-6a4fd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prompt-6a4fd
VITE_FIREBASE_STORAGE_BUCKET=prompt-6a4fd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=905027425668
VITE_FIREBASE_APP_ID=1:905027425668:web:38f58912370df2c2be39d1
```

**Примечание:** `storageBucket` может быть в формате `.appspot.com` или `.firebasestorage.app` - оба варианта правильные.

### 5. Включите Authentication

1. В Firebase Console перейдите в **Authentication**
2. Нажмите **Get started**
3. Включите **Email/Password** провайдер
4. Сохраните

### 6. Создайте Firestore Database

1. Перейдите в **Firestore Database**
2. Нажмите **Create database**
3. Выберите режим: **Start in test mode** (для разработки)
4. Выберите регион (ближайший к вам)
5. Нажмите **Enable**

### 7. Настройте Security Rules

В Firestore Database > **Rules** добавьте:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/channels/{channelId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Нажмите **Publish**

## ✅ Готово!

После выполнения этих шагов ваше приложение будет готово к работе.

## 🔒 Безопасность

- **НЕ** коммитьте файл `.env` в Git
- Service Account credentials (которые вы предоставили) используйте только на сервере
- Web App credentials безопасны для клиентского приложения (они публичные)

