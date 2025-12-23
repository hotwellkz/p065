# Исправление: Использование Collection Group Query для поиска каналов

## Проблема

Backend не находил каналы с автоматизацией, потому что искал пользователей в коллекции `users`, которая пустая. Пользователи используют Firebase Authentication, а не хранятся в Firestore.

## Решение

Использован **Collection Group Query** для поиска всех каналов напрямую, независимо от пути.

### Что изменилось

**Было:**
```typescript
// Искали пользователей в коллекции "users" (которая пустая)
const usersSnapshot = await db.collection("users").get();
for (const userDoc of usersSnapshot.docs) {
  const channelsSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("channels")
    .get();
  // ...
}
```

**Стало:**
```typescript
// Используем Collection Group Query для поиска всех каналов
const allChannelsSnapshot = await db.collectionGroup("channels").get();
for (const channelDoc of allChannelsSnapshot.docs) {
  // Извлекаем userId из пути документа
  const pathParts = channelDoc.ref.path.split("/");
  const userId = pathParts[pathParts.indexOf("users") + 1];
  // ...
}
```

### Преимущества

1. **Не зависит от коллекции "users"** - работает даже если пользователи не хранятся в Firestore
2. **Более эффективно** - один запрос вместо N+1 запросов (один для пользователей + N для каналов каждого пользователя)
3. **Находит все каналы** - независимо от структуры путей

### Структура данных

Каналы хранятся в Firestore по пути:
```
users/{userId}/channels/{channelId}
```

Collection Group Query ищет все документы в коллекции `channels` независимо от пути, поэтому находит:
- `users/user1/channels/channel1`
- `users/user2/channels/channel2`
- и т.д.

### Требования

Для работы Collection Group Query в Firestore должен быть создан индекс. Обычно он создаётся автоматически при первом запросе, но если возникнет ошибка, нужно:

1. Открыть Firebase Console → Firestore Database → Indexes
2. Создать индекс для collection group `channels`
3. Дождаться завершения создания индекса

### Проверка

После исправления запустите:

```bash
cd backend
node check-firestore-access.js
```

Должно показать:
```
✅ Успешно! Найдено каналов: X
✅ Каналы с autoSendEnabled=true: Y
```

### Логи

Теперь в логах cron будет:
```
[INFO] getChannelsWithAutoSendEnabled: using collection group query for 'channels'
[INFO] getChannelsWithAutoSendEnabled: collection group query successful { size: X }
[INFO] getChannelsWithAutoSendEnabled: found channels { count: X }
```

Вместо:
```
[WARN] getChannelsWithAutoSendEnabled: WARNING - no users found in Firestore
```


