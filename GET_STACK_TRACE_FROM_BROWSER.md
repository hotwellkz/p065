# Получение stack trace 500 ошибок из браузера

## Способ 1: Через DevTools Network

1. Откройте `https://shortsai.ru` в браузере
2. Откройте DevTools (F12) → вкладка **Network**
3. Выполните действие, которое вызывает 500 ошибку
4. Найдите запрос с ошибкой 500 (красный статус)
5. Кликните на запрос → вкладка **Response**
6. Скопируйте JSON ответ - там должен быть:
   - `error` - название ошибки
   - `message` - сообщение об ошибке
   - `requestId` - ID запроса для поиска в логах
   - `stackTrace` - stack trace (если NODE_ENV не production)

## Способ 2: Через Console

1. Откройте `https://shortsai.ru` в браузере
2. Откройте DevTools (F12) → вкладка **Console**
3. Выполните действие, которое вызывает 500 ошибку
4. Найдите ошибку в консоли
5. Скопируйте полный текст ошибки

## Способ 3: Логи через docker-compose (без sudo)

```bash
cd /volume1/docker/shortsai/backend
docker-compose logs --tail 300 backend 2>&1 | tail -150
```

## Способ 4: Логи через Synology Container Manager

1. Откройте **Container Manager** в DSM
2. Найдите контейнер `shorts-backend` (или похожий)
3. Кликните на контейнер → **Details** → **Log**
4. Скопируйте последние ошибки

## Способ 5: Прямой доступ к логам (если есть права)

```bash
# Попробуйте без sudo
cd /volume1/docker/shortsai/backend
docker logs --tail 300 $(docker ps -q --filter "name=backend") 2>&1 | tail -150
```


