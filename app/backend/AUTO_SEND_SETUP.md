# Настройка автоотправки промптов в Syntx

## Описание

Система автоматической генерации и отправки промптов в Syntx-бот по расписанию. Промпты генерируются так же, как при нажатии кнопки "ИИ-идея", и отправляются в Syntx-бот так же, как при нажатии "Отправить в Syntx бот".

## Как это работает

1. **Настройка расписания** (Frontend):
   - Откройте страницу редактирования канала
   - Включите "Автоотправку в Syntx"
   - Выберите временную зону
   - Добавьте одно или несколько расписаний:
     - Дни недели (Пн-Вс)
     - Время (HH:MM)
     - Количество промптов за запуск (1-10)

2. **Планировщик** (Backend):
   - Каждую минуту проверяет все каналы с включённой автоотправкой
   - Для каждого расписания проверяет:
     - Включено ли расписание
     - Совпадает ли текущий день недели
     - Совпадает ли текущее время (с точностью до минуты)
     - Не был ли уже запуск сегодня в это время
   - Если все условия выполнены:
     - Генерирует N промптов (где N = `promptsPerRun`)
     - Отправляет каждый промпт в Syntx-бот
     - Отмечает расписание как выполненное

## Запуск планировщика

### Локально (для разработки)

Планировщик запускается автоматически при старте backend-сервера (если `ENABLE_CRON_SCHEDULER !== "false"`):

```bash
cd backend
npm run dev
```

Планировщик будет проверять расписание каждую минуту.

### В продакшене (Cloud Run / Cloud Scheduler)

Для Cloud Run используйте HTTP-эндпоинт `/api/cron/manual-tick`:

1. Настройте Cloud Scheduler для вызова эндпоинта каждую минуту:
   - URL: `https://your-backend-url/api/cron/manual-tick`
   - Метод: POST
   - Headers: `x-cron-secret: YOUR_CRON_SECRET`
   - Расписание: `* * * * *` (каждую минуту)

2. Установите переменную окружения:
   ```
   ENABLE_CRON_SCHEDULER=false
   ```

3. Установите `CRON_SECRET` в `.env`:
   ```
   CRON_SECRET=your-secret-token-here
   ```

## Переменные окружения

- `ENABLE_CRON_SCHEDULER` - включить/выключить встроенный планировщик (по умолчанию `true`)
- `CRON_SECRET` - секретный токен для защиты HTTP-эндпоинта `/api/cron/manual-tick`

## API Endpoints

### POST /api/cron/manual-tick

Ручной запуск планировщика (для Cloud Scheduler).

**Headers:**
- `x-cron-secret`: секретный токен (должен совпадать с `CRON_SECRET`)

**Response:**
```json
{
  "success": true,
  "message": "Auto-send tick completed"
}
```

## Структура данных

### ChannelAutoSendSchedule

```typescript
{
  id: string;              // UUID
  enabled: boolean;        // включен ли этот слот
  daysOfWeek: number[];    // 0–6 (вс, пн, вт, ...)
  time: string;            // "HH:MM" (24h формат)
  promptsPerRun: number;   // сколько промптов за запуск (1-10)
  lastRunAt?: string;      // ISO-дата последнего запуска
}
```

### Channel (новые поля)

```typescript
{
  // ... существующие поля
  autoSendEnabled?: boolean;              // общий флаг
  timezone?: string;                      // IANA-таймзона (например "Asia/Almaty")
  autoSendSchedules?: ChannelAutoSendSchedule[];
}
```

## Логирование

Все действия планировщика логируются:
- `processAutoSendTick: start` - начало проверки
- `Found channels with auto-send enabled` - найдено каналов
- `Running scheduled prompt generation` - запуск генерации
- `Scheduled prompt generation completed` - завершение
- `Failed to process scheduled prompt generation` - ошибка

## Обработка ошибок

- Ошибки одного канала не останавливают обработку других каналов
- Ошибки логируются, но не пробрасываются дальше
- Планировщик продолжает работать даже при ошибках

## Тестирование

1. Настройте канал с автоотправкой:
   - Включите автоотправку
   - Добавьте расписание на текущий день и время (через 1-2 минуты)
   - Установите `promptsPerRun: 1`

2. Запустите backend:
   ```bash
   cd backend
   npm run dev
   ```

3. Подождите наступления времени расписания

4. Проверьте:
   - Логи backend (должны быть сообщения о генерации и отправке)
   - Telegram-бот Syntx (должно прийти сообщение с промптом)

## Troubleshooting

**Промпты не генерируются:**
- Проверьте, что `autoSendEnabled: true` в настройках канала
- Проверьте, что расписание включено (`enabled: true`)
- Проверьте, что день недели и время совпадают
- Проверьте логи backend на наличие ошибок

**Ошибка "Firestore is not available":**
- Проверьте настройки Firebase Admin в `.env`
- Убедитесь, что `FIREBASE_SERVICE_ACCOUNT` или отдельные переменные установлены

**Ошибка "OpenAI API ключ не настроен":**
- Установите `OPENAI_API_KEY` в `.env`

**Ошибка "TELEGRAM_SESSION_NOT_INITIALIZED":**
- Запустите `npm run dev:login` для инициализации Telegram-сессии


