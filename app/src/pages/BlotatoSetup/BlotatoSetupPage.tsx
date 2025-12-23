import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Key, CheckCircle2, ExternalLink, Loader2, Youtube, Instagram, Music } from "lucide-react";
import { getUserSettings, updateUserSettings } from "../../api/userSettings";
import { useChannelStore } from "../../stores/channelStore";
import { useAuthStore } from "../../stores/authStore";
import { useToast } from "../../hooks/useToast";

export default function BlotatoSetupPage() {
  const navigate = useNavigate();
  const { channelId } = useParams<{ channelId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { updateChannel, fetchChannels } = useChannelStore();
  const { showSuccess, showError } = useToast();

  // Состояния для API-ключа
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);

  // Состояния для ID платформ
  const [tiktokId, setTiktokId] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [youtubeId, setYoutubeId] = useState("");
  const [facebookId, setFacebookId] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [threadsId, setThreadsId] = useState("");
  const [twitterId, setTwitterId] = useState("");
  const [linkedinId, setLinkedinId] = useState("");
  const [pinterestId, setPinterestId] = useState("");
  const [pinterestBoardId, setPinterestBoardId] = useState("");
  const [blueskyId, setBlueskyId] = useState("");
  const [savingPlatforms, setSavingPlatforms] = useState(false);

  // Состояния для аккордеона
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  useEffect(() => {
    // Загружаем данные канала и настройки пользователя
    const loadData = async () => {
      if (!channelId || !user?.uid) {
        return;
      }

      try {
        // Загружаем каналы
        await fetchChannels(user.uid);
        const { channels } = useChannelStore.getState();
        const channel = channels.find((c) => c.id === channelId);
        
        if (channel) {
          // Загружаем существующие ID платформ из канала
          if (channel.blotataTiktokId) setTiktokId(channel.blotataTiktokId);
          if (channel.blotataInstagramId) setInstagramId(channel.blotataInstagramId);
          if (channel.blotataYoutubeId) setYoutubeId(channel.blotataYoutubeId);
          if (channel.blotataFacebookId) setFacebookId(channel.blotataFacebookId);
          if (channel.blotataFacebookPageId) setFacebookPageId(channel.blotataFacebookPageId);
          if (channel.blotataThreadsId) setThreadsId(channel.blotataThreadsId);
          if (channel.blotataTwitterId) setTwitterId(channel.blotataTwitterId);
          if (channel.blotataLinkedinId) setLinkedinId(channel.blotataLinkedinId);
          if (channel.blotataPinterestId) setPinterestId(channel.blotataPinterestId);
          if (channel.blotataPinterestBoardId) setPinterestBoardId(channel.blotataPinterestBoardId);
          if (channel.blotataBlueskyId) setBlueskyId(channel.blotataBlueskyId);
          
          // Если в канале уже есть API-ключ, считаем его сохранённым
          if (channel.blotataApiKey) {
            setApiKeySaved(true);
          }
        }

        // Проверяем настройки пользователя для подстановки API-ключа по умолчанию
        const settings = await getUserSettings();
        if (settings.hasDefaultBlottataApiKey && !channel?.blotataApiKey) {
          // Если в канале нет ключа, но есть в настройках, можно показать подсказку
          // Но не заполняем автоматически, чтобы пользователь явно ввёл его
        }
      } catch (error) {
        console.error("Failed to load channel data or user settings", error);
      }
    };
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, user?.uid]);

  const handleSaveApiKey = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      showError("Введите API-ключ", 3000);
      return;
    }

    if (!channelId || !user?.uid) {
      showError("ID канала или пользователя не найден", 3000);
      return;
    }

    setSavingApiKey(true);
    try {
      // Сохраняем ключ в профиль пользователя (как ключ по умолчанию)
      await updateUserSettings({
        defaultBlottataApiKey: trimmedKey
      });
      
      // Сохраняем ключ в канал
      await fetchChannels(user.uid);
      const { channels } = useChannelStore.getState();
      const channel = channels.find((c) => c.id === channelId);
      
      if (channel) {
        await updateChannel(user.uid, {
          ...channel,
          blotataApiKey: trimmedKey
        });
      }
      
      setApiKeySaved(true);
      setApiKey("");
      showSuccess("API-ключ Blotato успешно сохранён в профиль и канал", 3000);
    } catch (error: any) {
      showError(error.message || "Не удалось сохранить API-ключ", 5000);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleSavePlatforms = async () => {
    if (!channelId || !user?.uid) {
      showError("ID канала или пользователя не найден", 3000);
      return;
    }

    setSavingPlatforms(true);
    try {
      // Загружаем каналы, чтобы получить актуальный канал
      await fetchChannels(user.uid);
      const { channels } = useChannelStore.getState();
      const channel = channels.find((c) => c.id === channelId);
      
      if (!channel) {
        throw new Error("Канал не найден");
      }

      // Обновляем все поля ID платформ
      await updateChannel(user.uid, {
        ...channel,
        blotataTiktokId: tiktokId.trim() || null,
        blotataInstagramId: instagramId.trim() || null,
        blotataYoutubeId: youtubeId.trim() || null,
        blotataFacebookId: facebookId.trim() || null,
        blotataFacebookPageId: facebookPageId.trim() || null,
        blotataThreadsId: threadsId.trim() || null,
        blotataTwitterId: twitterId.trim() || null,
        blotataLinkedinId: linkedinId.trim() || null,
        blotataPinterestId: pinterestId.trim() || null,
        blotataPinterestBoardId: pinterestBoardId.trim() || null,
        blotataBlueskyId: blueskyId.trim() || null
      });
      showSuccess("ID платформ успешно сохранены в настройках канала", 3000);
    } catch (error: any) {
      showError(error.message || "Не удалось сохранить ID платформ", 5000);
    } finally {
      setSavingPlatforms(false);
    }
  };
  
  // Функция для сохранения всех данных (API-ключ + ID платформ) перед переходом
  const handleSaveAllData = async (): Promise<boolean> => {
    if (!channelId || !user?.uid) {
      showError("ID канала или пользователя не найден", 3000);
      return false;
    }

    setSavingApiKey(true);
    setSavingPlatforms(true);
    
    try {
      // Загружаем каналы, чтобы получить актуальный канал
      await fetchChannels(user.uid);
      const { channels } = useChannelStore.getState();
      const channel = channels.find((c) => c.id === channelId);
      
      if (!channel) {
        throw new Error("Канал не найден");
      }

      // Определяем финальный API-ключ: используем введённый, если он есть, иначе оставляем существующий
      let finalApiKey = channel.blotataApiKey;
      
      // Если пользователь ввёл новый API-ключ, сохраняем его
      if (apiKey.trim()) {
        const trimmedKey = apiKey.trim();
        // Сохраняем в профиль (как ключ по умолчанию)
        await updateUserSettings({
          defaultBlottataApiKey: trimmedKey
        });
        finalApiKey = trimmedKey;
      } else if (apiKeySaved && channel.blotataApiKey) {
        // Если ключ уже был сохранён ранее, используем его из канала
        finalApiKey = channel.blotataApiKey;
      }

      // Сохраняем все данные в канал одним запросом
      await updateChannel(user.uid, {
        ...channel,
        blotataApiKey: finalApiKey,
        blotataTiktokId: tiktokId.trim() || null,
        blotataInstagramId: instagramId.trim() || null,
        blotataYoutubeId: youtubeId.trim() || null,
        blotataFacebookId: facebookId.trim() || null,
        blotataFacebookPageId: facebookPageId.trim() || null,
        blotataThreadsId: threadsId.trim() || null,
        blotataTwitterId: twitterId.trim() || null,
        blotataLinkedinId: linkedinId.trim() || null,
        blotataPinterestId: pinterestId.trim() || null,
        blotataPinterestBoardId: pinterestBoardId.trim() || null,
        blotataBlueskyId: blueskyId.trim() || null
      });

      showSuccess("Все данные успешно сохранены в настройках канала", 3000);
      return true;
    } catch (error: any) {
      showError(error.message || "Не удалось сохранить данные", 5000);
      return false;
    } finally {
      setSavingApiKey(false);
      setSavingPlatforms(false);
    }
  };

  const handleComplete = async () => {
    // Сохраняем все данные перед переходом
    const saved = await handleSaveAllData();
    if (!saved) {
      return; // Если сохранение не удалось, остаёмся на странице
    }

    if (channelId) {
      navigate(`/channels/${channelId}/edit`, { replace: true });
    } else {
      navigate("/channels", { replace: true });
    }
  };

  const handleSkip = () => {
    // Пропускаем настройку, переходим к редактированию канала
    if (channelId) {
      navigate(`/channels/${channelId}/edit`, { replace: true });
    } else {
      navigate("/channels", { replace: true });
    }
  };

  // Проверяем, есть ли хотя бы API-ключ и один ID платформы
  const hasApiKey = apiKeySaved || apiKey.trim() !== "";
  const hasPlatformId = tiktokId.trim() || instagramId.trim() || youtubeId.trim() || 
                        facebookId.trim() || facebookPageId.trim() || threadsId.trim() || 
                        twitterId.trim() || linkedinId.trim() || pinterestId.trim() || 
                        pinterestBoardId.trim() || blueskyId.trim();
  const canComplete = hasApiKey && hasPlatformId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Хедер */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">
            Шаг 12: Подключите Blotato для автопубликаций
          </h1>
          <p className="text-sm text-slate-400 md:text-base">
            Чтобы видео автоматически публиковались в TikTok, Instagram и YouTube, подключите Blotato и укажите API-ключ и ID аккаунтов.
            Наше приложение генерирует и сохраняет видео на своём сервере, а Blotato берёт готовые файлы из нашей системы и публикует их в ваши соцсети.
          </p>
        </div>

        {/* Блок 1: Что такое Blotato */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6 shadow-lg">
          <h2 className="mb-3 text-lg font-semibold text-white">Что такое Blotato?</h2>
          <p className="text-sm leading-relaxed text-slate-300 md:text-base">
            Blotato — это внешний сервис автопубликации контента в соцсети.
            Наше приложение генерирует и сохраняет видео на своём сервере,
            а Blotato по API получает ссылки на файлы и публикует их в TikTok, Instagram, YouTube и другие платформы.
          </p>
        </div>

        {/* Блок 2: Получение API-ключа */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Key className="h-5 w-5 text-purple-300" />
            </div>
            <h2 className="text-lg font-semibold text-white">Получение Blotato API-ключа</h2>
            {apiKeySaved && (
              <div className="ml-auto flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-300">Готово</span>
              </div>
            )}
          </div>

          <ol className="mb-6 space-y-3 text-sm text-slate-300 md:text-base">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                1
              </span>
              <div className="flex-1">
                <span>Перейдите на сайт Blotato — </span>
                <a
                  href="https://blotato.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition"
                >
                  Открыть blotato.com
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                2
              </span>
              <span>Зарегистрируйтесь или войдите в свой аккаунт.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                3
              </span>
              <span>Перейдите в раздел Settings → API.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                4
              </span>
              <span>Скопируйте свой API Key.</span>
            </li>
          </ol>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Blotato API-ключ
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Вставьте сюда API-ключ из Blotato"
                disabled={apiKeySaved || savingApiKey}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={apiKeySaved || savingApiKey || !apiKey.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-medium text-white transition hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingApiKey ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Сохранение...</span>
                </>
              ) : apiKeySaved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Сохранено</span>
                </>
              ) : (
                <span>Сохранить API-ключ</span>
              )}
            </button>
          </div>
        </div>

        {/* Блок 3: ID платформ */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/50 p-6 shadow-lg">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Подключите аккаунты соцсетей в Blotato
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-slate-300 md:text-base">
            В Blotato подключите свои аккаунты соцсетей (TikTok, Instagram, YouTube).
            Для каждого подключённого аккаунта Blotato покажет Account ID.
            Эти ID нужно один раз скопировать и указать в настройках вашего канала.
          </p>

          {/* Аккордеон для платформ */}
          <div className="space-y-3">
            {/* TikTok */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40">
              <button
                onClick={() => setExpandedPlatform(expandedPlatform === "tiktok" ? null : "tiktok")}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                    <Music className="h-5 w-5 text-pink-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">TikTok</h3>
                    <p className="text-xs text-slate-400">Скопируйте TikTok Account ID из Blotato</p>
                  </div>
                </div>
                <span className="text-slate-400">
                  {expandedPlatform === "tiktok" ? "−" : "+"}
                </span>
              </button>
              {expandedPlatform === "tiktok" && (
                <div className="border-t border-white/10 p-4">
                  <ol className="mb-4 space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">1.</span>
                      <div>
                        <span>Откройте </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition"
                        >
                          my.blotato.com
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span> — кнопка </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-brand/20 px-2 py-1 text-xs text-brand hover:bg-brand/30 transition"
                        >
                          Открыть панель Blotato
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">2.</span>
                      <span>Перейдите в Settings → Accounts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">3.</span>
                      <span>Подключите TikTok (кнопка Login with TikTok).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">4.</span>
                      <span>В списке Connected accounts найдите ваш TikTok-аккаунт.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">5.</span>
                      <span>Нажмите Copy Account ID — ID будет скопирован в буфер обмена.</span>
                    </li>
                  </ol>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      TikTok ID
                    </label>
                    <input
                      type="text"
                      value={tiktokId}
                      onChange={(e) => setTiktokId(e.target.value)}
                      placeholder="Вставьте сюда TikTok Account ID из Blotato"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Этот ID будет автоматически сохранён в настройках текущего канала.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Instagram */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40">
              <button
                onClick={() => setExpandedPlatform(expandedPlatform === "instagram" ? null : "instagram")}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                    <Instagram className="h-5 w-5 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Instagram</h3>
                    <p className="text-xs text-slate-400">Скопируйте Instagram Account ID из Blotato</p>
                  </div>
                </div>
                <span className="text-slate-400">
                  {expandedPlatform === "instagram" ? "−" : "+"}
                </span>
              </button>
              {expandedPlatform === "instagram" && (
                <div className="border-t border-white/10 p-4">
                  <ol className="mb-4 space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">1.</span>
                      <div>
                        <span>Откройте </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition"
                        >
                          my.blotato.com
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span> — кнопка </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-brand/20 px-2 py-1 text-xs text-brand hover:bg-brand/30 transition"
                        >
                          Открыть панель Blotato
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">2.</span>
                      <span>Перейдите в Settings → Accounts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">3.</span>
                      <span>Подключите Instagram (кнопка Login with Instagram).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">4.</span>
                      <span>В списке Connected accounts найдите ваш Instagram-аккаунт.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">5.</span>
                      <span>Нажмите Copy Account ID — ID будет скопирован в буфер обмена.</span>
                    </li>
                  </ol>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      Instagram ID
                    </label>
                    <input
                      type="text"
                      value={instagramId}
                      onChange={(e) => setInstagramId(e.target.value)}
                      placeholder="Вставьте сюда Instagram Account ID из Blotato"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Этот ID будет автоматически сохранён в настройках текущего канала.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* YouTube */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40">
              <button
                onClick={() => setExpandedPlatform(expandedPlatform === "youtube" ? null : "youtube")}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20">
                    <Youtube className="h-5 w-5 text-red-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">YouTube</h3>
                    <p className="text-xs text-slate-400">Скопируйте YouTube Account ID из Blotato</p>
                  </div>
                </div>
                <span className="text-slate-400">
                  {expandedPlatform === "youtube" ? "−" : "+"}
                </span>
              </button>
              {expandedPlatform === "youtube" && (
                <div className="border-t border-white/10 p-4">
                  <ol className="mb-4 space-y-2 text-sm text-slate-300">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">1.</span>
                      <div>
                        <span>Откройте </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand hover:text-brand/80 transition"
                        >
                          my.blotato.com
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span> — кнопка </span>
                        <a
                          href="https://my.blotato.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-brand/20 px-2 py-1 text-xs text-brand hover:bg-brand/30 transition"
                        >
                          Открыть панель Blotato
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">2.</span>
                      <span>Перейдите в Settings → Accounts.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">3.</span>
                      <span>Подключите YouTube (кнопка Login with YouTube).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">4.</span>
                      <span>В списке Connected accounts найдите ваш YouTube-аккаунт.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-brand">5.</span>
                      <span>Нажмите Copy Account ID — ID будет скопирован в буфер обмена.</span>
                    </li>
                  </ol>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      YouTube ID
                    </label>
                    <input
                      type="text"
                      value={youtubeId}
                      onChange={(e) => setYoutubeId(e.target.value)}
                      placeholder="Вставьте сюда YouTube Account ID из Blotato"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Этот ID будет автоматически сохранён в настройках текущего канала.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Кнопка сохранения ID платформ */}
          <div className="mt-6">
            <button
              onClick={handleSavePlatforms}
              disabled={savingPlatforms || (!tiktokId.trim() && !instagramId.trim() && !youtubeId.trim())}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand/80 px-6 py-3 font-medium text-white transition hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed md:w-auto"
            >
              {savingPlatforms ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Сохранить ID платформ</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="sticky bottom-0 rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-sm p-6 shadow-xl">
          <div className="mb-4 text-center">
            <p className="text-xs text-slate-400">
              Все эти параметры вы сможете изменить позже в настройках аккаунта и в настройках канала.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:justify-center">
            <button
              onClick={handleComplete}
              disabled={!canComplete || savingApiKey || savingPlatforms}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-purple-600 px-8 py-3 font-semibold text-white transition hover:from-brand/90 hover:to-purple-600/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingApiKey || savingPlatforms ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Готово, перейти к каналу</span>
                </>
              )}
            </button>
            <button
              onClick={handleSkip}
              className="rounded-xl border border-white/20 bg-transparent px-8 py-3 font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              Пропустить, настрою позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

