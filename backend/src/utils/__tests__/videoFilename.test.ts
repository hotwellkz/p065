/**
 * Тесты для функций генерации имён файлов видео
 * 
 * Проверяет:
 * - Генерацию из uiTitle
 * - Генерацию из promptText
 * - Санитизацию имён
 * - Обработку коллизий
 * - Отсутствие дат/времени в именах
 */

import { 
  buildVideoBaseName, 
  sanitizeBaseName, 
  resolveCollision, 
  isTooGenericName,
  generateVideoFilename,
  isTitleBasedFilename,
  normalizeIncomingFilename
} from "../videoFilename";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Мокируем fs для тестов коллизий
jest.mock("fs/promises");

describe("buildVideoBaseName", () => {
  it("should use uiTitle when provided and valid", async () => {
    const result = await buildVideoBaseName({
      uiTitle: "SipPani Stroitelstvo s yumorom",
      promptText: "Some prompt text",
      channelName: "PostroimDom.kz"
    });

    expect(result.source).toBe("uiTitle");
    expect(result.baseName).toMatch(/sippani_stroitelstvo_s_yumorom/i);
    expect(result.baseName.length).toBeLessThanOrEqual(50);
    expect(result.baseName.length).toBeGreaterThanOrEqual(16);
  });

  it("should generate from promptText when uiTitle is missing", async () => {
    const result = await buildVideoBaseName({
      promptText: "8-second video, vertical 9:16 aspect ratio. Shooting style: Humor. Location: Living room. Characters: A fluffy orange cat with big eyes. Camera movement: Slight handheld movement. Actions: 0-2s: The cat is spinning around excitedly, trying to catch its own tail.",
      channelName: "PostroimDom.kz"
    });

    expect(result.source).toMatch(/openai|fallback/);
    expect(result.baseName.length).toBeGreaterThanOrEqual(16);
    expect(result.baseName.length).toBeLessThanOrEqual(50);
    // Не должно содержать дату/время
    expect(result.baseName).not.toMatch(/\d{8}/); // YYYYMMDD
    expect(result.baseName).not.toMatch(/\d{4}$/); // HHMM
  });

  it("should not contain brand names or domains", async () => {
    const result = await buildVideoBaseName({
      promptText: "8-second video about PostroimDom.kz construction with HotWell materials",
      channelName: "PostroimDom.kz"
    });

    expect(result.baseName.toLowerCase()).not.toContain("postroimdom");
    expect(result.baseName.toLowerCase()).not.toContain("hotwell");
    expect(result.baseName.toLowerCase()).not.toContain(".kz");
  });

  it("should handle empty inputs gracefully", async () => {
    const result = await buildVideoBaseName({
      channelName: "PostroimDom.kz"
    });

    expect(result.source).toBe("fallback");
    expect(result.baseName.length).toBeGreaterThan(0);
    expect(result.baseName.length).toBeLessThanOrEqual(50);
    // Не должно содержать дату/время
    expect(result.baseName).not.toMatch(/\d{8}/);
  });
});

