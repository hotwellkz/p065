import { useState, useCallback, useEffect } from "react";
import type { Toast, ToastType } from "../components/Toast";

let toastIdCounter = 0;

export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "error", duration?: number) => {
      const id = `toast-${++toastIdCounter}`;
      const newToast: Toast = {
        id,
        message,
        type,
        duration
      };

      setToasts((prev) => {
        // Если уже есть toast с таким же сообщением, заменяем его
        const existingIndex = prev.findIndex((t) => t.message === message);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = newToast;
          return updated;
        }
        return [...prev, newToast];
      });

      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showError = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, "error", duration);
    },
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, "success", duration);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      return showToast(message, "info", duration);
    },
    [showToast]
  );

  // Очищаем все toast при размонтировании или смене страницы
  useEffect(() => {
    return () => {
      setToasts([]);
    };
  }, []);

  return {
    toasts,
    showToast,
    showError,
    showSuccess,
    showInfo,
    removeToast
  };
};

