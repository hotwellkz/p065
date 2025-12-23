# Системное исправление проблемы с выборкой каналов для автоотправки

## Проблема

Функция `getChannelsWithAutoSendEnabled()` возвращала пустой массив, хотя каналы с включённой автоматизацией были сохранены в БД.

## Выполненные исправления

### 1. Создан debug-эндпоинт для проверки данных в БД

**Файл:** `backend/src/routes/debugRoutes.ts`

**Эндпоинт:** `GET /api/debug/auto-send-channels`

**Что делает:**
- Получает ВСЕ каналы из Firestore (без фильтрации)
- Возвращает детальную информацию по каждому каналу:
  - `id`, `name`, `ownerId`
  - `autoSendEnabled` (значение и тип)
  - `timezone`
  - `autoSendSchedules` (массив, количество, детали каждого расписания)
- Логирует статистику в консоль backend
- Показывает информацию об окружении (NODE_ENV, FIREBASE_PROJECT_ID)

**Как использовать:**
```bash
# Откройте в браузере или через curl:
GET http://localhost:8080/api/debug/auto-send-channels
Headers: Authorization: Bearer <your-firebase-token>
```

**Ответ:**
```json
{
  "success": true,
  "env": {
    "NODE_ENV": "development",
    "FIREBASE_PROJECT_ID": "your-project-id"
  },
  "totalChannels": 3,
  "channelsWithAutoSendEnabled": 1,
  "channelsWithSchedules": 1,
  "channels": [
    {
      "id": "abc123",
      "name": "My Channel",
      "ownerId": "user123",
      "autoSendEnabled": true,
      "autoSendEnabledType": "boolean",
      "timezone": "Asia/Almaty",
      "autoSendSchedules": [...],
      "schedulesCount": 1,
      "schedulesType": "object"
    }
  ]
}
```

### 2. Исправлен channelConverter для явного сохранения полей

**Файл:** `src/domain/channel.ts`

**Проблема:** Firestore может не сохранять `undefined` значения, что приводило к тому, что `autoSendEnabled` не сохранялся, если он был `undefined`.

**Исправление:**
```typescript
toFirestore(channel: Channel): ChannelFirestoreData {
  const { id, ...rest } = channel;
  return {
    ...rest,
    generationMode: channel.generationMode || "script",
    // Явно устанавливаем autoSendEnabled, чтобы Firestore сохранил его
    autoSendEnabled: channel.autoSendEnabled ?? false,
    timezone: channel.timezone,
    autoSendSchedules: channel.autoSendSchedules ?? [],
    createdAt: channel.createdAt ?? (serverTimestamp() as unknown as Timestamp),
    updatedAt: serverTimestamp() as unknown as Timestamp
  };
}
```

**Что изменилось:**
- `autoSendEnabled` теперь явно устанавливается в `false`, если он `undefined`
- `autoSendSchedules` явно устанавливается в `[]`, если он `undefined`
- Это гарантирует, что поля всегда сохраняются в Firestore

### 3. Добавлено логирование при сохранении канала на frontend

**Файл:** `src/repositories/channelRepository.ts`

**Что добавлено:**
- Логирование payload перед сохранением (только в development режиме)
- Показывает, что именно сохраняется: `autoSendEnabled`, `timezone`, `autoSendSchedules`

**Как использовать:**
1. Откройте консоль браузера (F12)
2. Включите автоотправку в канале и сохраните
3. В консоли увидите: `DEBUG updateChannel payload { ... }`

### 4. Улучшена функция выборки каналов

**Файл:** `backend/src/services/autoSendScheduler.ts`

**Что улучшено:**
- Строгая проверка `autoSendEnabled === true` (не просто truthy)
- Проверка типа массива: `Array.isArray(autoSendSchedules)`
- Детальное логирование всех каналов для отладки
- Логирование статистики: сколько каналов с флагом, сколько с расписаниями

### 5. Добавлено логирование окружения в cron

**Файл:** `backend/src/services/autoSendScheduler.ts`

**Что добавлено:**
- Логирование `NODE_ENV`, `FIREBASE_PROJECT_ID`, `ENABLE_CRON_SCHEDULER` при каждом тике
- Это помогает убедиться, что cron и API смотрят в одну и ту же БД

### 6. Добавлено логирование кандидатов на срабатывание

**Файл:** `backend/src/services/autoSendScheduler.ts`

**Что добавлено:**
- Перед проверкой каждого расписания логируется:
  - `channelId`, `scheduleId`
  - Текущее локальное время
  - Параметры расписания (время, дни недели, enabled)
- После срабатывания логируется `TRIGGERED auto-send`

