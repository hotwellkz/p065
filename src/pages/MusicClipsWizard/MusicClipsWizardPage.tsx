import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Music, X } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type { ChannelCreatePayload, MusicClipsSettings } from "../../domain/channel";
import { useToast } from "../../hooks/useToast";

const MusicClipsWizardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { createChannel } = useChannelStore((state) => ({
    createChannel: state.createChannel
  }));
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    name: string;
    musicClipsSettings: MusicClipsSettings;
  }>({
    name: "",
    musicClipsSettings: {
      targetDurationSec: 60,
      clipSec: 10,
      segmentDelayMs: 30000,
      maxParallelSegments: 1,
      maxRetries: 3,
      retryDelayMs: 60000,
      sunoPrompt: "",
      styleTags: [],
      platforms: {
        youtube: true,
        tiktok: false,
        instagram: false
      },
      language: "ru"
    }
  });

  const [currentStyleTag, setCurrentStyleTag] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!user?.uid) {
      setError("Пользователь не авторизован");
      return;
    }

    // Валидация
    if (!formData.name.trim()) {
      setError("Название канала обязательно");
      return;
    }

    if (!formData.musicClipsSettings.sunoPrompt.trim()) {
      setError("Промпт для Suno обязателен");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Создаём payload для Music Clips канала
      const payload: ChannelCreatePayload = {
        name: formData.name.trim(),
        type: "music_clips",
        platform: "YOUTUBE_SHORTS", // По умолчанию, не критично для music_clips
        language: formData.musicClipsSettings.language || "ru",
        targetDurationSec: formData.musicClipsSettings.targetDurationSec,
        niche: "", // Не требуется для music_clips
        audience: "", // Не требуется для music_clips
        tone: "", // Не требуется для music_clips
        blockedTopics: "", // Не требуется для music_clips
        musicClipsSettings: formData.musicClipsSettings,
        autoSendEnabled: false, // Music Clips не используют автоотправку
        autoSendSchedules: [], // Пустое расписание для music_clips
        blotataEnabled: true, // Включена публикация через Blotato
        timezone: "Asia/Almaty"
      };

      const newChannel = await createChannel(user.uid, payload);
      
      showSuccess(`Канал "${newChannel.name}" успешно создан!`);
      
      // Редирект на страницу Music Clips
      navigate("/music-clips", { replace: true });
    } catch (err: any) {
      const errorMessage = err?.message || "Ошибка при создании канала";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addStyleTag = () => {
    const tag = currentStyleTag.trim();
    if (tag && !formData.musicClipsSettings.styleTags?.includes(tag)) {
      setFormData({
        ...formData,
        musicClipsSettings: {
          ...formData.musicClipsSettings,
          styleTags: [...(formData.musicClipsSettings.styleTags || []), tag]
        }
      });
      setCurrentStyleTag("");
    }
  };

  const removeStyleTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      musicClipsSettings: {
        ...formData.musicClipsSettings,
        styleTags: formData.musicClipsSettings.styleTags?.filter(tag => tag !== tagToRemove) || []
      }
    });
  };

  return (
    <div className="relative min-h-screen px-3 py-3 text-white sm:px-4 sm:py-10 md:py-4 lg:py-6">
      <div className="channels-premium-bg" />
      
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6">
        {/* Заголовок */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/music-clips")}
            className="rounded-xl border border-white/10 bg-slate-800/60 px-4 py-2 text-sm text-slate-300 transition-all duration-200 hover:border-white/20 hover:bg-slate-800/80 hover:text-white"
          >
            <ArrowLeft size={16} className="inline mr-2" />
            Назад
          </button>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold premium-title">
              Создание канала Music Clips
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Настройте параметры для автоматической генерации музыкальных клипов
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/80 p-6 shadow-2xl shadow-brand/10 backdrop-blur-sm md:rounded-3xl md:p-8 lg:p-10">
            {error && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {/* Название канала */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <span>Название канала *</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20"
                  placeholder="Например: Мои музыкальные клипы"
                />
              </div>

              {/* Промпт для Suno */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Music size={16} />
                  <span>Промпт для Suno *</span>
                </label>
                <textarea
                  value={formData.musicClipsSettings.sunoPrompt}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      musicClipsSettings: {
                        ...formData.musicClipsSettings,
                        sunoPrompt: e.target.value
                      }
                    })
                  }
                  required
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20 resize-y"
                  placeholder="Опишите музыку, которую нужно сгенерировать (например: Upbeat electronic music with catchy melody, energetic and modern)"
                />
                <p className="text-xs text-slate-400">
                  Опишите стиль, настроение и характеристики музыки для генерации
                </p>
              </div>

              {/* Теги стиля */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <span>Теги стиля (опционально)</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.musicClipsSettings.styleTags?.map((tag, index) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand/20 border border-brand/30 px-3 py-1.5 text-xs text-brand-light"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeStyleTag(tag)}
                        className="text-brand-light hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentStyleTag}
                    onChange={(e) => setCurrentStyleTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStyleTag();
                      }
                    }}
                    placeholder="Добавить тег (Enter)"
                    className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
                  />
                  <button
                    type="button"
                    onClick={addStyleTag}
                    className="rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/60"
                  >
                    Добавить
                  </button>
                </div>
              </div>

              {/* Целевая длительность и длительность сегмента */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>Целевая длительность (сек) *</span>
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={formData.musicClipsSettings.targetDurationSec}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        musicClipsSettings: {
                          ...formData.musicClipsSettings,
                          targetDurationSec: parseInt(e.target.value) || 60
                        }
                      })
                    }
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20"
                  />
                  <p className="text-xs text-slate-400">Рекомендуется: 20-60 секунд для тестов, 60+ для продакшена</p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span>Длительность сегмента (сек)</span>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={formData.musicClipsSettings.clipSec}
                    disabled
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-400">По умолчанию 10 сек (не изменяется)</p>
                </div>
              </div>

              {/* Платформы для публикации */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <span>Платформы для публикации</span>
                </label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.musicClipsSettings.platforms?.youtube ?? true}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          musicClipsSettings: {
                            ...formData.musicClipsSettings,
                            platforms: {
                              ...(formData.musicClipsSettings.platforms || { youtube: true, tiktok: false, instagram: false }),
                              youtube: e.target.checked
                            }
                          }
                        })
                      }
                      className="rounded border-white/20 text-brand focus:ring-brand/50"
                    />
                    <span className="text-sm text-slate-300">YouTube</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.musicClipsSettings.platforms?.tiktok ?? false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          musicClipsSettings: {
                            ...formData.musicClipsSettings,
                            platforms: {
                              ...(formData.musicClipsSettings.platforms || { youtube: true, tiktok: false, instagram: false }),
                              tiktok: e.target.checked
                            }
                          }
                        })
                      }
                      className="rounded border-white/20 text-brand focus:ring-brand/50"
                    />
                    <span className="text-sm text-slate-300">TikTok</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.musicClipsSettings.platforms?.instagram ?? false}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          musicClipsSettings: {
                            ...formData.musicClipsSettings,
                            platforms: {
                              ...(formData.musicClipsSettings.platforms || { youtube: true, tiktok: false, instagram: false }),
                              instagram: e.target.checked
                            }
                          }
                        })
                      }
                      className="rounded border-white/20 text-brand focus:ring-brand/50"
                    />
                    <span className="text-sm text-slate-300">Instagram</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Кнопки */}
            <div className="mt-8 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate("/music-clips")}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-brand/40 hover:text-white"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/40"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Создание...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>Создать канал</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MusicClipsWizardPage;

