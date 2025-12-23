# Устранение ошибки 401 Unauthorized для /api/prompt/openai

## Быстрая диагностика

### Шаг 1: Проверьте, что пользователь авторизован

1. Откройте DevTools → Console (F12)
2. Проверьте, нет ли ошибок Firebase Auth
3. Убедитесь, что вы видите интерфейс приложения (не страницу логина)

**Если не авторизованы:**
- Войдите в систему через страницу авторизации

---

### Шаг 2: Проверьте, что токен передаётся

1. Откройте DevTools → Network
2. Отправьте запрос генерации сценария
3. Найдите запрос `POST /api/prompt/openai`
4. Откройте вкладку **Headers** → **Request Headers**
5. Проверьте наличие заголовка:
   ```
   Authorization: Bearer <длинный-токен>
   ```

**Если заголовка нет:**
- Проблема на frontend - токен не получается
- Проверьте Console на ошибки получения токена

**Если заголовок есть:**
- Переходите к Шагу 3

---

### Шаг 3: Проверьте логи backend

В консоли backend должны быть логи:

**✅ При успешной авторизации:**
```
authRequired: token verified successfully { uid: '...', method: 'POST', path: '/openai' }
```

**❌ При ошибке авторизации:**
```
authRequired: token verification failed { error: '...', method: 'POST', path: '/openai' }
```

**❌ Если Firebase Admin не инициализирован:**
```
authRequired: Firebase Admin not initialized
```

---

### Шаг 4: Проверьте инициализацию Firebase Admin

При старте backend должны быть логи:

**✅ Успешная инициализация:**
```
Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env variable
```
или
```
Firebase Admin initialized from individual env variables
```

**❌ Если видите:**
```
Firebase Admin not initialized: no credentials provided
```

**Решение:**
1. Проверьте файл `backend/.env`
2. Убедитесь, что установлены переменные:
   - `FIREBASE_SERVICE_ACCOUNT` (JSON строка) ИЛИ
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
3. Перезапустите backend

---

## Частые проблемы

### Проблема: Множественные запросы (зацикливание)

**Симптомы:**
- В Network видно много запросов `/api/prompt/openai` (10+ раз)
- Ошибка 400 при обновлении токена

**Причина:**
- Логика retry зацикливается

**Решение:**
- ✅ Исправлено в последней версии кода
- Перезагрузите страницу и попробуйте снова

---

### Проблема: "Token expired" или "Invalid token"

**Причина:**
- Токен истёк или невалиден

**Решение:**
1. Frontend автоматически попытается обновить токен один раз
2. Если это не помогло:
   - Выйдите из системы
   - Войдите заново

---

### Проблема: "Firebase Admin not initialized"

**Причина:**
- Backend не может проверить токен, т.к. Firebase Admin не настроен

**Решение:**
1. Проверьте `backend/.env` файл
2. Убедитесь, что установлены переменные окружения для Firebase Admin
3. Перезапустите backend сервер

---

### Проблема: Токен не передаётся

**Причина:**
- Пользователь не авторизован на frontend
- Ошибка при получении токена

**Решение:**
1. Проверьте Console на ошибки
2. Убедитесь, что пользователь залогинен
3. Попробуйте перелогиниться

---

## Проверка end-to-end

### Чек-лист:

1. [ ] Backend сервер запущен (`npm run dev` в папке backend)
2. [ ] Firebase Admin инициализирован (есть лог при старте backend)
3. [ ] Пользователь авторизован в приложении
4. [ ] В Network виден заголовок `Authorization: Bearer <token>`
5. [ ] В логах backend нет ошибок авторизации
6. [ ] Запрос возвращает статус 200 (не 401)

---

## Если ничего не помогло

1. **Проверьте, что backend и frontend используют один и тот же Firebase проект:**
   - Frontend: `VITE_FIREBASE_PROJECT_ID` в `.env`
   - Backend: `FIREBASE_PROJECT_ID` в `backend/.env`
   - Они должны совпадать!

2. **Проверьте логи backend при запросе:**
   - Должны быть логи о проверке токена
   - Если логов нет - запрос не доходит до middleware

3. **Проверьте CORS:**
   - В логах backend не должно быть ошибок CORS
   - Frontend origin должен быть разрешён

4. **Перезапустите оба сервера:**
   - Backend: `cd backend && npm run dev`
   - Frontend: перезагрузите страницу или перезапустите Vite
