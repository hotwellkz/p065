import { useState, useCallback } from "react";
import { explainField, explainSection, type ExplainFieldParams, type ExplainSectionParams } from "../../api/helpApi";
import type { AIMessage, AskFieldHelpParams, AskSectionHelpParams, FieldHelpKey } from "./types";

export function useAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentFieldKey, setCurrentFieldKey] = useState<FieldHelpKey | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const openPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Не очищаем сообщения, чтобы пользователь мог вернуться к истории
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentFieldKey(null);
  }, []);

  const addMessage = useCallback((role: "user" | "assistant", content: string, fieldKey?: FieldHelpKey) => {
    const newMessage: AIMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
      fieldKey: fieldKey || undefined
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const askFieldHelp = useCallback(async (params: AskFieldHelpParams) => {
    const { fieldKey, page, question, channelContext, currentValue } = params;
    
    // Открываем панель, если она закрыта
    if (!isOpen) {
      setIsOpen(true);
    }

    // Устанавливаем текущее поле
    setCurrentFieldKey(fieldKey);

    // Формируем вопрос
    const userQuestion = question || `Объясни поле "${fieldKey}" и как его правильно заполнять.`;

    // Добавляем сообщение пользователя
    addMessage("user", userQuestion, fieldKey);

    setIsLoading(true);

    try {
      const requestParams: ExplainFieldParams = {
        fieldKey,
        page,
        userQuestion,
        currentValue,
        channelContext
      };

      const response = await explainField(requestParams);

      if (response.success && response.answer) {
        addMessage("assistant", response.answer, fieldKey);
      } else {
        const errorMessage = response.message || "Не удалось получить объяснение поля. Попробуйте ещё раз.";
        addMessage("assistant", `❌ ${errorMessage}`, fieldKey);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Произошла ошибка при обращении к AI ассистенту.";
      addMessage("assistant", `❌ ${errorMessage}`, fieldKey);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, addMessage]);

  const askSectionHelp = useCallback(async (params: AskSectionHelpParams) => {
    const { sectionKey, page, sectionTitle, currentStatus, question, context } = params;
    
    // Открываем панель, если она закрыта
    if (!isOpen) {
      setIsOpen(true);
    }

    // Очищаем текущее поле (для секций не используется)
    setCurrentFieldKey(null);

    // Формируем вопрос
    const userQuestion = question || `Объясни секцию "${sectionTitle || sectionKey}" и как её правильно настроить.`;

    // Добавляем сообщение пользователя
    addMessage("user", userQuestion);

    setIsLoading(true);

    try {
      const requestParams: ExplainSectionParams = {
        sectionKey,
        page,
        sectionTitle,
        currentStatus,
        question,
        context
      };

      const response = await explainSection(requestParams);

      if (response.success && response.answer) {
        addMessage("assistant", response.answer);
      } else {
        const errorMessage = response.message || "Не удалось получить объяснение секции. Попробуйте ещё раз.";
        addMessage("assistant", `❌ ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Произошла ошибка при обращении к AI ассистенту.";
      addMessage("assistant", `❌ ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, addMessage]);

  const askFollowUp = useCallback(async (question: string) => {
    if (!currentFieldKey) {
      // Если нет текущего поля, просто добавляем вопрос как обычное сообщение
      addMessage("user", question);
      addMessage("assistant", "Пожалуйста, выберите поле или секцию, о которой хотите узнать, нажав на иконку ? рядом с ним.");
      return;
    }

    // Добавляем вопрос пользователя
    addMessage("user", question, currentFieldKey);

    setIsLoading(true);

    try {
      // Используем текущий контекст поля для дополнительного вопроса
      const lastMessage = messages.find(m => m.fieldKey === currentFieldKey && m.role === "assistant");
      const context = lastMessage ? `Контекст предыдущего ответа: ${lastMessage.content}\n\n` : "";
      
      const requestParams: ExplainFieldParams = {
        fieldKey: currentFieldKey,
        page: "channelEdit", // Можно улучшить, передавая page из контекста
        userQuestion: `${context}Дополнительный вопрос: ${question}`,
        channelContext: {} // Можно улучшить, передавая актуальный контекст
      };

      const response = await explainField(requestParams);

      if (response.success && response.answer) {
        addMessage("assistant", response.answer, currentFieldKey);
      } else {
        const errorMessage = response.message || "Не удалось получить ответ. Попробуйте ещё раз.";
        addMessage("assistant", `❌ ${errorMessage}`, currentFieldKey);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Произошла ошибка при обращении к AI ассистенту.";
      addMessage("assistant", `❌ ${errorMessage}`, currentFieldKey);
    } finally {
      setIsLoading(false);
    }
  }, [currentFieldKey, messages, addMessage]);

  return {
    isOpen,
    currentFieldKey,
    messages,
    isLoading,
    openPanel,
    closePanel,
    clearMessages,
    askFieldHelp,
    askSectionHelp,
    askFollowUp
  };
}

