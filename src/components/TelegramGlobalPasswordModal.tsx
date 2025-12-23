import { useState, FormEvent } from "react";
import { X, Lock, AlertCircle } from "lucide-react";
import { verifyTelegramGlobalPassword } from "../api/admin";

interface TelegramGlobalPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  channelName?: string;
}

const TelegramGlobalPasswordModal = ({
  isOpen,
  onClose,
  onSuccess,
  channelName
}: TelegramGlobalPasswordModalProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await verifyTelegramGlobalPassword(password);
      // Сохраняем флаг в sessionStorage
      sessionStorage.setItem("canUseGlobalTelegram", "true");
      setPassword("");
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorCode = err?.code || "UNKNOWN_ERROR";
      if (errorCode === "INVALID_PASSWORD") {
        setError("Неверный пароль. Попробуйте ещё раз.");
      } else {
        setError(err?.message || "Ошибка при проверке пароля. Попробуйте ещё раз.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded p-1 text-slate-400 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-brand/50"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {/* Заголовок */}
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/20 p-2">
            <Lock size={24} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Подтверждение доступа</h2>
        </div>

        {/* Описание */}
        <p className="mb-6 text-sm text-slate-300">
          Для использования общего Telegram-аккаунта введите пароль администратора.
          {channelName && (
            <span className="mt-1 block text-xs text-slate-400">
              Канал: <span className="font-medium text-slate-300">{channelName}</span>
            </span>
          )}
        </p>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Поле ввода пароля */}
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
              Пароль администратора
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={loading}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
              placeholder="Введите пароль"
              autoFocus
            />
          </div>

          {/* Ошибка */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Проверка..." : "Подтвердить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TelegramGlobalPasswordModal;

