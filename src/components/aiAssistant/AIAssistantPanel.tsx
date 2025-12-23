import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { useAIAssistantContext } from "./AIAssistantProvider";
import type { AIMessage } from "./types";

const FIELD_LABELS: Record<string, string> = {
  "channel.name": "Название канала",
  "channel.platform": "Платформа",
  "channel.language": "Язык",
  "channel.targetDurationSec": "Длительность",
  "channel.niche": "Ниша",
  "channel.audience": "Аудитория",
  "channel.tone": "Тон",
  "channel.blockedTopics": "Запрещённые темы",
  "channel.preferences": "Дополнительные пожелания",
  "channel.preferences.mode": "Режим пожеланий",
  "channel.generationMode": "Режим генерации",
  "channel.generationTransport": "Источник отправки",
  "channel.telegramSyntaxPeer": "Username или ID чата Syntax",
  "channel.youtubeUrl": "YouTube канал",
  "channel.tiktokUrl": "TikTok канал",
  "channel.instagramUrl": "Instagram",
  "channel.googleDriveFolderId": "Google Drive Folder ID",
  "channel.timezone": "Временная зона",
  "channel.autoSendEnabled": "Автоматизация",
  "channel.autoSendSchedules": "Расписание",
  "channel.autoSendSchedules.time": "Время отправки",
  "channel.autoSendSchedules.daysOfWeek": "Дни недели",
  "channel.autoSendSchedules.promptsPerRun": "Количество промптов",
  "channel.blotataEnabled": "Blotato",
  "channel.driveInputFolderId": "Входная папка",
  "channel.driveArchiveFolderId": "Архивная папка",
  "channel.blotataApiKey": "Blotato API Key",
  "channel.blotataYoutubeId": "YouTube ID в Blotato",
  "channel.blotataTiktokId": "TikTok ID в Blotato",
  "channel.blotataInstagramId": "Instagram ID в Blotato",
  "channel.blotataFacebookId": "Facebook ID в Blotato",
  "channel.blotataFacebookPageId": "Facebook Page ID в Blotato",
  "channel.blotataThreadsId": "Threads ID в Blotato",
  "channel.blotataTwitterId": "Twitter ID в Blotato",
  "channel.blotataLinkedinId": "LinkedIn ID в Blotato",
  "channel.blotataPinterestId": "Pinterest ID в Blotato",
  "channel.blotataPinterestBoardId": "Pinterest Board ID в Blotato",
  "channel.blotataBlueskyId": "Bluesky ID в Blotato",
  "channel.uploadNotificationChatId": "Telegram chat ID для уведомлений"
};

const SECTION_LABELS: Record<string, string> = {
  "telegram_integration": "Telegram интеграция",
  "google_drive_integration": "Google Drive интеграция",
  "profile": "Профиль"
};

function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-brand/20 text-white"
            : "bg-slate-800/80 text-slate-100 border border-white/10"
        }`}
      >
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {message.fieldKey && !isUser && (
          <div className="mt-2 text-xs text-slate-400">
            Поле: {FIELD_LABELS[message.fieldKey] || message.fieldKey}
          </div>
        )}
      </div>
    </div>
  );
}

export function AIAssistantPanel() {
  const {
    isOpen,
    currentFieldKey,
    messages,
    isLoading,
    closePanel,
    askFollowUp
  } = useAIAssistantContext();

  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Фокус на поле ввода при открытии
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const question = inputValue.trim();
    setInputValue("");
    await askFollowUp(question);
  };

  if (!isOpen) return null;

  const currentFieldLabel = currentFieldKey ? FIELD_LABELS[currentFieldKey] || currentFieldKey : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10000] md:hidden"
        onClick={closePanel}
      />
      
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[420px] bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-[10001] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 p-2">
              <Sparkles size={20} className="text-purple-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI-ассистент</h2>
              <p className="text-xs text-slate-400">
                {currentFieldLabel ? `Сейчас: ${currentFieldLabel}` : "Задайте вопрос по любому полю"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePanel}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Sparkles size={48} className="text-purple-400/50 mb-4" />
              <p className="text-slate-400 text-sm">
                Нажмите на иконку <span className="text-purple-300">?</span> рядом с полем, чтобы узнать о нём больше
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-slate-800/80 rounded-2xl px-4 py-2.5 border border-white/10">
                    <Loader2 size={16} className="animate-spin text-purple-300" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={currentFieldKey ? "Задайте дополнительный вопрос..." : "Введите вопрос..."}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="rounded-lg bg-brand px-4 py-2.5 text-white transition hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Отправить"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

