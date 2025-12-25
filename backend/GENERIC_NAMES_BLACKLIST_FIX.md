# Исправление логики blacklist "слишком общих имён"

## Проблема

Логика `isTooGenericName()` ошибочно считала бренды (postroimdom, hotwell, sipdelux) "слишком общими", из-за чего часть каналов уходила в fallback и получала неправильные длинные filename (title/prompt slug).

**Старая логика:**
```typescript
const GENERIC_NAMES_BLACKLIST = ["postroimdom", "hotwell", "sipdelux", "video", "shorts", ...];
isTooGenericName(name) -> lower.includes(generic) || generic.includes(lower)
```

**Проблема:** Использование `includes()` по подстроке давало ложные срабатывания. Например:
- `"hotwell"` считался generic
- `"postroimdom_stroika"` считался generic (т.к. содержит "postroimdom")
- Бренды не отличались от действительно generic слов

## Решение

### 1. Разделение на категории

```typescript
// A) STOP/GENERIC слова - действительно мусор
const GENERIC_STOP_WORDS = ["video", "shorts", "clip", "rolik", "film", "movie"];

// B) BRAND слова - бренды/компании, НЕ считаются generic
const BRAND_WORDS = ["postroimdom", "postroimdomkz", "hotwell", "sipdelux", "kz"];
```

### 2. Токенизация вместо includes

**Новая функция `tokenizeName()`:**
- Разбивает имя на отдельные слова (токены)
- Разделители: подчёркивания, дефисы, пробелы
- Очищает токены от не-буквенно-цифровых символов

**Новая логика `isTooGenericName()`:**
- Проверяет только по `GENERIC_STOP_WORDS` (не по брендам)
- Использует токенизацию для точного сравнения
- Если ВСЕ токены в `GENERIC_STOP_WORDS` и токенов <= 2 => generic
- Если есть хотя бы один бренд-токен => НЕ generic
- Если есть хотя бы один токен не из blacklist => НЕ generic

### 3. Правило минимальной информативности

- Если baseName слишком короткий/пустой или состоит только из generic токенов => fallback
- **НО:** если там есть брендовый токен — это уже НЕ generic

### 4. Улучшенное логирование

Все операции логируются с меткой `[BASENAME]`:
- `source=<uiTitle/openai/fallback>`
- `rawTitle=...`
- `baseName=...`
- `tokens=[...]` - разбиение на токены
- `genericTokens=[...]` - какие generic токены найдены
- `brandTokens=[...]` - какие бренд-токены найдены
- `reason=...` - причина выбора/отклонения

## Изменённые файлы

### 1. `backend/src/utils/videoFilename.ts`

**Ключевые изменения:**

1. **Разделение blacklist:**
```typescript
// ДО:
const GENERIC_NAMES_BLACKLIST = ["postroimdom", "hotwell", "sipdelux", "video", ...];

// ПОСЛЕ:
const GENERIC_STOP_WORDS = ["video", "shorts", "clip", "rolik", "film", "movie"];
const BRAND_WORDS = ["postroimdom", "postroimdomkz", "hotwell", "sipdelux", "kz"];
```

2. **Новая функция токенизации:**
```typescript
function tokenizeName(name: string): string[] {
  const normalized = name.toLowerCase().replace(/[-_]+/g, " ");
  const tokens = normalized.split(/\s+/).filter(token => token.length > 0);
  return tokens.map(token => token.replace(/[^a-z0-9]/g, "")).filter(token => token.length > 0);
}
```

3. **Исправленная `isTooGenericName()`:**
```typescript
export function isTooGenericName(name: string): boolean {
  const tokens = tokenizeName(name);
  
  // Если только 1 токен и он в GENERIC_STOP_WORDS => generic
  if (tokens.length === 1) {
    return GENERIC_STOP_WORDS.includes(tokens[0]);
  }
  
  // Если есть хотя бы один бренд-токен => НЕ generic
  const hasBrandToken = tokens.some(token => BRAND_WORDS.includes(token));
  if (hasBrandToken) {
    return false;
  }
  
  // Если все токены в GENERIC_STOP_WORDS => generic
  const allGeneric = tokens.every(token => GENERIC_STOP_WORDS.includes(token));
  if (allGeneric) {
    return true;
  }
  
  // Если есть хотя бы один токен не из blacklist => НЕ generic
  return false;
}
```

4. **Обновлённое логирование в `buildVideoBaseName()`:**
- Добавлена токенизация и анализ токенов
- Логирование generic/brand токенов
- Детальные reason для каждого случая

5. **Исправлена `ensureNonGeneric()`:**
- Теперь проверяет наличие бренд-токенов
- Если есть бренд, не добавляет дополнительные слова

6. **Исправлена `fallbackNameFromPrompt()`:**
- Учитывает бренд-токены при проверке generic
- Если есть бренд, использует как есть (даже если короткое)

### 2. `backend/src/utils/__tests__/videoFilename.test.ts`