describe("sanitizeBaseName", () => {
  it("should remove forbidden characters", () => {
    const result = sanitizeBaseName("Test?File:Name*With<Forbidden>Chars|");
    expect(result).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("should remove emojis", () => {
    const result = sanitizeBaseName("Test🎬Video🎉Name");
    expect(result).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("should replace spaces with underscores", () => {
    const result = sanitizeBaseName("Test Video Name");
    expect(result).toContain("_");
    expect(result).not.toContain(" ");
  });

  it("should transliterate Russian to Latin", () => {
    const result = sanitizeBaseName("СИП панели строительство");
    expect(result).not.toMatch(/[а-яё]/i);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should limit length to maxLen", () => {
    const longTitle = "A".repeat(100);
    const result = sanitizeBaseName(longTitle, 50, 16);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("should return empty string if too short", () => {
    const shortTitle = "abc";
    const result = sanitizeBaseName(shortTitle, 50, 16);
    expect(result).toBe("");
  });
});

describe("isTooGenericName", () => {
  // STOP/GENERIC слова - должны быть generic
  it("should detect generic stop words", () => {
    expect(isTooGenericName("video")).toBe(true);
    expect(isTooGenericName("shorts")).toBe(true);
    expect(isTooGenericName("clip")).toBe(true);
    expect(isTooGenericName("rolik")).toBe(true);
    expect(isTooGenericName("film")).toBe(true);
    expect(isTooGenericName("movie")).toBe(true);
  });

  // BRAND слова - НЕ должны быть generic
  it("should NOT detect brand words as generic", () => {
    expect(isTooGenericName("hotwell")).toBe(false);
    expect(isTooGenericName("postroimdom")).toBe(false);
    expect(isTooGenericName("sipdelux")).toBe(false);
    expect(isTooGenericName("sipdelux_kz")).toBe(false);
  });

  // Комбинации с брендами - НЕ generic
  it("should NOT detect names with brand tokens as generic", () => {
    expect(isTooGenericName("video_hotwell")).toBe(false); // есть бренд
    expect(isTooGenericName("hotwell_stroika")).toBe(false); // есть бренд + смысловое слово
    expect(isTooGenericName("postroimdom_kz")).toBe(false); // бренд + гео
    expect(isTooGenericName("sipdelux_paneli")).toBe(false); // бренд + смысловое слово
  });

  // Только generic слова - generic
  it("should detect names with only generic tokens as generic", () => {
    expect(isTooGenericName("video_shorts")).toBe(true); // оба generic
    expect(isTooGenericName("film_movie")).toBe(true); // оба generic
  });

  // Смешанные токены - если есть не-generic, то не generic
  it("should NOT detect names with non-generic tokens as generic", () => {
    expect(isTooGenericName("sip_paneli_kaska")).toBe(false); // есть смысловые слова
    expect(isTooGenericName("stroika_dom")).toBe(false); // есть смысловые слова
    expect(isTooGenericName("video_stroika")).toBe(false); // есть смысловое слово
  });

  // Пустые/короткие имена
  it("should detect empty or invalid names as generic", () => {
    expect(isTooGenericName("")).toBe(true);
    expect(isTooGenericName("   ")).toBe(true);
  });
});

describe("resolveCollision", () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    mockFs.access = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return base name if file does not exist", async () => {
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await resolveCollision(tempDir, "test_video", ".mp4");
    expect(result).toBe("test_video");
  });

  it("should add _2 suffix if file exists", async () => {
    // Первый файл существует
    mockFs.access.mockResolvedValueOnce(undefined);
    // Второй файл не существует
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await resolveCollision(tempDir, "test_video", ".mp4");
    expect(result).toBe("test_video_2");
  });

  it("should add _3 suffix if _2 also exists", async () => {
    // Первый файл существует
    mockFs.access.mockResolvedValueOnce(undefined);
    // Второй файл существует
    mockFs.access.mockResolvedValueOnce(undefined);
    // Третий файл не существует
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await resolveCollision(tempDir, "test_video", ".mp4");
    expect(result).toBe("test_video_3");
  });

  it("should use single underscore for collision suffix", async () => {
    mockFs.access.mockResolvedValueOnce(undefined);
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await resolveCollision(tempDir, "test_video", ".mp4");
    // Должно быть одно подчёркивание перед цифрой
    expect(result).toBe("test_video_2");
    expect(result).not.toMatch(/__\d/); // Не должно быть двойного подчёркивания
  });

  it("should limit total length to 50 characters", async () => {
    const longBase = "a".repeat(48);
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await resolveCollision(tempDir, longBase, ".mp4");
    expect(result.length).toBeLessThanOrEqual(50);
  });
});

describe("generateVideoFilename", () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    mockFs.access = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return video_<shortId>.mp4 format", async () => {
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await generateVideoFilename({
      source: "test",
      channelId: "test-channel",
      userId: "test-user",
      targetDir: tempDir
    });

    expect(result).toMatch(/^video_[a-z0-9]{6}\.mp4$/i);
  });

  it("should handle collisions with _2, _3 suffixes", async () => {
    // Первый файл существует
    mockFs.access.mockResolvedValueOnce(undefined);
    // Второй файл существует
    mockFs.access.mockResolvedValueOnce(undefined);
    // Третий файл не существует
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await generateVideoFilename({
      source: "test",
      channelId: "test-channel",
      userId: "test-user",
      targetDir: tempDir
    });

    expect(result).toMatch(/^video_[a-z0-9]{6}_3\.mp4$/i);
  });

  it("should always return format video_<id>.mp4 (no title-based names)", async () => {
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));

    const result = await generateVideoFilename({
      source: "test",
      channelId: "test-channel",
      userId: "test-user",
      targetDir: tempDir
    });

    // Не должно содержать длинных слов или подчёркиваний (кроме video_<id>)
    expect(result).not.toMatch(/_[a-z]{10,}/); // Нет длинных слов
    expect(result).toMatch(/^video_[a-z0-9]{6}(_\d+)?\.mp4$/i);
  });
});

