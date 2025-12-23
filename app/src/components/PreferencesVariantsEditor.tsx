import { useState, useEffect, useMemo } from "react";
import { Copy, Trash2, Plus, ChevronDown, ChevronUp, Edit2, GripVertical } from "lucide-react";
import type { ChannelPreferences, PreferenceVariant, PreferencesMode } from "../domain/channel";
import { createPreferenceVariant, validatePreferences } from "../utils/preferencesUtils";
import VariantEditModal from "./VariantEditModal";
import { FieldHelpIcon } from "./aiAssistant/FieldHelpIcon";

interface PreferencesVariantsEditorProps {
  preferences: ChannelPreferences | undefined;
  onChange: (preferences: ChannelPreferences) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const PreferencesVariantsEditor = ({
  preferences,
  onChange,
  onValidationChange
}: PreferencesVariantsEditorProps) => {
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  const [collapsedVariants, setCollapsedVariants] = useState<Set<string>>(new Set());
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Определяем мобильное устройство
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Инициализация preferences если их нет
  // Используем useMemo, чтобы избежать создания нового объекта на каждом рендере
  const currentPreferences: ChannelPreferences = useMemo(() => {
    return preferences || {
      variants: [createPreferenceVariant("", 1)],
      mode: "cyclic",
      lastUsedIndex: 0
    };
  }, [preferences]);
  
  // Используем JSON.stringify для сравнения, чтобы избежать лишних вызовов валидации
  const preferencesKey = useMemo(() => JSON.stringify(currentPreferences), [currentPreferences]);

  const toggleVariantExpanded = (variantId: string) => {
    const newExpanded = new Set(expandedVariants);
    const newCollapsed = new Set(collapsedVariants);
    
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId);
      newCollapsed.add(variantId);
    } else {
      newExpanded.add(variantId);
      newCollapsed.delete(variantId);
    }
    