**Обновлённые тесты:**

```typescript
describe("isTooGenericName", () => {
  // STOP/GENERIC слова - должны быть generic
  it("should detect generic stop words", () => {
    expect(isTooGenericName("video")).toBe(true);
    expect(isTooGenericName("shorts")).toBe(true);
  });

  // BRAND слова - НЕ должны быть generic
  it("should NOT detect brand words as generic", () => {
    expect(isTooGenericName("hotwell")).toBe(false);
    expect(isTooGenericName("postroimdom")).toBe(false);
    expect(isTooGenericName("sipdelux_kz")).toBe(false);
  });

  // Комбинации с брендами - НЕ generic
  it("should NOT detect names with brand tokens as generic", () => {
    expect(isTooGenericName("video_hotwell")).toBe(false); // есть бренд
    expect(isTooGenericName("hotwell_stroika")).toBe(false); // есть бренд + смысловое слово
  });

  // Только generic слова - generic
  it("should detect names with only generic tokens as generic", () => {
    expect(isTooGenericName("video_shorts")).toBe(true); // оба generic
  });
});
```

## Ключевые диффы

### До исправления:

```typescript
// Проблема: includes() по подстроке
isTooGenericName("hotwell") -> true ❌
isTooGenericName("postroimdom_stroika") -> true ❌
isTooGenericName("video_hotwell") -> true ❌ (ложное срабатывание)
```

### После исправления:

```typescript
// Токенизация + проверка по категориям
isTooGenericName("hotwell") -> false ✅
isTooGenericName("postroimdom_stroika") -> false ✅
isTooGenericName("video_hotwell") -> false ✅ (есть бренд-токен)
isTooGenericName("video_shorts") -> true ✅ (оба generic)
```

## Почему раньше названия прыгали в fallback

1. **Ложные срабатывания blacklist:**
   - Бренды (hotwell, postroimdom) считались generic
   - `isTooGenericName("hotwell")` возвращал `true`
   - `buildVideoBaseName()` отклонял uiTitle/openai title
   - Уходил в fallback → длинные имена из промпта

2. **Сверхжёсткое условие `generic.includes(lower)`:**
   - Даже если имя содержало бренд + смысловые слова, проверка `generic.includes(lower)` могла сработать
   - Например: `"hotwell_stroika"` → `lower = "hotwellstroika"` → `"hotwell".includes("hotwellstroika")` = false, но `"hotwellstroika".includes("hotwell")` = true

3. **Отсутствие токенизации:**
   - Проверка шла по всей строке, а не по отдельным словам
   - Нельзя было различить "video_hotwell" (бренд) от "video_shorts" (оба generic)

## Почему теперь будет стабильно

1. **Разделение на категории:**
   - Бренды отделены от generic слов
   - Бренды НЕ считаются generic

2. **Токенизация:**
   - Точное сравнение по словам, а не по подстрокам
   - Можно различить "video_hotwell" (бренд) от "video_shorts" (оба generic)

3. **Правило минимальной информативности:**
   - Если есть бренд-токен → НЕ generic (даже если короткое)
   - Если есть смысловые слова → НЕ generic

4. **Улучшенное логирование:**
   - Видно какие токены сработали
   - Легче диагностировать проблемы

## Примеры работы

### Пример 1: Бренд-название
```typescript
uiTitle: "HotWell СИП панели"
→ sanitized: "hotwell_sip_paneli"
→ tokens: ["hotwell", "sip", "paneli"]
→ brandTokens: ["hotwell"]
→ isGeneric: false ✅
→ Используется как есть
```

### Пример 2: Generic название
```typescript
uiTitle: "video shorts"
→ sanitized: "video_shorts"
→ tokens: ["video", "shorts"]
→ genericTokens: ["video", "shorts"]
→ brandTokens: []
→ isGeneric: true
→ Уходит в fallback
```

### Пример 3: Бренд + смысловые слова
```typescript
uiTitle: "PostroimDom строительство"
→ sanitized: "postroimdom_stroitelstvo"
→ tokens: ["postroimdom", "stroitelstvo"]
→ brandTokens: ["postroimdom"]
→ isGeneric: false ✅
→ Используется как есть
```

## Тесты

Все тесты проходят:
- ✅ `isTooGenericName("video") == true`
- ✅ `isTooGenericName("shorts") == true`
- ✅ `isTooGenericName("hotwell") == false`
- ✅ `isTooGenericName("postroimdom") == false`
- ✅ `isTooGenericName("sipdelux_kz") == false`
- ✅ `isTooGenericName("video_hotwell") == false` (т.к. есть бренд)
- ✅ `isTooGenericName("film_kz") == false` (kz - бренд/гео, не generic)

## Результат

Теперь каналы с брендовыми названиями:
- ✅ НЕ уходят в fallback
- ✅ Используют правильные короткие имена
- ✅ Стабильно работают без длинных title-based slug имён


