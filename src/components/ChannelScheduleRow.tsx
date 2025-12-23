import { useState } from "react";
import { Edit2, Save, X, Plus, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { updateChannelSchedule, type ChannelScheduleItem } from "../api/channelSchedule";
import type { ConflictKey } from "../utils/scheduleConflicts";
import AutomationToggle from "./AutomationToggle";

interface ChannelScheduleRowProps {
  item: ChannelScheduleItem;
  timeColumnsCount: number;
  conflicts: Set<ConflictKey>;
  activeTime: string | null;
  animateActiveTime: string | null;
  remainingSeconds: number;
  minIntervalMinutes: number;
  nextTime: string | null;
  previousTime: string | null;
  previousElapsedSeconds: number;
  onUpdate: (updatedItem: ChannelScheduleItem) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onAutomationChange: (enabled: boolean) => Promise<void>;
  isMobile?: boolean;
}

/**
 * Валидация времени в формате HH:MM
 */
function validateTime(time: string): boolean {
  if (!time || !time.trim()) {
    return false;
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return false;
  }
  const [hours, minutes] = time.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Форматирует время для input[type="time"]
 * Конвертирует "HH:MM" в формат для time input
 */
function formatTimeForInput(time: string): string {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return "";
  }
  return time;
}

/**
 * Конвертирует значение из input[type="time"] в формат "HH:MM"
 */
function formatTimeFromInput(inputValue: string): string {
  if (!inputValue) {
    return "";
  }
  // input[type="time"] возвращает "HH:MM" или "HH:MM:SS", берём первые 5 символов
  return inputValue.substring(0, 5);
}

/**
 * Форматирует оставшееся время в формат "M:SS"
 */
function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Форматирует оставшееся время в формат "HH:MM:SS" для мобильной версии
 */
function formatRemainingFull(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Форматирует прошедшее время после предыдущей публикации
 */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return "прошло 0 мин";

  const m = Math.floor(seconds / 60);
  if (m < 60) return `прошло ${m} мин`;

  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `прошло ${h} ч ${mm.toString().padStart(2, "0")} мин`;
}

const ChannelScheduleRow = ({
  item,
  timeColumnsCount,
  conflicts,
  activeTime,
  animateActiveTime,
  remainingSeconds,
  minIntervalMinutes,
  nextTime,
  previousTime,
  previousElapsedSeconds,
  onUpdate,
  onError,
  onSuccess,
  onAutomationChange,
  isMobile = false
}: ChannelScheduleRowProps) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedTimes, setEditedTimes] = useState<string[]>([]);
  const [timeErrors, setTimeErrors] = useState<Record<number, string>>({});

  const handleEdit = () => {
    setEditedTimes([...item.times]);
    setTimeErrors({});
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedTimes([]);
    setTimeErrors({});
    setIsEditing(false);
  };

  const handleTimeChange = (index: number, value: string) => {
    const formatted = formatTimeFromInput(value);
    const newTimes = [...editedTimes];
    
    // Если индекс выходит за пределы массива, добавляем новые элементы
    while (newTimes.length <= index) {
      newTimes.push("");
    }
    
    newTimes[index] = formatted;
    setEditedTimes(newTimes);

    // Валидация в реальном времени
    if (formatted && !validateTime(formatted)) {
      setTimeErrors((prev) => ({
        ...prev,
        [index]: "Неверный формат времени (HH:MM)"
      }));
    } else {
      setTimeErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[index];
        return newErrors;
      });
    }
  };

  const handleAddTime = () => {
    setEditedTimes([...editedTimes, ""]);
  };

  const handleRemoveTime = (index: number) => {
    const newTimes = editedTimes.filter((_, i) => i !== index);
    setEditedTimes(newTimes);
    setTimeErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[index];
      // Сдвигаем индексы ошибок
      const shifted: Record<number, string> = {};
      Object.keys(newErrors).forEach((key) => {
        const keyNum = Number(key);
        if (keyNum > index) {
          shifted[keyNum - 1] = newErrors[keyNum];
        } else {
          shifted[keyNum] = newErrors[keyNum];
        }
      });
      return shifted;
    });
  };

  const handleSave = async () => {
    // Фильтруем пустые значения и валидируем
    const validTimes = editedTimes
      .map((time) => time.trim())
      .filter((time) => time.length > 0);

    // Проверяем валидность всех времён
    const errors: Record<number, string> = {};
    validTimes.forEach((time, index) => {
      if (!validateTime(time)) {
        errors[index] = "Неверный формат времени (HH:MM)";
      }
    });

    if (Object.keys(errors).length > 0) {
      setTimeErrors(errors);
      onError("Исправьте ошибки в расписании");
      return;
    }

    if (validTimes.length === 0) {
      onError("Добавьте хотя бы одно время");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateChannelSchedule(item.id, validTimes);
      onUpdate(updated);
      setIsEditing(false);
      onSuccess("Расписание сохранено");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка при сохранении расписания";
      onError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChannelClick = () => {
    if (!isEditing) {
      navigate(`/channels/${item.id}/edit`);
    }
  };

  // Заполняем времена до нужного количества колонок для отображения
  const displayTimes = isEditing
    ? editedTimes
    : [...item.times];
  
  while (displayTimes.length < timeColumnsCount) {
    displayTimes.push("");
  }

  const visibleTimes = displayTimes.slice(0, timeColumnsCount);
  const hiddenTimesCount = Math.max(0, (isEditing ? editedTimes : item.times).length - timeColumnsCount);

  // Проверяем, есть ли активное время в этой строке
  const isActiveRow = activeTime != null && item.times.includes(activeTime);
  // Проверяем, есть ли следующее время в этой строке (только если нет активного)
  const isNextRow = !isActiveRow && nextTime != null && item.times.includes(nextTime);
  // Проверяем, есть ли предыдущее время в этой строке (только если нет активного и следующего)
  const isPreviousRow = !isActiveRow && !isNextRow && previousTime != null && item.times.includes(previousTime);

  // Формируем краткое резюме расписания для мобильной карточки
  const scheduleSummary = item.times.length > 0
    ? item.times.length === 1
      ? `1 публикация: ${item.times[0]}`
      : item.times.length <= 3
      ? `${item.times.length} публикации: ${item.times.join(", ")}`
      : `${item.times.length} публикаций: ${item.times[0]}...${item.times[item.times.length - 1]}`
    : "Нет публикаций";

  // Мобильная версия - карточка (всегда развернута)
  if (isMobile) {
    const validTimes = isEditing ? editedTimes.filter(t => t.trim()) : item.times;
    
    return (
      <div
        className={`w-full rounded-lg border border-white/10 bg-slate-900/50 transition ${
          isEditing ? "bg-slate-800/50" : ""
        } ${!item.isAutomationEnabled ? "opacity-60" : ""} ${
          isActiveRow && !isEditing ? "border-emerald-500/30 bg-emerald-500/5" : ""
        }`}
      >
        {/* Шапка карточки */}
        <div className="flex items-start justify-between gap-3 p-3 pb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex-shrink-0">#{String(item.index).padStart(3, "0")}</span>
              <button
                onClick={handleChannelClick}
                disabled={isEditing}
                className="text-left transition hover:text-brand disabled:cursor-default disabled:hover:text-white flex-1 min-w-0"
              >
                <div className="font-medium text-white truncate">{item.name}</div>
                <div className="text-xs text-slate-400">{item.platform}</div>
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <AutomationToggle
                enabled={item.isAutomationEnabled}
                onChange={onAutomationChange}
                channelName={item.name}
                disabled={isEditing}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isEditing ? (
              <button
                type="button"
                onClick={handleEdit}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded border border-white/10 bg-slate-800/50 p-2 text-slate-300 transition hover:bg-slate-700/50"
                title="Изменить расписание"
              >
                <Edit2 size={16} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || Object.keys(timeErrors).length > 0}
                  className="min-h-[40px] rounded bg-brand px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="min-h-[40px] rounded border border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Расписание - всегда видно */}
        <div className="px-3 pb-3">
          {isEditing ? (
            <div className="space-y-2">
              <div className="space-y-2">
                {editedTimes.map((time, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={formatTimeForInput(time)}
                        onChange={(e) => handleTimeChange(idx, e.target.value)}
                        disabled={isSaving}
                        className={`flex-1 rounded border px-3 py-2 text-sm font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50 ${
                          timeErrors[idx]
                            ? "border-red-500 bg-red-500/10 text-red-200"
                            : "border-white/10 bg-slate-950/60 text-white"
                        }`}
                      />
                      {time && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTime(idx)}
                          disabled={isSaving}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded p-2 text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                          title="Удалить время"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    {timeErrors[idx] && (
                      <div className="text-xs text-red-400">{timeErrors[idx]}</div>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddTime}
                disabled={isSaving || editedTimes.length >= 10}
                className="w-full min-h-[40px] rounded border border-white/10 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
              >
                <Plus size={16} className="inline mr-2" />
                Добавить время
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-400 mb-1">
                {validTimes.length > 0 
                  ? `${validTimes.length} ${validTimes.length === 1 ? 'публикация' : validTimes.length < 5 ? 'публикации' : 'публикаций'}`
                  : 'Нет публикаций'}
              </div>
              {/* Обратный отсчёт для активного слота - только на мобильной версии */}
              {isActiveRow && remainingSeconds > 0 && (
                <div className="flex items-center justify-between gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5">
                  <span className="text-[10px] text-slate-300 whitespace-nowrap">Запуск через:</span>
                  <span className="text-[11px] font-mono font-semibold text-emerald-300 tabular-nums">
                    {formatRemainingFull(remainingSeconds)}
                  </span>
                </div>
              )}
              {validTimes.length > 0 ? (
                <div className="overflow-x-auto -mx-3 px-3">
                  <div className="flex gap-2 pb-2">
                    {validTimes.map((time, idx) => {
                      const conflictKey: ConflictKey | null = time
                        ? `${item.id}-${time}`
                        : null;
                      const hasConflict = conflictKey ? conflicts.has(conflictKey) : false;
                      const isActiveCell = activeTime != null && time === activeTime;
                      const isNextCell = !isActiveCell && nextTime != null && time === nextTime;
                      const isPreviousCell =
                        !isActiveCell &&
                        !isNextCell &&
                        previousTime != null &&
                        time != null &&
                        time.trim() === previousTime.trim();

                      return (
                        <div
                          key={idx}
                          className={`flex-shrink-0 rounded border px-2.5 py-1.5 text-xs font-mono transition whitespace-nowrap ${
                            isActiveCell
                              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 font-semibold"
                              : isNextCell
                              ? "border-amber-500/50 bg-amber-500/18 text-amber-200"
                              : isPreviousCell
                              ? "border-blue-500/50 bg-blue-500/18 text-blue-200"
                              : hasConflict
                              ? "border-red-500/50 bg-red-500/10 text-red-300"
                              : "border-white/10 bg-slate-800/50 text-white"
                          }`}
                        >
                          {time}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-1">
                  Нет публикаций в расписании
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Десктопная версия - таблица
  return (
    <tr
      className={`border-b border-white/5 transition ${
        isEditing ? "bg-slate-800/50" : "hover:bg-slate-800/30"
      } ${!item.isAutomationEnabled ? "opacity-60" : ""} ${
        isActiveRow && !isEditing ? "bg-emerald-500/5" : ""
      } ${isNextRow && !isEditing ? "next-slot-row" : ""} ${
        isPreviousRow && !isEditing ? "previous-slot-row" : ""
      }`}
    >
      <td className="sticky left-0 z-10 bg-inherit px-4 py-3 text-sm text-slate-300">
        {String(item.index).padStart(3, "0")}
      </td>
      <td className="sticky left-[60px] z-10 bg-inherit px-4 py-3">
        <button
          onClick={handleChannelClick}
          disabled={isEditing}
          className="text-left transition hover:text-brand disabled:cursor-default disabled:hover:text-white"
        >
          <div className="font-medium text-white">{item.name}</div>
          <div className="text-xs text-slate-400">{item.platform}</div>
        </button>
      </td>
      <td className="px-4 py-3 text-center align-middle">
        <div className="flex items-center justify-center">
          <AutomationToggle
            enabled={item.isAutomationEnabled}
            onChange={onAutomationChange}
            channelName={item.name}
            disabled={isEditing}
          />
        </div>
      </td>
      {visibleTimes.map((time, timeIndex) => {
        const hasTime = !!time;
        const conflictKey: ConflictKey | null = hasTime
          ? `${item.id}-${time}`
          : null;
        const hasConflict = conflictKey ? conflicts.has(conflictKey) : false;
        const isActiveCell = activeTime != null && time === activeTime;
        // Следующий слот подсвечивается только если он не активный (приоритет зелёного)
        const isNextCell = !isActiveCell && nextTime != null && time === nextTime;
        // Предыдущий слот подсвечивается только если он не активный и не следующий
        // Предыдущий слот: проверяем точное совпадение времени (с учётом возможных пробелов)
        const isPreviousCell = 
          !isActiveCell && 
          !isNextCell && 
          previousTime != null && 
          time != null &&
          time.trim() === previousTime.trim();

        // Диагностический лог для проблемных ячеек
        if (time && previousTime) {
          const timeMatches = time === previousTime;
          const timeTrimmed = time.trim();
          const prevTrimmed = previousTime.trim();
          const trimmedMatches = timeTrimmed === prevTrimmed;
          
          if (timeMatches || trimmedMatches) {
            console.log("🔍 CHECKING PREVIOUS CELL:", {
              time,
              previousTime,
              timeTrimmed,
              prevTrimmed,
              timeMatches,
              trimmedMatches,
              isActiveCell,
              isNextCell,
              isPreviousCell,
              activeTime,
              nextTime
            });
          }
        }

        const conflictTooltip = hasConflict
          ? "Время пересекается с другими каналами: интервал менее 11 минут"
          : undefined;
        const activeTooltip = isActiveCell
          ? "Текущий активный временной слот"
          : undefined;
        const nextTooltip = isNextCell
          ? "Следующая ближайшая публикация"
          : undefined;
        const previousTooltip = isPreviousCell
          ? "Предыдущая публикация"
          : undefined;

        return (
          <td
            key={timeIndex}
            className={`min-w-[80px] px-4 py-3 text-center align-middle transition-colors ${
              isActiveCell && !isEditing ? "bg-emerald-500/15" : ""
            } ${!isActiveCell && isNextCell && !isEditing ? "next-slot-cell" : ""} ${
              !isActiveCell && !isNextCell && isPreviousCell && !isEditing ? "previous-slot-cell" : ""
            } ${animateActiveTime && time === animateActiveTime && !isEditing ? "active-slot-pulse rounded" : ""}`}
            title={activeTooltip || nextTooltip || previousTooltip || conflictTooltip}
          >
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  value={formatTimeForInput(time)}
                  onChange={(e) => handleTimeChange(timeIndex, e.target.value)}
                  disabled={isSaving}
                  className={`w-full rounded border px-2 py-1 text-sm font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50 ${
                    timeErrors[timeIndex]
                      ? "border-red-500 bg-red-500/10 text-red-200"
                      : hasConflict
                      ? "border-red-500/60 bg-red-500/10 text-red-200"
                      : "border-white/10 bg-slate-950/60 text-white"
                  }`}
                />
                {time && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTime(timeIndex)}
                    disabled={isSaving}
                    className="rounded p-1 text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                    title="Удалить время"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span
                  className={`inline-flex min-h-[1.5rem] items-center justify-center rounded px-1 font-mono transition-colors ${
                    isActiveCell
                      ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                      : isNextCell
                      ? "bg-amber-500/18 text-amber-200 font-medium"
                      : isPreviousCell
                      ? "bg-blue-500/18 text-blue-200 font-medium"
                      : hasConflict
                      ? "bg-red-500/10 text-red-300 underline decoration-red-500/60 decoration-dotted"
                      : "text-white"
                  } ${animateActiveTime && time === animateActiveTime ? "active-slot-pulse" : ""}`}
                >
                  {time || "—"}
                </span>
                {isActiveCell && (
                  <div className="time-countdown">
                    <span className="time-countdown-text text-[10px] text-emerald-300/80">
                      осталось {formatRemaining(remainingSeconds)}
                    </span>
                    <div className="time-countdown-bar relative h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="time-countdown-bar-fill h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-1000 ease-linear"
                        style={{
                          width: `${Math.max(0, Math.min(100, (remainingSeconds / (minIntervalMinutes * 60)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                )}
                {!isActiveCell && isNextCell && (
                  <span className="next-slot-label text-[10px] text-amber-300/70 font-medium uppercase tracking-wider">
                    следующая
                  </span>
                )}
                {!isActiveCell && !isNextCell && isPreviousCell && (
                  <>
                    <span className="previous-slot-label text-[10px] text-blue-300/70 font-medium uppercase tracking-wider">
                      предыдущая
                    </span>
                    <span className="previous-slot-elapsed">
                      {formatElapsed(previousElapsedSeconds)}
                    </span>
                  </>
                )}
              </div>
            )}
            {timeErrors[timeIndex] && (
              <div className="mt-1 text-xs text-red-400">{timeErrors[timeIndex]}</div>
            )}
          </td>
        );
      })}
      {hiddenTimesCount > 0 && !isEditing && (
        <td
          className="px-4 py-3 text-center text-sm text-slate-400"
          title={`Ещё времена: ${(isEditing ? editedTimes : item.times).slice(timeColumnsCount).join(", ")}`}
        >
          <span className="rounded bg-slate-800/50 px-2 py-1">+{hiddenTimesCount}</span>
        </td>
      )}
      {isEditing && (
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={handleAddTime}
            disabled={isSaving || editedTimes.length >= 10}
            className="rounded border border-white/10 bg-slate-800/50 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            title="Добавить время"
          >
            <Plus size={14} />
          </button>
        </td>
      )}
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || Object.keys(timeErrors).length > 0}
              className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="rounded border border-white/10 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleEdit}
            className="rounded border border-white/10 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50"
            title="Изменить расписание"
          >
            <Edit2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
};

export default ChannelScheduleRow;

