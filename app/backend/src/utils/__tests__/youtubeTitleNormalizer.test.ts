/**
 * Тесты для функции normalizeYoutubeTitle
 * 
 * Проверяет обработку различных случаев:
 * - Длинные названия на разных языках
 * - Названия с эмодзи
 * - Названия без пробелов
 * - Граничные случаи
 */

import { normalizeYoutubeTitle, MAX_YOUTUBE_TITLE_LENGTH } from "../youtubeTitleNormalizer";

describe("normalizeYoutubeTitle", () => {
  it("should return title as-is if within limit", () => {
    const shortTitle = "Short title";
    expect(normalizeYoutubeTitle(shortTitle)).toBe(shortTitle);
  });

  it("should truncate long Russian title", () => {
    const longTitle = "Очень длинное название ролика которое точно превышает лимит в 55 символов и должно быть обрезано";
    const result = normalizeYoutubeTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    expect(result).toMatch(/…$/);
  });

  it("should truncate long English title", () => {
    const longTitle = "This is a very long video title that definitely exceeds the 55 character limit and should be truncated properly";
    const result = normalizeYoutubeTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    expect(result).toMatch(/…$/);
  });

  it("should truncate long Kazakh title", () => {
    const longTitle = "Бұл өте ұзын бейне тақырыбы, ол 55 таңба шегінен асып кетуі керек және дұрыс қысқартылуы тиіс";
    const result = normalizeYoutubeTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    expect(result).toMatch(/…$/);
  });

  it("should handle titles with emojis", () => {
    const titleWithEmoji = "🎬 Amazing video title with emoji 🎉 that is very long and should be truncated";
    const result = normalizeYoutubeTitle(titleWithEmoji);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    // Эмодзи должны сохраниться
    expect(result).toContain("🎬");
  });

  it("should handle titles without spaces", () => {
    const noSpaces = "VeryLongTitleWithoutAnySpacesThatExceedsTheLimitAndShouldBeTruncated";
    const result = normalizeYoutubeTitle(noSpaces);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    expect(result).toMatch(/…$/);
  });

  it("should remove trailing punctuation", () => {
    const withPunctuation = "Title with punctuation at the end!!! that is very long";
    const result = normalizeYoutubeTitle(withPunctuation);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
    // Не должно заканчиваться на несколько восклицательных знаков
    expect(result).not.toMatch(/!+…$/);
  });

  it("should normalize multiple spaces", () => {
    const withSpaces = "Title   with    multiple     spaces";
    const result = normalizeYoutubeTitle(withSpaces);
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("should handle empty string", () => {
    expect(normalizeYoutubeTitle("")).toBe("");
  });

  it("should handle exactly 55 characters", () => {
    const exactly55 = "A".repeat(55);
    const result = normalizeYoutubeTitle(exactly55);
    expect(result.length).toBe(55);
    expect(result).not.toMatch(/…$/);
  });

  it("should handle 56 characters (should truncate)", () => {
    const exactly56 = "A".repeat(56);
    const result = normalizeYoutubeTitle(exactly56);
    expect(result.length).toBeLessThanOrEqual(MAX_YOUTUBE_TITLE_LENGTH);
  });
});