describe("isTitleBasedFilename", () => {
  it("should detect correct format video_<shortId>.mp4", () => {
    expect(isTitleBasedFilename("video_76sgbi.mp4")).toBe(false);
    expect(isTitleBasedFilename("video_dq77u1.mp4")).toBe(false);
    expect(isTitleBasedFilename("video_5155c2.mp4")).toBe(false);
  });

  it("should detect correct format with collision suffix", () => {
    expect(isTitleBasedFilename("video_76sgbi_2.mp4")).toBe(false);
    expect(isTitleBasedFilename("video_dq77u1_3.mp4")).toBe(false);
  });

  it("should detect title-based filenames", () => {
    expect(isTitleBasedFilename("fierce_showdown_between_jaguar_caiman.mp4")).toBe(true);
    expect(isTitleBasedFilename("whimsical_little_plant_character_discover.mp4")).toBe(true);
    expect(isTitleBasedFilename("video_with_very_long_title_name_that_contains_many_words.mp4")).toBe(true);
  });

  it("should detect non-video_ prefix as title-based", () => {
    expect(isTitleBasedFilename("my_video_file.mp4")).toBe(true);
    expect(isTitleBasedFilename("test.mp4")).toBe(true);
  });
});

describe("normalizeIncomingFilename", () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    testFilePath = path.join(tempDir, "fierce_showdown_between_jaguar_caiman.mp4");
    mockFs.access = jest.fn();
    mockFs.rename = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should normalize title-based filename to video_<shortId>.mp4", async () => {
    // Файл не существует (для generateVideoFilename)
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));
    // rename успешен
    mockFs.rename.mockResolvedValueOnce(undefined);

    const result = await normalizeIncomingFilename(
      testFilePath,
      "fierce_showdown_between_jaguar_caiman.mp4",
      tempDir,
      "test-channel",
      "test-user"
    );

    expect(result).toMatch(/^video_[a-z0-9]{6}\.mp4$/i);
    expect(mockFs.rename).toHaveBeenCalledWith(
      testFilePath,
      expect.stringMatching(/^.*\/video_[a-z0-9]{6}\.mp4$/)
    );
  });

  it("should handle collisions during normalization", async () => {
    // Первый файл существует (для generateVideoFilename)
    mockFs.access.mockResolvedValueOnce(undefined);
    // Второй файл не существует
    mockFs.access.mockRejectedValueOnce(new Error("File not found"));
    // rename успешен
    mockFs.rename.mockResolvedValueOnce(undefined);

    const result = await normalizeIncomingFilename(
      testFilePath,
      "fierce_showdown_between_jaguar_caiman.mp4",
      tempDir,
      "test-channel",
      "test-user"
    );

    expect(result).toMatch(/^video_[a-z0-9]{6}_2\.mp4$/i);
  });
});


