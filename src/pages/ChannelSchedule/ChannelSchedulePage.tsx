import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, RefreshCw, AlertTriangle, Pause, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchChannelSchedule, type ChannelScheduleItem } from "../../api/channelSchedule";
import ChannelScheduleTable from "../../components/ChannelScheduleTable";
import UserMenu from "../../components/UserMenu";
import NotificationBell from "../../components/NotificationBell";
import Accordion from "../../components/Accordion";
import { calculateScheduleConflicts, type ConflictKey } from "../../utils/scheduleConflicts";
import {
  fetchScheduleSettings,
  updateScheduleSettings,
  type ScheduleSettings,
  getMinIntervalForMinutes
} from "../../api/scheduleSettings";
import {
  calculateFreeRanges,
  generateSuggestedSlots,
  mapItemsToChannelSchedule,
  type FreeRange,
  type SuggestedSlot
} from "../../utils/scheduleFreeSlots";
import {
  calculateActiveTime,
  collectAllTimesMinutes,
  findNextTimeMinutes,
  findPreviousTimeMinutes
} from "../../utils/activeTimeSlot";
import { minutesToHHMM } from "../../utils/scheduleFreeSlots";

const ChannelSchedulePage = () => {
  const navigate = useNavigate();
  const [scheduleItems, setScheduleItems] = useState<ChannelScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Set<ConflictKey>>(new Set());
  const [settings, setSettings] = useState<ScheduleSettings>({
    minIntervalMinutes: 11,
    minInterval_00_13: 11,
    minInterval_13_17: 11,
    minInterval_17_24: 11,
    conflictsCheckEnabled: true,
    isAutomationPaused: false
  });
  const [settingsDraft, setSettingsDraft] = useState<ScheduleSettings>({
    minIntervalMinutes: 11,
    minInterval_00_13: 11,
    minInterval_13_17: 11,
    minInterval_17_24: 11,
    conflictsCheckEnabled: true,
    isAutomationPaused: false
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccessMessage, setSettingsSuccessMessage] = useState<string | null>(null);
  const [freeRanges, setFreeRanges] = useState<FreeRange[]>([]);
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [showAllRanges, setShowAllRanges] = useState(false);
  const [copiedSlot, setCopiedSlot] = useState<string | null>(null);
  const [activeTime, setActiveTime] = useState<string | null>(null);
  const [activeSlotStartMinutes, setActiveSlotStartMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [animateActiveTime, setAnimateActiveTime] = useState<string | null>(null);
  const [nextTime, setNextTime] = useState<string | null>(null);
  const [nextTimeMinutes, setNextTimeMinutes] = useState<number | null>(null);
  const [previousTime, setPreviousTime] = useState<string | null>(null);
  const [previousTimeMinutes, setPreviousTimeMinutes] = useState<number | null>(null);
  const [previousElapsedSeconds, setPreviousElapsedSeconds] = useState<number>(0);

  // Диагностический лог для отслеживания изменений previousTime
  useEffect(() => {
    console.log("📊 PREVIOUS TIME STATE:", {
      previousTime,
      previousTimeMinutes,
      previousElapsedSeconds
    });
  }, [previousTime, previousTimeMinutes, previousElapsedSeconds]);

  const loadSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChannelSchedule();
      setScheduleItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при загрузке расписания");
      console.error("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedule();
  }, []);

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await fetchScheduleSettings();
      setSettings(data);
      setSettingsDraft(data);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Ошибка при загрузке настроек расписания"
      );
      console.error("Failed to load schedule settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  // Пересчитываем конфликты при любом изменении локального состояния расписания
  useEffect(() => {
    if (!loading && !error) {
      if (!settings.conflictsCheckEnabled) {
        setConflicts(new Set());
        setFreeRanges([]);
        setSuggestedSlots([]);
        return;
      }

      const conflictSet = calculateScheduleConflicts(scheduleItems, settings);
      setConflicts(conflictSet);

      const ranges = calculateFreeRanges(
        mapItemsToChannelSchedule(scheduleItems),
        settings
      );
      setFreeRanges(ranges);

      const slots = generateSuggestedSlots(ranges, settings);
      setSuggestedSlots(slots);
    }
  }, [scheduleItems, loading, error, settings.conflictsCheckEnabled, settings.minInterval_00_13, settings.minInterval_13_17, settings.minInterval_17_24]);

  // Вычисляем активный временной слот и следующий ближайший слот
  useEffect(() => {
    if (loading || error || scheduleItems.length === 0) {
      setActiveTime(null);
      setActiveSlotStartMinutes(null);
      setAnimateActiveTime(null);
      setNextTime(null);
      setNextTimeMinutes(null);
      setPreviousTime(null);
      setPreviousTimeMinutes(null);
      return;
    }

    // Функция пересчёта активного и следующего слота
    const recalculateTimes = () => {
      // Используем средний интервал для расчета активного времени (для обратной совместимости)
      const avgInterval = Math.round(
        ((settings.minInterval_00_13 ?? 11) + 
         (settings.minInterval_13_17 ?? 11) + 
         (settings.minInterval_17_24 ?? 11)) / 3
      );
      const minInterval = Math.max(1, Math.min(60, avgInterval));
      
      // Получаем текущее время
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      
      // Собираем все времена
      const allTimesMinutes = collectAllTimesMinutes(scheduleItems);
      
      // Диагностический лог
      console.log("🔍 RECALCULATE TIMES:", {
        allTimesMinutes,
        nowMinutes,
        scheduleItemsCount: scheduleItems.length
      });
      
      // 1) Вычисляем активный слот
      const activeResult = calculateActiveTime(scheduleItems, minInterval);
      const newActiveTime = activeResult.activeTime;
      const newActiveMinutes = activeResult.activeMinutes;
      
      // Используем функциональное обновление для сравнения
      setActiveTime((prevActiveTime) => {
        // Проверяем, изменился ли активный слот
        if (newActiveTime !== prevActiveTime) {
          // Запускаем анимацию при смене активного слота
          if (newActiveTime) {
            setAnimateActiveTime(newActiveTime);
            // Выключаем анимацию через 2.5 секунды
            setTimeout(() => {
              setAnimateActiveTime((prev) => (prev === newActiveTime ? null : prev));
            }, 2500);
          } else {
            setAnimateActiveTime(null);
          }
        }
        return newActiveTime;
      });
      
      setActiveSlotStartMinutes(newActiveMinutes);
      
      // 2) Вычисляем следующий ближайший слот (исключая активный)
      const nextMinutes = findNextTimeMinutes(allTimesMinutes, nowMinutes, newActiveMinutes);
      
      if (nextMinutes === null) {
        setNextTime(null);
        setNextTimeMinutes(null);
      } else {
        const normalizedNext = nextMinutes % 1440;
        setNextTime(minutesToHHMM(normalizedNext));
        setNextTimeMinutes(normalizedNext);
      }
      
      // 3) Вычисляем предыдущий ближайший слот
      // previousTime всегда фиксируется и остаётся подсвеченным
      // Он не зависит от activeTime, интервалов и условий
      // Обновляется ТОЛЬКО когда наступает следующий слот
      const prevMinutes = findPreviousTimeMinutes(allTimesMinutes, nowMinutes);
      
      // Диагностические логи
      console.log("🔍 PREVIOUS TIME CALCULATION:");
      console.log("  - allTimesMinutes:", allTimesMinutes);
      console.log("  - nowMinutes:", nowMinutes);
      console.log("  - prevMinutes:", prevMinutes);
      
      if (prevMinutes === null) {
        console.log("  ⚠️ prevMinutes is null - no slots found");
        setPreviousTime(null);
        setPreviousTimeMinutes(null);
      } else {
        const normalizedPrev = prevMinutes % 1440;
        const prevTimeStr = minutesToHHMM(normalizedPrev);
        console.log("  ✅ Setting previousTime:", prevTimeStr, "minutes:", normalizedPrev);
        setPreviousTime(prevTimeStr);
        setPreviousTimeMinutes(normalizedPrev);
      }
    };

    recalculateTimes();

    // Обновляем каждые 30 секунд для более плавного обновления
    const intervalId = setInterval(() => {
      recalculateTimes();
    }, 30_000); // 30 секунд

    return () => clearInterval(intervalId);
  }, [scheduleItems, loading, error, settings.minInterval_00_13, settings.minInterval_13_17, settings.minInterval_17_24]);

  // Обратный отсчёт в секундах
  useEffect(() => {
    if (activeSlotStartMinutes === null) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const nowSeconds = nowMinutes * 60 + now.getSeconds();

      const startSeconds = activeSlotStartMinutes * 60;
      // Используем интервал для времени начала активного слота
      const minIntervalForSlot = getMinIntervalForMinutes(activeSlotStartMinutes, settings);
      const minIntervalSeconds = minIntervalForSlot * 60;

      // Учёт перехода через полночь
      let diff = nowSeconds - startSeconds;
      if (diff < 0) {
        diff += 24 * 60 * 60;
      }

      const remaining = minIntervalSeconds - diff;
      setRemainingSeconds(remaining > 0 ? remaining : 0);
    };

    // Первый расчёт сразу
    updateCountdown();

    // Обновляем каждую секунду
    const intervalId = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeSlotStartMinutes, settings]);

  // Расчёт прошедшего времени после предыдущей публикации
  useEffect(() => {
    if (previousTimeMinutes == null) {
      setPreviousElapsedSeconds(0);
      return;
    }

    const update = () => {
      const now = new Date();
      const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      let prevSeconds = previousTimeMinutes * 60;

      // Учёт перехода через полночь
      if (nowSeconds < prevSeconds) {
        prevSeconds -= 24 * 3600;
      }

      const elapsed = nowSeconds - prevSeconds;
      setPreviousElapsedSeconds(elapsed >= 0 ? elapsed : 0);
    };

    update(); // Первый расчёт сразу
    const id = setInterval(update, 30_000); // Обновляем каждые 30 секунд

    return () => clearInterval(id);
  }, [previousTimeMinutes]);

  const handleSettingsChange = (partial: Partial<ScheduleSettings>) => {
    setSettingsDraft((prev) => ({
      ...prev,
      ...partial
    }));
    setSettingsSuccessMessage(null);
    setSettingsError(null);
  };

  const handleTogglePause = async () => {
    const newPauseState = !settingsDraft.isAutomationPaused;
    setSettingsDraft((prev) => ({
      ...prev,
      isAutomationPaused: newPauseState
    }));

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccessMessage(null);

    try {
      const updated = await updateScheduleSettings({
        ...settingsDraft,
        isAutomationPaused: newPauseState
      });
      setSettings(updated);
      setSettingsDraft(updated);
      setSettingsSuccessMessage(
        newPauseState 
          ? "Автоматизация поставлена на паузу" 
          : "Автоматизация возобновлена"
      );
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Ошибка при изменении статуса паузы"
      );
      // Откатываем изменение при ошибке
      setSettingsDraft((prev) => ({
        ...prev,
        isAutomationPaused: !newPauseState
      }));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    // Валидация всех трех интервалов
    const validateInterval = (value: number | undefined, name: string): boolean => {
      if (typeof value === "undefined") return false;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 60
      ) {
        setSettingsError(`${name} должен быть целым числом от 1 до 60 минут`);
        return false;
      }
      return true;
    };

    if (
      !validateInterval(settingsDraft.minInterval_00_13, "Интервал для 00:00–13:00") ||
      !validateInterval(settingsDraft.minInterval_13_17, "Интервал для 13:00–17:00") ||
      !validateInterval(settingsDraft.minInterval_17_24, "Интервал для 17:00–24:00")
    ) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccessMessage(null);

    try {
      const updated = await updateScheduleSettings({
        minIntervalMinutes: settingsDraft.minIntervalMinutes, // Для обратной совместимости
        minInterval_00_13: settingsDraft.minInterval_00_13!,
        minInterval_13_17: settingsDraft.minInterval_13_17!,
        minInterval_17_24: settingsDraft.minInterval_17_24!,
        conflictsCheckEnabled: settingsDraft.conflictsCheckEnabled,
        isAutomationPaused: settingsDraft.isAutomationPaused
      });
      setSettings(updated);
      setSettingsDraft(updated);
      setSettingsSuccessMessage("Настройки сохранены");
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : "Ошибка при сохранении настроек расписания"
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-8 md:px-6 lg:px-8">
        {/* Header - адаптивный для мобильных */}
        <div className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate("/channels")}
              className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 sm:px-4"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">К каналам</span>
            </button>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Расписание каналов</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleTogglePause}
              disabled={settingsLoading || isSavingSettings}
              className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 sm:px-4 ${
                settingsDraft.isAutomationPaused
                  ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-200 hover:border-emerald-500/60 hover:bg-emerald-900/30"
                  : "border-white/10 bg-slate-900/50 text-slate-200 hover:border-brand/40 hover:bg-slate-800/50"
              }`}
            >
              {settingsDraft.isAutomationPaused ? (
                <>
                  <Play className="h-4 w-4" />
                  <span className="hidden sm:inline">Снять с паузы</span>
                  <span className="sm:hidden">Снять паузу</span>
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4" />
                  <span className="hidden sm:inline">Поставить на паузу</span>
                  <span className="sm:hidden">Пауза</span>
                </>
              )}
            </button>
            <button
              onClick={loadSchedule}
              disabled={loading}
              className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 disabled:opacity-50 sm:px-4"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Обновить</span>
            </button>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>

        {/* Баннер о статусе паузы */}
        {!loading && !error && settings.isAutomationPaused && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
            <div className="flex-1 text-sm">
              <p className="font-medium">
                Автоматизация публикаций сейчас на паузе
              </p>
              <p className="mt-1 text-amber-100/90">
                Новые авто-публикации не будут запускаться, пока вы не снимете паузу.
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
              Загрузка расписания...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            <p className="font-medium">Ошибка загрузки</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={loadSchedule}
              className="mt-3 rounded bg-red-500/20 px-4 py-2 text-sm hover:bg-red-500/30"
            >
              Попробовать снова
            </button>
          </div>
        ) : scheduleItems.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center">
            <p className="text-slate-400">Нет каналов с настроенным расписанием</p>
          </div>
        ) : (
          <>
            {/* Панель настроек конфликта расписания - аккордион на мобильных */}
            <div className="mb-4 md:mb-4">
              {/* Десктопная версия - без изменений */}
              <div className="hidden md:block">
                <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        Настройки проверки конфликтов расписания
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Эти настройки применяются ко всем каналам вашего аккаунта.
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={settingsDraft.conflictsCheckEnabled}
                          onChange={(e) =>
                            handleSettingsChange({
                              conflictsCheckEnabled: e.target.checked
                            })
                          }
                          disabled={settingsLoading || isSavingSettings}
                          className="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                        />
                        <span>Проверять конфликты в расписании</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleSaveSettings}
                        disabled={
                          settingsLoading ||
                          isSavingSettings ||
                          !settingsDraft.minInterval_00_13 ||
                          settingsDraft.minInterval_00_13 < 1 ||
                          settingsDraft.minInterval_00_13 > 60 ||
                          !settingsDraft.minInterval_13_17 ||
                          settingsDraft.minInterval_13_17 < 1 ||
                          settingsDraft.minInterval_13_17 > 60 ||
                          !settingsDraft.minInterval_17_24 ||
                          settingsDraft.minInterval_17_24 < 1 ||
                          settingsDraft.minInterval_17_24 > 60
                        }
                        className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                      >
                        {isSavingSettings ? "Сохранение..." : "Сохранить"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-sm font-medium text-slate-200">
                      Минимальный интервал между публикациями (мин):
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">
                              Время суток
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">
                              Интервал (мин)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-sm text-slate-200">00:00 – 13:00</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                step={1}
                                value={settingsDraft.minInterval_00_13 ?? 11}
                                onChange={(e) =>
                                  handleSettingsChange({
                                    minInterval_00_13: Number(e.target.value) || 0
                                  })
                                }
                                disabled={settingsLoading || isSavingSettings}
                                className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                              />
                            </td>
                          </tr>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-sm text-slate-200">13:00 – 17:00</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                step={1}
                                value={settingsDraft.minInterval_13_17 ?? 11}
                                onChange={(e) =>
                                  handleSettingsChange({
                                    minInterval_13_17: Number(e.target.value) || 0
                                  })
                                }
                                disabled={settingsLoading || isSavingSettings}
                                className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                              />
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 text-sm text-slate-200">17:00 – 24:00</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                step={1}
                                value={settingsDraft.minInterval_17_24 ?? 11}
                                onChange={(e) =>
                                  handleSettingsChange({
                                    minInterval_17_24: Number(e.target.value) || 0
                                  })
                                }
                                disabled={settingsLoading || isSavingSettings}
                                className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Интервал применяется только к публикациям, попадающим в соответствующий диапазон времени суток.
                    </p>
                  </div>


                  {settingsError && (
                    <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {settingsError}
                    </div>
                  )}

                  {settingsSuccessMessage && (
                    <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      {settingsSuccessMessage}
                    </div>
                  )}
                </div>

                {/* Баннер о конфликтах на десктопе */}
                {settings.conflictsCheckEnabled && conflicts.size > 0 && (
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                    <div className="text-sm">
                      <p className="font-medium">
                        Обнаружены конфликты в расписании.
                      </p>
                      <p className="mt-1 text-amber-100/90">
                        Некоторые публикации стоят ближе, чем требуется по минимальным интервалам для соответствующих диапазонов времени суток. Отредактируйте подсвеченные времена, если хотите избежать пересечений.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Мобильная версия - аккордион */}
              <div className="md:hidden">
                <Accordion
                  title="Настройки проверки конфликтов"
                  summary={
                    settings.conflictsCheckEnabled && conflicts.size > 0
                      ? `Есть ${conflicts.size} конфликт${conflicts.size > 1 ? "ов" : ""}`
                      : settings.conflictsCheckEnabled
                      ? "Проверка включена"
                      : "Проверка отключена"
                  }
                  defaultOpen={false}
                >
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Эти настройки применяются ко всем каналам вашего аккаунта.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={settingsDraft.conflictsCheckEnabled}
                        onChange={(e) =>
                          handleSettingsChange({
                            conflictsCheckEnabled: e.target.checked
                          })
                        }
                        disabled={settingsLoading || isSavingSettings}
                        className="h-4 w-4 rounded border-white/20 bg-slate-950/60 text-brand focus:ring-2 focus:ring-brand/40"
                      />
                      <span>Проверять конфликты в расписании</span>
                    </label>

                    <div className="flex flex-col gap-2 text-sm">
                      <span className="text-slate-200">
                        Минимальный интервал между публикациями (мин):
                      </span>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-400">
                                Время суток
                              </th>
                              <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-400">
                                Интервал (мин)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-white/5">
                              <td className="px-2 py-1.5 text-xs text-slate-200">00:00 – 13:00</td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={60}
                                  step={1}
                                  value={settingsDraft.minInterval_00_13 ?? 11}
                                  onChange={(e) =>
                                    handleSettingsChange({
                                      minInterval_00_13: Number(e.target.value) || 0
                                    })
                                  }
                                  disabled={settingsLoading || isSavingSettings}
                                  className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                  title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                                />
                              </td>
                            </tr>
                            <tr className="border-b border-white/5">
                              <td className="px-2 py-1.5 text-xs text-slate-200">13:00 – 17:00</td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={60}
                                  step={1}
                                  value={settingsDraft.minInterval_13_17 ?? 11}
                                  onChange={(e) =>
                                    handleSettingsChange({
                                      minInterval_13_17: Number(e.target.value) || 0
                                    })
                                  }
                                  disabled={settingsLoading || isSavingSettings}
                                  className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                  title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                                />
                              </td>
                            </tr>
                            <tr>
                              <td className="px-2 py-1.5 text-xs text-slate-200">17:00 – 24:00</td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={60}
                                  step={1}
                                  value={settingsDraft.minInterval_17_24 ?? 11}
                                  onChange={(e) =>
                                    handleSettingsChange({
                                      minInterval_17_24: Number(e.target.value) || 0
                                    })
                                  }
                                  disabled={settingsLoading || isSavingSettings}
                                  className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
                                  title="Интервал применяется только к публикациям, попадающим в этот диапазон времени суток"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-slate-400">
                        Интервал применяется только к публикациям, попадающим в соответствующий диапазон времени суток.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={
                        settingsLoading ||
                        isSavingSettings ||
                        !settingsDraft.minInterval_00_13 ||
                        settingsDraft.minInterval_00_13 < 1 ||
                        settingsDraft.minInterval_00_13 > 60 ||
                        !settingsDraft.minInterval_13_17 ||
                        settingsDraft.minInterval_13_17 < 1 ||
                        settingsDraft.minInterval_13_17 > 60 ||
                        !settingsDraft.minInterval_17_24 ||
                        settingsDraft.minInterval_17_24 < 1 ||
                        settingsDraft.minInterval_17_24 > 60
                      }
                      className="w-full min-h-[40px] rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
                    >
                      {isSavingSettings ? "Сохранение..." : "Сохранить"}
                    </button>

                    {settingsError && (
                      <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {settingsError}
                      </div>
                    )}

                    {settingsSuccessMessage && (
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                        {settingsSuccessMessage}
                      </div>
                    )}

                    {/* Баннер о конфликтах в мобильном аккордионе */}
                    {settings.conflictsCheckEnabled && conflicts.size > 0 && (
                      <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                        <div className="text-xs">
                          <p className="font-medium">
                            Обнаружены конфликты в расписании.
                          </p>
                          <p className="mt-1 text-amber-100/90">
                            Некоторые публикации стоят ближе, чем требуется по минимальным интервалам для соответствующих диапазонов времени суток. Отредактируйте подсвеченные времена, если хотите избежать пересечений.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </Accordion>
              </div>
            </div>

            {/* Панель свободных временных окон - аккордион на мобильных */}
            {settings.conflictsCheckEnabled && (
              <>
                {/* Десктопная версия */}
                <div className="mb-4 hidden md:block">
                  <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          Свободные окна для новых публикаций
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Показываются интервалы и возможные слоты с интервалом не менее минимального интервала для соответствующего диапазона времени суток от всех публикаций.
                        </p>
                      </div>
                    </div>

                    {freeRanges.length === 0 ? (
                      <div className="mt-3 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                        Свободных окон для новых публикаций не найдено с текущим интервалом.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {/* Диапазоны */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Свободные диапазоны
                          </p>
                          <div className="space-y-1 text-xs text-slate-200">
                            {(showAllRanges ? freeRanges : freeRanges.slice(0, 10)).map(
                              (range, idx) => {
                                const length = range.endMinutes - range.startMinutes + 1;
                                // Используем интервал для начала диапазона
                                const intervalForRange = getMinIntervalForMinutes(range.startMinutes, settings);
                                const maxSlots = Math.floor(
                                  length / Math.max(1, intervalForRange)
                                );
                                const fromH = Math.floor(range.startMinutes / 60)
                                  .toString()
                                  .padStart(2, "0");
                                const fromM = (range.startMinutes % 60)
                                  .toString()
                                  .padStart(2, "0");
                                const toH = Math.floor(range.endMinutes / 60)
                                  .toString()
                                  .padStart(2, "0");
                                const toM = (range.endMinutes % 60)
                                  .toString()
                                  .padStart(2, "0");

                                return (
                                  <div
                                    key={`${range.startMinutes}-${range.endMinutes}-${idx}`}
                                    className="flex flex-wrap items-center gap-2 rounded bg-slate-900/80 px-3 py-1.5"
                                  >
                                    <span className="font-mono text-slate-100">
                                      {fromH}:{fromM} – {toH}:{toM}
                                    </span>
                                    <span className="text-slate-400">
                                      • {length} мин • до {maxSlots} публикаций
                                    </span>
                                  </div>
                                );
                              }
                            )}
                          </div>
                          {freeRanges.length > 10 && (
                            <button
                              type="button"
                              onClick={() => setShowAllRanges((prev) => !prev)}
                              className="mt-2 text-xs font-medium text-slate-300 underline underline-offset-2 hover:text-white"
                            >
                              {showAllRanges ? "Свернуть" : "Показать ещё диапазоны"}
                            </button>
                          )}
                        </div>

                        {/* Предлагаемые слоты */}
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Предлагаемые свободные слоты
                          </p>
                          {suggestedSlots.length === 0 ? (
                            <p className="text-xs text-slate-400">
                              Для текущих диапазонов не удалось сгенерировать слоты.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {suggestedSlots.map((slot) => {
                                const labelMinutes = slot.minutes;
                                const hh = Math.floor(labelMinutes / 60)
                                  .toString()
                                  .padStart(2, "0");
                                const mm = (labelMinutes % 60).toString().padStart(2, "0");
                                const label = `${hh}:${mm}`;
                                return (
                                  <button
                                    key={slot.minutes}
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(label);
                                        setCopiedSlot(label);
                                        setTimeout(() => setCopiedSlot((prev) =>
                                          prev === label ? null : prev
                                        ), 2000);
                                      } catch {
                                        // ignore
                                      }
                                    }}
                                    className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-xs font-mono text-slate-100 transition hover:border-brand/60 hover:bg-brand/10 hover:text-white"
                                    title="Нажмите, чтобы скопировать время в буфер обмена"
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {copiedSlot && (
                            <p className="mt-2 text-xs text-emerald-300">
                              Время {copiedSlot} скопировано. Вставьте его в нужное поле расписания.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Мобильная версия - два отдельных аккордиона */}
                <div className="mb-4 space-y-3 md:hidden">
                  {/* Аккордион для свободных диапазонов */}
                  {freeRanges.length > 0 && (
                    <Accordion
                      title={`Свободные окна для новых публикаций (${freeRanges.length} ${freeRanges.length === 1 ? "слот" : "слотов"})`}
                      defaultOpen={false}
                    >
                      <div className="space-y-3">
                        <p className="text-xs text-slate-400">
                          Показываются интервалы и возможные слоты с интервалом не менее минимального интервала для соответствующего диапазона времени суток от всех публикаций.
                        </p>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Свободные диапазоны
                          </p>
                          <div className="space-y-1 text-xs text-slate-200">
                            {(showAllRanges ? freeRanges : freeRanges.slice(0, 10)).map(
                              (range, idx) => {
                                const length = range.endMinutes - range.startMinutes + 1;
                                // Используем интервал для начала диапазона
                                const intervalForRange = getMinIntervalForMinutes(range.startMinutes, settings);
                                const maxSlots = Math.floor(
                                  length / Math.max(1, intervalForRange)
                                );
                                const fromH = Math.floor(range.startMinutes / 60)
                                  .toString()
                                  .padStart(2, "0");
                                const fromM = (range.startMinutes % 60)
                                  .toString()
                                  .padStart(2, "0");
                                const toH = Math.floor(range.endMinutes / 60)
                                  .toString()
                                  .padStart(2, "0");
                                const toM = (range.endMinutes % 60)
                                  .toString()
                                  .padStart(2, "0");

                                return (
                                  <div
                                    key={`${range.startMinutes}-${range.endMinutes}-${idx}`}
                                    className="flex flex-wrap items-center gap-2 rounded bg-slate-900/80 px-3 py-1.5"
                                  >
                                    <span className="font-mono text-slate-100">
                                      {fromH}:{fromM} – {toH}:{toM}
                                    </span>
                                    <span className="text-slate-400">
                                      • {length} мин • до {maxSlots} публикаций
                                    </span>
                                  </div>
                                );
                              }
                            )}
                          </div>
                          {freeRanges.length > 10 && (
                            <button
                              type="button"
                              onClick={() => setShowAllRanges((prev) => !prev)}
                              className="mt-2 text-xs font-medium text-slate-300 underline underline-offset-2 hover:text-white"
                            >
                              {showAllRanges ? "Свернуть" : "Показать ещё диапазоны"}
                            </button>
                          )}
                        </div>
                      </div>
                    </Accordion>
                  )}

                  {/* Аккордион для предлагаемых слотов */}
                  {suggestedSlots.length > 0 && (
                    <Accordion
                      title={`Предлагаемые свободные слоты (${suggestedSlots.length} ${suggestedSlots.length === 1 ? "слот" : "слотов"})`}
                      defaultOpen={false}
                    >
                      <div className="space-y-3">
                        <div className="overflow-x-auto -mx-4 px-4">
                          <div className="flex gap-1.5 pb-2">
                            {suggestedSlots.map((slot) => {
                              const labelMinutes = slot.minutes;
                              const hh = Math.floor(labelMinutes / 60)
                                .toString()
                                .padStart(2, "0");
                              const mm = (labelMinutes % 60).toString().padStart(2, "0");
                              const label = `${hh}:${mm}`;
                              return (
                                <button
                                  key={slot.minutes}
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(label);
                                      setCopiedSlot(label);
                                      setTimeout(() => setCopiedSlot((prev) =>
                                        prev === label ? null : prev
                                      ), 2000);
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="flex-shrink-0 rounded-full border border-white/10 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-100 transition hover:border-brand/60 hover:bg-brand/10 hover:text-white"
                                  title="Нажмите, чтобы скопировать время в буфер обмена"
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {copiedSlot && (
                          <p className="text-xs text-emerald-300">
                            Время {copiedSlot} скопировано. Вставьте его в нужное поле расписания.
                          </p>
                        )}
                      </div>
                    </Accordion>
                  )}

                  {freeRanges.length === 0 && suggestedSlots.length === 0 && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                      Свободных окон для новых публикаций не найдено с текущим интервалом.
                    </div>
                  )}
                </div>
              </>
            )}

            <ChannelScheduleTable
              items={scheduleItems}
              onItemsUpdate={setScheduleItems}
              conflicts={conflicts}
              activeTime={activeTime}
              animateActiveTime={animateActiveTime}
              remainingSeconds={remainingSeconds}
              minIntervalMinutes={Math.round(
                ((settings.minInterval_00_13 ?? 11) + 
                 (settings.minInterval_13_17 ?? 11) + 
                 (settings.minInterval_17_24 ?? 11)) / 3
              )}
              nextTime={nextTime}
              previousTime={previousTime}
              previousElapsedSeconds={previousElapsedSeconds}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ChannelSchedulePage;

