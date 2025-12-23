import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2, Save, HelpCircle } from "lucide-react";
import { getUserSettings, updateUserSettings } from "../api/userSettings";
import { useToast } from "../hooks/useToast";
import { SectionHelpButton } from "./aiAssistant/SectionHelpButton";

export function BlottataApiKeySettings() {
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const settings = await getUserSettings();
        setHasExistingKey(settings.hasDefaultBlottataApiKey);
        // Если ключ есть, показываем маскированное значение
        if (settings.hasDefaultBlottataApiKey) {
          setApiKey("****");
        } else {
          setApiKey("");
        }
      } catch (error: any) {
        console.error("Failed to load Blottata API key settings", error);
        showError("Не удалось загрузить настройки", 5000);
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [showError]);

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Если пользователь ввёл "****", это значит он не хочет менять существующий ключ
      const valueToSave = apiKey === "****" ? null : (apiKey.trim() || null);
      
      await updateUserSettings({
        defaultBlottataApiKey: valueToSave
      });

      // Обновляем локальное состояние
      if (valueToSave) {
        setHasExistingKey(true);
        setApiKey("****");
        setShowApiKey(false);
      } else {
        setHasExistingKey(false);
        setApiKey("");
      }

      showSuccess("Настройки сохранены", 3000);
    } catch (error: any) {
      console.error("Failed to save Blottata API key settings", error);
      showError(error.message || "Не удалось сохранить настройки", 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Если пользователь начинает вводить новый ключ, убираем маску
    if (hasExistingKey && value !== "****" && value.length < 4) {
      setHasExistingKey(false);
      setApiKey(value);
    } else {
      setApiKey(value);
    }
  };

  if (loading) {
    return (
      <div className="border-t border-white/10 pt-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Загрузка настроек...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 pt-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Blotato API ключ (по умолчанию)</h2>
        <SectionHelpButton
          sectionKey="blottata_api_key_default"
          sectionTitle="Blotato API ключ (по умолчанию)"
          context={{
            hasExistingKey
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Укажите API-ключ Blotato один раз. При создании новых каналов это значение будет автоматически подставлено в поле «Blotato API Key» в настройках канала. Ключ можно переопределить для конкретного канала.
      </p>
      {!hasExistingKey && (
        <p className="mt-1 text-xs text-amber-400/80">
          Если это поле оставить пустым, при создании новых каналов Blotato API Key придётся указывать вручную.
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={handleInputChange}
            placeholder="Введите API ключ Blotato"
            className="w-full rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/20"
            disabled={saving}
          />
          {hasExistingKey && apiKey === "****" && (
            <button
              type="button"
              onClick={() => {
                setShowApiKey(!showApiKey);
                if (!showApiKey) {
                  // При показе ключа, заменяем маску на пустое поле для ввода нового значения
                  setApiKey("");
                  setHasExistingKey(false);
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              aria-label={showApiKey ? "Скрыть ключ" : "Показать ключ"}
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
          {!hasExistingKey && apiKey && (
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              aria-label={showApiKey ? "Скрыть ключ" : "Показать ключ"}
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (hasExistingKey && apiKey === "****")}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span className="hidden sm:inline">Сохранение...</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span className="hidden sm:inline">Сохранить</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

