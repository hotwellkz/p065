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

import { buildVideoBaseName, sanitizeBaseName, resolveCollision, isTooGenericName } from "../videoFilename";
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
  it("should detect generic names", () => {
    expect(isTooGenericName("postroimdom")).toBe(true);
    expect(isTooGenericName("hotwell")).toBe(true);
    expect(isTooGenericName("video")).toBe(true);
    expect(isTooGenericName("shorts")).toBe(true);
  });

  it("should not detect specific names as generic", () => {
    expect(isTooGenericName("sip_paneli_kaska")).toBe(false);
    expect(isTooGenericName("stroika_dom")).toBe(false);
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


