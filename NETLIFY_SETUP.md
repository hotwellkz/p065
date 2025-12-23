# 🚀 Настройка Netlify для работы с Cloud Run Backend

## ✅ Backend готов

- **URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app
- **Health Check**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app/health

## 📋 Переменные окружения для Netlify

Добавьте эти переменные в **Netlify Dashboard** → **Site settings** → **Environment variables**:

### Обязательные переменные:

```env
VITE_BACKEND_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
VITE_API_URL=https://shortsai-backend-rhnx5gonwq-uc.a.run.app
VITE_FIREBASE_API_KEY=AIzaSyCtAg7fTGY7EsyEQf1WXl0ei7HUO5ls0sQ
VITE_FIREBASE_AUTH_DOMAIN=prompt-6a4fd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prompt-6a4fd
VITE_FIREBASE_STORAGE_BUCKET=prompt-6a4fd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=905027425668
VITE_FIREBASE_APP_ID=1:905027425668:web:38f58912370df2c2be39d1
```

### Опциональные:

```env
VITE_OPENAI_MODEL=gpt-4o-mini
```

## 📝 Пошаговая инструкция

### 1. Подключите репозиторий к Netlify

1. Откройте https://app.netlify.com/
2. Нажмите **Add new site** → **Import an existing project**
3. Выберите **GitHub** и авторизуйтесь
4. Найдите репозиторий **hotwellkz/p042**
5. Нажмите **Import**

### 2. Настройте Build Settings

Netlify автоматически определит настройки из `netlify.toml`:
- **Build command**: `npm run build`
- **Publish directory**: `dist`

Если нужно настроить вручную:
- **Base directory**: (оставьте пустым)
- **Build command**: `npm ci && npm run build`
- **Publish directory**: `dist`

### 3. Добавьте переменные окружения

1. В настройках сайта перейдите в **Site settings** → **Environment variables**
2. Нажмите **Add a variable** для каждой переменной
3. Добавьте все переменные из раздела выше

**Важно:** После добавления переменных **пересоберите сайт**:
- **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

### 4. Обновите CORS на Backend (после получения Netlify URL)

После первого деплоя вы получите Netlify URL (например: `https://your-site-123.netlify.app`).

Обновите CORS на backend:

```bash
# Замените YOUR_NETLIFY_URL на ваш реальный Netlify URL
NETLIFY_URL="https://your-site-123.netlify.app"

gcloud run services update shortsai-backend \
  --region us-central1 \
  --project prompt-6a4fd \
  --update-env-vars "FRONTEND_ORIGIN=$NETLIFY_URL"
```

Или через PowerShell:

```powershell
$NETLIFY_URL = "https://your-site-123.netlify.app"

gcloud run services update shortsai-backend `
  --region us-central1 `
  --project prompt-6a4fd `
  --update-env-vars "FRONTEND_ORIGIN=$NETLIFY_URL"
```

### 5. Проверьте работу

1. Откройте ваш Netlify сайт
2. Откройте консоль браузера (F12)
3. Проверьте, что нет ошибок `ERR_CONNECTION_REFUSED`
4. Попробуйте авторизоваться через Firebase

## 🔍 Troubleshooting

### Ошибка: ERR_CONNECTION_REFUSED

**Причина:** Переменные окружения не установлены или указан неправильный URL.

**Решение:**
1. Проверьте переменные окружения в Netlify
2. Убедитесь, что `VITE_BACKEND_URL` и `VITE_API_URL` указывают на Cloud Run URL
3. Пересоберите сайт: **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

### Ошибка: CORS

**Причина:** Backend не разрешает запросы с вашего Netlify домена.

**Решение:**
Обновите `FRONTEND_ORIGIN` на Cloud Run (см. шаг 4 выше).

### Ошибка: Firebase не инициализирован

**Причина:** Неправильные Firebase переменные окружения.

**Решение:**
1. Проверьте все `VITE_FIREBASE_*` переменные в Netlify
2. Убедитесь, что они соответствуют значениям из Firebase Console
3. Пересоберите сайт

## 📊 Чеклист

- [ ] Репозиторий подключен к Netlify
- [ ] Build settings настроены
- [ ] Все переменные окружения добавлены
- [ ] Сайт успешно задеплоен
- [ ] Получен Netlify URL
- [ ] CORS обновлён на backend
- [ ] Сайт работает без ошибок в консоли

## 🔗 Полезные ссылки

- **Netlify Dashboard**: https://app.netlify.com/
- **Cloud Run Console**: https://console.cloud.google.com/run?project=prompt-6a4fd
- **Firebase Console**: https://console.firebase.google.com/project/prompt-6a4fd
- **Backend URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app

---

**Дата**: 2025-12-16
**Backend URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app

