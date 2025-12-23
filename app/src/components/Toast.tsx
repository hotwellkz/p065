import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // в миллисекундах, по умолчанию 5000
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
  onClick?: () => void;
}

const ToastComponent = ({ toast, onClose, onClick }: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const duration = toast.duration ?? 5000;

  useEffect(() => {
    // Анимация появления
    setIsVisible(true);

    // Автоматическое скрытие
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Даём время на анимацию исчезновения перед удалением
        setTimeout(() => onClose(toast.id), 200);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [toast.id, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(toast.id), 200);
  };

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle2 size={20} className="flex-shrink-0" />;
      case "error":
        return <AlertCircle size={20} className="flex-shrink-0" />;
      case "info":
        return <Info size={20} className="flex-shrink-0" />;
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case "success":
        return "bg-green-500/95 text-white border-green-400/30";
      case "error":
        return "bg-red-500/95 text-white border-red-400/30";
      case "info":
        return "bg-blue-500/95 text-white border-blue-400/30";
    }
  };

  return (
    <div
      className={`w-full rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200 cursor-pointer ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-2 opacity-0"
      } ${getStyles()}`}
      role="alert"
      aria-live="assertive"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) {
          onClick();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-relaxed break-words line-clamp-3">
            {toast.message}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="ml-2 flex-shrink-0 rounded p-1 transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Закрыть уведомление"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default ToastComponent;

