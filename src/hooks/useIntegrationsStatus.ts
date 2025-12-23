import { useState, useEffect, useCallback } from "react";
import { getTelegramStatus, type TelegramIntegrationStatus } from "../api/telegramIntegration";

export interface IntegrationsStatus {
  telegram: {
    connected: boolean;
    status: TelegramIntegrationStatus["status"];
    phoneNumber?: string;
    loading: boolean;
    error: string | null;
  };
}

export function useIntegrationsStatus() {
  const [status, setStatus] = useState<IntegrationsStatus>({
    telegram: {
      connected: false,
      status: "not_connected",
      loading: true,
      error: null
    }
  });

  const refreshStatus = useCallback(async () => {
    // Загружаем статус Telegram
    setStatus((prev) => ({
      ...prev,
      telegram: { ...prev.telegram, loading: true, error: null }
    }));

    try {
      const telegramStatus = await getTelegramStatus();
      setStatus((prev) => ({
        ...prev,
        telegram: {
          connected: telegramStatus.status === "active",
          status: telegramStatus.status,
          phoneNumber: telegramStatus.phoneNumber,
          loading: false,
          error: null
        }
      }));
    } catch (error: any) {
      setStatus((prev) => ({
        ...prev,
        telegram: {
          ...prev.telegram,
          loading: false,
          error: error.message || "Не удалось загрузить статус Telegram"
        }
      }));
    }

  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    refreshStatus
  };
}

