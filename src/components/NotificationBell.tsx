import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { fetchUnreadCount } from "../api/notifications";

const NotificationBell = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadUnreadCount = async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUnreadCount();
    // Обновляем счётчик каждые 30 секунд
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    navigate("/notifications");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-white/10 bg-slate-900/50 text-slate-200 transition hover:border-brand/40 hover:bg-slate-800/50 hover:text-white"
      aria-label="Уведомления"
    >
      <Bell size={18} />
      {!loading && unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;



