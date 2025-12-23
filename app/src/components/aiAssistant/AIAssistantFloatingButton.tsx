import { useState, useEffect, useRef } from "react";
import { Sparkles, MessageCircle, Phone } from "lucide-react";
import { useAIAssistantContext } from "./AIAssistantProvider";

const TELEGRAM_URL = "https://t.me/+77475000217";
const TELEGRAM_MESSAGE = "Привет! Нужна помощь по сервису ShortsAI Studio.";
const WHATSAPP_URL = "https://wa.me/77475000217";
const WHATSAPP_MESSAGE = "Привет! Нужна помощь по сервису ShortsAI Studio.";

export function AIAssistantFloatingButton() {
  const { isOpen, openPanel } = useAIAssistantContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие меню при клике вне зоны
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Закрытие меню при открытии панели AI
  useEffect(() => {
    if (isOpen) {
      setIsMenuOpen(false);
    }
  }, [isOpen]);

  const handleTelegramClick = () => {
    // Telegram использует формат с параметром text для предзаполнения сообщения
    const url = `${TELEGRAM_URL}?text=${encodeURIComponent(TELEGRAM_MESSAGE)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setIsMenuOpen(false);
  };

  const handleWhatsAppClick = () => {
    const url = `${WHATSAPP_URL}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setIsMenuOpen(false);
  };

  const handleAIClick = () => {
    openPanel();
    setIsMenuOpen(false);
  };

  if (isOpen) return null; // Не показываем кнопку, если панель открыта

  return (
    <div ref={menuRef} className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999]">
      {/* Меню */}
      {isMenuOpen && (
        <div 
          className="absolute bottom-16 right-0 mb-3 w-56 sm:w-64 rounded-3xl glass border border-white/20 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-purple-500/20 p-2"
          style={{
            animation: "slide-up 0.3s ease-out forwards"
          }}
        >
          {/* AI-ассистент */}
          <button
            type="button"
            onClick={handleAIClick}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 hover:bg-white/10 hover:shadow-lg hover:shadow-purple-500/20 group"
          >
            <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2.5 border border-purple-500/30 group-hover:border-purple-400/50 group-hover:scale-110 transition-transform">
              <Sparkles size={20} className="text-purple-300 group-hover:text-purple-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">AI-ассистент</div>
            </div>
          </button>

          {/* Telegram */}
          <button
            type="button"
            onClick={handleTelegramClick}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 hover:bg-white/10 hover:shadow-lg hover:shadow-blue-500/20 group mt-1.5"
          >
            <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-2.5 border border-blue-500/30 group-hover:border-blue-400/50 group-hover:scale-110 transition-transform">
              <MessageCircle size={20} className="text-blue-300 group-hover:text-blue-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Написать в Telegram</div>
            </div>
          </button>

          {/* WhatsApp */}
          <button
            type="button"
            onClick={handleWhatsAppClick}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 hover:bg-white/10 hover:shadow-lg hover:shadow-green-500/20 group mt-1.5"
          >
            <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 p-2.5 border border-green-500/30 group-hover:border-green-400/50 group-hover:scale-110 transition-transform">
              <Phone size={20} className="text-green-300 group-hover:text-green-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Написать в WhatsApp</div>
            </div>
          </button>
        </div>
      )}

      {/* Главная кнопка */}
      <button
        type="button"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30 flex items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${
          isMenuOpen ? "scale-95" : ""
        }`}
        aria-label="Открыть меню техподдержки"
        title="Техподдержка"
      >
        {isMenuOpen ? (
          <span className="text-xl sm:text-2xl font-bold">×</span>
        ) : (
          <Sparkles size={22} className="sm:w-6 sm:h-6 animate-pulse" />
        )}
      </button>
    </div>
  );
}

