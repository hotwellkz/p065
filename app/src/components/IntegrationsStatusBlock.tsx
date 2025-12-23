import { CheckCircle2, XCircle, Loader2, ExternalLink, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIntegrationsStatus } from "../hooks/useIntegrationsStatus";
import { SectionHelpButton } from "./aiAssistant/SectionHelpButton";

interface IntegrationsStatusBlockProps {
  onTelegramConnect?: () => void;
}

export function IntegrationsStatusBlock({
  onTelegramConnect
}: IntegrationsStatusBlockProps) {
  const { status, refreshStatus } = useIntegrationsStatus();
  const navigate = useNavigate();

  const handleConnectTelegram = () => {
    if (onTelegramConnect) {
      onTelegramConnect();
    } else {
      // Открываем страницу настроек с фокусом на Telegram
      navigate("/settings");
    }
  };

  const handleManageInSettings = (integration: "telegram") => {
    navigate("/settings");
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Статус интеграций
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        {/* Telegram интеграция */}
        <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-200">Telegram</h4>
              <SectionHelpButton
                sectionKey="telegram_integration"
                sectionTitle="Telegram интеграция"
                currentStatus={status.telegram.connected ? "connected" : "not_connected"}
                context={{ phoneNumber: status.telegram.phoneNumber }}
              />
            </div>
            {status.telegram.loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : status.telegram.connected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
          </div>

          {status.telegram.loading ? (
            <p className="text-xs text-slate-400">Загрузка статуса...</p>
          ) : status.telegram.connected ? (
            <>
              <p className="mb-2 text-sm font-medium text-emerald-300">
                ✅ Telegram подключён
              </p>
              {status.telegram.phoneNumber && (
                <p className="mb-3 text-xs text-slate-400">
                  {status.telegram.phoneNumber}
                </p>
              )}
              <button
                type="button"
                onClick={() => handleManageInSettings("telegram")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50"
              >
                <ExternalLink className="h-3 w-3" />
                Управлять в настройках
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-red-300">
                ❌ Telegram не подключён
              </p>
              <p className="mb-3 text-xs text-slate-400">
                Подключите Telegram, чтобы система могла отправлять промпты и сообщения от вашего имени
              </p>
              <button
                type="button"
                onClick={handleConnectTelegram}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
                aria-label="Подключить Telegram"
              >
                Подключить Telegram
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

