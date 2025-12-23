import { HelpCircle } from "lucide-react";
import { useAIAssistantContext } from "./AIAssistantProvider";
import type { FieldHelpKey } from "./types";

interface FieldHelpIconProps {
  fieldKey: FieldHelpKey;
  page: string;
  channelContext?: any;
  currentValue?: any;
  label?: string;
}

export function FieldHelpIcon({
  fieldKey,
  page,
  channelContext,
  currentValue,
  label
}: FieldHelpIconProps) {
  const { askFieldHelp } = useAIAssistantContext();

  const handleClick = () => {
    askFieldHelp({
      fieldKey,
      page,
      question: `Объясни поле "${label || fieldKey}" на странице редактирования канала. Что это за поле и как его правильно заполнять?`,
      channelContext,
      currentValue
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 transition hover:bg-indigo-500/40 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      aria-label={`Спросить у AI про поле ${label || fieldKey}`}
      title="Нажмите, чтобы спросить у AI-ассистента про это поле"
    >
      <HelpCircle size={14} />
    </button>
  );
}