## Исправленный код

### Функция `getChannelsWithAutoSendEnabled()`

```typescript
async function getChannelsWithAutoSendEnabled(): Promise<ChannelWithSchedule[]> {
  // ... проверка Firestore ...

  const channels: ChannelWithSchedule[] = [];
  let totalChannelsCount = 0;
  let channelsWithAutoSendFlag = 0;
  let channelsWithSchedules = 0;

  try {
    const usersSnapshot = await db.collection("users").get();
    
    // Собираем все каналы для отладки
    const allChannelsDebug = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const channelsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("channels")
        .get();

      totalChannelsCount += channelsSnapshot.docs.length;

      for (const channelDoc of channelsSnapshot.docs) {
        const channelData = channelDoc.data() as any;
        
        const autoSendEnabled = channelData.autoSendEnabled;
        const autoSendSchedules = channelData.autoSendSchedules;
        const schedulesCount = Array.isArray(autoSendSchedules) ? autoSendSchedules.length : 0;

        // Отладочная информация
        allChannelsDebug.push({
          id: channelDoc.id,
          name: channelData.name,
          ownerId: userId,
          autoSendEnabled: autoSendEnabled,
          autoSendEnabledType: typeof autoSendEnabled,
          schedulesCount: schedulesCount,
          schedulesType: typeof autoSendSchedules
        });

        // СТРОГАЯ проверка: именно true, а не просто truthy
        const isAutoSendEnabled = autoSendEnabled === true;
        // Проверка, что это массив и он не пустой
        const hasSchedules = Array.isArray(autoSendSchedules) && autoSendSchedules.length > 0;

        if (isAutoSendEnabled) {
          channelsWithAutoSendFlag++;
        }
        if (hasSchedules) {
          channelsWithSchedules++;
        }

        if (isAutoSendEnabled && hasSchedules) {
          channels.push({
            id: channelDoc.id,
            ownerId: userId,
            autoSendEnabled: true,
            timezone: channelData.timezone || "UTC",
            autoSendSchedules: autoSendSchedules
          });
        }
      }
    }

    // Детальное логирование
    Logger.info("getChannelsWithAutoSendEnabled: DEBUG statistics", {
      totalChannels: totalChannelsCount,
      channelsWithAutoSendFlag: channelsWithAutoSendFlag,
      channelsWithSchedules: channelsWithSchedules,
      channelsWithBoth: channels.length
    });

    // Логируем каналы с autoSendEnabled=true
    const channelsWithFlag = allChannelsDebug.filter(c => c.autoSendEnabled === true);
    if (channelsWithFlag.length > 0) {
      Logger.info("getChannelsWithAutoSendEnabled: DEBUG channels with autoSendEnabled=true", {
        count: channelsWithFlag.length,
        channels: channelsWithFlag.map(c => ({
          id: c.id,
          name: c.name,
          autoSendEnabled: c.autoSendEnabled,
          autoSendEnabledType: c.autoSendEnabledType,
          schedulesCount: c.schedulesCount,
          schedulesType: c.schedulesType,
          schedules: c.autoSendSchedules
        }))
      });
    }

    return channels;
  } catch (error) {
    // ... обработка ошибок ...
  }
}
```

### Функция `processAutoSendTick()`

```typescript
export async function processAutoSendTick(): Promise<void> {
  const nowUtc = new Date();
  Logger.info("processAutoSendTick: start", { 
    nowUtc: nowUtc.toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set",
      ENABLE_CRON_SCHEDULER: process.env.ENABLE_CRON_SCHEDULER || "true"
    }
  });

  try {
    const channels = await getChannelsWithAutoSendEnabled();
    Logger.info("processAutoSendTick: totalChannels", { 
      count: channels.length,
      channelIds: channels.map(c => c.id),
      channels: channels.map(c => ({
        id: c.id,
        autoSendEnabled: c.autoSendEnabled,
        timezone: c.timezone,
        schedulesCount: c.autoSendSchedules?.length || 0
      }))
    });

    // ... обработка каналов и расписаний ...

    for (const schedule of channel.autoSendSchedules) {
      // Логируем кандидата на срабатывание
      const localTimeForLog = getLocalTimeInTimezone(nowUtc, channel.timezone || "UTC");
      Logger.info("processAutoSendTick: TRIGGER candidate", {
        channelId: channel.id,
        scheduleId: schedule.id,
        nowUtc: nowUtc.toISOString(),
        nowLocal: localTimeForLog.timeString,
        scheduleTime: schedule.time,
        scheduleDaysOfWeek: schedule.daysOfWeek,
        scheduleEnabled: schedule.enabled
      });

      if (shouldRunScheduleNow(channel, schedule, nowUtc)) {
        Logger.info("processAutoSendTick: TRIGGERED auto-send", {
          channelId: channel.id,
          scheduleId: schedule.id
        });
        // ... генерация и отправка промпта ...
      }
    }
  } catch (error) {
    // ... обработка ошибок ...
  }
}
```

