import { createContext, useContext, ReactNode } from "react";
import { useAIAssistant } from "./useAIAssistant";
import type { AskFieldHelpParams, AskSectionHelpParams } from "./types";

interface AIAssistantContextType {
  isOpen: boolean;
  currentFieldKey: string | null;
  messages: ReturnType<typeof useAIAssistant>["messages"];
  isLoading: boolean;
  openPanel: () => void;
  closePanel: () => void;
  clearMessages: () => void;
  askFieldHelp: (params: AskFieldHelpParams) => Promise<void>;
  askSectionHelp: (params: AskSectionHelpParams) => Promise<void>;
  askFollowUp: (question: string) => Promise<void>;
}

const AIAssistantContext = createContext<AIAssistantContextType | null>(null);

export function useAIAssistantContext() {
  const context = useContext(AIAssistantContext);
  if (!context) {
    throw new Error("useAIAssistantContext must be used within AIAssistantProvider");
  }
  return context;
}

interface AIAssistantProviderProps {
  children: ReactNode;
}

export function AIAssistantProvider({ children }: AIAssistantProviderProps) {
  const assistant = useAIAssistant();

  return (
    <AIAssistantContext.Provider value={assistant}>
      {children}
    </AIAssistantContext.Provider>
  );
}

