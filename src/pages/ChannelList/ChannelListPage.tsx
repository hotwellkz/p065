import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, Video, Wand2, Calendar, MoreVertical, Bell, Grid3x3, List, User, LogOut, Search, X, AlignJustify, Play, Edit2, Download, Upload } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from "@dnd-kit/sortable";
import ChannelCard from "../../components/ChannelCard";
import ChannelCardCompact from "../../components/ChannelCardCompact";
import AIAutoGenerateModal from "../../components/AIAutoGenerateModal";
import CustomPromptModal from "../../components/CustomPromptModal";
import ChannelImportModal from "../../components/ChannelImportModal";
import DeleteChannelModal from "../../components/DeleteChannelModal";
import UserMenu from "../../components/UserMenu";
import NotificationBell from "../../components/NotificationBell";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type { Channel } from "../../domain/channel";
import { calculateChannelStates, type ChannelStateInfo } from "../../utils/channelAutomationState";
import { fetchScheduleSettings } from "../../api/scheduleSettings";
import { getAuthToken } from "../../utils/auth";
import { getUserSettings, updateUserSettings } from "../../api/userSettings";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

const ChannelListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore((state) => ({
    user: state.user,
    logout: state.logout
  }));

  const { channels, loading, error, fetchChannels, deleteChannel, reorderChannels } =
    useChannelStore((state) => ({
      channels: state.channels,
      loading: state.loading,
      error: state.error,
      fetchChannels: state.fetchChannels,
      deleteChannel: state.deleteChannel,
      reorderChannels: state.reorderChannels
    }));

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [selectedChannelForAI, setSelectedChannelForAI] =
    useState<Channel | null>(null);
  const [isCustomPromptModalOpen, setIsCustomPromptModalOpen] = useState(false);
  const [selectedChannelForCustomPrompt, setSelectedChannelForCustomPrompt] =
    useState<Channel | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [localChannels, setLocalChannels] = useState<Channel[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [channelStates, setChannelStates] = useState<Map<string, ChannelStateInfo>>(new Map());
  const [minIntervalMinutes, setMinIntervalMinutes] = useState(11);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Состояние для режима отображения (grid/list/compact)
  type ChannelsViewMode = "grid" | "list" | "compact";
  const [layoutMode, setLayoutMode] = useState<ChannelsViewMode>(() => {
    const saved = localStorage.getItem("channels-layout-mode");
    return (saved === "grid" || saved === "list" || saved === "compact") ? saved : "grid";
  });

  // Сохраняем режим в localStorage при изменении
  useEffect(() => {
    localStorage.setItem("channels-layout-mode", layoutMode);
  }, [layoutMode]);

  // Синхронизируем локальное состояние с глобальным
  useEffect(() => {
    setLocalChannels(channels);
  }, [channels]);

  // Функция для фильтрации каналов по поисковому запросу
  const filteredChannels = localChannels.filter((channel) => {
    if (!searchQuery.trim()) {
      return true;
    }
    
    const query = searchQuery.toLowerCase().trim();
    const searchableText = [
      channel.name,
      channel.platform,
      channel.niche,
      channel.audience,
      channel.tone,
      channel.language
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    
    return searchableText.includes(query);
  });

  // Настройка сенсоров для drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Минимальное расстояние для начала перетаскивания (в пикселях)
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    if (!user?.uid) {
      return;
    }

    const oldIndex = localChannels.findIndex((ch) => ch.id === active.id);
    const newIndex = localChannels.findIndex((ch) => ch.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Оптимистично обновляем локальное состояние
    const newChannels = arrayMove(localChannels, oldIndex, newIndex);
    setLocalChannels(newChannels);

    // Отправляем новый порядок на сервер
    try {
      const orderedIds = newChannels.map((ch) => ch.id);
      await reorderChannels(user.uid, orderedIds);
    } catch (error) {
      // В случае ошибки откатываем изменения
      console.error("Failed to reorder channels:", error);
      setLocalChannels(channels);
      alert("Не удалось сохранить новый порядок каналов. Попробуйте ещё раз.");
    }
  };

  useEffect(() => {
    if (user?.uid) {
      void fetchChannels(user.uid);
    }
  }, [user?.uid, fetchChannels]);

  // Автоматический редирект на мастер для новых пользователей
  useEffect(() => {
    const checkAndRedirectToWizard = async () => {
      // Пропускаем, если каналы ещё загружаются
      if (loading) {
        return;
      }

      // Пропускаем, если уже на странице мастера
      if (location.pathname === "/channels/new") {
        return;
      }

      // Если есть ошибка загрузки каналов, не редиректим
      // чтобы не создавать ложное ощущение, что у пользователя нет каналов
      if (error) {
        return;
      }

      // Если каналов нет, проверяем флаг hasSeenChannelWizard
      if (channels.length === 0 && user?.uid) {
        try {
          const settings = await getUserSettings();
          
          // Если пользователь ещё не видел мастер, редиректим его туда
          if (!settings.hasSeenChannelWizard) {
            // Устанавливаем флаг, что мастер был показан
            try {
              await updateUserSettings({ hasSeenChannelWizard: true });
            } catch (updateError) {
              // Игнорируем ошибку обновления флага - не критично
              console.warn("Failed to update hasSeenChannelWizard flag:", updateError);
            }
            
            // Редиректим на мастер создания канала
            navigate("/channels/new", { replace: true });
          }
        } catch (settingsError) {
          // Если не удалось получить настройки, не редиректим
          // чтобы не создавать ложное ощущение, что у пользователя нет каналов
          console.error("Failed to check user settings for wizard redirect:", settingsError);
        }
      }
    };

    void checkAndRedirectToWizard();
  }, [channels.length, loading, error, user?.uid, navigate, location.pathname]);

  // Загружаем настройки расписания для получения minIntervalMinutes
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchScheduleSettings();
        // Используем среднее значение интервалов для обратной совместимости
        const avgInterval = Math.round(
          ((settings.minInterval_00_13 ?? 11) + 
           (settings.minInterval_13_17 ?? 11) + 
           (settings.minInterval_17_24 ?? 11)) / 3
        );
        setMinIntervalMinutes(avgInterval);
      } catch (error) {
        console.error("Failed to load schedule settings:", error);
      }
    };
    void loadSettings();
  }, []);

  // Вычисляем состояния каналов
  useEffect(() => {
    if (localChannels.length === 0) {
      setChannelStates(new Map());
      return;
    }

    const recalculateStates = () => {
      const states = calculateChannelStates(localChannels, minIntervalMinutes);
      setChannelStates(states);
    };

    recalculateStates();

    // Обновляем каждые 30 секунд
    const intervalId = setInterval(recalculateStates, 30_000);

    return () => clearInterval(intervalId);
  }, [localChannels, minIntervalMinutes]);

  const handleDelete = async (channel: Channel) => {
    if (!user?.uid) {
      return;
    }
    setChannelToDelete(channel);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!user?.uid || !channelToDelete) {
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        setToast({
          message: "Ошибка авторизации. Перезайдите в систему.",
          type: "error"
        });
        return;
      }

      const response = await fetch(
        `${backendBaseUrl}/api/channels/${channelToDelete.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Ошибка при удалении канала");
      }

      // Обновляем локальное состояние
      await deleteChannel(user.uid, channelToDelete.id);

      setToast({
        message: "Канал и все связанные данные успешно удалены",
        type: "success"
      });

      setIsDeleteModalOpen(false);
      setChannelToDelete(null);
    } catch (error: any) {
      console.error("Error deleting channel:", error);
      setToast({
        message: error?.message || "Ошибка при удалении канала",
        type: "error"
      });
      throw error; // Пробрасываем ошибку для обработки в модалке
    }
  };

  const goToWizard = () => {
    navigate("/channels/new");
  };

  const goToEdit = (channelId: string) => {
    navigate(`/channels/${channelId}/edit`);
  };

  const goToGeneration = (channelId: string) => {
    navigate(`/channels/${channelId}/generate`);
  };

  const handleAutoGenerate = (channel: Channel) => {
    setSelectedChannelForAI(channel);
    setIsAIModalOpen(true);
  };

  const handleCloseAIModal = () => {
    setIsAIModalOpen(false);
    setSelectedChannelForAI(null);
  };

  const handleCustomPrompt = (channel: Channel) => {
    setSelectedChannelForCustomPrompt(channel);
    setIsCustomPromptModalOpen(true);
  };

  const handleCloseCustomPromptModal = () => {
    setIsCustomPromptModalOpen(false);
    setSelectedChannelForCustomPrompt(null);
  };

  const handleCustomPromptSuccess = () => {
    // Можно добавить обновление списка каналов или показ уведомления
    console.log("Custom prompt sent successfully");
  };

  const handleMobileLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowMobileMenu(false);
      setMenuPosition(null);
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("Ошибка при выходе:", error);
      // Всё равно делаем редирект
      setShowMobileMenu(false);
      setMenuPosition(null);
      navigate("/auth", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleMobileProfileClick = () => {
    setShowMobileMenu(false);
    setMenuPosition(null);
    navigate("/settings");
  };

  const handleExport = async () => {
    if (!user?.uid) {
      return;
    }

    setIsExporting(true);
    try {
      // Получаем токен авторизации
      const token = await getAuthToken();

      const exportUrl = `${backendBaseUrl}/api/channels/export`;
      
      // Логируем для отладки (только в development)
      if (import.meta.env.DEV) {
        console.log("Export: отправка запроса", {
          url: exportUrl,
          backendBaseUrl,
          hasToken: !!token
        });
      }

      const response = await fetch(exportUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Не удалось экспортировать каналы");
      }

      // Получаем имя файла из заголовка Content-Disposition или используем дефолтное
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "shorts-channels.json";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Скачиваем файл
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Показываем успешное сообщение
      setToast({ 
        message: `Экспортировано каналов: ${channels.length}`, 
        type: "success" 
      });
      setTimeout(() => setToast(null), 3000);
    } catch (error: any) {
      console.error("Export error:", error);
      
      // Определяем тип ошибки
      let errorMessage = "Не удалось экспортировать каналы. Попробуйте позже.";
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        errorMessage = "Не удалось подключиться к серверу. Проверьте, запущен ли backend.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setToast({ message: errorMessage, type: "error" });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    setIsImportModalOpen(true);
  };

  const handleImportClose = () => {
    setIsImportModalOpen(false);
    // Обновляем список каналов после импорта
    if (user?.uid) {
      void fetchChannels(user.uid);
    }
  };

  return (
    <div className="relative min-h-screen px-3 py-3 text-white sm:px-4 sm:py-10 md:py-4 lg:py-6">
      {/* Премиальный фон */}
      <div className="channels-premium-bg" />
      
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-4 md:gap-4 lg:gap-6">
        {/* Toast уведомления */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-[10001] rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm transition-all ${
              toast.type === "success"
                ? "bg-green-500/90 text-white"
                : "bg-red-500/90 text-white"
            }`}
            onClick={() => setToast(null)}
            role="alert"
          >
            {toast.message}
          </div>
        )}

        {/* Десктопная версия заголовка */}
        <header className="hidden flex-col gap-3 rounded-2xl channels-premium-header p-4 md:flex lg:p-5">
          {/* Основной контейнер: заголовок слева, кнопки справа */}
          <div className="flex items-start justify-between gap-4 lg:gap-6">
            {/* Левая часть: заголовок и описание (ограничиваем ширину) */}
            <div className="flex-1 min-w-0 max-w-[45%]">
              <div className="flex items-baseline gap-2 flex-wrap mb-1">
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-medium">
                  Панель канала
                </p>
                {user && (
                  <p className="text-[10px] text-slate-500 truncate">
                    Вы вошли как <span className="text-slate-400 font-medium">{user.email}</span>
                  </p>
                )}
              </div>
              <h1 className="text-xl lg:text-2xl font-bold premium-title mb-1">
                Ваши каналы ({channels.length})
              </h1>
              <p className="text-xs text-slate-400 premium-subtitle leading-snug line-clamp-2">
                Управляйте настройками, запускайте генерации сценариев и создавайте
                новые каналы под разные соцсети.
              </p>
            </div>

            {/* Правая часть: кнопки, переключатели, аватар */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {/* Группа основных кнопок */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={goToWizard}
                  className="premium-btn-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white lg:px-3.5 lg:py-2 lg:text-sm"
                >
                  <Plus size={14} className="lg:w-4 lg:h-4" />
                  <span className="hidden lg:inline">Создать</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/channels/schedule")}
                  className="premium-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-slate-200 lg:px-3 lg:py-2 lg:text-sm"
                  title="Расписание"
                >
                  <Calendar size={14} className="lg:w-4 lg:h-4" />
                  <span className="hidden xl:inline">Расписание</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/scripts")}
                  className="premium-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-slate-200 lg:px-3 lg:py-2 lg:text-sm"
                  title="Генератор"
                >
                  <Wand2 size={14} className="lg:w-4 lg:h-4" />
                  <span className="hidden xl:inline">Генератор</span>
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || channels.length === 0}
                  className="premium-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-slate-200 lg:px-3 lg:py-2 lg:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Экспорт каналов"
                >
                  {isExporting ? (
                    <Loader2 size={14} className="lg:w-4 lg:h-4 animate-spin" />
                  ) : (
                    <Download size={14} className="lg:w-4 lg:h-4" />
                  )}
                  <span className="hidden xl:inline">Экспорт</span>
                </button>
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="premium-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-slate-200 lg:px-3 lg:py-2 lg:text-sm"
                  title="Импорт каналов"
                >
                  <Upload size={14} className="lg:w-4 lg:h-4" />
                  <span className="hidden xl:inline">Импорт</span>
                </button>
              </div>
              {/* Переключатель раскладки Grid/List/Compact */}
              <div className="hidden md:flex items-center gap-0.5 rounded-xl premium-btn-secondary p-0.5">
                <button
                  type="button"
                  onClick={() => setLayoutMode("grid")}
                  className={`flex items-center justify-center rounded-lg px-2 py-1.5 text-xs transition-all lg:px-2 lg:py-1.5 ${
                    layoutMode === "grid"
                      ? "bg-brand text-white shadow-lg"
                      : "text-slate-300 hover:text-white"
                  }`}
                  title="Сетка"
                >
                  <Grid3x3 size={14} className="lg:w-4 lg:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("list")}
                  className={`flex items-center justify-center rounded-lg px-2 py-1.5 text-xs transition-all lg:px-2 lg:py-1.5 ${
                    layoutMode === "list"
                      ? "bg-brand text-white shadow-lg"
                      : "text-slate-300 hover:text-white"
                  }`}
                  title="Список"
                >
                  <List size={14} className="lg:w-4 lg:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("compact")}
                  className={`flex items-center justify-center rounded-lg px-2 py-1.5 text-xs transition-all lg:px-2 lg:py-1.5 ${
                    layoutMode === "compact"
                      ? "bg-brand text-white shadow-lg"
                      : "text-slate-300 hover:text-white"
                  }`}
                  title="Минималистичный"
                >
                  <AlignJustify size={14} className="lg:w-4 lg:h-4" />
                </button>
              </div>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          {/* Вторая строка: поиск */}
          {channels.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 lg:left-3 lg:h-4 lg:w-4" />
                <input
                  type="text"
                  placeholder="Поиск по названию, платформе, нише, аудитории..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900/50 px-8 py-2 text-xs text-white placeholder:text-slate-500 focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20 transition-all lg:px-10 lg:py-2.5 lg:text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors lg:right-3"
                    aria-label="Очистить поиск"
                  >
                    <X className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="mt-1.5 text-[10px] lg:text-xs text-slate-500">
                  Найдено каналов: {filteredChannels.length} из {channels.length}
                </p>
              )}
            </div>
          )}
        </header>

        {/* Мобильная версия заголовка */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between rounded-2xl channels-premium-header p-4">
            <h1 className="text-xl font-bold premium-title">
              Ваши каналы ({channels.length})
            </h1>
            <div className="flex items-center gap-2">
              <div className="relative mobile-header-menu-container">
                <button
                  ref={mobileMenuButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const button = e.currentTarget;
                    const rect = button.getBoundingClientRect();
                    const menuWidth = 192; // w-48 = 12rem = 192px
                    const estimatedMenuHeight = 400; // примерная высота меню
                    const padding = 8;
                    
                    // Вычисляем позицию справа от правого края кнопки
                    let right = window.innerWidth - rect.right;
                    
                    // Вычисляем позицию сверху (открываем вниз)
                    let top = rect.bottom + padding;
                    
                    // Проверяем, помещается ли меню снизу
                    if (top + estimatedMenuHeight > window.innerHeight - padding) {
                      // Если не помещается снизу, открываем вверх
                      top = rect.top - estimatedMenuHeight - padding;
                      // Если и вверх не помещается, открываем снизу с ограничением высоты
                      if (top < padding) {
                        top = rect.bottom + padding;
                      }
                    }
                    
                    // Проверяем, не выходит ли меню за левый край
                    const leftPosition = window.innerWidth - right - menuWidth;
                    if (leftPosition < padding) {
                      right = window.innerWidth - menuWidth - padding;
                    }
                    
                    setMenuPosition({
                      top: Math.max(padding, Math.min(top, window.innerHeight - padding)),
                      right: Math.max(padding, Math.min(right, window.innerWidth - padding))
                    });
                    setShowMobileMenu(!showMobileMenu);
                  }}
                  className="premium-btn-secondary flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-2 text-slate-300"
                  aria-label="Меню"
                >
                  <MoreVertical size={20} />
                </button>
                {showMobileMenu && menuPosition && createPortal(
                  <>
                    <div
                      className="fixed inset-0 bg-transparent"
                      style={{ zIndex: 99998 }}
                      onClick={() => {
                        setShowMobileMenu(false);
                        setMenuPosition(null);
                      }}
                    />
                    <div 
                      className="mobile-header-menu-dropdown fixed w-48 rounded-lg channels-premium-header p-2 shadow-2xl z-[99999]"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                        maxHeight: `calc(100vh - ${menuPosition.top + 16}px)`,
                        maxWidth: `calc(100vw - ${menuPosition.right + 16}px)`,
                        overflowY: 'auto'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/notifications");
                          setShowMobileMenu(false);
                          setMenuPosition(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Bell size={16} />
                        Уведомления
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/channels/schedule");
                          setShowMobileMenu(false);
                          setMenuPosition(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Calendar size={16} />
                        Расписание
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigate("/scripts");
                          setShowMobileMenu(false);
                          setMenuPosition(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Wand2 size={16} />
                        Генератор
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleExport();
                          setShowMobileMenu(false);
                          setMenuPosition(null);
                        }}
                        disabled={isExporting || channels.length === 0}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExporting ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Download size={16} />
                        )}
                        Экспорт каналов
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleImportClick();
                          setShowMobileMenu(false);
                          setMenuPosition(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                      >
                        <Upload size={16} />
                        Импорт каналов
                      </button>
                      <div className="my-2 border-t border-white/10" />
                      {/* Переключатель раскладки для мобильной версии */}
                      <div className="flex items-center gap-1 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLayoutMode("grid");
                            setShowMobileMenu(false);
                            setMenuPosition(null);
                          }}
                          className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-all ${
                            layoutMode === "grid"
                              ? "bg-brand text-white"
                              : "text-slate-300 hover:text-white"
                          }`}
                          title="Сетка"
                        >
                          <Grid3x3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLayoutMode("list");
                            setShowMobileMenu(false);
                            setMenuPosition(null);
                          }}
                          className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-all ${
                            layoutMode === "list"
                              ? "bg-brand text-white"
                              : "text-slate-300 hover:text-white"
                          }`}
                          title="Список"
                        >
                          <List size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLayoutMode("compact");
                            setShowMobileMenu(false);
                            setMenuPosition(null);
                          }}
                          className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-all ${
                            layoutMode === "compact"
                              ? "bg-brand text-white"
                              : "text-slate-300 hover:text-white"
                          }`}
                          title="Минималистичный"
                        >
                          <AlignJustify size={16} />
                        </button>
                      </div>
                      <div className="my-2 border-t border-white/10" />
                      {/* Пункты меню пользователя для мобильной версии */}
                      {user && (
                        <>
                          <div className="rounded-lg border border-white/5 bg-slate-800/40 px-3 py-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-light">
                                {user.displayName 
                                  ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                                  : user.email?.[0].toUpperCase() || "U"}
                              </div>
                              <div className="min-w-0 flex-1">
                                {user.displayName && (
                                  <div className="truncate text-sm font-medium text-white">
                                    {user.displayName}
                                  </div>
                                )}
                                <div className="truncate text-xs text-slate-400">{user.email}</div>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleMobileProfileClick}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800/50"
                          >
                            <User size={16} />
                            Профиль
                          </button>
                          <div className="my-1 border-t border-white/10" />
                          <button
                            type="button"
                            onClick={handleMobileLogout}
                            disabled={isLoggingOut}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-900/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoggingOut ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <LogOut size={16} />
                            )}
                            <span>{isLoggingOut ? "Выход..." : "Выйти"}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </>,
                  document.body
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={goToWizard}
            className="premium-btn-primary w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
          >
            <Plus size={18} />
            Создать канал
          </button>

          {/* Поиск каналов для мобильной версии */}
          {channels.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск каналов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-10 py-3 text-sm text-white placeholder:text-slate-400 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {searchQuery && channels.length > 0 && (
            <p className="text-xs text-slate-400">
              Найдено: {filteredChannels.length} из {channels.length}
            </p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl channels-premium-header py-16">
            <div className="flex items-center gap-3 text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
              <span className="font-medium">Загружаем каналы...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/20 backdrop-blur-sm px-6 py-4 text-red-100 shadow-lg">
            <span className="font-semibold">Ошибка:</span> {error}
          </div>
        )}

        {!loading && searchQuery && filteredChannels.length === 0 && channels.length > 0 && (
          <div className="rounded-3xl channels-premium-header p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-slate-900/50 backdrop-blur-sm text-slate-400 shadow-lg">
              <Search size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-bold premium-title">
              Ничего не найдено
            </h2>
            <p className="mt-2 text-slate-300 premium-subtitle">
              Попробуйте изменить поисковый запрос или{" "}
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-brand-light hover:text-brand underline"
              >
                очистить поиск
              </button>
            </p>
          </div>
        )}

        {!loading && channels.length === 0 && (
          <div className="rounded-3xl channels-premium-header p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-slate-900/50 backdrop-blur-sm text-brand-light shadow-lg">
              <Video size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-bold premium-title">
              Каналы ещё не созданы
            </h2>
            <p className="mt-2 text-slate-300 premium-subtitle">
              Пройдите мастер настройки, чтобы задать платформу, длительность,
              аудиторию и тон, а затем начните генерацию сценариев.
            </p>
            <button
              type="button"
              onClick={goToWizard}
              className="premium-btn-primary mt-6 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
            >
              Запустить мастер
            </button>
          </div>
        )}

        {filteredChannels.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredChannels.map((ch) => ch.id)}
              strategy={rectSortingStrategy}
            >
              {layoutMode === "compact" ? (
                <div className="flex flex-col gap-1.5 pb-6 sm:pb-0">
                  {filteredChannels.map((channel, index) => {
                    const stateInfo = channelStates.get(channel.id);
                    return (
                      <ChannelCardCompact
                        key={channel.id}
                        channel={channel}
                        index={index}
                        automationStateInfo={stateInfo}
                        minIntervalMinutes={minIntervalMinutes}
                        onEdit={() => goToEdit(channel.id)}
                        onDelete={() => handleDelete(channel)}
                        onGenerate={() => goToGeneration(channel.id)}
                        onAutoGenerate={() => handleAutoGenerate(channel)}
                        onCustomPrompt={() => handleCustomPrompt(channel)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`transition-all duration-300 pb-6 sm:pb-0 ${
                    layoutMode === "grid"
                      ? "grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                      : "flex flex-col gap-3 sm:gap-4"
                  }`}
                >
                  {filteredChannels.map((channel, index) => {
                    const stateInfo = channelStates.get(channel.id);
                    return (
                      <div
                        key={channel.id}
                        className={layoutMode === "list" ? "w-full" : ""}
                      >
                        <ChannelCard
                          channel={channel}
                          index={index}
                          compact
                          automationState={stateInfo?.state || "default"}
                          automationStateInfo={stateInfo}
                          minIntervalMinutes={minIntervalMinutes}
                          onEdit={() => goToEdit(channel.id)}
                          onDelete={() => handleDelete(channel)}
                          onGenerate={() => goToGeneration(channel.id)}
                          onAutoGenerate={() => handleAutoGenerate(channel)}
                          onCustomPrompt={() => handleCustomPrompt(channel)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* AI Auto Generate Modal */}
      {selectedChannelForAI && (
        <AIAutoGenerateModal
          isOpen={isAIModalOpen}
          channel={selectedChannelForAI}
          onClose={handleCloseAIModal}
        />
      )}

      {/* Custom Prompt Modal */}
      {selectedChannelForCustomPrompt && (
        <CustomPromptModal
          channel={selectedChannelForCustomPrompt}
          isOpen={isCustomPromptModalOpen}
          onClose={handleCloseCustomPromptModal}
          onSuccess={handleCustomPromptSuccess}
        />
      )}

      {/* Channel Import Modal */}
      <ChannelImportModal
        isOpen={isImportModalOpen}
        onClose={handleImportClose}
      />

      {/* Delete Channel Modal */}
      <DeleteChannelModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setChannelToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        channelName={channelToDelete?.name || "канал"}
      />
    </div>
  );
};

export default ChannelListPage;