## Как протестировать

### Шаг 1: Проверьте данные в БД через debug-эндпоинт

1. Откройте браузер и перейдите на:
   ```
   http://localhost:8080/api/debug/auto-send-channels
   ```
   (Нужен авторизационный токен в заголовке `Authorization: Bearer <token>`)

2. Или используйте curl:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/api/debug/auto-send-channels
   ```

3. Проверьте ответ:
   - Если `channelsWithAutoSendEnabled: 0`, значит в БД нет каналов с `autoSendEnabled: true`
   - Если `channelsWithAutoSendEnabled > 0`, но каналы не находятся в cron, проверьте логи

### Шаг 2: Проверьте сохранение канала

1. Откройте консоль браузера (F12)
2. Откройте редактирование канала
3. Включите "Автоотправку в Syntx"
4. Добавьте расписание (например, через 2-3 минуты от текущего времени)
5. Нажмите "Сохранить изменения"
6. В консоли браузера должно появиться:
   ```
   DEBUG updateChannel payload {
     autoSendEnabled: true,
     timezone: "Asia/Almaty",
     autoSendSchedules: [{ id: "...", enabled: true, ... }]
   }
   ```

### Шаг 3: Проверьте логи backend

После сохранения канала проверьте логи backend. Должны появиться логи от debug-эндпоинта (если вы его вызывали).

### Шаг 4: Проверьте работу cron

1. Запустите backend:
   ```bash
   cd backend
   npm run dev
   ```

2. Наблюдайте за логами каждую минуту:
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
   [INFO] processAutoSendTick: totalChannels { count: 1, channelIds: ['abc123'] }
   [INFO] processAutoSendTick: TRIGGER candidate { ... }
   [INFO] shouldRunScheduleNow: TRIGGERED { ... }
   [INFO] processAutoSendTick: TRIGGERED auto-send { ... }
   [INFO] processAutoSendTick: generating and sending prompt { ... }
   [INFO] processAutoSendTick: prompt sent successfully { ... }
   ```

### Шаг 5: Проверьте Telegram-бот Syntx

После срабатывания расписания проверьте, что в Telegram-бот Syntx пришло сообщение с промптом.

## Возможные проблемы и решения

### Проблема 1: `channelsWithAutoSendFlag: 0` в логах

**Причина:** В БД нет каналов с `autoSendEnabled === true`

**Решение:**
1. Откройте канал в UI
2. Убедитесь, что чекбокс "Включить автоотправку в Syntx" **включён** (не просто виден, а реально checked)
3. Сохраните канал
4. Проверьте debug-эндпоинт снова

### Проблема 2: `channelsWithAutoSendFlag > 0`, но `channelsWithBoth: 0`

**Причина:** У каналов нет расписаний или они не являются массивом

**Решение:**
1. Откройте канал в UI
2. Убедитесь, что добавлено хотя бы одно расписание
3. Убедитесь, что расписание включено (`enabled: true`)
4. Сохраните канал
5. Проверьте debug-эндпоинт - там должны быть `schedulesDetails`

### Проблема 3: Каналы находятся, но расписание не срабатывает

**Причина:** Не совпадает время или день недели

**Решение:**
1. Проверьте логи `processAutoSendTick: TRIGGER candidate`
2. Сравните `nowLocal` и `scheduleTime` - они должны совпадать (или отличаться на ±1 минуту)
3. Проверьте `nowLocalDayOfWeek` и `scheduleDaysOfWeek` - день недели должен быть в списке

### Проблема 4: Разные окружения для cron и API

**Причина:** Cron и API смотрят в разные БД

**Решение:**
1. Проверьте логи `processAutoSendTick: start` - там должно быть `env`
2. Проверьте ответ debug-эндпоинта - там тоже должно быть `env`
3. Убедитесь, что `FIREBASE_PROJECT_ID` совпадает
4. Убедитесь, что используется одна и та же конфигурация Firebase

## Примеры рабочих логов

### Успешное срабатывание:

```
[INFO] processAutoSendTick: start { 
  nowUtc: '2025-01-02T01:57:00.123Z',
  env: { NODE_ENV: 'development', FIREBASE_PROJECT_ID: 'prompt-6a4fd', ENABLE_CRON_SCHEDULER: 'true' }
}
[INFO] getChannelsWithAutoSendEnabled: found users { count: 1 }
[INFO] getChannelsWithAutoSendEnabled: DEBUG statistics {
  totalChannels: 3,
  channelsWithAutoSendFlag: 1,
  channelsWithSchedules: 1,
  channelsWithBoth: 1
}
[INFO] getChannelsWithAutoSendEnabled: DEBUG channels with autoSendEnabled=true {
  count: 1,
  channels: [{
    id: 'abc123',
    name: 'My Channel',
    autoSendEnabled: true,
    autoSendEnabledType: 'boolean',
    schedulesCount: 1,
    schedulesType: 'object',
    schedules: [{
      id: 'schedule-1',
      enabled: true,
      daysOfWeek: [0,1,2,3,4,5,6],
      time: '01:57',
      promptsPerRun: 1
    }]
  }]
}
[INFO] getChannelsWithAutoSendEnabled: found channels with auto-send enabled { 
  count: 1, 
  channelIds: ['abc123'] 
}
[INFO] processAutoSendTick: totalChannels { 
  count: 1, 
  channelIds: ['abc123'],
  channels: [{ id: 'abc123', autoSendEnabled: true, timezone: 'Asia/Almaty', schedulesCount: 1 }]
}
[INFO] processAutoSendTick: checking channel { 
  channelId: 'abc123', 
  timezone: 'Asia/Almaty', 
  schedulesCount: 1 
}
[INFO] processAutoSendTick: TRIGGER candidate {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  nowUtc: '2025-01-02T01:57:00.123Z',
  nowLocal: '01:57',
  nowLocalDayOfWeek: 1,
  scheduleTime: '01:57',
  scheduleDaysOfWeek: [0,1,2,3,4,5,6],
  scheduleEnabled: true,
  timezone: 'Asia/Almaty'
}
[INFO] shouldRunScheduleNow: checking { ... }
[INFO] shouldRunScheduleNow: TRIGGERED { 
  channelId: 'abc123', 
  scheduleId: 'schedule-1', 
  localTime: '01:57', 
  scheduleTime: '01:57' 
}
[INFO] processAutoSendTick: TRIGGERED auto-send {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  nowUtc: '2025-01-02T01:57:00.123Z',
  nowLocal: '01:57'
}
[INFO] processAutoSendTick: TRIGGERED - Running scheduled prompt generation {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  promptsPerRun: 1,
  timezone: 'Asia/Almaty'
}
[INFO] processAutoSendTick: generating and sending prompt {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  promptNumber: 1,
  totalPrompts: 1
}
[INFO] generateAndSendPromptForChannel: start { channelId: 'abc123', userId: 'user123' }
[INFO] Prompt generated { channelId: 'abc123', promptLength: 245 }
[INFO] Prompt sent to Syntx { channelId: 'abc123' }
[INFO] processAutoSendTick: prompt sent successfully {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  promptNumber: 1
}
[INFO] processAutoSendTick: Scheduled prompt generation completed {
  channelId: 'abc123',
  scheduleId: 'schedule-1',
  promptsSent: 1,
  lastRunAt: '2025-01-02T01:57:00.123Z'
}
[INFO] processAutoSendTick: completed {
  totalChannels: 1,
  triggeredSchedules: 1,
  skippedSchedules: 0
}
```

## Основная проблема и решение

**Основная проблема:** 
Firestore может не сохранять `undefined` значения. Если `autoSendEnabled` был `undefined` (а не явно `true` или `false`), он не сохранялся в БД, и cron не мог найти каналы с автоматизацией.

**Решение:**
1. В `channelConverter.toFirestore` явно устанавливаем `autoSendEnabled: channel.autoSendEnabled ?? false`
2. Это гарантирует, что поле всегда сохраняется в Firestore (либо `true`, либо `false`)
3. Добавлена строгая проверка `autoSendEnabled === true` в функции выборки
4. Добавлено детальное логирование для отладки на всех этапах

## Следующие шаги

1. **Перезапустите backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Проверьте debug-эндпоинт:**
   - Убедитесь, что каналы с `autoSendEnabled: true` есть в ответе

3. **Проверьте логи cron:**
   - Должны появиться логи `getChannelsWithAutoSendEnabled: DEBUG statistics`
   - `channelsWithBoth` должно быть > 0, если каналы настроены правильно

4. **Если проблема сохраняется:**
   - Проверьте логи `DEBUG channels with autoSendEnabled=true`
   - Убедитесь, что `autoSendEnabledType: 'boolean'` и `autoSendEnabled: true`
   - Проверьте, что `schedulesCount > 0` и `schedulesType: 'object'`


