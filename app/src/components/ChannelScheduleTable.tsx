import type { ChannelScheduleItem } from "../api/channelSchedule";
import type { ConflictKey } from "../utils/scheduleConflicts";
import ChannelScheduleRow from "./ChannelScheduleRow";
import { useToast } from "../hooks/useToast";
import Toast from "./Toast";
import { createPortal } from "react-dom";

interface ChannelScheduleTableProps {
  items: ChannelScheduleItem[];
  onItemsUpdate: (updatedItems: ChannelScheduleItem[]) => void;
  conflicts: Set<ConflictKey>;
  activeTime: string | null;
  animateActiveTime: string | null;
  remainingSeconds: number;
  minIntervalMinutes: number;
  nextTime: string | null;
  previousTime: string | null;
  previousElapsedSeconds: number;
}

const ChannelScheduleTable = ({
  items,
  onItemsUpdate,
  conflicts,
  activeTime,
  animateActiveTime,
  remainingSeconds,
  minIntervalMinutes,
  nextTime,
  previousTime,
  previousElapsedSeconds
}: ChannelScheduleTableProps) => {
  const { toasts, showError, showSuccess, removeToast } = useToast();

  // Находим максимальное количество времён для определения количества колонок
  const maxTimes = Math.max(...items.map((item) => item.times.length), 0);
  // Показываем минимум 4 колонки, максимум 10
  const timeColumnsCount = Math.min(Math.max(maxTimes, 4), 10);

  const handleUpdate = (updatedItem: ChannelScheduleItem) => {
    const updatedItems = items.map((item) =>
      item.id === updatedItem.id ? updatedItem : item
    );
    onItemsUpdate(updatedItems);
  };

  const handleError = (message: string) => {
    showError(message, 6000);
  };

  const handleSuccess = (message: string) => {
    showSuccess(message, 3000);
  };

  const handleAutomationUpdate = async (item: ChannelScheduleItem, enabled: boolean) => {
    try {
      const { updateChannelAutomation } = await import("../api/channelSchedule");
      await updateChannelAutomation(item.id, enabled);
      
      // Обновляем локальное состояние
      const updatedItems = items.map((i) =>
        i.id === item.id ? { ...i, isAutomationEnabled: enabled } : i
      );
      onItemsUpdate(updatedItems);
      
      showSuccess(
        enabled
          ? `Автоматизация включена для канала "${item.name}"`
          : `Автоматизация выключена для канала "${item.name}"`,
        3000
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Ошибка при обновлении автоматизации";
      showError(errorMsg, 6000);
      throw error; // Пробрасываем для обработки в компоненте
    }
  };

  return (
    <>
      {/* Toast уведомления - фиксированная позиция сверху */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed left-0 right-0 top-0 z-[10002] pointer-events-none px-4 sm:px-6">
            <div className="relative mx-auto max-w-md">
              {toasts.map((toast, index) => (
                <div
                  key={toast.id}
                  className="pointer-events-auto"
                  style={{
                    position: index === 0 ? "relative" : "absolute",
                    top: index === 0 ? 0 : `${index * 80}px`,
                    width: "100%",
                    transition: "top 0.2s ease-out"
                  }}
                >
                  <Toast toast={toast} onClose={removeToast} />
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
      {/* Десктопная версия - таблица */}
      <div className="hidden overflow-x-auto rounded-lg border border-white/10 bg-slate-900/50 md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-slate-800/50">
              <th className="sticky left-0 z-10 bg-slate-800/50 px-4 py-3 text-left text-sm font-semibold text-slate-300">
                №
              </th>
              <th className="sticky left-[60px] z-10 bg-slate-800/50 px-4 py-3 text-left text-sm font-semibold text-slate-300">
                Название канала
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                Автоматизация
              </th>
              {Array.from({ length: timeColumnsCount }, (_, i) => (
                <th
                  key={i}
                  className="min-w-[80px] px-4 py-3 text-center text-sm font-semibold text-slate-300"
                >
                  {i === 0 ? "Расписание" : ""}
                </th>
              ))}
              {maxTimes > timeColumnsCount && (
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                  Ещё
                </th>
              )}
              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIndex) => (
              <ChannelScheduleRow
                key={item.id}
                item={item}
                timeColumnsCount={timeColumnsCount}
                conflicts={conflicts}
                activeTime={activeTime}
                animateActiveTime={animateActiveTime}
                remainingSeconds={remainingSeconds}
                minIntervalMinutes={minIntervalMinutes}
                nextTime={nextTime}
                previousTime={previousTime}
                previousElapsedSeconds={previousElapsedSeconds}
                onUpdate={handleUpdate}
                onError={handleError}
                onSuccess={handleSuccess}
                onAutomationChange={(enabled) => handleAutomationUpdate(item, enabled)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Мобильная версия - карточки (всегда развернуты) */}
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <ChannelScheduleRow
            key={item.id}
            item={item}
            timeColumnsCount={timeColumnsCount}
            conflicts={conflicts}
            activeTime={activeTime}
            animateActiveTime={animateActiveTime}
            remainingSeconds={remainingSeconds}
            minIntervalMinutes={minIntervalMinutes}
            nextTime={nextTime}
            previousTime={previousTime}
            previousElapsedSeconds={previousElapsedSeconds}
            onUpdate={handleUpdate}
            onError={handleError}
            onSuccess={handleSuccess}
            onAutomationChange={(enabled) => handleAutomationUpdate(item, enabled)}
            isMobile={true}
          />
        ))}
      </div>
    </>
  );
};

export default ChannelScheduleTable;

