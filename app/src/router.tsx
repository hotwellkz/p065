import { ReactNode, useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation
} from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthPage from "./pages/Auth/AuthPage";
import LandingPage from "./pages/Landing/LandingPage";
import ChannelListPage from "./pages/ChannelList/ChannelListPage";
import ChannelWizardPage from "./pages/ChannelWizard/ChannelWizardPage";
import ChannelEditPage from "./pages/ChannelEdit/ChannelEditPage";
import ChannelSchedulePage from "./pages/ChannelSchedule/ChannelSchedulePage";
import ScriptGenerationPage from "./pages/ScriptGeneration/ScriptGenerationPage";
import PrivacyPolicy from "./pages/PrivacyPolicy/PrivacyPolicy";
import AccountSettingsPage from "./pages/AccountSettings/AccountSettingsPage";
import NotificationsPage from "./pages/Notifications/NotificationsPage";
import BlotatoSetupPage from "./pages/BlotatoSetup/BlotatoSetupPage";
import { useAuthStore } from "./stores/authStore";

const FullscreenLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
    <div className="flex items-center gap-3 text-slate-200">
      <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
      Проверяем сессию...
    </div>
  </div>
);

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { status, user, initialize } = useAuthStore((state) => ({
    status: state.status,
    user: state.user,
    initialize: state.initialize
  }));

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (status === "idle" || status === "loading") {
    return <FullscreenLoader />;
  }

  if (status === "authenticated" && user) {
    return children;
  }

  return <Navigate to="/auth" replace state={{ from: location }} />;
};

const AppRouter = () => {
  const location = useLocation();

  // Базовые SEO мета-теги для страниц без собственного SEOHead
  useEffect(() => {
    if (location.pathname === "/" || location.pathname.startsWith("/channels")) {
      const defaultStructuredData = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Shorts AI Studio",
        description: "Генератор сценариев для коротких вертикальных видео с помощью искусственного интеллекта",
        url: `https://shortsai.ru${location.pathname}`,
        applicationCategory: "MultimediaApplication"
      };

      // Обновляем SEO для страниц каналов
      if (location.pathname.startsWith("/channels")) {
        document.title = "Мои каналы - Shorts AI Studio";
        const metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
        if (metaDescription) {
          metaDescription.content = "Управляйте каналами и генерируйте сценарии для TikTok, Reels, Shorts с помощью искусственного интеллекта";
        }
      }
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <AccountSettingsPage />
          </PrivateRoute>
        }
      />
    <Route
      path="/channels"
      element={
        <PrivateRoute>
          <ChannelListPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/channels/new"
      element={
        <PrivateRoute>
          <ChannelWizardPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/channels/schedule"
      element={
        <PrivateRoute>
          <ChannelSchedulePage />
        </PrivateRoute>
      }
    />
    <Route
      path="/channels/:channelId/edit"
      element={
        <PrivateRoute>
          <ChannelEditPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/channels/:channelId/blotato-setup"
      element={
        <PrivateRoute>
          <BlotatoSetupPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/channels/:channelId/generate"
      element={
        <PrivateRoute>
          <ScriptGenerationPage />
        </PrivateRoute>
      }
    />
    <Route
      path="/notifications"
      element={
        <PrivateRoute>
          <NotificationsPage />
        </PrivateRoute>
      }
    />
    <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRouter;

