import { HelpCircle } from "lucide-react";
import { useAIAssistantContext } from "./AIAssistantProvider";

interface SectionHelpButtonProps {
  sectionKey: "telegram_integration" | "google_drive_integration" | "profile";
  sectionTitle: string;
  currentStatus?: string;
  context?: any;
}

export function SectionHelpButton({
  sectionKey,
  sectionTitle,
  currentStatus,
  context
}: SectionHelpButtonProps) {
  const { askSectionHelp } = useAIAssistantContext();

  const handleClick = () => {
    askSectionHelp({
      sectionKey,
      sectionTitle,
      currentStatus,
      context
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 transition hover:bg-indigo-500/40 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      aria-label={`Спросить у AI про ${sectionTitle}`}
      title="Нажмите, чтобы спросить у AI-ассистента про эту секцию"
    >
      <HelpCircle size={14} />
    </button>
  );
}

