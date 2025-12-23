import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
  Check
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import {
  generateShortScript,
  generateDetailedScripts,
  type GeneratedScript,
  type GenerationResponse
} from "../../services/openaiScriptGenerator";
import { sendPromptToSyntx } from "../../api/telegram";
import type { Channel } from "../../domain/channel";
import { updatePreferenceIndex } from "../../utils/preferencesUtils";

const ScriptGenerationPage = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { channels, fetchChannels, updateChannel } = useChannelStore((state) => ({
    channels: state.channels,
    fetchChannels: state.fetchChannels,
    updateChannel: state.updateChannel
  }));

  const [channel, setChannel] = useState<Channel | null>(null);
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [detailedResult, setDetailedResult] =
    useState<GenerationResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedVideoPrompt, setCopiedVideoPrompt] = useState(false);
  const [copiedFileTitle, setCopiedFileTitle] = useState(false);
  const [syntxSendStatus, setSyntxSendStatus] = useState<
    null | "sending" | "sent" | "error"
  >(null);
  const [syntxError, setSyntxError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !channelId) {
      navigate("/channels", { replace: true });
      return;
    }

    const loadChannel = async () => {
      try {
        await fetchChannels(user.uid);
        const found = channels.find((c) => c.id === channelId);
        if (found) {
          setChannel(found);
        } else {
          setError("Канал не найден");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Ошибка при загрузке канала"
        );
      }
    };

    void loadChannel();
  }, [user?.uid, channelId, navigate, fetchChannels]);

  useEffect(() => {
    if (channels.length > 0 && channelId) {
      const found = channels.find((c) => c.id === channelId);
      if (found) {
        setChannel(found);
      }
    }
  }, [channels, channelId]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!channel || !idea.trim() || !user?.uid) {
      setError("Введите идею для сценария");
      return;
    }

    // Перезагружаем канал из store, чтобы получить актуальные preferences
    await fetchChannels(user.uid);
    const currentChannel = channels.find((c) => c.id === channel.id) || channel;

    setLoading(true);
    setError(null);
    setScript(null);
    setDetailedResult(null);

    try {
      const mode = currentChannel.generationMode || "script";

      if (mode === "prompt" || mode === "video-prompt-only") {
        const result = await generateDetailedScripts(currentChannel, idea.trim());
        setDetailedResult(result);
      } else {
        const result = await generateShortScript(currentChannel, idea.trim());
        setScript(result);
      }

      // Обновляем индекс preferences после успешной генерации
      if (currentChannel.preferences && currentChannel.preferences.mode === "cyclic") {
        const oldIndex = currentChannel.preferences.lastUsedIndex || 0;
        const updatedPreferences = updatePreferenceIndex(currentChannel.preferences);
        const newIndex = updatedPreferences?.lastUsedIndex || 0;
        
        // Обновляем только если индекс изменился
        if (oldIndex !== newIndex) {
          const updatedChannel = {
            ...currentChannel,
            preferences: updatedPreferences
          };
          await updateChannel(user.uid, updatedChannel);
          // Перезагружаем каналы после обновления
          await fetchChannels(user.uid);
          // Обновляем локальное состояние канала
          setChannel(updatedChannel);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ошибка при генерации сценария. Проверьте настройки OpenAI API."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (detailedResult) {
      // Копирование детальных сценариев
      const textToCopy = detailedResult.scenarios
        .map(
          (scenario) =>
            `${scenario.title} (${scenario.durationSeconds} сек):\n\n${scenario.steps
              .map(
                (step) =>
                  `${step.secondFrom}-${step.secondTo}с: ${step.description}${step.dialog.length > 0 ? `\n${step.dialog.map((d) => `${d.character}: "${d.text}"`).join("\n")}` : ""}`
              )
              .join("\n\n")}`
        )
        .join("\n\n---\n\n");

      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        setError("Не удалось скопировать в буфер обмена");
      }
      return;
    }

    if (!script) return;

    const textToCopy = `СЦЕНАРИЙ ДЛЯ ${channel?.name || "ВИДЕО"}

ЗАВЯЗКА (0-3 сек):
${script.sections.hook || "—"}

ОСНОВНОЕ ДЕЙСТВИЕ:
${script.sections.mainAction || "—"}

ФИНАЛ:
${script.sections.finale || "—"}

ТЕКСТ НА ЭКРАНЕ:
${script.sections.onScreenText || "—"}

РЕПЛИКИ/ГОЛОС ЗА КАДРОМ:
${script.sections.voiceover || "—"}

ЗВУКИ/МУЗЫКА:
${script.sections.sounds || "—"}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Не удалось скопировать в буфер обмена");
    }
  };

  const handleRegenerate = () => {
    setScript(null);
    setDetailedResult(null);
    setError(null);
  };

  const handleCopyVideoPrompt = async () => {
    if (!detailedResult?.videoPrompt) return;

    try {
      await navigator.clipboard.writeText(detailedResult.videoPrompt);
      setCopiedVideoPrompt(true);
      setTimeout(() => setCopiedVideoPrompt(false), 2000);
    } catch (err) {
      setError("Не удалось скопировать промпт в буфер обмена");
    }
  };

  const handleCopyFileTitle = async () => {
    if (!detailedResult?.fileTitle) return;

    try {
      await navigator.clipboard.writeText(detailedResult.fileTitle);
      setCopiedFileTitle(true);
      setTimeout(() => setCopiedFileTitle(false), 2000);
    } catch (err) {
      setError("Не удалось скопировать название в буфер обмена");
    }
  };

  const handleSendToSyntx = async () => {
    if (!detailedResult?.videoPrompt || !channel) return;

    setSyntxSendStatus("sending");
    setSyntxError(null);

    try {
      // Передаем channelId, чтобы backend мог определить, какой тип Telegram использовать
      await sendPromptToSyntx(detailedResult.videoPrompt, channel.id);
      setSyntxSendStatus("sent");
    } catch (err: any) {
      setSyntxSendStatus("error");
      
      const status = err?.response?.status || err?.response?.statusCode;
      const errorCode = err?.response?.data?.error;
      const errorMessage = err?.response?.data?.message;
      
      // Обработка ошибки 401 (неавторизован в приложении - это ошибка авторизации Firebase)
      if (status === 401) {
        // Проверяем, это ошибка авторизации приложения или Telegram
        if (errorCode === "Unauthorized" || errorMessage?.includes("token") || errorMessage?.includes("Authorization")) {
          setSyntxError("Сессия приложения истекла. Обновите страницу и войдите в аккаунт ещё раз.");
          console.error("401 Unauthorized (Firebase auth) при отправке в Syntx:", err?.response?.data);
          return;
        }
        // Если это TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN, обрабатываем ниже как ошибку Telegram
      }
      
      // Обработка ошибок Telegram (не ошибки авторизации приложения)
      let userFriendlyMessage: string;
      
      if (errorCode === "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN") {
        userFriendlyMessage = "Не удалось отправить промпт в Syntx: сессия Telegram истекла. Отвяжите Telegram в настройках и привяжите снова.";
      } else if (errorCode === "TELEGRAM_USER_NOT_CONNECTED") {
        userFriendlyMessage = "Telegram не привязан. Привяжите Telegram в настройках аккаунта.";
      } else if (errorCode === "TELEGRAM_SESSION_NOT_INITIALIZED") {
        userFriendlyMessage = "Telegram сессия не инициализирована. Обратитесь к администратору.";
      } else if (errorCode === "SYNX_CHAT_ID_NOT_CONFIGURED") {
        userFriendlyMessage = "Настройки сервера не завершены. Обратитесь к администратору.";
      } else if (errorCode === "FAILED_TO_SEND_PROMPT") {
        userFriendlyMessage = errorMessage || "Не удалось отправить промпт. Попробуйте позже.";
      } else if (errorMessage) {
        userFriendlyMessage = errorMessage;
      } else if (err?.message) {
        userFriendlyMessage = err.message;
      } else {
        userFriendlyMessage = "Ошибка при отправке промпта в SyntX. Попробуйте позже.";
      }
      
      console.error("Ошибка при отправке в Syntx:", {
        status,
        errorCode,
        errorMessage,
        channelId: channel?.id,
        channelTransport: channel?.generationTransport,
        fullError: err
      });
      
      setSyntxError(userFriendlyMessage);
    }
  };

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-xl space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center">
          {error ? (
            <>
              <h1 className="text-2xl font-semibold text-red-200">
                Ошибка загрузки
              </h1>
              <p className="text-red-300">{error}</p>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-light" />
              <p className="text-slate-300">Загрузка канала...</p>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="mt-4 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/channels")}
            className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition hover:border-brand/40 hover:text-white"
          >
            <ArrowLeft size={16} className="inline mr-2" />
            Назад
          </button>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-brand-light" />
            <h1 className="text-2xl font-semibold">Генерация сценария</h1>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <h2 className="mb-2 text-lg font-semibold">{channel.name}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <span>Платформа: {channel.platform}</span>
            <span>•</span>
            <span>Длительность: {channel.targetDurationSec} сек</span>
            <span>•</span>
            <span>Язык: {channel.language}</span>
            <span>•</span>
            <span>Тон: {channel.tone}</span>
          </div>
        </div>

        {!script && (
          <form onSubmit={handleGenerate} className="mb-8">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl shadow-brand/10">
              <label className="mb-4 block text-sm font-medium text-slate-200">
                О чём будет ролик?
              </label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Например: Как быстро приготовить завтрак за 5 минут"
                rows={4}
                className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
                disabled={loading}
                required
              />

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !idea.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-brand-dark"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Генерируем сценарий...
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    Сгенерировать сценарий
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {(script || detailedResult) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold">
                {detailedResult?.mode === "video-prompt-only"
                  ? "Промпт для генерации видео"
                  : detailedResult
                    ? "Сгенерированные сценарии"
                    : "Сгенерированный сценарий"}
              </h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-300 transition hover:border-brand/40 hover:text-white"
                >
                  <Copy size={16} />
                  {copied ? "Скопировано!" : "Копировать"}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-300 transition hover:border-brand/40 hover:text-white"
                >
                  <RefreshCw size={16} />
                  Сгенерировать ещё
                </button>
              </div>
            </div>


            {/* Старый формат (для обратной совместимости) */}
            {script && (
              <div className="space-y-4">
                {script.sections.hook && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      🎣 Завязка (0-3 сек)
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.hook}
                    </p>
                  </div>
                )}

                {script.sections.mainAction && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      🎬 Основное действие
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.mainAction}
                    </p>
                  </div>
                )}

                {script.sections.finale && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      🎯 Финал
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.finale}
                    </p>
                  </div>
                )}

                {script.sections.onScreenText && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      📝 Текст на экране
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.onScreenText}
                    </p>
                  </div>
                )}

                {script.sections.voiceover && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      🎤 Реплики / Голос за кадром
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.voiceover}
                    </p>
                  </div>
                )}

                {script.sections.sounds && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-light">
                      🔊 Звуки / Музыка
                    </h3>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {script.sections.sounds}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Новый формат (детальные сценарии) */}
            {detailedResult && (
              <div className="space-y-6">
                {/* Показываем сценарии только если они есть и режим не video-prompt-only */}
                {detailedResult.scenarios.length > 0 &&
                  detailedResult.mode !== "video-prompt-only" &&
                  detailedResult.scenarios.map((scenario, scenarioIndex) => (
                  <div
                    key={scenarioIndex}
                    className="rounded-xl border border-white/10 bg-slate-900/60 p-6"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-brand-light">
                        {scenario.title}
                      </h3>
                      <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand-light">
                        {scenario.durationSeconds} сек
                      </span>
                    </div>

                    <div className="space-y-4">
                      {scenario.steps.map((step, stepIndex) => (
                        <div
                          key={stepIndex}
                          className="rounded-lg border border-white/5 bg-slate-800/40 p-4"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="rounded bg-brand/20 px-2 py-1 text-xs font-semibold text-brand-light">
                              {step.secondFrom}-{step.secondTo}с
                            </span>
                          </div>
                          <p className="mb-2 text-sm text-slate-200">
                            {step.description}
                          </p>
                          {step.dialog.length > 0 && (
                            <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                              {step.dialog.map((line, dialogIndex) => (
                                <div
                                  key={dialogIndex}
                                  className="text-sm text-slate-300"
                                >
                                  <span className="font-semibold text-brand-light">
                                    {line.character}:
                                  </span>{" "}
                                  <span className="italic">"{line.text}"</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Сообщение для режима video-prompt-only, если нет сценариев */}
                {detailedResult.mode === "video-prompt-only" &&
                  detailedResult.scenarios.length === 0 && (
                    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6 text-center">
                      <p className="text-slate-400">
                        В этом режиме сценарий не генерируется, только промпт для видео.
                      </p>
                    </div>
                  )}

                {/* Блок названия файла (для режима video-prompt-only) */}
                {detailedResult.fileTitle && (
                  <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                          Название ролика / файла
                        </div>
                        <div className="break-all text-sm font-medium text-slate-50">
                          {detailedResult.fileTitle}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyFileTitle}
                        disabled={!detailedResult.fileTitle}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedFileTitle ? (
                          <>
                            <Check size={14} />
                            <span>Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Копировать</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* VIDEO_PROMPT блок (для режимов "prompt" и "video-prompt-only") */}
                {detailedResult.videoPrompt && (
                  <div className="rounded-xl border border-brand/30 bg-brand/5 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-brand-light">
                        🎬 Промпт для генерации видео
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyVideoPrompt}
                          className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-light transition hover:bg-brand/20"
                        >
                          <Copy size={14} />
                          {copiedVideoPrompt ? "Скопировано!" : "Копировать"}
                        </button>
                        <button
                          type="button"
                          onClick={handleSendToSyntx}
                          disabled={syntxSendStatus === "sending"}
                          className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {syntxSendStatus === "sending" ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Отправка...
                            </>
                          ) : syntxSendStatus === "sent" ? (
                            <>
                              <Check size={14} />
                              Отправлено
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Отправить в SyntX
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <textarea
                      readOnly
                      value={detailedResult.videoPrompt}
                      rows={12}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 outline-none"
                    />
                    {syntxSendStatus === "sent" && !syntxError && (
                      <p className="mt-2 text-xs text-emerald-300">
                        ✓ Промпт успешно отправлен в SyntX через Telegram
                      </p>
                    )}
                    {syntxSendStatus === "error" && syntxError && (
                      <p className="mt-2 text-xs text-red-300">{syntxError}</p>
                    )}
                    {!syntxSendStatus && (
                      <p className="mt-2 text-xs text-slate-400">
                        Готовый промпт для Sora / Veo 3.1 Fast. Скопируйте и
                        используйте для генерации видео или отправьте в SyntX.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Исходный JSON (только для старого формата) */}
            {script && (
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Исходный JSON
                </h3>
                <pre className="overflow-x-auto rounded-lg bg-slate-950/60 p-4 text-xs text-slate-300">
                  {script.rawText}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptGenerationPage;
