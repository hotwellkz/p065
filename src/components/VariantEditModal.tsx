import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface VariantEditModalProps {
  isOpen: boolean;
  variantNumber: number;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void;
}

const VariantEditModal = ({
  isOpen,
  variantNumber,
  initialText,
  onClose,
  onSave
}: VariantEditModalProps) => {
  const [text, setText] = useState(initialText);
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Определяем мобильное устройство
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Обновляем текст при изменении initialText
  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      // Фокус на textarea при открытии
      setTimeout(() => {
        textareaRef.current?.focus();
        // Автоматически устанавливаем высоту
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      }, 100);
    }
  }, [isOpen, initialText]);

  // Автоматическое изменение высоты textarea при открытии
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const textarea = textareaRef.current;
      // Устанавливаем минимальную высоту для мобильных
      const minHeight = isMobile ? "50vh" : "300px";
      textarea.style.minHeight = minHeight;
      textarea.style.height = "auto";
      // Для длинного текста используем scroll
      const maxHeight = isMobile ? window.innerHeight * 0.6 : 400;
      if (textarea.scrollHeight > maxHeight) {
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = "auto";
      } else {
        textarea.style.height = `${textarea.scrollHeight}px`;
        textarea.style.overflowY = "hidden";
      }
    }
  }, [isOpen, isMobile]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const characterCount = text.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full md:w-full md:max-w-2xl h-[85vh] md:h-auto md:max-h-[80vh] flex flex-col rounded-t-2xl md:rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/95 backdrop-blur-sm px-4 md:px-6 py-4 flex-shrink-0">
          <h2 className="text-lg md:text-xl font-semibold text-white">
            Редактирование варианта {variantNumber}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-6 py-4">
          {/* Textarea */}
          <div className="flex-1 flex flex-col min-h-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Напишите здесь дополнительные пожелания для генерации сценария…"
              className="flex-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 resize-none overflow-y-auto text-sm md:text-base leading-relaxed"
              style={{
                minHeight: isMobile ? "50vh" : "300px"
              }}
            />
            
            {/* Счетчик символов */}
            <div className="mt-2 flex items-center justify-end">
              <span className="text-xs text-slate-400">
                {characterCount.toLocaleString()} {characterCount === 1 ? "символ" : characterCount < 5 ? "символа" : "символов"}
              </span>
            </div>
          </div>

          {/* Подсказка */}
          <div className="mt-4 p-3 rounded-lg border border-white/5 bg-slate-900/30">
            <p className="text-xs text-slate-400 leading-relaxed">
              Опишите дополнительные пожелания для генерации. Можно использовать списки, условия, юмор и т.д.
            </p>
          </div>
        </div>

        {/* Footer - кнопки */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-slate-900/50 px-4 md:px-6 py-4 flex-shrink-0 safe-area-inset-bottom">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 md:flex-initial px-4 py-3 rounded-lg border border-white/10 bg-slate-800/50 text-slate-200 transition hover:bg-slate-700/50 hover:text-white text-sm font-medium"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 md:flex-initial px-4 py-3 rounded-lg bg-brand text-white transition hover:bg-brand-dark text-sm font-medium"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default VariantEditModal;

