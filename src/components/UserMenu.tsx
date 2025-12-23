import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { LogOut, User, ChevronDown, Loader2 } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const navigate = useNavigate();

  const { user, status, logout } = useAuthStore((state) => ({
    user: state.user,
    status: state.status,
    logout: state.logout
  }));

  // Вычисляем позицию меню при открытии
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 224; // w-56 = 224px
      const padding = 8; // Отступ от края экрана
      
      // Вычисляем правый отступ с учетом ширины меню
      let right = window.innerWidth - buttonRect.right;
      
      // Если меню выходит за правый край экрана, корректируем позицию
      if (buttonRect.right + menuWidth > window.innerWidth - padding) {
        right = padding;
      }
      
      // Проверяем, не выходит ли меню за нижний край экрана
      const menuHeight = 200; // Примерная высота меню
      let top = buttonRect.bottom + 8;
      
      if (buttonRect.bottom + menuHeight + 8 > window.innerHeight - padding) {
        // Если не помещается снизу, показываем сверху
        top = buttonRect.top - menuHeight - 8;
        // Если и сверху не помещается, прижимаем к верхнему краю
        if (top < padding) {
          top = padding;
        }
      }
      
      setMenuPosition({
        top,
        right
      });
    } else {
      setMenuPosition(null);
    }
  }, [isOpen]);

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Используем capture phase для более надежного определения кликов вне меню
      document.addEventListener("mousedown", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isOpen]);

  // Обновляем позицию при скролле или изменении размера окна
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (buttonRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        const menuWidth = 224; // w-56 = 224px
        const padding = 8;
        
        let right = window.innerWidth - buttonRect.right;
        if (buttonRect.right + menuWidth > window.innerWidth - padding) {
          right = padding;
        }
        
        const menuHeight = 200;
        let top = buttonRect.bottom + 8;
        if (buttonRect.bottom + menuHeight + 8 > window.innerHeight - padding) {
          top = buttonRect.top - menuHeight - 8;
          if (top < padding) {
            top = padding;
          }
        }
        
        setMenuPosition({ top, right });
      }
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  // Закрытие меню при нажатии Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("Ошибка при выходе:", error);
      // Всё равно делаем редирект
      navigate("/auth", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleProfileClick = () => {
    setIsOpen(false);
    navigate("/settings");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
        <div className="h-8 w-8 animate-pulse rounded-full bg-slate-700" />
        <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-700 sm:block" />
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Генерируем инициалы из email или displayName
  const getInitials = () => {
    if (user.displayName) {
      return user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const displayName = user.displayName || user.email || "Пользователь";
  const initials = getInitials();

  const menuContent = isOpen && menuPosition ? (
    <div
      ref={menuRef}
      className="fixed w-56 rounded-xl border border-white/10 bg-slate-900 shadow-2xl z-[10000] max-h-[calc(100vh-16px)] overflow-y-auto"
      style={{
        top: `${menuPosition.top}px`,
        right: `${menuPosition.right}px`
      }}
    >
      <div className="p-2">
        {/* Информация о пользователе */}
        <div className="rounded-lg border border-white/5 bg-slate-800/40 px-3 py-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-light">
              {initials}
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

        {/* Пункты меню */}
        <button
          type="button"
          onClick={handleProfileClick}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
        >
          <User size={16} />
          <span>Профиль</span>
        </button>

        <div className="my-1 h-px bg-white/5" />

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-900/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingOut ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <LogOut size={16} />
          )}
          <span>{isLoggingOut ? "Выход..." : "Выйти"}</span>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 transition hover:border-brand/40 hover:bg-slate-800 hover:text-white sm:gap-3"
          aria-label="Меню пользователя"
          aria-expanded={isOpen}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-light">
            {initials}
          </div>
          <span className="hidden max-w-[120px] truncate sm:block">{displayName}</span>
          <ChevronDown
            size={16}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Рендерим меню через Portal в document.body для гарантированного отображения поверх всего */}
      {typeof document !== "undefined" && createPortal(menuContent, document.body)}
    </>
  );
};

export default UserMenu;

