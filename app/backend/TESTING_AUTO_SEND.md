# Инструкция по тестированию автоотправки

## Быстрый тест

### 1. Настройте тестовое расписание

1. Откройте редактирование канала
2. Включите "Автоотправку в Syntx"
3. Выберите таймзону: `Asia/Almaty`
4. Добавьте расписание:
   - Дни недели: выберите **текущий день** (например, если сегодня понедельник, выберите Пн)
   - Время: установите на **2-3 минуты вперёд** от текущего времени
     - Например, если сейчас 01:55, установите 01:57
   - Количество промптов: 1
5. Сохраните канал

### 2. Проверьте сохранение через debug-эндпоинт

```bash
# Получите токен из браузера (F12 -> Application -> Local Storage -> firebase:authUser:...)
# Или используйте токен из запросов в Network tab

curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/debug/auto-send-channels | jq
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "totalChannels": 3,
  "channelsWithAutoSendEnabled": 1,
  "channelsWithSchedules": 1,
  "channels": [
    {
      "id": "abc123",
      "autoSendEnabled": true,
      "autoSendEnabledType": "boolean",
      "timezone": "Asia/Almaty",
      "schedulesCount": 1,
      "schedulesDetails": [
        {
          "id": "schedule-1",
          "enabled": true,
          "daysOfWeek": [1],
          "time": "01:57",
          "promptsPerRun": 1
        }
      ]
    }
  ]
}
```

**Если `channelsWithAutoSendEnabled: 0`:**
- Откройте канал в UI
- Убедитесь, что чекбокс "Включить автоотправку" **реально включён**
- Сохраните канал
- Проверьте debug-эндпоинт снова

### 3. Проверьте логи backend

Запустите backend и наблюдайте за логами:

```bash
cd backend
npm run dev
```

**Каждую минуту вы увидите:**

```
[INFO] processAutoSendTick: start { 
  nowUtc: '2025-01-02T01:57:00.000Z',
  env: { NODE_ENV: 'development', FIREBASE_PROJECT_ID: '...' }
}
[INFO] getChannelsWithAutoSendEnabled: DEBUG statistics {
  totalChannels: 3,
  channelsWithAutoSendFlag: 1,  // ← Должно быть > 0
  channelsWithSchedules: 1,
  channelsWithBoth: 1  // ← Должно быть > 0
}
```

**Если `channelsWithBoth: 0`:**
- Проверьте логи `DEBUG channels with autoSendEnabled=true`
- Убедитесь, что `schedulesCount > 0`
- Если `schedulesCount: 0`, добавьте расписание в UI и сохраните

### 4. При наступлении времени расписания

Вы должны увидеть:

```
[INFO] processAutoSendTick: TRIGGER candidate {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  nowLocal: '01:57',
  scheduleTime: '01:57',
  scheduleDaysOfWeek: [1],
  scheduleEnabled: true
}
[INFO] shouldRunScheduleNow: TRIGGERED { ... }
[INFO] processAutoSendTick: TRIGGERED auto-send { ... }
[INFO] processAutoSendTick: generating and sending prompt { ... }
[INFO] processAutoSendTick: prompt sent successfully { ... }
```

### 5. Проверьте Telegram-бот Syntx

После срабатывания расписания проверьте, что в Telegram-бот Syntx пришло сообщение с промптом.

## Отладка проблем

### Проблема: `channelsWithAutoSendFlag: 0`

**Причина:** В БД нет каналов с `autoSendEnabled: true`

**Решение:**
1. Откройте канал в UI
2. Убедитесь, что чекбокс **включён** (checked)
3. Сохраните канал
4. Проверьте debug-эндпоинт

### Проблема: `channelsWithAutoSendFlag > 0`, но `channelsWithBoth: 0`

**Причина:** У каналов нет расписаний

**Решение:**
1. Откройте канал в UI
2. Добавьте расписание
3. Убедитесь, что расписание включено
4. Сохраните канал
5. Проверьте debug-эндпоинт - там должны быть `schedulesDetails`

### Проблема: Каналы находятся, но расписание не срабатывает

**Причина:** Не совпадает время или день недели

**Решение:**
1. Проверьте логи `TRIGGER candidate`
2. Сравните `nowLocal` и `scheduleTime` - должны совпадать (или ±1 минута)
3. Проверьте `nowLocalDayOfWeek` и `scheduleDaysOfWeek` - день должен быть в списке

### Проблема: Время в UI "01:57 AM", а в логах не срабатывает

**Причина:** Формат времени

**Решение:**
- В UI используется `type="time"`, который возвращает время в формате "HH:MM" (24-часовой формат)
- "01:57 AM" в UI сохраняется как "01:57" в БД
- Это правильно, проверьте логи - там должно быть `scheduleTime: '01:57'`

## Чек-лист перед тестированием

- [ ] Backend запущен (`npm run dev`)
- [ ] Firebase Admin настроен (проверьте логи при старте)
- [ ] Telegram-сессия инициализирована (`npm run dev:login`)
- [ ] В UI включена автоотправка для канала
- [ ] Добавлено расписание на текущий день
- [ ] Время расписания установлено на 2-3 минуты вперёд
- [ ] Канал сохранён
- [ ] Debug-эндпоинт показывает `channelsWithAutoSendEnabled > 0`
- [ ] Логи cron показывают `channelsWithBoth > 0`


