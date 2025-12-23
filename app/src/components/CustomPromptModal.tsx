import { useState } from "react";
import { X, Loader2, Send } from "lucide-react";
import { runCustomPrompt } from "../api/customPrompt";
import type { Channel } from "../domain/channel";

interface CustomPromptModalProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MAX_PROMPT_LENGTH = 15000;

const CustomPromptModal = ({
  channel,
  isOpen,
  onClose,
  onSuccess
}: CustomPromptModalProps) => {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedPrompt = prompt.trim();
    
    // Валидация
    if (!trimmedPrompt) {
      setError("Промпт не может быть пустым");
      return;
    }

    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      setError(`Промпт слишком длинный. Максимальная длина: ${MAX_PROMPT_LENGTH} символов`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await runCustomPrompt(channel.id, trimmedPrompt);
      
      setShowSuccess(true);
      setPrompt("");
      
      // Закрываем модал через 2 секунды после успеха
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
        if (onSuccess) {
          onSuccess();
        }
      }, 2000);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Ошибка при отправке промпта");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setPrompt("");
      setError(null);
      setShowSuccess(false);
      onClose();
    }
  };

  const remainingChars = MAX_PROMPT_LENGTH - prompt.length;
  const isPromptValid = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        {/* Заголовок */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            Отправить промпт для канала «{channel.name}»
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Textarea */}
          <div>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
              placeholder="Вставьте сюда готовый промпт для генерации видео…"
              disabled={isSubmitting}
              rows={12}
              className={`w-full rounded-lg border px-4 py-3 text-sm text-white placeholder:text-slate-500 ${
                error && !isPromptValid
                  ? "border-red-500 bg-red-500/10"
                  : "border-white/10 bg-slate-900/50"
              } outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50`}
            />
            
            {/* Счётчик символов */}
            <div className="mt-1 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                {remainingChars < 0 ? (
                  <span className="text-red-400">
                    Превышено на {Math.abs(remainingChars)} символов
                  </span>
                ) : (
                  <span>
                    {prompt.length} / {MAX_PROMPT_LENGTH} символов
                  </span>
                )}
              </div>
              {error && !isPromptValid && (
                <div className="text-xs text-red-400">{error}</div>
              )}
            </div>
          </div>

          {/* Подсказка */}
          <div className="rounded-lg border border-white/5 bg-slate-900/30 p-3">
            <p className="text-xs text-slate-400">
              Будет использован весь текущий набор настроек канала (язык, длительность, стиль и т.д.), меняется только текст промпта.
            </p>
          </div>

          {/* Сообщение об успехе */}
          {showSuccess && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
              <p className="text-sm text-green-300">
                Генерация ролика по вашему промпту запущена. Результат появится после завершения обработки.
              </p>
            </div>
          )}

          {/* Сообщение об ошибке */}
          {error && isPromptValid && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Кнопки */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg border border-white/10 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isPromptValid}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Отправить промпт
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomPromptModal;


