# ОТЧЁТ: Анализ проблемы скачивания видео из SynTX через Telegram

## КОНТЕКСТ ПРОБЛЕМЫ

- Backend запущен в Docker на Synology
- Видео раньше скачивались из SynTX, сейчас перестали после обновления
- Ошибок в backend почти нет, но видео не сохраняются
- В Telegram-сообщении НЕТ прямой mp4 ссылки
- Реальная mp4 появляется ТОЛЬКО в веб-плеере (модальном окне)
- В браузере mp4 грузится с домена: `https://r2.syntx.ai/veo3/2025/12/22/XXXXX.mp4`
- Этот mp4 успешно открывается напрямую в браузере (206 Partial Content)

## РЕАЛИЗОВАННЫЕ ИЗМЕНЕНИЯ

### ШАГ 1: Детальное логирование Telegram Updates ✅

**Файл:** `backend/src/utils/telegramDownload.ts`

Добавлено подробное логирование ВСЕГО входящего Telegram update:

1. **Для каждого сообщения логируется:**
   - `messageId` - ID сообщения
   - `date` - Дата сообщения
   - `messageText` - Текст сообщения (первые 500 символов, токены замаскированы)
   - `caption` - Подпись (если есть)
   - `entities` - Массив entities (MessageEntityUrl, MessageEntityTextUrl и т.д.)
   - `captionEntities` - Entities в подписи
   - `replyMarkup` - Кнопки (inline_keyboard)
   - `media`, `video`, `document`, `photo` - Медиа-вложения

2. **Извлечение всех URL:**
   - URL из текста сообщения (regex: `https?://[^\s"']+`)
   - URL из caption
   - URL из entities (MessageEntityUrl, MessageEntityTextUrl)
   - URL из reply_markup (KeyboardButtonUrl)

3. **Критический вывод:**
   - `hasR2SyntxUrl` - Есть ли URL на r2.syntx.ai
   - `hasGetVideoUrl` - Есть ли URL на getvideo
   - `hasMp4Url` - Есть ли прямой .mp4 URL
   - `hasAnyVideoUrl` - Есть ли хоть один URL, связанный с видео
   - `conclusion` - Вывод: "✅ URL НАЙДЕН" или "❌ URL НЕТ"

**Пример лога:**
```json
{
  "message": "[TELEGRAM_UPDATE_ANALYSIS] Message #1/50",
  "messageId": 12345,
  "textUrls": ["https://example.com"],
  "allUrls": ["https://example.com"],
  "hasR2SyntxUrl": false,
  "hasGetVideoUrl": false,
  "hasMp4Url": false,
  "conclusion": "❌ URL НЕТ В TELEGRAM UPDATE"
}
```

### ШАГ 2: Если URL найден - парсинг и скачивание ✅

**Файл:** `backend/src/utils/telegramDownload.ts`

Если URL найден в Telegram update:
1. Проверяется тип URL (r2.syntx.ai, getvideo, прямой mp4)
2. Если это прямой mp4 (r2.syntx.ai) - скачивается сразу через `downloadVideoFromUrl`
3. Если это getvideo URL - парсится HTML через `extractVideoUrlFromGetVideoPage`
4. Все действия логируются с маскированием токенов

### ШАГ 3: Если URL НЕТ - фиксация вывода ✅

**Файл:** `backend/src/utils/telegramDownload.ts`

Если URL НЕ найден в Telegram update:
- Логируется вывод: "❌ URL НЕТ В TELEGRAM UPDATE - Telegram не содержит данных для скачивания видео"
- Это доказывает, что текущая архитектура скачивания из Telegram НЕРАБОТОСПОСОБНА

### ШАГ 4: Новая архитектура - прямой импорт MP4 ✅

**Файл:** `backend/src/routes/telegramRoutes.ts`

Создан новый эндпоинт: **POST `/api/telegram/importVideo`**

**Запрос:**
```json
{
  "channelId": "channel_123",
  "videoUrl": "https://r2.syntx.ai/veo3/2025/12/22/XXXXX.mp4"
}
```

**Логика работы:**
1. Валидация `channelId` и `videoUrl`
2. Проверка доступа к каналу в Firestore
3. **HEAD запрос** к videoUrl:
   - Проверка доступности
   - Проверка Content-Type (должен быть video/mp4 или octet-stream)
   - Проверка размера файла
   - Проверка поддержки Range (206 Partial Content)
