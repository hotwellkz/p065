import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AutomationToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void>;
  channelName?: string;
  disabled?: boolean;
}

const AutomationToggle = ({
  enabled,
  onChange,
  channelName,
  disabled = false
}: AutomationToggleProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [localEnabled, setLocalEnabled] = useState(enabled);

  // Синхронизируем локальное состояние с пропсами
  useEffect(() => {
    setLocalEnabled(enabled);
  }, [enabled]);

  const handleToggle = async () => {
    if (disabled || isLoading) return;

    const newValue = !localEnabled;
    const previousValue = localEnabled;
    
    // Optimistic UI update
    setLocalEnabled(newValue);
    setIsLoading(true);

    try {
      await onChange(newValue);
      // Успех - состояние уже обновлено через props
    } catch (error) {
      // Ошибка - возвращаем исходное состояние
      setLocalEnabled(previousValue);
      throw error; // Пробрасываем ошибку дальше для обработки
    } finally {
      setIsLoading(false);
    }
  };

  const tooltipText = localEnabled
    ? `Выключить автоматическую публикацию роликов для канала "${channelName || "этого канала"}"`
    : `Включить автоматическую публикацию роликов для канала "${channelName || "этого канала"}"`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || isLoading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${
          localEnabled ? "bg-brand" : "bg-slate-600"
        }`}
        title={tooltipText}
        aria-label={tooltipText}
        aria-pressed={localEnabled}
        role="switch"
      >
        <span
          className={`inline-flex h-4 w-4 items-center justify-center transform rounded-full bg-white transition-transform ${
            localEnabled ? "translate-x-6" : "translate-x-1"
          } ${isLoading ? "opacity-50" : ""}`}
        >
          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-slate-600" />
          )}
        </span>
      </button>
      <span
        className={`text-xs font-medium ${
          localEnabled ? "text-emerald-300" : "text-slate-400"
        }`}
      >
        {localEnabled ? "Вкл." : "Выкл."}
      </span>
    </div>
  );
};

export default AutomationToggle;

