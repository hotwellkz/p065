import { useEffect, useState } from "react";
import type { ChannelStateInfo } from "../utils/channelAutomationState";

interface AutomationTimersProps {
  stateInfo: ChannelStateInfo;
  minIntervalMinutes: number;
  isMobile?: boolean;
}

/**
 * Форматирует секунды в формат ЧЧ:ММ:СС
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Форматирует дату в формат времени (HH:MM)
 */
function formatTimeOnly(date: Date | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Форматирует дату в формат времени (HH:MM) или с датой если другой день
 */
function formatTime(date: Date | undefined, timeStr?: string): string {
  if (!date && !timeStr) return "";
  
  // Если есть date, используем его (более точный)
  if (date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleString("ru-RU", { 
        day: "2-digit", 
        month: "2-digit", 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    }
  }
  
  // Fallback на timeStr
  if (timeStr) {
    return timeStr;
  }
  
  return "";
}

/**
 * Вычисляет прошедшее время от даты до сейчас
 */
function calculateTimeElapsed(startDate: Date | undefined): number {
  if (!startDate) return 0;
  const now = new Date();
  const diff = Math.floor((now.getTime() - startDate.getTime()) / 1000);
  return Math.max(0, diff);
}

/**
 * Форматирует прошедшее время в формат ЧЧ:ММ:СС
 */
function formatTimeElapsed(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Вычисляет оставшееся время до даты
 */
function calculateTimeUntil(targetDate: Date | undefined): number {
  if (!targetDate) return 0;
  const now = new Date();
  const diff = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
  return Math.max(0, diff);
}

export default function AutomationTimers({ stateInfo, minIntervalMinutes, isMobile = false }: AutomationTimersProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [nextCountdown, setNextCountdown] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Обратный отсчёт для текущего канала
  useEffect(() => {
    if (stateInfo.state !== "current" || !stateInfo.currentEndTime) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = calculateTimeUntil(stateInfo.currentEndTime);
      setRemainingSeconds(remaining);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [stateInfo.state, stateInfo.currentEndTime]);

  // Обратный отсчёт для следующего канала
  useEffect(() => {
    if (stateInfo.state !== "next" || !stateInfo.nextStartTime) {
      setNextCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = calculateTimeUntil(stateInfo.nextStartTime);
      setNextCountdown(remaining);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    return () => clearInterval(intervalId);
  }, [stateInfo.state, stateInfo.nextStartTime]);

  // Прошедшее время для предыдущего канала
  useEffect(() => {
    if (stateInfo.state !== "previous" || !stateInfo.previousStartTime) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const elapsed = calculateTimeElapsed(stateInfo.previousStartTime);
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const intervalId = setInterval(updateElapsed, 1000);

    return () => clearInterval(intervalId);
  }, [stateInfo.state, stateInfo.previousStartTime]);

  // Для текущего канала
  if (stateInfo.state === "current") {
    const showCountdown = remainingSeconds > 0;
    const startTime = formatTimeOnly(stateInfo.currentStartTime);
    const nextTime = formatTime(stateInfo.nextSlotDate, stateInfo.nextSlotTime);
    const previousTime = formatTime(stateInfo.previousSlotDate, stateInfo.previousSlotTime);

    if (isMobile) {
      // Мобильная версия - компактная, две строки
      return (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-1.5">
          {startTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Началась:</span>
              <span className="font-mono text-emerald-200 tabular-nums text-xs sm:text-sm leading-none flex-shrink-0">{startTime}</span>
            </div>
          )}
          {showCountdown && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Осталось:</span>
              <span className="font-mono font-semibold text-emerald-300 tabular-nums text-sm sm:text-base leading-none flex-shrink-0">
                {formatTimeRemaining(remainingSeconds)}
              </span>
            </div>
          )}
          {nextTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Следующая:</span>
              <span className="font-mono text-emerald-200 tabular-nums text-xs sm:text-sm leading-none flex-shrink-0">{nextTime}</span>
            </div>
          )}
          {previousTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Предыдущая:</span>
              <span className="font-mono text-emerald-200 tabular-nums text-xs sm:text-sm leading-none flex-shrink-0">{previousTime}</span>
            </div>
          )}
        </div>
      );
    }

    // Десктопная версия
    return (
      <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        {startTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Началась:</span>
            <span className="font-mono text-emerald-200 tabular-nums">{startTime}</span>
          </div>
        )}
        {showCountdown && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Осталось:</span>
            <span className="font-mono font-semibold text-emerald-300 tabular-nums">
              {formatTimeRemaining(remainingSeconds)}
            </span>
          </div>
        )}
        {nextTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Следующая:</span>
            <span className="font-mono text-emerald-200 tabular-nums">{nextTime}</span>
          </div>
        )}
        {previousTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Предыдущая:</span>
            <span className="font-mono text-emerald-200 tabular-nums">{previousTime}</span>
          </div>
        )}
      </div>
    );
  }

  // Для следующего канала
  if (stateInfo.state === "next" && stateInfo.nextStartTime) {
    const showCountdown = nextCountdown > 0;
    const startTime = formatTimeOnly(stateInfo.nextStartTime);
    
    if (isMobile) {
      return (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
          {startTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Начнётся:</span>
              <span className="font-mono text-amber-200 tabular-nums text-xs sm:text-sm leading-none flex-shrink-0">{startTime}</span>
            </div>
          )}
          {showCountdown && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Запуск через:</span>
              <span className="font-mono font-semibold text-amber-300 tabular-nums text-sm sm:text-base leading-none flex-shrink-0">
                {formatTimeRemaining(nextCountdown)}
              </span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        {startTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Начнётся:</span>
            <span className="font-mono text-amber-200 tabular-nums">{startTime}</span>
          </div>
        )}
        {showCountdown && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Запуск через:</span>
            <span className="font-mono font-semibold text-amber-300 tabular-nums">
              {formatTimeRemaining(nextCountdown)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Для предыдущего канала
  if (stateInfo.state === "previous" && stateInfo.previousStartTime) {
    const startTime = formatTimeOnly(stateInfo.previousStartTime);
    const showElapsed = elapsedSeconds > 0;

    if (isMobile) {
      return (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 space-y-1.5">
          {startTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Была:</span>
              <span className="font-mono text-blue-200 tabular-nums text-xs sm:text-sm leading-none flex-shrink-0">{startTime}</span>
            </div>
          )}
          {showElapsed && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs text-slate-400 leading-tight">Прошло:</span>
              <span className="font-mono font-semibold text-blue-300 tabular-nums text-sm sm:text-base leading-none flex-shrink-0">
                {formatTimeElapsed(elapsedSeconds)}
              </span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        {startTime && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Была:</span>
            <span className="font-mono text-blue-200 tabular-nums">{startTime}</span>
          </div>
        )}
        {showElapsed && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Прошло:</span>
            <span className="font-mono font-semibold text-blue-300 tabular-nums">
              {formatTimeElapsed(elapsedSeconds)}
            </span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

