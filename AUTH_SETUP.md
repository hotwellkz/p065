# Настройка авторизации для /api/prompt/openai

## Обзор

Маршрут `POST /api/prompt/openai` теперь защищён Firebase-авторизацией через middleware `authRequired`.

### Как это работает

1. **Frontend** автоматически получает Firebase ID Token текущего пользователя
2. **Frontend** добавляет заголовок `Authorization: Bearer <token>` к каждому запросу
3. **Backend** проверяет токен через Firebase Admin SDK
4. При успешной проверке запрос проходит, при ошибке возвращается 401

---

## Backend изменения

### Файл: `backend/src/middleware/auth.ts`

- ✅ Использует Firebase Admin SDK для проверки токена (`admin.auth().verifyIdToken()`)
- ✅ Проверяет подпись токена и его валидность
- ✅ Сохраняет информацию о пользователе в `req.user` (uid, email)
- ✅ Логирует ошибки авторизации для отладки
- ✅ Возвращает понятные JSON-ответы при ошибках

### Файл: `backend/src/routes/promptRoutes.ts`

- ✅ Роут `/api/prompt/openai` защищён middleware `authRequired`
- ✅ Добавлены комментарии о требованиях авторизации

---

## Frontend изменения

### Файл: `src/services/openaiScriptGenerator.ts`

- ✅ Функция `getAuthToken()` получает актуальный токен из Firebase Auth
- ✅ Функция `callOpenAIProxy()` автоматически добавляет заголовок `Authorization: Bearer <token>`
- ✅ При ошибке 401 автоматически пытается обновить токен и повторить запрос один раз
- ✅ Возвращает понятные сообщения об ошибках для пользователя

---

## Инструкции по запуску и проверке

### 1. Перезапуск backend

```bash
cd backend
npm run dev
# или
pnpm run dev
```

### 2. Проверка работы авторизации

#### Шаг 1: Войдите в приложение
- Откройте приложение в браузере
- Войдите под Firebase-аккаунтом (email/password)

#### Шаг 2: Откройте DevTools
- Нажмите `F12` или `Ctrl+Shift+I`
- Перейдите на вкладку **Network**

#### Шаг 3: Отправьте запрос генерации сценария
- Перейдите на страницу генерации сценария
- Нажмите кнопку генерации

#### Шаг 4: Проверьте запрос в Network
1. Найдите запрос `POST /api/prompt/openai`
2. Откройте вкладку **Headers**
3. Проверьте заголовок **Request Headers**:
   ```
   Authorization: Bearer <длинный-токен>
   ```
4. Проверьте **Response**:
   - ✅ Должен быть статус `200 OK` (не 401)
   - ✅ Должен содержать ответ от OpenAI API

#### Шаг 5: Проверьте логи backend
В консоли backend должны быть логи:
- ✅ При успешной авторизации: `authRequired: token verified successfully`
- ❌ При ошибке: `authRequired: token verification failed` с деталями

---

## Устранение проблем

### Ошибка 401 Unauthorized

#### Проверка 1: Пользователь авторизован?
- Откройте DevTools → Console
- Проверьте, нет ли ошибок Firebase Auth
- Убедитесь, что вы видите интерфейс приложения (не страницу логина)

#### Проверка 2: Токен передаётся?
- DevTools → Network → запрос `/api/prompt/openai` → Headers
- Должен быть заголовок `Authorization: Bearer <token>`
- Если его нет — проблема на frontend

#### Проверка 3: Backend проверяет токен?
- Проверьте логи backend
- Должны быть сообщения о проверке токена
- Если видите "Firebase Admin not initialized" — проблема с настройкой Firebase

#### Проверка 4: Firebase Admin настроен?
- Проверьте переменные окружения в `backend/.env`:
  - `FIREBASE_SERVICE_ACCOUNT` (JSON строка) ИЛИ
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Перезапустите backend после изменения `.env`

### Ошибка "Пользователь не авторизован" на frontend

- Пользователь не залогинен в Firebase
- Решение: войдите в систему через страницу авторизации

### Токен истёк (Token expired)

- Frontend автоматически попытается обновить токен и повторить запрос
- Если это не помогло — пользователю нужно перелогиниться

---

## Технические детали

### Backend: Проверка токена

```typescript
// backend/src/middleware/auth.ts
const decodedToken = await admin.auth().verifyIdToken(token);
req.user = { uid: decodedToken.uid, email: decodedToken.email };
```

### Frontend: Получение токена

```typescript
// src/services/openaiScriptGenerator.ts
const auth = getAuth();
const user = auth.currentUser;
const token = await user.getIdToken(); // или getIdToken(true) для принудительного обновления
```

### Frontend: Отправка запроса

```typescript
fetch(url, {
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(requestBody)
});
```

---

## Чек-лист для проверки

- [ ] Backend перезапущен после изменений
- [ ] Пользователь авторизован в приложении
- [ ] В Network виден заголовок `Authorization: Bearer <token>`
- [ ] Запрос возвращает статус 200 (не 401)
- [ ] В логах backend нет ошибок авторизации
- [ ] Сценарий успешно генерируется

---

## Дополнительная информация

- Все запросы к `/api/prompt/openai` требуют авторизации
- Токен автоматически обновляется при необходимости
- Ошибки авторизации логируются на backend для отладки
- Пользователь получает понятные сообщения об ошибках


