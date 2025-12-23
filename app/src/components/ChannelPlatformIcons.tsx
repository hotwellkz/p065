import type { Channel } from "../domain/channel";

interface ChannelPlatformIconsProps {
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
  instagramUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ChannelPlatformIcons = ({
  youtubeUrl,
  tiktokUrl,
  instagramUrl,
  size = "md",
  className = ""
}: ChannelPlatformIconsProps) => {
  const hasSocialLinks = youtubeUrl || tiktokUrl || instagramUrl;

  if (!hasSocialLinks) {
    return null;
  }

  const handleSocialClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    url: string
  ) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Размеры иконок
  const sizeClasses = {
    sm: "h-4 w-4 text-[8px] gap-0.5",
    md: "h-5 w-5 text-[9px] gap-0.5",
    lg: "h-6 w-6 text-[10px] gap-1"
  };

  const iconSizeClass = sizeClasses[size];

  return (
    <div className={`flex items-center ${className}`}>
      {youtubeUrl && (
        <button
          type="button"
          onClick={(e) => handleSocialClick(e, youtubeUrl)}
          className={`flex items-center justify-center rounded-full bg-red-600/20 text-red-400 transition hover:bg-red-600/30 hover:scale-110 ${iconSizeClass}`}
          title="Открыть канал на YouTube"
        >
          YT
        </button>
      )}
      {tiktokUrl && (
        <button
          type="button"
          onClick={(e) => handleSocialClick(e, tiktokUrl)}
          className={`flex items-center justify-center rounded-full bg-black text-white transition hover:bg-black/80 hover:scale-110 ${iconSizeClass}`}
          title="Открыть профиль в TikTok"
        >
          TT
        </button>
      )}
      {instagramUrl && (
        <button
          type="button"
          onClick={(e) => handleSocialClick(e, instagramUrl)}
          className={`flex items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 text-white transition hover:opacity-90 hover:scale-110 ${iconSizeClass}`}
          title="Открыть профиль в Instagram"
        >
          IG
        </button>
      )}
    </div>
  );
};

// Вспомогательная функция для использования с объектом Channel
export const ChannelPlatformIconsFromChannel = ({
  channel,
  size = "md",
  className = ""
}: {
  channel: Channel;
  size?: "sm" | "md" | "lg";
  className?: string;
}) => {
  return (
    <ChannelPlatformIcons
      youtubeUrl={channel.youtubeUrl}
      tiktokUrl={channel.tiktokUrl}
      instagramUrl={channel.instagramUrl}
      size={size}
      className={className}
    />
  );
};

export default ChannelPlatformIcons;