4. **Скачивание** через `downloadFromUrl`:
   - Поддержка 206 Partial Content
   - Стриминг для больших файлов
   - Ретраи при ошибках
5. **Сохранение** в локальное хранилище:
   - Путь: `STORAGE_ROOT/{userSlug}/{channelSlug}/{fileName}`
   - Генерация безопасного имени файла
6. **Сохранение метаданных** в Firestore:
   - `localFilePath`
   - `sourceUrl`
   - `fileSize`
   - `contentType`

**Ответ:**
```json
{
  "status": "ok",
  "success": true,
  "channelId": "channel_123",
  "storage": {
    "filePath": "/storage/videos/user/channel/file.mp4",
    "fileName": "file.mp4"
  },
  "fileSize": 12345678,
  "sourceUrl": "https://r2.syntx.ai/..."
}
```

### ШАГ 5: Скачивание MP4 с поддержкой 206 Partial Content ✅

**Файл:** `backend/src/services/urlDownloader.ts`

Функция `downloadFromUrl` уже поддерживает:
- HEAD запрос для проверки
- Поддержку 206 Partial Content (Range requests)
- Стриминг для больших файлов
- Ретраи при ошибках
- Логирование прогресса

## КАК ИСПОЛЬЗОВАТЬ

### Вариант 1: Веб UI (Shorts AI Studio)

1. Откройте DevTools → Network
2. Найдите запрос к `r2.syntx.ai/*.mp4` в списке запросов
3. Скопируйте URL из Network tab
4. Отправьте POST запрос на `/api/telegram/importVideo`:

```javascript
fetch('/api/telegram/importVideo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channelId: 'your_channel_id',
    videoUrl: 'https://r2.syntx.ai/veo3/2025/12/22/XXXXX.mp4'
  })
})
```

### Вариант 2: Проверка логов

После следующего запроса на скачивание видео из Telegram, проверьте логи:

1. Найдите `[TELEGRAM_UPDATE_ANALYSIS]` - это детальный анализ всех сообщений
2. Найдите `[TELEGRAM_UPDATE_ANALYSIS] КРИТИЧЕСКИЙ ВЫВОД` - это финальный вывод
3. Если `hasAnyVideoUrl: false` - значит URL действительно нет в Telegram update

## ВЫВОДЫ

### Если URL НЕТ в Telegram update:

1. **Текущая архитектура НЕРАБОТОСПОСОБНА** - Telegram не содержит данных для скачивания
2. **Решение:** Использовать новый эндпоинт `/api/telegram/importVideo` с прямой mp4 ссылкой
3. **Telegram остаётся только триггером** - для уведомления о готовности видео

### Если URL ЕСТЬ в Telegram update:

1. Текущий код должен работать
2. Проверить логи парсинга URL
3. Проверить логи скачивания

## СЛЕДУЮЩИЕ ШАГИ

1. **Запустить backend** и проверить логи при следующем запросе на скачивание
2. **Проверить вывод** `[TELEGRAM_UPDATE_ANALYSIS] КРИТИЧЕСКИЙ ВЫВОД`
3. **Если URL нет:**
   - Интегрировать `/api/telegram/importVideo` в веб UI
   - Добавить кнопку "Импортировать по URL" в интерфейс
4. **Если URL есть:**
   - Проверить логи парсинга
   - Исправить парсер, если нужно

## ЛОГИ ДЛЯ ПРОВЕРКИ

После запуска backend, при следующем запросе на скачивание видео, ищите в логах:

1. `[TELEGRAM_UPDATE_ANALYSIS]` - детальный анализ каждого сообщения
2. `[TELEGRAM_UPDATE_ANALYSIS] КРИТИЧЕСКИЙ ВЫВОД` - финальный вывод о наличии URL
3. `importVideo: REQUEST RECEIVED` - если используется новый эндпоинт
4. `importVideo: SUCCESS` - если видео успешно импортировано

## ТЕХНИЧЕСКИЕ ДЕТАЛИ

- Все URL в логах маскируются (токены заменяются на `***`)
- Поддержка 206 Partial Content для больших файлов
- Таймауты: 10 секунд для HEAD, 5 минут для GET
- Максимальный размер файла: 500 MB (настраивается через env)
- Ретраи: 3 попытки с экспоненциальной задержкой


