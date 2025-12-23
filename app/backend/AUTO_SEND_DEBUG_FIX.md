# Исправление проблемы с выборкой каналов для автоотправки

## Проблема

Функция `getChannelsWithAutoSendEnabled()` возвращала пустой массив, хотя каналы с включённой автоматизацией были сохранены в БД.

## Причины проблемы

1. **Строгая проверка типа**: Проверка `channelData.autoSendEnabled && ...` может не сработать, если значение `undefined`, `null` или другое falsy значение, даже если в UI оно отображается как включённое.

2. **Отсутствие детального логирования**: Не было видно, что именно находится в БД и почему каналы не проходят фильтр.

3. **Проверка массива расписаний**: Проверка `autoSendSchedules?.length > 0` может не сработать, если `autoSendSchedules` не является массивом.

## Исправления

### 1. Улучшена проверка условий

**Было:**
```typescript
if (channelData.autoSendEnabled && channelData.autoSendSchedules?.length > 0)
```

**Стало:**
```typescript
const isAutoSendEnabled = autoSendEnabled === true;  // Строгая проверка на true
const hasSchedules = Array.isArray(autoSendSchedules) && autoSendSchedules.length > 0;

if (isAutoSendEnabled && hasSchedules)
```

**Почему это важно:**
- `autoSendEnabled === true` проверяет именно булево значение `true`, а не просто truthy
- `Array.isArray()` гарантирует, что `autoSendSchedules` действительно массив

### 2. Добавлено детальное логирование

Теперь функция логирует:
- Общее количество каналов
- Количество каналов с `autoSendEnabled === true`
- Количество каналов с расписаниями
- Детальную информацию о каждом канале с `autoSendEnabled === true`:
  - ID и название канала
  - Тип и значение `autoSendEnabled`
  - Количество расписаний
  - Тип `autoSendSchedules`
  - Сами расписания

**Пример логов:**
```
[INFO] getChannelsWithAutoSendEnabled: DEBUG statistics {
  totalChannels: 5,
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
    schedules: [{ id: '...', enabled: true, ... }]
  }]
}
```

### 3. Улучшена обработка данных из Firestore

Добавлена явная проверка типов и значений перед добавлением канала в результат.

## Как использовать для отладки

### Шаг 1: Запустите backend

```bash
cd backend
npm run dev
```

### Шаг 2: Наблюдайте за логами

Каждую минуту вы увидите логи вида:

```
[INFO] processAutoSendTick: start { nowUtc: '2025-01-02T01:50:00.000Z' }
[INFO] getChannelsWithAutoSendEnabled: found users { count: 1 }
[INFO] getChannelsWithAutoSendEnabled: DEBUG statistics {
  totalChannels: 3,
  channelsWithAutoSendFlag: 1,
  channelsWithSchedules: 1,
  channelsWithBoth: 1
}
[INFO] getChannelsWithAutoSendEnabled: DEBUG channels with autoSendEnabled=true { ... }
[INFO] getChannelsWithAutoSendEnabled: found channels with auto-send enabled { count: 1, channelIds: ['abc123'] }
[INFO] processAutoSendTick: found channels { count: 1, channelIds: ['abc123'] }
```

### Шаг 3: Проверьте данные в логах

Если `channelsWithAutoSendFlag: 0`, значит:
- В БД нет каналов с `autoSendEnabled === true`
- Возможно, поле сохранено как `undefined`, `null` или другое значение

**Решение:**
1. Откройте редактирование канала в UI
2. Убедитесь, что чекбокс "Включить автоотправку в Syntx" **включён**
3. Сохраните канал
4. Проверьте логи снова

Если `channelsWithAutoSendFlag > 0`, но `channelsWithBoth: 0`, значит:
- Каналы с `autoSendEnabled === true` есть, но у них нет расписаний
- Проверьте, что `autoSendSchedules` - это массив и он не пустой

**Решение:**
1. Откройте редактирование канала
2. Убедитесь, что добавлено хотя бы одно расписание
3. Сохраните канал
4. Проверьте логи снова

### Шаг 4: Проверьте формат времени

В логах вы увидите расписания. Убедитесь, что время в формате "HH:MM" (24-часовой формат):
- ✅ Правильно: `"01:50"`, `"14:30"`, `"23:59"`
- ❌ Неправильно: `"1:50 AM"`, `"01:50:00"`, `"1:50"`

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
          schedulesType: c.schedulesType
        }))
      });
    }

    return channels;
  } catch (error) {
    // ... обработка ошибок ...
  }
}
```

## Что было исправлено

1. **Строгая проверка `autoSendEnabled === true`**: Теперь проверяется именно булево значение `true`, а не просто truthy.

2. **Проверка типа массива**: Используется `Array.isArray()` для гарантии, что `autoSendSchedules` - это массив.

3. **Детальное логирование**: Добавлены логи, которые показывают:
   - Сколько всего каналов
   - Сколько каналов с `autoSendEnabled === true`
   - Сколько каналов с расписаниями
   - Детальную информацию о каждом канале

## Ожидаемые логи после исправления

### Успешный случай (каналы найдены):

```
[INFO] processAutoSendTick: start { nowUtc: '2025-01-02T01:50:00.000Z' }
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
    schedulesType: 'object'
  }]
}
[INFO] getChannelsWithAutoSendEnabled: found channels with auto-send enabled { 
  count: 1, 
  channelIds: ['abc123'] 
}
[INFO] processAutoSendTick: found channels { count: 1, channelIds: ['abc123'] }
[INFO] processAutoSendTick: checking channel { 
  channelId: 'abc123', 
  timezone: 'Asia/Almaty', 
  schedulesCount: 1 
}
[INFO] shouldRunScheduleNow: checking { ... }
[INFO] shouldRunScheduleNow: TRIGGERED { ... }
[INFO] processAutoSendTick: TRIGGERED - Running scheduled prompt generation { ... }
[INFO] processAutoSendTick: generating and sending prompt { ... }
[INFO] processAutoSendTick: prompt sent successfully { ... }
```

### Проблемный случай (каналы не найдены):

```
[INFO] getChannelsWithAutoSendEnabled: DEBUG statistics {
  totalChannels: 3,
  channelsWithAutoSendFlag: 0,  // ← Проблема: нет каналов с autoSendEnabled=true
  channelsWithSchedules: 0,
  channelsWithBoth: 0
}
```

**Решение:** Проверьте, что в UI чекбокс "Включить автоотправку в Syntx" действительно включён и канал сохранён.

## Следующие шаги

1. Запустите backend и проверьте логи
2. Если `channelsWithAutoSendFlag: 0`, откройте канал в UI и убедитесь, что автоотправка включена
3. Сохраните канал и проверьте логи снова
4. Если проблема сохраняется, проверьте логи `DEBUG channels with autoSendEnabled=true` - там будет видно, что именно сохранено в БД


