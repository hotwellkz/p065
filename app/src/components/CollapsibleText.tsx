import { useState, useRef, useEffect } from "react";

interface CollapsibleTextProps {
  text: string;
  maxHeight?: number; // в пикселях, default 100px (70px на мобильных)
  className?: string;
}

export function CollapsibleText({
  text,
  maxHeight = 100,
  className = ""
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [actualMaxHeight, setActualMaxHeight] = useState(maxHeight);

  useEffect(() => {
    // Определяем актуальную максимальную высоту (меньше на мобильных)
    const updateMaxHeight = () => {
      const isMobile = window.innerWidth < 640;
      setActualMaxHeight(isMobile ? 70 : maxHeight);
    };

    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);

    return () => window.removeEventListener("resize", updateMaxHeight);
  }, [maxHeight]);

  useEffect(() => {
    if (contentRef.current) {
      const scrollHeight = contentRef.current.scrollHeight;
      setNeedsCollapse(scrollHeight > actualMaxHeight);
    }
  }, [text, actualMaxHeight]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? "2000px" : `${actualMaxHeight}px`
        }}
      >
        <div className="whitespace-pre-wrap break-words">{text}</div>
      </div>

      {/* Градиент затемнения снизу (только когда свернуто и нужен collapse) */}
      {!expanded && needsCollapse && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-800/60 via-slate-800/30 to-transparent pointer-events-none rounded-b-xl" />
      )}

      {/* Кнопка показать/скрыть */}
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm font-medium text-brand-light hover:text-brand transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-slate-900 rounded"
        >
          {expanded ? "Скрыть" : "Показать полностью"}
        </button>
      )}
    </div>
  );
}

