import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import {
  requestTelegramCode,
  confirmTelegramCode,
  getTelegramStatus,
  type TelegramIntegrationStatus
} from "../../api/telegramIntegration";
import { FieldHelpIcon } from "../aiAssistant/FieldHelpIcon";

interface WizardTelegramStepProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export function WizardTelegramStep({ onComplete, onSkip }: WizardTelegramStepProps) {
  const [status, setStatus] = useState<TelegramIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetButton, setShowResetButton] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    // Если Telegram уже подключен, автоматически переходим к следующему шагу
    if (status?.status === "active") {
      // Небольшая задержка для лучшего UX
      const timer = setTimeout(() => {
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status?.status, onComplete]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const currentStatus = await getTelegramStatus();
      setStatus(currentStatus);
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить статус");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async () => {
    if (!phoneNumber.trim()) {
      setError("Введите номер телефона");
      return;
    }

    try {
      setRequestingCode(true);
      setError(null);
      await requestTelegramCode(phoneNumber.trim());
      await loadStatus();
    } catch (err: any) {
      const errorMsg = err.message || "Не удалось отправить код";
      if (errorMsg.includes("FLOOD_WAIT")) {
        setError("Слишком много запросов. Подождите немного и попробуйте снова.");
      } else {
        setError(errorMsg);
      }
    } finally {
      setRequestingCode(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!code.trim()) {
      setError("Введите код подтверждения");
      return;
    }

    if (requiresPassword && !password.trim()) {
      setError("Введите пароль 2FA");
      return;
    }

    try {
      setConfirmingCode(true);
      setError(null);
      const result = await confirmTelegramCode(code.trim(), requiresPassword ? password.trim() : undefined);
      
      if (result.status === "connected") {
        setCode("");
        setPassword("");
        setPhoneNumber("");
        setRequiresPassword(false);
        setTimeout(() => {
          void loadStatus();
        }, 500);
        // onComplete будет вызван автоматически через useEffect
      }
    } catch (err: any) {
      const errorCode = err.code || err.message || "";
      const errorMsg = err.message || "Не удалось подтвердить код";
      
      if (errorCode === "PASSWORD_REQUIRED_FOR_2FA" || errorMsg.includes("PASSWORD_REQUIRED_FOR_2FA")) {
        setRequiresPassword(true);
        setError("Требуется пароль 2FA. Введите пароль от вашего Telegram аккаунта.");
      } else if (errorCode === "PASSWORD_INVALID" || errorMsg.includes("PASSWORD_INVALID")) {
        setError("Неверный пароль 2FA. Попробуйте ещё раз.");
      } else if (errorCode === "PHONE_CODE_INVALID" || errorMsg.includes("PHONE_CODE_INVALID")) {
        setError("Неверный код подтверждения. Проверьте код и попробуйте ещё раз.");
      } else if (errorCode === "PHONE_CODE_EXPIRED" || errorMsg.includes("PHONE_CODE_EXPIRED")) {
        setError("Код истёк. Запросите новый код.");
      } else {
        setError(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setConfirmingCode(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
      </div>
    );
  }

  const currentStatus = status?.status || "not_connected";

  // Если уже подключен, показываем успешное сообщение
  if (currentStatus === "active") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div>
            <div className="font-medium text-white">✅ Telegram успешно подключён</div>
            {status?.phoneNumber && (
              <div className="text-sm text-slate-400">{status.phoneNumber}</div>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-400">Переходим к следующему шагу...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold md:text-lg">Подключение Telegram</h3>
        <FieldHelpIcon
          fieldKey="wizard.telegram_connection"
          page="wizard"
          channelContext={{
            step: "telegram_connection",
            context: "wizard"
          }}
          label="Подключение Telegram"
        />
      </div>
      <p className="text-xs text-slate-400 md:text-sm">
        Привяжите свой Telegram аккаунт для отправки промптов от вашего имени. Это необходимо для автоматической работы с ботом Syntax.
      </p>

      {/* Статус интеграции */}
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
        {status?.status === "active" ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div className="flex-1">
              <div className="font-medium text-white">Статус: Telegram подключён</div>
              {status.phoneNumber && (
                <div className="text-sm text-slate-400">{status.phoneNumber}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-slate-400" />
            <div className="font-medium text-white">Статус: Telegram не привязан</div>
          </div>
        )}
      </div>

      {/* Ошибки */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-900/20 p-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <div className="flex-1 text-sm text-red-300">{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Форма привязки */}
      {currentStatus === "not_connected" || currentStatus === "error" ? (
        <div className="space-y-4 rounded-lg border border-white/10 bg-slate-900/50 p-4">
          <div>
            <label className="block text-sm font-medium text-slate-200">
              Номер телефона
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+7 123 456 7890"
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-white placeholder:text-slate-500 focus:border-brand/50 focus:outline-none"
              disabled={requestingCode}
            />
          </div>
          <button
            type="button"
            onClick={handleRequestCode}
            disabled={requestingCode || !phoneNumber.trim()}
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {requestingCode ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Отправка...
              </>
            ) : (
              "Отправить код"
            )}
          </button>
        </div>
      ) : null}

      {/* Форма подтверждения кода */}
      {currentStatus === "waiting_code" ? (
        <div className="space-y-4 rounded-lg border border-white/10 bg-slate-900/50 p-4">
          <div>
            <label className="block text-sm font-medium text-slate-200">
              Код подтверждения
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345"
              maxLength={6}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-white placeholder:text-slate-500 focus:border-brand/50 focus:outline-none"
              disabled={confirmingCode}
              autoFocus
            />
          </div>
          {requiresPassword && (
            <div>
              <label className="block text-sm font-medium text-slate-200">
                Пароль 2FA *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль Telegram"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-white placeholder:text-slate-500 focus:border-brand/50 focus:outline-none"
                disabled={confirmingCode}
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleConfirmCode}
            disabled={confirmingCode || !code.trim() || (requiresPassword && !password.trim())}
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {confirmingCode ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Подтверждение...
              </>
            ) : (
              "Подтвердить"
            )}
          </button>
        </div>
      ) : null}

      {/* Кнопка пропуска (опционально) */}
      {onSkip && (currentStatus === "not_connected" || currentStatus === "error") && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full rounded-lg border border-white/20 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50"
        >
          Пропустить (можно подключить позже)
        </button>
      )}
    </div>
  );
}

