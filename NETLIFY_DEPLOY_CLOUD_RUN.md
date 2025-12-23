# 🚀 Деплой фронтенда на Netlify с Cloud Run Backend

## ✅ Backend готов

Backend задеплоен на Cloud Run:
- **URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app
- **Health Check**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app/health
- **Статус**: ✅ Работает

## 📋 Переменные окружения для Netlify

### 1. Backend URL (ОБЯЗАТЕЛЬНО)

```
VITE_BACKEND_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
VITE_API_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
```

**Важно:** Оба URL должны указывать на Cloud Run backend.

### 2. Firebase Configuration (ОБЯЗАТЕЛЬНО)

Эти переменные нужны для работы с Firebase Authentication и Firestore:

```
VITE_FIREBASE_API_KEY=AIzaSyCtAg7fTGY7EsyEQf1WXl0ei7HUO5ls0sQ
VITE_FIREBASE_AUTH_DOMAIN=prompt-6a4fd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prompt-6a4fd
VITE_FIREBASE_STORAGE_BUCKET=prompt-6a4fd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=905027425668
VITE_FIREBASE_APP_ID=1:905027425668:web:38f58912370df2c2be39d1
```

**Где получить (если нужно обновить):**
1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект `prompt-6a4fd`
3. Перейдите в **Project Settings** → **Your apps** → **Web app**
4. Скопируйте значения из раздела **SDK setup and configuration**

### 3. OpenAI Model (ОПЦИОНАЛЬНО)

Модель OpenAI для генерации сценариев:

```
VITE_OPENAI_MODEL=gpt-4o-mini
```

## 📝 Инструкция по добавлению в Netlify

### Шаг 1: Подключите репозиторий GitHub

1. Откройте [Netlify Dashboard](https://app.netlify.com/)
2. Нажмите **Add new site** → **Import an existing project**
3. Выберите **GitHub** и авторизуйтесь
4. Найдите репозиторий `hotwellkz/p042`
5. Нажмите **Import**

### Шаг 2: Настройте Build Settings

Netlify автоматически определит настройки из `netlify.toml`, но проверьте:

- **Base directory**: (оставьте пустым или укажите корень проекта)
- **Build command**: `npm run build` (или `npm ci && npm run build`)
- **Publish directory**: `dist` (или как указано в `netlify.toml`)

### Шаг 3: Добавьте переменные окружения

1. В настройках сайта перейдите в **Site settings** → **Environment variables**
2. Нажмите **Add a variable**
3. Добавьте все переменные из раздела выше:

**Обязательные:**
```
VITE_BACKEND_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
VITE_API_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
VITE_FIREBASE_API_KEY=AIzaSyCtAg7fTGY7EsyEQf1WXl0ei7HUO5ls0sQ
VITE_FIREBASE_AUTH_DOMAIN=prompt-6a4fd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prompt-6a4fd
VITE_FIREBASE_STORAGE_BUCKET=prompt-6a4fd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=905027425668
VITE_FIREBASE_APP_ID=1:905027425668:web:38f58912370df2c2be39d1
```

**Опциональные:**
```
VITE_OPENAI_MODEL=gpt-4o-mini
```

### Шаг 4: Настройте CORS на Backend

CORS уже настроен для работы с Netlify доменами (`*.netlify.app`), но если нужно добавить конкретный домен:

```bash
# Получите ваш Netlify домен после деплоя (например: https://your-site.netlify.app)
# Затем обновите FRONTEND_ORIGIN на Cloud Run:

gcloud run services update shortsai-backend \
  --region us-central1 \
  --project prompt-6a4fd \
  --update-env-vars "FRONTEND_ORIGIN=https://your-site.netlify.app"
```

### Шаг 5: Деплой

1. Нажмите **Deploy site** в Netlify
2. Дождитесь завершения сборки
3. После деплоя получите URL вашего сайта (например: `https://your-site.netlify.app`)

### Шаг 6: Обновите CORS (если нужно)

После получения Netlify URL обновите CORS на backend:

```bash
NETLIFY_URL="https://your-site.netlify.app"

gcloud run services update shortsai-backend \
  --region us-central1 \
  --project prompt-6a4fd \
  --update-env-vars "FRONTEND_ORIGIN=$NETLIFY_URL"
```

## 🔍 Проверка работы

После деплоя проверьте:

1. **Откройте сайт** в браузере
2. **Проверьте консоль браузера** (F12) - не должно быть ошибок подключения к backend
3. **Попробуйте авторизоваться** через Firebase
4. **Проверьте API запросы** в Network tab - они должны идти на Cloud Run URL

## 🐛 Troubleshooting

### Ошибка: ERR_CONNECTION_REFUSED

**Причина:** Переменные окружения не установлены или указан неправильный URL.

**Решение:**
1. Проверьте переменные окружения в Netlify
2. Убедитесь, что `VITE_BACKEND_URL` и `VITE_API_URL` указывают на Cloud Run URL
3. Пересоберите сайт в Netlify (Deploy → Trigger deploy → Clear cache and deploy site)

### Ошибка: CORS

**Причина:** Backend не разрешает запросы с вашего Netlify домена.

**Решение:**
```bash
# Обновите FRONTEND_ORIGIN на Cloud Run
gcloud run services update shortsai-backend \
  --region us-central1 \
  --project prompt-6a4fd \
  --update-env-vars "FRONTEND_ORIGIN=https://your-site.netlify.app"
```

### Ошибка: Firebase не инициализирован

**Причина:** Неправильные Firebase переменные окружения.

**Решение:**
1. Проверьте все `VITE_FIREBASE_*` переменные в Netlify
2. Убедитесь, что они соответствуют значениям из Firebase Console
3. Пересоберите сайт

## 📊 Итоговый чеклист

- [ ] Репозиторий подключен к Netlify
- [ ] Build settings настроены
- [ ] Все переменные окружения добавлены
- [ ] Сайт успешно задеплоен
- [ ] CORS обновлён на backend (если нужно)
- [ ] Сайт работает без ошибок в консоли

## 🔗 Полезные ссылки

- **Netlify Dashboard**: https://app.netlify.com/
- **Cloud Run Console**: https://console.cloud.google.com/run?project=prompt-6a4fd
- **Firebase Console**: https://console.firebase.google.com/project/prompt-6a4fd
- **Backend URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app

---

**Дата**: 2025-12-16
**Backend URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app

