# 🚀 Финальная инструкция: Деплой фронтенда на Netlify

## ✅ Backend готов

- **URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app
- **CORS**: Настроен для работы с `*.netlify.app` доменами
- **Статус**: ✅ Работает

## 📋 Что нужно настроить в Netlify

### 1. Переменные окружения (ОБЯЗАТЕЛЬНО)

Добавьте в **Netlify Dashboard** → **Site settings** → **Environment variables**:

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

**Опционально:**
```env
VITE_OPENAI_MODEL=gpt-4o-mini
```

### 2. Подключение репозитория

1. Откройте https://app.netlify.com/
2. **Add new site** → **Import an existing project**
3. Выберите **GitHub** → найдите **hotwellkz/p042**
4. Нажмите **Import**

### 3. Build Settings

Netlify автоматически определит из `netlify.toml`:
- **Build command**: `npm run build`
- **Publish directory**: `dist`

### 4. После первого деплоя

После получения Netlify URL (например: `https://your-site-123.netlify.app`), обновите CORS на backend:

```bash
NETLIFY_URL="https://your-site-123.netlify.app"

gcloud run services update shortsai-backend \
  --region us-central1 \
  --project prompt-6a4fd \
  --update-env-vars "FRONTEND_ORIGIN=$NETLIFY_URL"
```

**Или через PowerShell:**
```powershell
$NETLIFY_URL = "https://your-site-123.netlify.app"

gcloud run services update shortsai-backend `
  --region us-central1 `
  --project prompt-6a4fd `
  --update-env-vars "FRONTEND_ORIGIN=$NETLIFY_URL"
```

## ✅ Готово!

После настройки переменных окружения и деплоя фронтенд будет работать с Cloud Run backend.

---

**Backend URL**: https://shortsai-backend-rhnx5gonwq-uc.a.run.app
**GitHub репозиторий**: https://github.com/hotwellkz/p042.git

