# Отчет об исправлении проблемы с именами файлов видео

## Проблема

При включенной автоматизации на части каналов видео сохранялись с правильным именем вида `video_<shortId>.mp4` (например: `video_76sgbi.mp4`), а на части каналов — с неправильным "title-based slug" именем (длинные английские слова с подчёркиваниями, например: `fierce_showdown_between_jaguar_caiman_...mp4`).

## Причина проблемы

Проблема была в том, что в разных местах кода использовались разные подходы к генерации имени файла:

1. **`buildVideoBaseName()`** в `videoFilename.ts` — использовал title/prompt для генерации имени файла через OpenAI или извлечение ключевых слов
2. **`generateUniqueVideoFileName()`** в `fileUtils.ts` — также использовал title для имени файла
3. **`generateVideoFileName()`** в `fileUtils.ts` — создавал имена на основе title/prompt

Для автоматизации (inbox-monitor → autopublish) это приводило к тому, что файлы получали длинные имена на основе промпта/сцены, а не единый формат `video_<shortId>.mp4`.

## Решение

### 1. Создана единая функция `generateVideoFilename()`

**Файл:** `backend/src/utils/videoFilename.ts`

```typescript
export async function generateVideoFilename(params: {
  source: string;
  channelId: string;
  userId: string;
  targetDir: string;
}): Promise<string>
```

**Функционал:**
- Всегда возвращает формат `video_<shortId>.mp4`
- Генерирует короткий стабильный ID (6 символов [a-z0-9])
- Обрабатывает коллизии через `_2`, `_3` и т.д.
- Детальное логирование всех операций

### 2. Добавлена функция нормализации входящих файлов

**Функции:**
- `isTitleBasedFilename(fileName: string): boolean` — проверяет, является ли имя файла title-based
- `normalizeIncomingFilename(...)` — переименовывает файл из title-based имени в `video_<shortId>.mp4`

### 3. Исправлены места использования

#### `videoDownloadService.ts`
- **Для автоматизации (mode === "auto")**: использует строго `generateVideoFilename()` → `video_<shortId>.mp4`
- **Для ручного режима (mode === "manual")**: продолжает использовать `buildVideoBaseName()` для title-based имен

#### `telegramRoutes.ts` (fetchAndSaveToServer)
- Использует `generateVideoFilename()` для единого формата

#### `blottataLocalMonitor.ts`
- Добавлена проверка входящих файлов на title-based имена
- Автоматическая нормализация при обнаружении "плохих" имен
- Детальное логирование процесса нормализации

### 4. Добавлено детальное логирование

Все операции логируются с метками:
- `[FILENAME]` — генерация имени файла
- `[FILENAME][WARN]` — обнаружение title-based имени
- Детальная информация: source, channelId, userId, requestedName, finalName, reason

### 5. Добавлены тесты

**Файл:** `backend/src/utils/__tests__/videoFilename.test.ts`

Тесты покрывают:
- Генерацию `video_<shortId>.mp4` формата
- Обработку коллизий
- Определение title-based имен
- Нормализацию входящих файлов

## Измененные файлы

1. `backend/src/utils/videoFilename.ts`
   - Добавлена функция `generateVideoFilename()`
   - Добавлена функция `isTitleBasedFilename()`
   - Добавлена функция `normalizeIncomingFilename()`
   - Добавлена функция `generateShortId()`

2. `backend/src/services/videoDownloadService.ts`
   - Исправлена логика генерации имени файла для автоматизации
   - Разделение логики для `auto` и `manual` режимов

3. `backend/src/routes/telegramRoutes.ts`
   - Исправлен `fetchAndSaveToServer` для использования единого формата

4. `backend/src/services/blottataLocalMonitor.ts`
   - Добавлена проверка и нормализация входящих файлов

5. `backend/src/utils/__tests__/videoFilename.test.ts`
   - Добавлены тесты для новых функций

## Ключевые изменения в коде

### До исправления:

```typescript
// videoDownloadService.ts (auto режим)
const nameResult = await buildVideoBaseName({
  promptText: prompt || null,
  uiTitle: videoTitle || effectiveTitle || null,
  channelName: channelData.name || null
});
const fileBaseName = await resolveCollision(inboxDir, nameResult.baseName, ".mp4");
// Результат: "fierce_showdown_between_jaguar_caiman.mp4" (title-based)
```

### После исправления:

```typescript
// videoDownloadService.ts (auto режим)
if (mode === "auto") {
  const { generateVideoFilename } = await import("../utils/videoFilename");
  const fullFileName = await generateVideoFilename({
    source: "videoDownloadService_auto",
    channelId,
    userId,
    targetDir: inboxDir
  });
  const fileBaseName = fullFileName.replace(/\.mp4$/i, '');
  // Результат: "video_76sgbi.mp4" (единый формат)
}
```

## Примеры логов

### До исправления:
```
[VIDEO_FILENAME] using fallback from prompt
baseName: "fierce_showdown_between_jaguar_caiman"
```

### После исправления:
```
[FILENAME] Generated video filename for automation
source: "videoDownloadService_auto"
channelId: "abc123"
userId: "user456"
requestedName: "video_76sgbi"
finalName: "video_76sgbi.mp4"
reason: "standard"
shortId: "76sgbi"
collisionDetected: false
```

### При обнаружении title-based имени:
```
[FILENAME][WARN] Title-based filename detected, normalizing
source: "inbox_monitor"
channelId: "abc123"
userId: "user456"
oldFileName: "fierce_showdown_between_jaguar_caiman.mp4"

[FILENAME] File normalized successfully
oldFileName: "fierce_showdown_between_jaguar_caiman.mp4"
newFileName: "video_76sgbi.mp4"
```

## Почему на части каналов было иначе

Проблема возникала из-за того, что:

1. **Разные пути сохранения файлов:**
   - Некоторые каналы использовали `videoDownloadService.ts` с `mode === "auto"`, который вызывал `buildVideoBaseName()` с промптом
   - Другие каналы могли использовать прямой путь через `telegramRoutes.ts` или другие сервисы

2. **Разные источники данных:**
   - Если промпт был длинным и содержал описательные слова, `buildVideoBaseName()` извлекал из него ключевые слова и создавал длинное имя
   - Если промпт был коротким или отсутствовал, использовался fallback с коротким ID

3. **Отсутствие единого контракта:**
   - Не было единой функции, которая гарантировала бы формат `video_<shortId>.mp4` для автоматизации
   - Каждый сервис использовал свою логику генерации имени

## Результат

Теперь **ВСЕ каналы** с включенной автоматизацией (inbox-monitor → autopublish) будут сохранять видео строго в формате `video_<shortId>.mp4`:

- ✅ Единый формат для всех каналов
- ✅ Автоматическая нормализация существующих файлов с "плохими" именами
- ✅ Детальное логирование для диагностики
- ✅ Обратная совместимость: ручной режим продолжает использовать title-based имена
- ✅ Тесты покрывают все сценарии

## Дополнительные улучшения

1. **Нормализация входящих файлов:** Если файл уже попал в inbox с "плохим" именем, он автоматически переименовывается при обработке
2. **Логирование:** Все операции логируются с детальной информацией для диагностики проблем по каналам
3. **Тесты:** Полное покрытие тестами всех новых функций


