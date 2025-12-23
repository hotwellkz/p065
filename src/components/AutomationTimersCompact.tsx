import { useEffect, useState } from "react";
import type { ChannelStateInfo } from "../utils/channelAutomationState";

interface AutomationTimersCompactProps {
  stateInfo: ChannelStateInfo;
  minIntervalMinutes: number;
}

/**
 * Форматирует секунды в формат ММ:СС или ЧЧ:ММ:СС
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Форматирует прошедшее время в формат ММ:СС или ЧЧ:ММ:СС
 */
function formatTimeElapsed(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
 * Форматирует дату в формат времени (HH:MM)
 */
function formatTimeOnly(date: Date | undefined): string {
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Компактная версия таймеров для минималистичного вида
 */
export default function AutomationTimersCompact({ stateInfo, minIntervalMinutes }: AutomationTimersCompactProps) {
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
    return (
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-emerald-300 font-medium">Сейчас идёт</span>
        {showCountdown && (
          <span className="font-mono text-emerald-300 tabular-nums">
            {formatTimeRemaining(remainingSeconds)}
          </span>
        )}
      </div>
    );
  }

  // Для следующего канала
  if (stateInfo.state === "next") {
    const startTime = formatTimeOnly(stateInfo.nextStartTime);
    const showCountdown = nextCountdown > 0;
    
    return (
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-amber-300 font-medium">Следующий:</span>
        {startTime && (
          <span className="font-mono text-amber-200 tabular-nums">{startTime}</span>
        )}
        {showCountdown && (
          <>
            <span className="text-amber-300">·</span>
            <span className="font-mono text-amber-300 tabular-nums">
              через {formatTimeRemaining(nextCountdown)}
            </span>
          </>
        )}
      </div>
    );
  }

  // Для предыдущего канала
  if (stateInfo.state === "previous") {
    const startTime = formatTimeOnly(stateInfo.previousStartTime);
    const showElapsed = elapsedSeconds > 0;

    return (
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-blue-300 font-medium">Последний:</span>
        {startTime && (
          <span className="font-mono text-blue-200 tabular-nums">{startTime}</span>
        )}
        {showElapsed && (
          <>
            <span className="text-blue-300">·</span>
            <span className="font-mono text-blue-300 tabular-nums">
              прошло {formatTimeElapsed(elapsedSeconds)}
            </span>
          </>
        )}
      </div>
    );
  }

  return null;
}