    setExpandedVariants(newExpanded);
    setCollapsedVariants(newCollapsed);
  };

  const handleVariantChange = (variantId: string, text: string) => {
    const updatedVariants = currentPreferences.variants.map((v) =>
      v.id === variantId ? { ...v, text } : v
    );

    const updatedPreferences: ChannelPreferences = {
      ...currentPreferences,
      variants: updatedVariants
    };

    onChange(updatedPreferences);
    
    // Валидация
    const validation = validatePreferences(updatedPreferences);
    if (onValidationChange) {
      onValidationChange(validation.valid);
    }
  };

  const handleOpenEditor = (variantId: string) => {
    setEditingVariantId(variantId);
  };

  const handleCloseEditor = () => {
    setEditingVariantId(null);
  };

  const handleSaveVariant = (variantId: string, text: string) => {
    handleVariantChange(variantId, text);
    setEditingVariantId(null);
  };

  const handleAddVariant = () => {
    const newOrder = currentPreferences.variants.length + 1;
    const newVariant = createPreferenceVariant("", newOrder);
    
    const updatedPreferences: ChannelPreferences = {
      ...currentPreferences,
      variants: [...currentPreferences.variants, newVariant]
    };

    onChange(updatedPreferences);
    
    // Разворачиваем новый вариант
    setExpandedVariants(new Set([...expandedVariants, newVariant.id]));
    setCollapsedVariants(new Set([...collapsedVariants].filter(id => id !== newVariant.id)));
  };

  const handleDuplicateVariant = (variantId: string) => {
    const variantToDuplicate = currentPreferences.variants.find((v) => v.id === variantId);
    if (!variantToDuplicate) return;

    const newOrder = currentPreferences.variants.length + 1;
    const newVariant = createPreferenceVariant(variantToDuplicate.text, newOrder);
    
    const updatedPreferences: ChannelPreferences = {
      ...currentPreferences,
      variants: [...currentPreferences.variants, newVariant]
    };

    onChange(updatedPreferences);
    
    // Разворачиваем дублированный вариант
    setExpandedVariants(new Set([...expandedVariants, newVariant.id]));
  };

  const handleDeleteVariant = (variantId: string) => {
    if (currentPreferences.variants.length <= 1) {
      alert("Должен остаться хотя бы один вариант пожеланий");
      return;
    }

    const updatedVariants = currentPreferences.variants
      .filter((v) => v.id !== variantId)
      .map((v, index) => ({ ...v, order: index + 1 })); // Пересчитываем порядок

    const updatedPreferences: ChannelPreferences = {
      ...currentPreferences,
      variants: updatedVariants
    };

    onChange(updatedPreferences);
    
    // Удаляем из состояний развёрнутости
    setExpandedVariants(new Set([...expandedVariants].filter(id => id !== variantId)));
    setCollapsedVariants(new Set([...collapsedVariants].filter(id => id !== variantId)));
  };

  const handleModeChange = (mode: PreferencesMode) => {
    const updatedPreferences: ChannelPreferences = {
      ...currentPreferences,
      mode
    };

    onChange(updatedPreferences);
  };

  // Валидация при изменении preferences
  useEffect(() => {
    const validation = validatePreferences(currentPreferences);
    if (onValidationChange) {
      onValidationChange(validation.valid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesKey]); // Используем стабильный ключ вместо объекта, чтобы избежать бесконечного цикла

  return (
    <div className="space-y-4">
      {/* Режим выбора варианта */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <span>Режим выбора варианта пожеланий</span>
          <FieldHelpIcon
            fieldKey="channel.preferences.mode"
            page="channelEdit"
            channelContext={{
              preferences: currentPreferences
            }}
            currentValue={currentPreferences.mode}
            label="Режим выбора варианта"
          />
        </label>
        <select
          value={currentPreferences.mode}
          onChange={(e) => handleModeChange(e.target.value as PreferencesMode)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20"
        >
          <option value="cyclic">По порядку (циклически)</option>
          <option value="random">Случайно</option>
          <option value="fixed">Только первый вариант</option>
        </select>
        <p className="text-xs text-slate-400">
          {currentPreferences.mode === "cyclic" &&
            "Варианты будут использоваться по очереди: 1 → 2 → ... → 1"}
          {currentPreferences.mode === "random" &&
            "На каждый запуск будет выбираться случайный вариант"}
          {currentPreferences.mode === "fixed" &&
            "Всегда будет использоваться только первый вариант"}
        </p>
      </div>

      {/* Список вариантов */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-slate-200">
            Варианты дополнительных пожеланий
          </label>
          <button
            type="button"
            onClick={handleAddVariant}
            className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm font-medium text-brand transition-all duration-200 hover:border-brand/50 hover:bg-brand/20 hover:shadow-md hover:shadow-brand/20"
          >
            <Plus size={18} />
            Добавить вариант пожеланий
          </button>
        </div>

        {currentPreferences.variants.map((variant, index) => {
          const isExpanded = expandedVariants.has(variant.id) || !collapsedVariants.has(variant.id);
          const previewText = variant.text.trim() || "";
          const previewLength = isMobile ? 140 : 100;
          const displayText = previewText.length > previewLength 
            ? `${previewText.substring(0, previewLength)}...` 
            : previewText;
          const isEmpty = !previewText;

          return (
            <div
              key={variant.id}
              className="group rounded-2xl border border-white/10 bg-slate-900/50 overflow-hidden shadow-lg shadow-black/20 transition-all duration-200 hover:border-white/20 hover:shadow-xl hover:shadow-brand/10"
            >
              {/* Заголовок варианта */}
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900/60 to-slate-800/40 border-b border-white/5">
                <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                  {!isMobile && (
                    <GripVertical size={16} className="text-slate-500 flex-shrink-0" />
                  )}
                  {!isMobile && (
                    <button
                      type="button"
                      onClick={() => toggleVariantExpanded(variant.id)}
                      className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white transition-all duration-200"
                    >
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-slate-400 transition-transform duration-200" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400 transition-transform duration-200" />
                      )}
                      <span>Вариант {index + 1}</span>
                    </button>
                  )}
                  {isMobile && (
                    <span className="text-sm font-semibold text-slate-200">Вариант {index + 1}</span>
                  )}
                  {!isExpanded && !isMobile && (
                    <span className="text-xs text-slate-400 truncate ml-2">
                      {displayText || "(пусто)"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditor(variant.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-brand hover:bg-brand/10 transition-all duration-200"
                      title="Редактировать"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDuplicateVariant(variant.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all duration-200"
                    title="Дублировать"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteVariant(variant.id)}
                    disabled={currentPreferences.variants.length <= 1}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Содержимое варианта */}
              {isMobile ? (
                // Мобильная версия: превью + кнопка редактирования
                <div className="px-3 md:px-4 pb-3 md:pb-4">
                  {/* Превью текста */}
                  <div
                    onClick={() => handleOpenEditor(variant.id)}
                    className="variant-preview rounded-lg border border-white/5 bg-slate-900/40 p-3 mb-2 cursor-pointer transition hover:bg-slate-900/60 hover:border-white/10 relative"
                  >
                    {isEmpty ? (
                      <p className="text-sm text-slate-500 italic">
                        Напишите здесь дополнительные пожелания для генерации сценария…
                      </p>
                    ) : (
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {previewText}
                      </p>
                    )}
                  </div>
                  
                  {/* Кнопка редактирования */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(variant.id)}
                    className="variant-edit-button w-full flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700/50 hover:text-white"
                  >
                    <Edit2 size={14} />
                    Редактировать
                  </button>
                </div>
              ) : (
                // Десктопная версия: inline textarea
                isExpanded && (
                  <div className="p-4 bg-slate-950/30">
                    <textarea
                      value={variant.text}
                      onChange={(e) => {
                        const textarea = e.currentTarget;
                        textarea.style.height = "auto";
                        textarea.style.height = `${textarea.scrollHeight}px`;
                        handleVariantChange(variant.id, textarea.value);
                      }}
                      rows={6}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20 min-h-[140px] h-auto resize-y overflow-auto text-sm leading-relaxed font-mono"
                      placeholder="Любые дополнительные требования к сценариям... Например: «бабушка и дедушка — казахи», особенности персонажей, сеттинг, стиль съёмки."
                    />
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Подсказка */}
      <p className="text-xs text-slate-400">
        Создайте несколько вариантов пожеланий для увеличения разнообразия контента. 
        Система будет использовать их согласно выбранному режиму.
      </p>

      {/* Модальное окно для редактирования варианта */}
      {editingVariantId && (() => {
        const variant = currentPreferences.variants.find(v => v.id === editingVariantId);
        if (!variant) return null;
        const variantIndex = currentPreferences.variants.findIndex(v => v.id === editingVariantId);
        
        return (
          <VariantEditModal
            isOpen={true}
            variantNumber={variantIndex + 1}
            initialText={variant.text}
            onClose={handleCloseEditor}
            onSave={(text) => handleSaveVariant(editingVariantId, text)}
          />
        );
      })()}
    </div>
  );
};

export default PreferencesVariantsEditor;

