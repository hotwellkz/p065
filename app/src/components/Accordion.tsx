import { useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
  title?: string; // Опционально, если используется summary как ReactNode
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: string | ReactNode; // Краткое описание для свернутого состояния (строка или ReactNode)
  className?: string;
}

/**
 * Компонент аккордиона для сворачивания/разворачивания контента
 */
export const Accordion = ({
  title,
  children,
  defaultOpen = false,
  summary,
  className = ""
}: AccordionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-2xl border border-white/10 bg-slate-900/50 shadow-lg shadow-black/10 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-all duration-200 hover:bg-slate-800/40 cursor-pointer"
        aria-expanded={isOpen}
        aria-controls={`accordion-content-${typeof summary === 'string' ? (title || 'accordion') : 'accordion'}`}
      >
        <div className="flex-1">
          {typeof summary === 'string' && title && (
            <div className="text-sm font-semibold text-white">{title}</div>
          )}
          {summary && (
            <div className={`${typeof summary === 'string' && title ? 'mt-1' : ''} ${typeof summary === 'string' ? 'text-xs text-slate-400' : ''}`}>
              {summary}
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={`accordion-content-${typeof summary === 'string' ? (title || 'accordion') : 'accordion'}`}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-4 pt-0">{children}</div>
      </div>
    </div>
  );
};

export default Accordion;



