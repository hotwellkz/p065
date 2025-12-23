import { useEffect } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import TelegramIntegration from "../../components/TelegramIntegration";
import { SectionHelpButton } from "../../components/aiAssistant/SectionHelpButton";
import { BlottataApiKeySettings } from "../../components/BlottataApiKeySettings";

const AccountSettingsPage = () => {
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 text-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
          Загрузка настроек...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        {/* Кнопка навигации назад к каналам */}
        <div className="mb-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-brand/40 hover:bg-slate-800/50 hover:text-white sm:px-4"
            aria-label="Вернуться к каналам"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">К каналам</span>
            <span className="sm:hidden">Назад</span>
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Настройки аккаунта</h1>
          <p className="mt-2 text-sm text-slate-400">
            Здесь в будущем появятся дополнительные настройки аккаунта.
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Профиль</h2>
              <SectionHelpButton
                sectionKey="profile"
                sectionTitle="Профиль"
                context={{ email: user.email }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Вы вошли как{" "}
              <span className="font-semibold text-slate-100">
                {user.email ?? "пользователь Firebase"}
              </span>
              .
            </p>
          </div>

          <div className="border-t border-white/10 pt-6">
            <TelegramIntegration />
          </div>

          <BlottataApiKeySettings />
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsPage;


