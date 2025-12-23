import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/authStore";
import { useNavigate, useLocation, Link } from "react-router-dom";
import type { Location } from "react-router-dom";
import SEOHead from "../../components/SEOHead";

type AuthMode = "login" | "signup";

const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { initialize, status, login, signup, error, user, logout } =
    useAuthStore((state) => ({
      initialize: state.initialize,
      status: state.status,
      login: state.login,
      signup: state.signup,
      error: state.error,
      user: state.user,
      logout: state.logout
    }));

  useEffect(() => {
    initialize();
    setIsVisible(true);
  }, [initialize]);

  useEffect(() => {
    if (status === "authenticated") {
      const redirectTo =
        (location.state as { from?: Location } | null)?.from?.pathname ??
        "/channels";
      navigate(redirectTo, { replace: true });
    }
  }, [status, navigate, location.state]);

  const isLoading = status === "loading";

  const headline = useMemo(
    () =>
      mode === "login"
        ? "Войдите в систему"
        : "Создайте аккаунт",
    [mode]
  );

  const modeLabel = mode === "login" ? "Войти" : "Зарегистрироваться";

  const secondaryActionLabel =
    mode === "login"
      ? "Нет аккаунта? Зарегистрируйтесь"
      : "Уже есть аккаунт? Войдите";

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setLocalError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await signup({ email, password });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка авторизации";
      setLocalError(message);
    }
  };

  const handleLogout = async () => {
    await logout();
    setEmail("");
    setPassword("");
  };

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Shorts AI Studio",
    description: "Генератор сценариев для коротких вертикальных видео с помощью искусственного интеллекта",
    url: "https://shortsai.ru",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "RUB"
    },
    featureList: [
      "Генерация сценариев для TikTok, Reels, Shorts",
      "Настройка каналов с персональными параметрами",
      "Использование OpenAI для создания контента"
    ]
  };

  return (
    <>
      <SEOHead
        title="Вход в Shorts AI Studio - Генератор сценариев для TikTok и Reels"
        description="Войдите в Shorts AI Studio для создания профессиональных сценариев коротких видео. Генерация уникального контента с помощью искусственного интеллекта."
        keywords="войти, регистрация, генератор сценариев, tiktok, reels, shorts, AI"
        structuredData={structuredData}
      />
      
      <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0f] text-white">
        {/* Премиальный анимированный фон */}
        <div className="absolute inset-0">
          {/* Градиентный фон */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-950/30 via-blue-950/20 to-pink-950/30" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(236,72,153,0.15),transparent_60%)]" />
          
          {/* Светящиеся орбы */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-cyan-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "0.5s" }} />
          
          {/* AI-волна эффект */}
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-purple-950/20 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 mx-auto min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          {/* Кликабельный логотип/название вверху */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 sm:left-8 sm:translate-x-0">
            <Link
              to="/"
              className="group inline-flex items-center gap-2.5 rounded-xl glass border border-white/10 px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:border-purple-500/50 hover:bg-white/5 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
              aria-label="Перейти на главную страницу"
            >
              <Sparkles size={18} className="text-purple-400 transition-transform group-hover:scale-110 group-hover:text-purple-300" />
              <span className="bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent group-hover:from-purple-300 group-hover:to-pink-300 transition-all">
                ShortsAI Studio
              </span>
            </Link>
          </div>

          {/* Форма авторизации - центрированная */}
          <div className="w-full max-w-md mx-auto">
            <div className={`glass-strong rounded-3xl border border-white/20 p-6 sm:p-8 lg:p-10 shadow-2xl transition-all duration-500 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}>
              {/* Заголовок формы */}
              <div className="mb-8 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold text-white">{headline}</h2>
              </div>

                {/* Переключатель Вход/Регистрация */}
                <div className="mb-8 flex gap-2 rounded-2xl glass p-1.5 border border-white/10">
                  {(["login", "signup"] as AuthMode[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMode(tab)}
                      className={clsx(
                        "flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300",
                        mode === tab
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {tab === "login" ? "Вход" : "Регистрация"}
                    </button>
                  ))}
                </div>

                {/* Сообщения об ошибках */}
                {(error || localError) && (
                  <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                    {localError ?? error}
                  </div>
                )}

                {/* Сообщение об успешном входе */}
                {user && (
                  <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-100 backdrop-blur-sm">
                    Вы вошли как <span className="font-semibold">{user.email}</span>
                  </div>
                )}

                {/* Форма */}
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="text-sm font-semibold text-slate-200"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="w-full rounded-xl glass border border-white/10 bg-white/5 px-5 py-4 text-white outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-purple-500/50 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/20 focus:shadow-lg focus:shadow-purple-500/10"
                      placeholder="founder@studio.me"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="text-sm font-semibold text-slate-200"
                    >
                      Пароль
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="w-full rounded-xl glass border border-white/10 bg-white/5 px-5 py-4 text-white outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-purple-500/50 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/20 focus:shadow-lg focus:shadow-purple-500/10"
                      placeholder="••••••••"
                    />
                  </div>

                  {/* Кнопка входа */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 px-6 py-4 text-base font-bold text-white transition-all duration-300 neon-glow-hover hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                    style={{ backgroundSize: "200% 200%" }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
                      {modeLabel}
                    </span>
                    <div 
                      className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                      style={{ backgroundSize: "200% 200%", animation: "gradient-shift 3s ease infinite" }} 
                    />
                  </button>
                </form>

              {/* Переключение режима и ссылка на главную */}
              <div className="mt-6 space-y-2 text-center">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-sm font-medium text-purple-400 underline-offset-4 transition hover:text-purple-300"
                >
                  {secondaryActionLabel}
                </button>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <span>или</span>
                  <Link
                    to="/"
                    className="font-medium text-slate-400 underline-offset-4 transition hover:text-purple-400"
                  >
                    вернуться на главную
                  </Link>
                </div>
              </div>

              {/* Кнопка выхода */}
              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-6 w-full rounded-xl glass border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Выйти из аккаунта
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AuthPage;
