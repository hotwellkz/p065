# ⚡ Быстрая настройка Telegram для Cloud Run

## Проблема
После деплоя появляется ошибка: *"Telegram не подключён. Авторизуйтесь через backend командой: npm run dev:login"*

## Решение (3 шага)

### 1️⃣ Локальный логин Telegram

```bash
cd backend
npm run dev:login
```

Введите:
- Номер телефона (например, `+79991234567`)
- Код из Telegram/SMS
- Пароль 2FA (если включён)

### 2️⃣ Экспорт сессии

```bash
npm run export:telegram-session
```

Скопируйте значение `TELEGRAM_SESSION_ENCRYPTED` из вывода.

### 3️⃣ Добавление в Cloud Run

**Через Cloud Console:**
1. Откройте https://console.cloud.google.com/run/detail/us-central1/shorts-backend
2. **Edit & Deploy New Revision**
3. **Variables & Secrets** → **Add Variable**
4. Key: `TELEGRAM_SESSION_ENCRYPTED`
5. Value: значение из шага 2
6. **Deploy**

**Или через CLI:**
```bash
gcloud run services update shorts-backend \
  --region us-central1 \
  --project shortai-532ac \
  --update-env-vars "TELEGRAM_SESSION_ENCRYPTED=ВАШЕ_ЗНАЧЕНИЕ_ИЗ_ШАГА_2"
```

## ✅ Готово!

После деплоя ошибка должна исчезнуть.

---

📚 Подробная инструкция: [backend/TELEGRAM_CLOUD_RUN_SETUP.md](./backend/TELEGRAM_CLOUD_RUN_SETUP.md)



