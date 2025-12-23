import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  structuredData?: object;
}

const SEOHead = ({
  title = "Shorts AI Studio - Генератор сценариев для TikTok, Reels и Shorts",
  description = "Создавайте профессиональные сценарии для коротких вертикальных видео (TikTok, Reels, Shorts, VK Клипы) с помощью искусственного интеллекта. Генерация уникальных сценариев на основе настроек вашего канала.",
  keywords = "генератор сценариев, tiktok сценарии, reels сценарии, shorts сценарии, AI генератор, создание контента, вертикальные видео, социальные сети",
  image = "https://shortsai.ru/og-image.jpg",
  url,
  type = "website",
  structuredData
}: SEOHeadProps) => {
  const location = useLocation();
  const baseUrl = "https://shortsai.ru";
  const currentUrl = url || `${baseUrl}${location.pathname}`;

  useEffect(() => {
    // Обновление title
    document.title = title;

    // Обновление или создание мета-тегов
    const updateMetaTag = (name: string, content: string, attribute: string = "name") => {
      let element = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    // Primary Meta Tags
    updateMetaTag("title", title);
    updateMetaTag("description", description);
    updateMetaTag("keywords", keywords);

    // Open Graph
    updateMetaTag("og:title", title, "property");
    updateMetaTag("og:description", description, "property");
    updateMetaTag("og:image", image, "property");
    updateMetaTag("og:url", currentUrl, "property");
    updateMetaTag("og:type", type, "property");
    updateMetaTag("og:locale", "ru_RU", "property");

    // Twitter Card
    updateMetaTag("twitter:card", "summary_large_image", "property");
    updateMetaTag("twitter:title", title, "property");
    updateMetaTag("twitter:description", description, "property");
    updateMetaTag("twitter:image", image, "property");

    // Canonical URL
    let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", currentUrl);

    // Структурированные данные (JSON-LD)
    if (structuredData) {
      // Удаляем старые структурированные данные
      const existingScript = document.querySelector('script[type="application/ld+json"]');
      if (existingScript) {
        existingScript.remove();
      }

      // Добавляем новые структурированные данные
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }
  }, [title, description, keywords, image, currentUrl, type, structuredData]);

  return null;
};

export default SEOHead;

