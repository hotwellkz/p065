import { useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";

interface DeleteChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  channelName: string;
}

const DeleteChannelModal = ({
  isOpen,
  onClose,
  onConfirm,
  channelName
}: DeleteChannelModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // Ошибка обрабатывается в родительском компоненте
      console.error("Error deleting channel:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isDeleting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10004] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="absolute right-4 top-4 rounded p-1 text-slate-400 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 disabled:opacity-50"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {/* Заголовок */}
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-red-500/20 p-2">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Удалить канал?</h2>
        </div>

        {/* Описание */}
        <div className="mb-6 space-y-2">
          <p className="text-sm text-slate-300">
            Канал <span className="font-medium text-white">"{channelName}"</span> и все связанные с ним данные будут удалены:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-slate-400">
            <li>Настройки канала</li>
            <li>Расписания автопубликации</li>
            <li>Журнал ошибок</li>
            <li>Видео на сервере</li>
            <li>История генераций</li>
          </ul>
          <p className="mt-3 text-sm font-medium text-red-400">
            Действие необратимо.
          </p>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Удаление...
              </>
            ) : (
              "Удалить навсегда"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteChannelModal;

