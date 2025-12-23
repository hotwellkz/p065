import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Info, Bell, Loader2, ExternalLink } from "lucide-react";
import { 
  fetchNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  type Notification,
  type NotificationStatus
} from "../../api/notifications";
import { useChannelStore } from "../../stores/channelStore";

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { channels, loadChannels } = useChannelStore((state) => ({ 
    channels: state.channels,
    loadChannels: state.loadChannels
  }));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | "all">("all");
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNotifications({
        isRead: filter === "unread" ? false : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 100
      });
      setNotifications(response.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при загрузке уведомлений");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [filter, statusFilter]);

  useEffect(() => {
    // Загружаем каналы для отображения названий
    if (channels.length === 0) {
      void loadChannels();
    }
  }, [channels.length, loadChannels]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      void handleMarkAsRead(notification.id);
    }
    if (notification.driveFileUrl) {
      window.open(notification.driveFileUrl, "_blank", "noopener,noreferrer");
    }
  };

  const getStatusIcon = (status: Notification["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 size={20} className="text-emerald-400" />;
      case "error":
        return <XCircle size={20} className="text-red-400" />;
      case "info":
        return <Info size={20} className="text-blue-400" />;
      default:
        return <Bell size={20} className="text-slate-400" />;
    }
  };

  const getChannelName = (channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    return channel?.name || channelId;
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} дн. назад`;
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-8 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate("/channels")}
              className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 sm:px-4"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Назад</span>
            </button>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Уведомления</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAll}
                className="flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 disabled:opacity-50 sm:px-4"
              >
                {isMarkingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Отметить все как прочитанные</span>
                <span className="sm:hidden">Прочитать все</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2 md:mb-6">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-1">
            <button
              onClick={() => setFilter("all")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                filter === "all"
                  ? "bg-brand text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                filter === "unread"
                  ? "bg-brand text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Непрочитанные
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-1">
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === "all"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Все статусы
            </button>
            <button
              onClick={() => setStatusFilter("success")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === "success"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Успех
            </button>
            <button
              onClick={() => setStatusFilter("error")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === "error"
                  ? "bg-red-500/20 text-red-300"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Ошибки
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-slate-200">
              <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
              Загрузка уведомлений...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200">
            <p className="font-medium">Ошибка загрузки</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={loadNotifications}
              className="mt-3 rounded bg-red-500/20 px-4 py-2 text-sm hover:bg-red-500/30"
            >
              Попробовать снова
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900/50 p-8 text-center">
            <Bell className="mx-auto h-12 w-12 text-slate-500" />
            <p className="mt-4 text-slate-400">
              {filter === "unread" ? "Нет непрочитанных уведомлений" : "Нет уведомлений"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop version - table */}
            <div className="hidden overflow-x-auto rounded-lg border border-white/10 bg-slate-900/50 md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Статус</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Заголовок</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Сообщение</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Канал</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Время</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notification) => (
                    <tr
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`cursor-pointer border-b border-white/5 transition hover:bg-slate-800/30 ${
                        !notification.isRead ? "bg-slate-800/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(notification.status)}
                          {!notification.isRead && (
                            <div className="h-2 w-2 rounded-full bg-brand" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{notification.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-300">{notification.message}</div>
                        {notification.driveFileUrl && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-brand-light">
                            <ExternalLink size={12} />
                            <span>Открыть файл</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-400">
                          {getChannelName(notification.channelId)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-400">
                          {formatDate(notification.createdAt)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile version - cards */}
            <div className="space-y-2 md:hidden">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`rounded-lg border border-white/10 bg-slate-900/50 p-3 transition ${
                    !notification.isRead ? "border-l-4 border-l-brand bg-slate-800/30" : ""
                  } ${notification.driveFileUrl ? "cursor-pointer hover:bg-slate-800/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(notification.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white">{notification.title}</h3>
                        {!notification.isRead && (
                          <div className="h-2 w-2 flex-shrink-0 rounded-full bg-brand mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{notification.message}</p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span>{getChannelName(notification.channelId)}</span>
                        <span>•</span>
                        <span>{formatDate(notification.createdAt)}</span>
                      </div>
                      {notification.driveFileUrl && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-brand-light">
                          <ExternalLink size={12} />
                          <span>Открыть файл в Google Drive</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;

