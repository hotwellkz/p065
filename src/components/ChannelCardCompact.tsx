import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Play, Edit2, MoreVertical, Zap, GripVertical, Music, Loader2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Channel } from "../domain/channel";
import type { ChannelStateInfo } from "../utils/channelAutomationState";
import { hhmmToMinutes } from "../utils/scheduleFreeSlots";
import AutomationTimersCompact from "./AutomationTimersCompact";
import ChannelPlatformIcons from "./ChannelPlatformIcons";

const platformLabels: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const languageLabels: Record<Channel["language"], string> = {
  ru: "RU",
  en: "EN",
  kk: "KK"
};

interface ChannelCardCompactProps {
  channel: Channel;
  index: number;
  automationStateInfo?: ChannelStateInfo;
  minIntervalMinutes?: number;
  onEdit: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  onAutoGenerate?: () => void;
  onCustomPrompt?: () => void;
  onMusicClipsRunOnce?: () => void;
  isRunningMusicClips?: boolean;
}

const ChannelCardCompact = ({
  channel,
  index,
  automationStateInfo,
  minIntervalMinutes = 11,
  onEdit,
  onDelete,
  onGenerate,
  onAutoGenerate,
  onCustomPrompt,
  onMusicClipsRunOnce,
  isRunningMusicClips = false
}: ChannelCardCompactProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // Определяем состояние автоматизации
  const automationState = automationStateInfo?.state || "default";
  const hasAutomation = automationState !== "default" && channel.autoSendEnabled;

  // Закрываем меню при клике вне или ESC
  useEffect(() => {
    if (!showMenu) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowMenu(false);
        setMenuPosition(null);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMenu]);

  // Вычисляем позицию меню при открытии
  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192; // w-48
    const menuHeight = 200; // примерная высота
    const padding = 8;

    // Позиционируем справа от кнопки
    let left = rect.right + padding;
    let top = rect.top;

    // Проверяем, не выходит ли за правый край
    if (left + menuWidth > window.innerWidth - padding) {
      left = rect.left - menuWidth - padding; // Открываем слева
    }

    // Проверяем, не выходит ли за нижний край
    if (top + menuHeight > window.innerHeight - padding) {
      top = window.innerHeight - menuHeight - padding;
    }

    // Проверяем, не выходит ли за верхний край
    if (top < padding) {
      top = padding;
    }

    setMenuPosition({ top, left });
    setShowMenu(true);
  };

  // Формируем информацию о расписании (только если нет активной автоматизации)
  const getScheduleInfo = (): string => {
    // Если есть активная автоматизация, не показываем базовое расписание
    if (hasAutomation) {
      return "";
    }

    if (!channel.autoSendSchedules || channel.autoSendSchedules.length === 0) {
      return "Расписание не настроено";
    }

    const enabledSchedules = channel.autoSendSchedules.filter(s => s.enabled);
    if (enabledSchedules.length === 0) {
      return "Расписание выключено";
    }

    const count = enabledSchedules.length;
    const countText = `${count} ${count === 1 ? 'публикация' : count < 5 ? 'публикации' : 'публикаций'}/день`;

    // Находим ближайшее время
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const times = enabledSchedules
      .map(s => s.time)
      .filter(time => time && /^\d{2}:\d{2}$/.test(time))
      .sort();
    
    if (times.length === 0) {
      return countText;
    }
    
    let nextTime: string | null = null;
    for (const time of times) {
      const slotMinutes = hhmmToMinutes(time);
      if (!Number.isNaN(slotMinutes) && slotMinutes > nowMinutes) {
        nextTime = time;
        break;
      }
    }
    
    if (!nextTime && times.length > 0) {
      nextTime = times[0]; // Следующий день
    }

    if (nextTime) {
      return `${countText} · ближайшая: ${nextTime}`;
    }
    return countText;
  };

  const scheduleInfo = getScheduleInfo();
  const isBlottataEnabled = channel.blotataEnabled === true;
  const number = String(index + 1).padStart(3, "0");

  // CSS классы для состояний автоматизации
  const getAutomationClasses = () => {
    if (!hasAutomation) return "";
    
    switch (automationState) {
      case "current":
        return "border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-500/10 to-transparent hover:from-emerald-500/15";
      case "next":
        return "border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-500/10 to-transparent hover:from-amber-500/15";
      case "previous":
        return "border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-500/10 to-transparent hover:from-blue-500/15";
      default:
        return "";
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative w-full rounded-lg border border-white/10 bg-slate-900/50 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-slate-900/70 ${
          isDragging ? "z-50 opacity-50" : ""
        } ${getAutomationClasses()}`}
      >
        {/* Desktop версия */}
        <div className="hidden md:flex items-center gap-3 px-4 py-2.5">
          {/* Номер канала */}
          <div className="flex-shrink-0 text-xs font-mono text-slate-400 w-10">
            #{number}
          </div>

          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-slate-500 hover:text-slate-300 transition-colors"
            title="Перетащите для изменения порядка"
          >
            <GripVertical size={14} />
          </button>

          {/* Название канала и индикатор автоматизации */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="font-semibold text-white text-sm truncate">
              {channel.name}
            </div>
            {/* Компактный индикатор автоматизации */}
            {hasAutomation && automationStateInfo && (
              <AutomationTimersCompact
                stateInfo={automationStateInfo}
                minIntervalMinutes={minIntervalMinutes}
              />
            )}
          </div>

          {/* Платформа и язык */}
          <div className="flex-shrink-0 text-xs text-slate-400 whitespace-nowrap">
            {platformLabels[channel.platform]} · {languageLabels[channel.language]}
          </div>

          {/* Blotato бейдж */}
          {isBlottataEnabled && (
            <div className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5">
              <Zap size={10} className="text-emerald-400" />
              <span className="text-[10px] font-medium text-emerald-300">Blotato</span>
            </div>
          )}

          {/* Расписание (только если нет активной автоматизации) */}
          {!hasAutomation && scheduleInfo && (
            <div className="flex-shrink-0 text-xs text-slate-400 max-w-[200px] truncate" title={scheduleInfo}>
              {scheduleInfo}
            </div>
          )}

          {/* Иконки платформ */}
          <ChannelPlatformIcons
            youtubeUrl={channel.youtubeUrl}
            tiktokUrl={channel.tiktokUrl}
            instagramUrl={channel.instagramUrl}
            size="sm"
            className="flex-shrink-0"
          />

          {/* Действия */}
          <div className="flex-shrink-0 flex items-center gap-1">
            {channel.type === "music_clips" && onMusicClipsRunOnce ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMusicClipsRunOnce();
                }}
                disabled={isRunningMusicClips}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Запустить Music Clips"
              >
                {isRunningMusicClips ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Music size={14} />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate();
                }}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand/20 hover:bg-brand/30 text-brand-light transition-colors"
                title="Генерация"
              >
                <Play size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition-colors"
              title="Редактировать"
            >
              <Edit2 size={14} />
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={handleMenuClick}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition-colors"
              title="Меню"
            >
              <MoreVertical size={14} />
            </button>
          </div>
        </div>

        {/* Mobile версия */}
        <div className="md:hidden flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="text-xs font-mono text-slate-400 flex-shrink-0">
                #{number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white text-sm truncate">
                  {channel.name}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {platformLabels[channel.platform]} · {languageLabels[channel.language]}
                  {channel.type && (
                    <span className="ml-1 text-[10px]">
                      {channel.type === "music_clips" ? "🎵" : "📹"}
                    </span>
                  )}
                </div>
                {/* Компактный индикатор автоматизации для мобильной версии */}
                {hasAutomation && automationStateInfo && (
                  <div className="mt-1.5">
                    <AutomationTimersCompact
                      stateInfo={automationStateInfo}
                      minIntervalMinutes={minIntervalMinutes}
                    />
                  </div>
                )}
                {/* Расписание для мобильной версии (только если нет активной автоматизации) */}
                {!hasAutomation && scheduleInfo && (
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {scheduleInfo}
                  </div>
                )}
              </div>
            </div>
            {isBlottataEnabled && (
              <div className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5">
                <Zap size={9} className="text-emerald-400" />
                <span className="text-[9px] font-medium text-emerald-300">Blotato</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {/* Иконки платформ для мобильной версии */}
            <ChannelPlatformIcons
              youtubeUrl={channel.youtubeUrl}
              tiktokUrl={channel.tiktokUrl}
              instagramUrl={channel.instagramUrl}
              size="sm"
              className="flex-shrink-0"
            />
            <div className="flex items-center gap-1">
              {channel.type === "music_clips" && onMusicClipsRunOnce ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMusicClipsRunOnce();
                  }}
                  disabled={isRunningMusicClips}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Запустить Music Clips"
                >
                  {isRunningMusicClips ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Music size={14} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/20 hover:bg-brand/30 text-brand-light transition-colors"
                  title="Генерация"
                >
                  <Play size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition-colors"
                title="Редактировать"
              >
                <Edit2 size={14} />
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={handleMenuClick}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition-colors"
                title="Меню"
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Контекстное меню через Portal */}
      {showMenu && menuPosition && createPortal(
        <>
          <div
            className="fixed inset-0 z-[99998] bg-transparent"
            onClick={() => {
              setShowMenu(false);
              setMenuPosition(null);
            }}
          />
          <div
            className="fixed z-[99999] w-48 rounded-lg border border-white/20 bg-slate-900/95 backdrop-blur-sm shadow-xl"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {onAutoGenerate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAutoGenerate();
                  setShowMenu(false);
                  setMenuPosition(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/50 rounded-t-lg transition-colors"
              >
                AI Автогенерация
              </button>
            )}
            {onCustomPrompt && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCustomPrompt();
                  setShowMenu(false);
                  setMenuPosition(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/50 transition-colors"
              >
                Кастомный промпт
              </button>
            )}
            {(onAutoGenerate || onCustomPrompt) && (
              <div className="border-t border-white/10 my-1" />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
                setMenuPosition(null);
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-900/20 rounded-b-lg transition-colors"
            >
              Удалить
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
};

export default ChannelCardCompact;
