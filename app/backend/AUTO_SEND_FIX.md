# Исправление автоотправки промптов по расписанию

## Проблемы, которые были исправлены

### 1. Неправильная конвертация времени и таймзон
**Проблема:** Использование `toLocaleString` и `toLocaleDateString` может давать неправильные результаты из-за локализации системы.

**Исправление:** Использован `Intl.DateTimeFormat` с `formatToParts` для надёжной конвертации времени в указанную таймзону.

### 2. Отсутствие "окна" для срабатывания
**Проблема:** Если cron запустился в 02:40:59, а время расписания 02:41, то проверка могла не сработать.

**Исправление:** Добавлено "окно" в ±1 минуту - расписание срабатывает, если текущее время совпадает с расписанием или отличается на 1 минуту.

### 3. Недостаточное логирование
**Проблема:** Не было подробных логов для отладки, сложно понять, почему расписание не срабатывает.

**Исправление:** Добавлены детальные логи на каждом этапе проверки:
- Текущее время в UTC и локальной таймзоне
- Параметры расписания
- Причина пропуска (SKIPPED) или срабатывания (TRIGGERED)
- Детали генерации и отправки промптов

### 4. Неточная проверка lastRunAt
**Проблема:** Проверка `lastRunAt` могла работать неправильно из-за сравнения строк.

**Исправление:** Используется точное сравнение года, месяца, дня, часа и минуты в локальной таймзоне.

## Изменённые функции

### `getLocalTimeInTimezone(date, timezone)`
Новая функция для надёжной конвертации времени в указанную таймзону.

**Что делает:**
- Использует `Intl.DateTimeFormat` с `formatToParts`
- Возвращает структурированные данные: день недели, час, минута, дата, месяц, год
- Возвращает время в формате "HH:MM"

### `parseTime(timeStr)`
Новая функция для парсинга времени из строки "HH:MM".

**Что делает:**
- Валидирует формат времени
- Проверяет диапазоны (0-23 для часов, 0-59 для минут)
- Возвращает объект `{ hour, minute }` или `null` при ошибке

### `shouldRunScheduleNow(channel, schedule, nowUtc)`
Полностью переписана с добавлением подробных логов.

**Что исправлено:**
1. Использует `getLocalTimeInTimezone` вместо `toLocaleString`
2. Добавлено "окно" в ±1 минуту для надёжности
3. Улучшена проверка `lastRunAt` с точным сравнением
4. Добавлены детальные логи на каждом этапе

**Логи:**
- `shouldRunScheduleNow: checking` - начало проверки с полными данными
- `shouldRunScheduleNow: SKIPPED (reason)` - причина пропуска
- `shouldRunScheduleNow: TRIGGERED` - расписание сработало

### `processAutoSendTick()`
Улучшено логирование.

**Что добавлено:**
- Логирование количества найденных каналов
- Логирование для каждого канала
- Счётчики `triggeredCount` и `skippedCount`
- Детальные логи для каждого промпта
- Итоговая статистика

## Как протестировать

### Шаг 1: Настройте тестовое расписание

1. Откройте редактирование канала
2. Включите "Автоотправку в Syntx"
3. Выберите таймзону (например, `Asia/Almaty`)
4. Добавьте расписание:
   - **Дни недели:** Выберите текущий день (например, если сегодня понедельник, выберите Пн)
   - **Время:** Установите время на **2-3 минуты вперёд** от текущего времени
     - Например, если сейчас 02:38, установите 02:41
   - **Количество промптов:** 1
5. Сохраните канал

### Шаг 2: Запустите backend и следите за логами

```bash
cd backend
npm run dev
```

### Шаг 3: Наблюдайте за логами

Каждую минуту вы увидите логи вида:

```
processAutoSendTick: start { nowUtc: '2025-01-02T02:41:00.000Z', ... }
processAutoSendTick: found channels { count: 1, channelIds: [...] }
processAutoSendTick: checking channel { channelId: '...', timezone: 'Asia/Almaty', ... }
shouldRunScheduleNow: checking { 
  channelId: '...',
  scheduleId: '...',
  nowUtc: '2025-01-02T02:41:00.000Z',
  timezone: 'Asia/Almaty',
  localTime: { dayOfWeek: 1, time: '02:41', date: '2025-01-02' },
  schedule: { enabled: true, daysOfWeek: [1], time: '02:41', ... }
}
```

**Если расписание должно сработать, вы увидите:**
```
shouldRunScheduleNow: TRIGGERED { channelId: '...', scheduleId: '...', ... }
processAutoSendTick: TRIGGERED - Running scheduled prompt generation { ... }
processAutoSendTick: generating and sending prompt { promptNumber: 1, ... }
processAutoSendTick: prompt sent successfully { ... }
processAutoSendTick: Scheduled prompt generation completed { promptsSent: 1 }
```

**Если расписание не сработало, вы увидите причину:**
```
shouldRunScheduleNow: SKIPPED (time mismatch) { 
  localTime: '02:40',
  scheduleTime: '02:41',
  timeDiffMinutes: 1
}
```

