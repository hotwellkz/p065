import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import {
  requestTelegramCode,
  confirmTelegramCode,
  disconnectTelegram,
  getTelegramStatus,
  resetTelegramIntegration,
  type TelegramIntegrationStatus
} from "../api/telegramIntegration";
import { SectionHelpButton } from "./aiAssistant/SectionHelpButton";

const TelegramIntegration = () => {
  const [status, setStatus] = useState<TelegramIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetButton, setShowResetButton] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

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
      } else if (errorMsg.includes("TELEGRAM_ALREADY_CONNECTED")) {
        setError("Telegram уже привязан");
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
      
      // Успешное подтверждение
      if (result.status === "connected") {
        setCode("");
        setPassword("");
        setPhoneNumber("");
        setRequiresPassword(false);
        // Обновляем статус после небольшой задержки, чтобы БД успела обновиться
        setTimeout(() => {
          void loadStatus();
        }, 500);
      }
    } catch (err: any) {
      const errorCode = err.code || err.message || "";
      const errorMsg = err.message || "Не удалось подтвердить код";
      
      console.error("Telegram code confirmation error:", {
        errorCode,
        errorMsg,
        fullError: err
      });
      
      if (errorCode === "PASSWORD_REQUIRED_FOR_2FA" || errorMsg.includes("PASSWORD_REQUIRED_FOR_2FA")) {
        setRequiresPassword(true);
        setError("Требуется пароль 2FA. Введите пароль от вашего Telegram аккаунта.");
      } else if (errorCode === "PASSWORD_INVALID" || errorMsg.includes("PASSWORD_INVALID")) {
        setError("Неверный пароль 2FA. Попробуйте ещё раз.");
      } else if (errorCode === "PHONE_CODE_INVALID" || errorMsg.includes("PHONE_CODE_INVALID")) {
        setError("Неверный код подтверждения. Проверьте код и попробуйте ещё раз.");
      } else if (errorCode === "PHONE_CODE_EXPIRED" || errorMsg.includes("PHONE_CODE_EXPIRED")) {
        setError("Код истёк. Запросите новый код.");
      } else if (errorCode === "FLOOD_WAIT" || errorMsg.includes("FLOOD_WAIT")) {
        setError("Слишком много попыток. Подождите немного перед следующей попыткой.");
      } else if (errorCode === "NO_PENDING_AUTHORIZATION" || errorCode === "AUTHORIZATION_EXPIRED" || errorCode === "AUTH_CLIENT_EXPIRED" || errorMsg.includes("Authorization client expired")) {
        setError("Срок действия кода истёк или сессия была сброшена. Запросите новый код.");
        setShowResetButton(true);
        // Очищаем поле кода и сбрасываем статус ожидания
        setCode("");
        setStatus({ status: "not_connected" });
      } else if (errorCode === "FAILED_TO_CONFIRM_CODE") {
        setError(`Ошибка подтверждения кода: ${errorMsg}. Проверьте логи сервера.`);
        setShowResetButton(true);
      } else {
        setError(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setConfirmingCode(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Вы уверены, что хотите отвязать Telegram?")) {
      return;
    }

    try {
      setDisconnecting(true);
      setError(null);
      await disconnectTelegram();
      await loadStatus();
      setShowResetButton(false);
    } catch (err: any) {
      setError(err.message || "Не удалось отвязать Telegram");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Вы уверены, что хотите сбросить привязку Telegram? Это очистит все данные авторизации.")) {
      return;
    }

    try {
      setResetting(true);
      setError(null);
      await resetTelegramIntegration();
      // Очищаем все поля
      setPhoneNumber("");
      setCode("");
      setPassword("");
      setRequiresPassword(false);
      setShowResetButton(false);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || "Не удалось сбросить привязку");
    } finally {
      setResetting(false);
    }
  };

  const handleRequestCodeAgain = async () => {
    // Очищаем состояние и запрашиваем новый код
    setShowResetButton(false);
    setCode("");
    setPassword("");
    setRequiresPassword(false);
    setError(null);
    if (phoneNumber.trim()) {
      await handleRequestCode();
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

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Telegram интеграция</h3>
          <SectionHelpButton
            sectionKey="telegram_integration"
            sectionTitle="Telegram интеграция"
            currentStatus={currentStatus}
            context={{ phoneNumber: status?.phoneNumber }}
          />
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Привяжите свой Telegram аккаунт для отправки промптов от вашего имени
        </p>
      </div>

      {/* Статус */}
      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
        <div className="flex items-center gap-3">
          {currentStatus === "active" && (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="font-medium text-white">✅ Привязан</div>
                {status?.phoneNumber && (
                  <div className="text-sm text-slate-400">{status.phoneNumber}</div>
                )}
              </div>
            </>
          )}
          {currentStatus === "waiting_code" && (
            <>
              <Clock className="h-5 w-5 text-amber-400" />
              <div>
                <div className="font-medium text-white">⏳ Ожидание кода</div>
                {status?.phoneNumber && (
                  <div className="text-sm text-slate-400">
                    Код отправлен на {status.phoneNumber}
                  </div>
                )}
              </div>
            </>
          )}
          {currentStatus === "error" && (
            <>
              <XCircle className="h-5 w-5 text-red-400" />
              <div>
                <div className="font-medium text-white">❌ Ошибка</div>
                {status?.lastError && (
                  <div className="text-sm text-red-400">{status.lastError}</div>
                )}
              </div>
            </>
          )}
          {currentStatus === "not_connected" && (
            <>
              <XCircle className="h-5 w-5 text-slate-400" />
              <div className="font-medium text-white">❌ Не привязан</div>
            </>
          )}
        </div>
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
              "Получить код"
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
              <p className="mt-1 text-xs text-slate-400">
                Для этого аккаунта включена двухфакторная аутентификация
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmCode}
              disabled={confirmingCode || !code.trim() || (requiresPassword && !password.trim())}
              className="flex-1 rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
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
            {showResetButton && (
              <button
                type="button"
                onClick={handleRequestCodeAgain}
                disabled={requestingCode}
                className="rounded-lg border border-white/20 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
              >
                Запросить код заново
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Кнопки управления */}
      {currentStatus === "active" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex-1 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-2 font-semibold text-red-300 transition hover:bg-red-900/30 disabled:opacity-50"
          >
            {disconnecting ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Отвязка...
              </>
            ) : (
              "Отвязать Telegram"
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded-lg border border-white/20 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            title="Сбросить привязку и начать заново"
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Сбросить"
            )}
          </button>
        </div>
      )}
      
      {/* Кнопка сброса для других состояний */}
      {(currentStatus === "not_connected" || currentStatus === "error" || showResetButton) && showResetButton && (
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="w-full rounded-lg border border-white/20 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
        >
          {resetting ? (
            <>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Сброс...
            </>
          ) : (
            "Сбросить привязку и начать заново"
          )}
        </button>
      )}
    </div>
  );
};

export default TelegramIntegration;

