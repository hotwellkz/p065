# Генерация Title и Description для YouTube

## Обзор

Единый сервис для генерации заголовков и описаний YouTube-роликов с учетом языка канала.

## Основная функция

`generateYoutubeTitleAndDescription(fileName: string, channel?: Channel): Promise<{ title: string; description: string }>`

### Параметры

- `fileName` - Название видеофайла (используется как контекст для генерации)
- `channel` - Объект канала с настройками, **обязательно** должно быть поле `language`

### Возвращает

- `title` - Заголовок для YouTube (до 55 символов для безопасной публикации)
- `description` - Описание для YouTube (до 70 символов)

## Поддерживаемые языки

- `ru` - Русский
- `en` - English
- `kk` - Қазақша (Казахский)

## Логика работы

1. **Определение языка**: Извлекается `channel.language`
   - Если язык не указан или неизвестен → используется дефолтный `ru` с предупреждением в логах

2. **Выбор промпта**: В зависимости от языка выбирается соответствующий промпт:
   - Промпт полностью на нужном языке
   - Явно указано, что результат должен быть на этом языке
   - Нет смешивания языков в инструкциях

3. **Генерация**: Вызывается OpenAI API с выбранным промптом

4. **Fallback**: При ошибке используется имя файла или дефолтное значение на нужном языке

## Использование

```typescript
import { generateYoutubeTitleAndDescription } from "./youtubeTitleDescriptionGenerator";

const channel = {
  id: "channel123",
  name: "My Channel",
  language: "en" // или "ru", "kk"
  // ... другие настройки
};

const { title, description } = await generateYoutubeTitleAndDescription(
  "my_video_file.mp4",
  channel
);

// title и description будут на английском, если channel.language === "en"
```

## Где используется

- `blottataFileProcessor.ts` - Обработка файлов для публикации через Blottata
- Все места, где нужно сгенерировать title/description для YouTube

## Тестирование

Используйте endpoint: `POST /api/channels/:id/test-youtube-title-description`

Body:
```json
{
  "fileName": "test_video.mp4"
}
```

Ответ:
```json
{
  "success": true,
  "channel": {
    "id": "...",
    "name": "...",
    "language": "en"
  },
  "result": {
    "title": "...",
    "description": "...",
    "titleLength": 45,
    "descriptionLength": 67
  }
}
```

## Важные замечания

- **Язык всегда берется из `channel.language`**
- Если язык не указан, используется `ru` с предупреждением
- Промпты для каждого языка полностью на этом языке
- Fallback значения также на соответствующем языке