### Шаг 4: Проверьте Telegram-бот Syntx

После срабатывания расписания проверьте, что в Telegram-бот Syntx пришло сообщение с промптом.

## Отладка проблем

### Расписание не срабатывает

1. **Проверьте логи:**
   - Найдите `shouldRunScheduleNow: checking`
   - Посмотрите на `localTime.time` и `schedule.time` - они должны совпадать (или отличаться на 1 минуту)
   - Проверьте `localTime.dayOfWeek` и `schedule.daysOfWeek` - день недели должен быть в списке

2. **Проверьте таймзону:**
   - Убедитесь, что `timezone` в логах правильная (например, `Asia/Almaty`)
   - Проверьте, что локальное время (`localTime.time`) соответствует ожидаемому

3. **Проверьте формат времени:**
   - В расписании должно быть время в формате "HH:MM" (24-часовой формат)
   - Например: "02:41", "14:30", "23:59"
   - НЕ "2:41 AM" или "02:41:00"

4. **Проверьте lastRunAt:**
   - Если видите `SKIPPED (already run today at this time)`, значит расписание уже сработало сегодня
   - Чтобы протестировать снова, либо подождите до следующего дня, либо временно удалите `lastRunAt` из Firestore

### Промпт не отправляется в Syntx

1. **Проверьте логи генерации:**
   - Должны быть логи `processAutoSendTick: generating and sending prompt`
   - Если есть ошибки, они будут в `processAutoSendTick: Failed to process scheduled prompt generation`

2. **Проверьте Telegram-сессию:**
   - Убедитесь, что Telegram-сессия инициализирована (`npm run dev:login`)
   - Проверьте, что `SYNX_CHAT_ID` установлен в `.env`

3. **Проверьте OpenAI API:**
   - Убедитесь, что `OPENAI_API_KEY` установлен
   - Проверьте логи генерации промпта на наличие ошибок

## Примеры логов

### Успешное срабатывание

```
[INFO] processAutoSendTick: start { nowUtc: '2025-01-02T02:41:00.123Z' }
[INFO] processAutoSendTick: found channels { count: 1, channelIds: ['abc123'] }
[INFO] processAutoSendTick: checking channel { channelId: 'abc123', timezone: 'Asia/Almaty', schedulesCount: 1 }
[INFO] shouldRunScheduleNow: checking { 
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  nowUtc: '2025-01-02T02:41:00.123Z',
  timezone: 'Asia/Almaty',
  localTime: { dayOfWeek: 1, time: '02:41', date: '2025-01-02' },
  schedule: { enabled: true, daysOfWeek: [1,2,3,4,5], time: '02:41', lastRunAt: null }
}
[INFO] shouldRunScheduleNow: TRIGGERED { channelId: 'abc123', scheduleId: 'schedule-1', localTime: '02:41', scheduleTime: '02:41' }
[INFO] processAutoSendTick: TRIGGERED - Running scheduled prompt generation { channelId: 'abc123', promptsPerRun: 1 }
[INFO] processAutoSendTick: generating and sending prompt { promptNumber: 1, totalPrompts: 1 }
[INFO] generateAndSendPromptForChannel: start { channelId: 'abc123', userId: 'user123' }
[INFO] Prompt generated { channelId: 'abc123', promptLength: 245 }
[INFO] Prompt sent to Syntx { channelId: 'abc123' }
[INFO] processAutoSendTick: prompt sent successfully { channelId: 'abc123', promptNumber: 1 }
[INFO] processAutoSendTick: Scheduled prompt generation completed { promptsSent: 1 }
[INFO] processAutoSendTick: completed { totalChannels: 1, triggeredSchedules: 1, skippedSchedules: 0 }
```

### Пропуск из-за несовпадения времени

```
[INFO] shouldRunScheduleNow: checking { 
  localTime: { time: '02:40' },
  schedule: { time: '02:41' }
}
[INFO] shouldRunScheduleNow: SKIPPED (time mismatch) { 
  localTime: '02:40',
  scheduleTime: '02:41',
  timeDiffMinutes: 1
}
```

### Пропуск из-за несовпадения дня недели

```
[INFO] shouldRunScheduleNow: SKIPPED (day of week mismatch) { 
  localDayOfWeek: 0,
  scheduleDaysOfWeek: [1,2,3,4,5]
}
```

## Важные замечания

1. **Формат времени:** В расписании время должно быть в формате "HH:MM" (24-часовой формат), например "02:41", а не "2:41 AM".

2. **Таймзона:** Убедитесь, что таймзона указана правильно (например, "Asia/Almaty", а не "Almaty").

3. **День недели:** Дни недели в коде: 0 = воскресенье, 1 = понедельник, ..., 6 = суббота.

4. **Окно срабатывания:** Расписание сработает, если текущее время совпадает с расписанием или отличается на ±1 минуту. Это нужно для компенсации возможных задержек cron.

5. **lastRunAt:** После успешного запуска `lastRunAt` обновляется, и повторный запуск в ту же минуту того же дня не произойдёт. На следующий день в то же время расписание снова сработает.


