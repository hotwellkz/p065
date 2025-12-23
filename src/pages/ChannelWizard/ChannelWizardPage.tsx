import { useState, useEffect, useRef, useCallback } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, FileText, Video, Zap } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import type {
  ChannelCreatePayload,
  SupportedPlatform,
  SupportedLanguage,
  GenerationMode
} from "../../domain/channel";
import { createEmptyChannel } from "../../domain/channel";
import { getTelegramStatus } from "../../api/telegramIntegration";
import { getUserSettings } from "../../api/userSettings";
import { useIntegrationsStatus } from "../../hooks/useIntegrationsStatus";
import { WizardTelegramStep } from "../../components/wizard/WizardTelegramStep";
import { WizardDriveFoldersStep } from "../../components/wizard/WizardDriveFoldersStep";
import { FieldHelpIcon } from "../../components/aiAssistant/FieldHelpIcon";
import { suggestNiche } from "../../api/nicheSuggestion";
import { suggestTargetAudience } from "../../api/targetAudienceSuggestion";
import { suggestForbiddenTopics } from "../../api/forbiddenTopicsSuggestion";
import { suggestAdditionalPreferences } from "../../api/additionalPreferencesSuggestion";
import { useToast } from "../../hooks/useToast";

const STEPS = [
  { id: 1, title: "Название канала" },
  { id: 2, title: "Соцсеть" },
  { id: 3, title: "Язык" },
  { id: 4, title: "Длительность" },
  { id: 5, title: "Ниша" },
  { id: 6, title: "Целевая аудитория" },
  { id: 7, title: "Тон" },
  { id: 8, title: "Запрещённые темы" },
  { id: 9, title: "Режим генерации" },
  { id: 10, title: "Доп. пожелания" }
];

const PLATFORMS: { value: SupportedPlatform; label: string }[] = [
  { value: "YOUTUBE_SHORTS", label: "YouTube Shorts" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM_REELS", label: "Instagram Reels" },
  { value: "VK_CLIPS", label: "VK Клипы" }
];

const LANGUAGES: { value: SupportedLanguage; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "kk", label: "Қазақша" }
];

const DURATIONS = [8, 15, 30, 60];

const POPULAR_NICHES = [
  "Технологии и гаджеты",
  "Кулинария и рецепты",
  "Спорт и фитнес",
  "Образование и саморазвитие",
  "Юмор и скетчи",
  "Путешествия",
  "Игры и стримы",
  "Красота и уход",
  "Семья и дети",
  "Финансы и инвестиции"
];

const POPULAR_AUDIENCES = [
  "Молодёжь 18–25 лет, активные пользователи соцсетей",
  "Взрослые 25–40 лет, занятые работой и семьёй",
  "Родители с детьми 5–12 лет",
  "Предприниматели и фрилансеры",
  "Студенты и старшеклассники",
  "Пенсионеры, которые хотят развлечений и общения",
  "Геймеры и любители игр",
  "Люди, интересующиеся личностным ростом и саморазвитием"
];

const COMMON_FORBIDDEN_TOPICS = [
  "Политика и религиозные споры",
  "Насилие, кровь, жестокие сцены",
  "Нецензурная лексика и оскорбления",
  "18+ контент: эротика, наркотики, алкоголь",
  "Дискриминация, расизм, буллинг",
  "Опасные челленджи и саморазрушительное поведение"
];

const TONES = [
  "Юмор",
  "Серьёзно",
  "Дерзко",
  "Детское",
  "Образовательное",
  "Вдохновляющее",
  "Развлекательное",
  "Профессиональное"
];

const ChannelWizardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { createChannel } = useChannelStore((state) => ({
    createChannel: state.createChannel
  }));

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [telegramStatus, setTelegramStatus] = useState<{ status: string } | null>(null);
  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);
  const [wizardDriveFolders, setWizardDriveFolders] = useState<{
    rootFolderId: string;
    archiveFolderId: string;
  } | null>(null);
  const [nicheGenerating, setNicheGenerating] = useState(false);
  const [audienceGenerating, setAudienceGenerating] = useState(false);
  const [forbiddenTopicsGenerating, setForbiddenTopicsGenerating] = useState(false);
  const [additionalPreferencesGenerating, setAdditionalPreferencesGenerating] = useState(false);
  const { showError, showSuccess } = useToast();
  const integrationsStatus = useIntegrationsStatus();
  
  // Вычисляем реальные шаги с учетом пропуска интеграций
  const getEffectiveSteps = useCallback(() => {
    const baseSteps = STEPS;
    const effectiveSteps: Array<{ id: number; title: string; type: string }> = [];
    
    // Добавляем базовые шаги
    baseSteps.forEach(step => {
      effectiveSteps.push({ ...step, type: "form" });
    });
    
    // Добавляем шаг Telegram (если не подключен)
    if (!integrationsStatus.status.telegram.connected) {
      effectiveSteps.push({ id: effectiveSteps.length + 1, title: "Подключение Telegram", type: "telegram" });
    }
    
    // Всегда добавляем шаг создания папок (обязательный)
    effectiveSteps.push({ id: effectiveSteps.length + 1, title: "Создание папок для канала", type: "drive_folders" });
    
    return effectiveSteps;
  }, [integrationsStatus.status.telegram.connected]);
  
  const effectiveSteps = getEffectiveSteps();
  const totalSteps = effectiveSteps.length;

  const [formData, setFormData] = useState<ChannelCreatePayload>(() => {
    const empty = createEmptyChannel();
    return {
      name: empty.name,
      platform: empty.platform,
      language: empty.language,
      targetDurationSec: empty.targetDurationSec,
      niche: empty.niche,
      audience: empty.audience,
      tone: empty.tone,
      blockedTopics: empty.blockedTopics,
      extraNotes: empty.extraNotes,
      generationMode: "video-prompt-only" as GenerationMode, // По умолчанию "video-prompt-only" для автоматизации
      generationTransport: undefined, // Будет установлено после проверки Telegram статуса
      youtubeUrl: empty.youtubeUrl || null,
      tiktokUrl: empty.tiktokUrl || null,
      instagramUrl: empty.instagramUrl || null
    };
  });

  // Загружаем статус Telegram и устанавливаем дефолт для generationTransport
  useEffect(() => {
    const loadTelegramStatus = async () => {
      if (!user?.uid) {
        return;
      }
      
      try {
        const status = await getTelegramStatus();
        setTelegramStatus(status);
        
        // Устанавливаем дефолт: если Telegram привязан - telegram_user, иначе telegram_global
        const defaultTransport = status.status === "active" ? "telegram_user" : "telegram_global";
        setFormData(prev => ({
          ...prev,
          generationTransport: prev.generationTransport || defaultTransport as any
        }));
      } catch (err) {
        console.error("Failed to load Telegram status", err);
        // При ошибке используем telegram_global как дефолт
        setFormData(prev => ({
          ...prev,
          generationTransport: prev.generationTransport || "telegram_global" as any
        }));
      }
    };

    void loadTelegramStatus();
  }, [user?.uid]);

  const getCurrentStepType = () => {
    return effectiveSteps[currentStep - 1]?.type || "form";
  };
  
  const getFormStepNumber = () => {
    // Возвращает номер шага формы (1-10), если текущий шаг - это шаг формы
    let formStep = 0;
    for (let i = 0; i < currentStep; i++) {
      if (effectiveSteps[i]?.type === "form") {
        formStep++;
      }
    }
    return formStep;
  };
  
  const canGoNext = () => {
    const stepType = getCurrentStepType();
    
    // Для шагов интеграций и создания папок логика в самих компонентах
    if (stepType === "telegram" || stepType === "drive_folders") {
      return false; // Кнопка "Далее" не показывается, используется логика компонента
    }
    
    // Для шагов формы используем старую логику
    const formStep = getFormStepNumber();
    switch (formStep) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return true; // platform всегда выбран
      case 3:
        return true; // language всегда выбран
      case 4:
        return true; // duration всегда выбран
      case 5:
        return formData.niche.trim().length > 0;
      case 6:
        return formData.audience.trim().length > 0;
      case 7:
        return formData.tone.trim().length > 0;
      case 8:
        return true; // blockedTopics опционально
      case 9:
        return true; // generationMode всегда выбран
      case 10:
        return true; // extraNotes опционально
      default:
        return false;
    }
  };

  const handleNext = () => {
    const stepType = getCurrentStepType();
    
    // Для шагов интеграций и создания папок переход происходит автоматически через onComplete
    if (stepType === "telegram" || stepType === "drive_folders") {
      return;
    }
    
    if (canGoNext() && currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };
  
  // Функция для создания канала напрямую (используется при пропуске Telegram, если это последний шаг)
  const createChannelDirectly = useCallback(async () => {
    if (!user?.uid) {
      setError("Пользователь не авторизован");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Получаем настройки пользователя для подстановки defaultBlottataApiKey
      let defaultBlottataApiKey: string | undefined = undefined;
      let hasDefaultBlotatoApiKey = false;
      try {
        const userSettings = await getUserSettings();
        hasDefaultBlotatoApiKey = userSettings.hasDefaultBlottataApiKey || false;
        if (userSettings.hasDefaultBlottataApiKey && userSettings.defaultBlottataApiKey) {
          defaultBlottataApiKey = userSettings.defaultBlottataApiKey === "****" 
            ? undefined 
            : userSettings.defaultBlottataApiKey;
        }
      } catch (settingsError) {
        console.warn("Failed to load user settings for default Blotato API key", settingsError);
      }

      // Создаём канал без личного Telegram (используем telegram_global)
      const channelData: ChannelCreatePayload = {
        ...formData,
        generationTransport: "telegram_global", // При пропуске Telegram используем глобальный аккаунт
        // Включаем Blotato-публикацию для нового канала
        blotataEnabled: true,
        // Используем folderId из мастера, если они были созданы ранее
        driveInputFolderId: wizardDriveFolders?.rootFolderId || formData.driveInputFolderId,
        driveArchiveFolderId: wizardDriveFolders?.archiveFolderId || formData.driveArchiveFolderId,
        // Подставляем API-ключ из настроек пользователя, если он есть
        blotataApiKey: defaultBlottataApiKey,
      };
      
      const newChannel = await createChannel(user.uid, channelData);
      
      // Если у пользователя нет сохранённого Blotato API-ключа, перенаправляем на страницу настройки
      if (!hasDefaultBlotatoApiKey || !defaultBlottataApiKey) {
        navigate(`/channels/${newChannel.id}/blotato-setup`, { replace: true });
      } else {
        // Если ключ есть, переходим к редактированию канала
        navigate(`/channels/${newChannel.id}/edit`, { replace: true });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при создании канала"
      );
      setLoading(false);
    }
  }, [user?.uid, formData, wizardDriveFolders, createChannel, navigate]);

  const handleTelegramComplete = useCallback(() => {
    integrationsStatus.refreshStatus();
    
    // Используем функциональное обновление для получения актуального currentStep
    setCurrentStep(prevStep => {
      const nextStep = prevStep + 1;
      
      // Если следующий шаг превышает общее количество шагов, создаём канал напрямую
      if (nextStep > totalSteps) {
        // Создаём канал в следующем тике, чтобы избежать проблем с обновлением состояния
        setTimeout(() => {
          void createChannelDirectly();
        }, 0);
        return prevStep; // Не меняем шаг, так как создаём канал
      }
      
      // Проверяем тип следующего шага
      const nextStepType = effectiveSteps[nextStep - 1]?.type;
      
      // Если следующего шага нет или это не шаг создания папок, и мы на последнем шаге,
      // создаём канал напрямую
      if (!nextStepType || (nextStep === totalSteps && nextStepType !== "drive_folders")) {
        setTimeout(() => {
          void createChannelDirectly();
        }, 0);
        return prevStep;
      }
      
      // Иначе переходим к следующему шагу
      setError(null);
      return nextStep;
    });
  }, [totalSteps, effectiveSteps, integrationsStatus, createChannelDirectly]);
  
  const handleDriveFoldersComplete = async (rootFolderId: string, archiveFolderId: string) => {
    // Сохраняем folderId во временное состояние мастера
    setWizardDriveFolders({ rootFolderId, archiveFolderId });
    // Обновляем formData с folder IDs
    setFormData(prev => ({
      ...prev,
      driveInputFolderId: rootFolderId,
      driveArchiveFolderId: archiveFolderId
    }));
    
    // Если это последний шаг, создаём канал и переходим к редактированию
    if (currentStep >= totalSteps) {
      // Создаём канал с folderId
      if (!user?.uid) {
        setError("Пользователь не авторизован");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Получаем настройки пользователя для подстановки defaultBlottataApiKey
        let defaultBlottataApiKey: string | undefined = undefined;
        let hasDefaultBlotatoApiKey = false;
        try {
          const userSettings = await getUserSettings();
          hasDefaultBlotatoApiKey = userSettings.hasDefaultBlottataApiKey || false;
          if (userSettings.hasDefaultBlottataApiKey && userSettings.defaultBlottataApiKey) {
            defaultBlottataApiKey = userSettings.defaultBlottataApiKey === "****" 
              ? undefined 
              : userSettings.defaultBlottataApiKey;
          }
        } catch (settingsError) {
          console.warn("Failed to load user settings for default Blotato API key", settingsError);
        }

        // Создаём канал с включённым Blotato и заполненными полями папок
        const channelData: ChannelCreatePayload = {
          ...formData,
          generationTransport: formData.generationTransport || (telegramStatus?.status === "active" ? "telegram_user" : "telegram_global"),
          // Включаем Blotato-публикацию для нового канала
          blotataEnabled: true,
          // Заполняем ID папок из созданных папок
          driveInputFolderId: rootFolderId,
          driveArchiveFolderId: archiveFolderId,
          // Подставляем API-ключ из настроек пользователя, если он есть
          blotataApiKey: defaultBlottataApiKey
        };
        
        const newChannel = await createChannel(user.uid, channelData);
        
        // Если у пользователя нет сохранённого Blotato API-ключа, перенаправляем на страницу настройки
        if (!hasDefaultBlotatoApiKey || !defaultBlottataApiKey) {
          navigate(`/channels/${newChannel.id}/blotato-setup`, { replace: true });
        } else {
          // Если ключ есть, переходим к редактированию канала
          navigate(`/channels/${newChannel.id}/edit`, { replace: true });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Ошибка при создании канала"
        );
        setLoading(false);
      }
    } else {
      // Переходим к следующему шагу
      setCurrentStep(prev => {
        if (prev < totalSteps) {
          return prev + 1;
        }
        return prev;
      });
      setError(null);
    }
  };

  const handleGenerateNiche = async () => {
    setNicheGenerating(true);
    try {
      const result = await suggestNiche({
        channelName: formData.name,
        language: formData.language,
        targetAudience: formData.audience,
        tone: formData.tone,
        platform: formData.platform
      });

      if (result.success && result.niche) {
        setFormData(prev => ({ ...prev, niche: result.niche! }));
        showSuccess("Ниша успешно сгенерирована", 3000);
      } else {
        throw new Error(result.message || "Не удалось сгенерировать нишу");
      }
    } catch (error: any) {
      console.error("Failed to generate niche:", error);
      showError(
        error.message || "Не удалось сгенерировать нишу. Попробуйте ещё раз или введите её вручную.",
        6000
      );
    } finally {
      setNicheGenerating(false);
    }
  };

  const handleNicheChipClick = (niche: string) => {
    setFormData(prev => ({ ...prev, niche }));
  };

  const handleGenerateTargetAudience = async () => {
    setAudienceGenerating(true);
    try {
      const result = await suggestTargetAudience({
        channelName: formData.name,
        platform: formData.platform,
        language: formData.language,
        niche: formData.niche,
        videoDuration: formData.targetDurationSec,
        tone: formData.tone,
        additionalNotes: formData.extraNotes
      });

      if (result.success && result.targetAudience) {
        setFormData(prev => ({ ...prev, audience: result.targetAudience! }));
        showSuccess("Целевая аудитория успешно сгенерирована", 3000);
      } else {
        throw new Error(result.message || "Не удалось сгенерировать целевую аудиторию");
      }
    } catch (error: any) {
      console.error("Failed to generate target audience:", error);
      showError(
        error.message || "Не удалось сгенерировать целевую аудиторию. Попробуйте ещё раз или опишите её вручную.",
        6000
      );
    } finally {
      setAudienceGenerating(false);
    }
  };

  const handleAudienceChipClick = (audience: string) => {
    setFormData(prev => ({ ...prev, audience }));
  };

  const handleGenerateForbiddenTopics = async () => {
    setForbiddenTopicsGenerating(true);
    try {
      const result = await suggestForbiddenTopics({
        channelName: formData.name,
        platform: formData.platform,
        language: formData.language,
        niche: formData.niche,
        targetAudience: formData.audience,
        tone: formData.tone,
        additionalNotes: formData.extraNotes
      });

      if (result.success && result.forbiddenTopics) {
        setFormData(prev => ({ ...prev, blockedTopics: result.forbiddenTopics! }));
        showSuccess("Запрещённые темы успешно сгенерированы", 3000);
      } else {
        throw new Error(result.message || "Не удалось сгенерировать список запрещённых тем");
      }
    } catch (error: any) {
      console.error("Failed to generate forbidden topics:", error);
      showError(
        error.message || "Не удалось сгенерировать список запрещённых тем. Попробуйте ещё раз или введите их вручную.",
        6000
      );
    } finally {
      setForbiddenTopicsGenerating(false);
    }
  };

  const handleForbiddenTopicChipClick = (topic: string) => {
    setFormData(prev => {
      const current = prev.blockedTopics.toLowerCase();
      const topicLower = topic.toLowerCase();
      
      // Проверяем, не добавлена ли уже эта тема
      if (current.includes(topicLower)) {
        return prev; // Не добавляем дубликат
      }
      
      // Добавляем через запятую, если поле уже заполнено
      const newValue = prev.blockedTopics.trim() 
        ? `${prev.blockedTopics}, ${topic}`
        : topic;
      
      return { ...prev, blockedTopics: newValue };
    });
  };

  const handleGenerateAdditionalPreferences = async () => {
    setAdditionalPreferencesGenerating(true);
    try {
      const result = await suggestAdditionalPreferences({
        channelName: formData.name,
        platform: formData.platform,
        language: formData.language,
        niche: formData.niche,
        targetAudience: formData.audience,
        tone: formData.tone,
        forbiddenTopics: formData.blockedTopics,
        generationMode: formData.generationMode,
        videoDuration: formData.targetDurationSec,
        otherNotes: formData.extraNotes
      });

      if (result.success && result.additionalPreferences) {
        setFormData(prev => ({ ...prev, extraNotes: result.additionalPreferences! }));
        showSuccess("Дополнительные пожелания успешно сгенерированы", 3000);
      } else {
        throw new Error(result.message || "Не удалось сгенерировать дополнительные пожелания");
      }
    } catch (error: any) {
      console.error("Failed to generate additional preferences:", error);
      showError(
        error.message || "Не удалось сгенерировать дополнительные пожелания. Попробуйте ещё раз или введите их вручную.",
        6000
      );
    } finally {
      setAdditionalPreferencesGenerating(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  // Автоскролл к началу контента при смене шага
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentStep]);
  
  // Автоматически пропускаем шаги интеграций, если они уже подключены
  useEffect(() => {
    const stepType = getCurrentStepType();
    
    // Если текущий шаг - Telegram, но он уже подключен, переходим дальше
    if (stepType === "telegram" && integrationsStatus.status.telegram.connected && !integrationsStatus.status.telegram.loading) {
      // Небольшая задержка для лучшего UX
      const timer = setTimeout(() => {
        handleTelegramComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
    
  }, [integrationsStatus.status.telegram.connected, currentStep, handleTelegramComplete]);
  

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) {
      setError("Пользователь не авторизован");
      return;
    }

    if (!canGoNext()) {
      setError("Заполните все обязательные поля");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Получаем настройки пользователя для подстановки defaultBlottataApiKey
      let defaultBlottataApiKey: string | undefined = undefined;
      try {
        const userSettings = await getUserSettings();
        if (userSettings.hasDefaultBlottataApiKey && userSettings.defaultBlottataApiKey) {
          // Если пользователь не указал явно blotataApiKey, используем значение по умолчанию
          // Но если пользователь явно указал пустое значение, не подставляем
          defaultBlottataApiKey = userSettings.defaultBlottataApiKey === "****" 
            ? undefined 
            : userSettings.defaultBlottataApiKey;
        }
      } catch (settingsError) {
        // Игнорируем ошибки получения настроек - не критично
        console.warn("Failed to load user settings for default Blottata API key", settingsError);
      }

      // Убеждаемся, что generationTransport установлен (если не был установлен ранее)
      // Используем folderId из мастера, если они были созданы
      const channelData: ChannelCreatePayload = {
        ...formData,
        generationTransport: formData.generationTransport || (telegramStatus?.status === "active" ? "telegram_user" : "telegram_global"),
        // Подставляем defaultBlottataApiKey только если он не был явно указан
        blotataApiKey: formData.blotataApiKey || defaultBlottataApiKey,
        // Используем folderId из мастера, если они были созданы
        driveInputFolderId: wizardDriveFolders?.rootFolderId || formData.driveInputFolderId,
        driveArchiveFolderId: wizardDriveFolders?.archiveFolderId || formData.driveArchiveFolderId
      };
      const newChannel = await createChannel(user.uid, channelData);
      setCreatedChannelId(newChannel.id);
      
      // Проверяем, есть ли у пользователя Blotato API-ключ
      try {
        const userSettings = await getUserSettings();
        if (!userSettings.hasDefaultBlottataApiKey || !userSettings.defaultBlottataApiKey) {
          // Если API-ключа нет, перенаправляем на страницу настройки Blotato
          navigate(`/channels/${newChannel.id}/blotato-setup`, { replace: true });
          return;
        }
      } catch (settingsError) {
        // Если не удалось проверить настройки, продолжаем обычный сценарий
        console.warn("Failed to check user settings for Blotato API key", settingsError);
      }
      
      // Переходим к редактированию канала
      navigate(`/channels/${newChannel.id}/edit`, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка при создании канала"
      );
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    const stepType = getCurrentStepType();
    const formStep = getFormStepNumber();
    
    // Обрабатываем специальные шаги интеграций
    if (stepType === "telegram") {
      return (
        <WizardTelegramStep
          onComplete={handleTelegramComplete}
          onSkip={handleTelegramComplete}
        />
      );
    }
    
    if (stepType === "drive_folders") {
      return (
        <WizardDriveFoldersStep
          channelName={formData.name}
          channelUuid={createdChannelId || undefined}
          onComplete={handleDriveFoldersComplete}
        />
      );
    }
    
    // Обрабатываем шаги формы
    switch (formStep) {
      case 1:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Название канала *
              </label>
              <FieldHelpIcon
                fieldKey="channel.name"
                page="wizard"
                channelContext={{
                  step: "name",
                  context: "wizard",
                  channelType: formData.platform,
                  userLanguage: formData.language
                }}
                label="Название канала"
              />
            </div>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Например: Мой канал про технологии"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 focus:shadow-lg focus:shadow-brand/20 md:rounded-2xl md:px-5 md:py-3.5"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Это название будет отображаться в списке ваших каналов
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Выберите платформу *
              </label>
              <FieldHelpIcon
                fieldKey="channel.platform"
                page="wizard"
                channelContext={{
                  step: "platform",
                  context: "wizard"
                }}
                label="Платформа"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, platform: platform.value })
                  }
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.platform === platform.value
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Язык сценариев *
              </label>
              <FieldHelpIcon
                fieldKey="channel.language"
                page="wizard"
                channelContext={{
                  step: "language",
                  context: "wizard",
                  platform: formData.platform
                }}
                label="Язык сценариев"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, language: lang.value })
                  }
                  className={`min-h-[44px] rounded-lg border px-2 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.language === lang.value
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Длительность ролика (секунды) *
              </label>
              <FieldHelpIcon
                fieldKey="channel.targetDurationSec"
                page="wizard"
                channelContext={{
                  step: "duration",
                  context: "wizard",
                  platform: formData.platform
                }}
                label="Длительность ролика"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
              {DURATIONS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, targetDurationSec: duration })
                  }
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.targetDurationSec === duration
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {duration} сек
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Ниша / Тематика *
              </label>
              <FieldHelpIcon
                fieldKey="channel.niche"
                page="wizard"
                channelContext={{
                  step: "niche",
                  context: "wizard",
                  platform: formData.platform
                }}
                label="Ниша / Тематика"
              />
            </div>
            <input
              type="text"
              value={formData.niche}
              onChange={(e) =>
                setFormData({ ...formData, niche: e.target.value })
              }
              placeholder="Например: Технологии, Кулинария, Спорт, Образование"
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 focus:shadow-lg focus:shadow-brand/20 md:rounded-2xl md:px-5 md:py-3.5"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Основная тематика вашего контента
            </p>

            {/* Популярные ниши (чипсы) */}
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400 md:text-sm">
                Популярные варианты:
              </p>
              <div className="flex flex-wrap gap-2 md:gap-2.5">
                {POPULAR_NICHES.map((niche) => (
                  <button
                    key={niche}
                    type="button"
                    onClick={() => handleNicheChipClick(niche)}
                    className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-brand/40 hover:bg-brand/10 hover:text-white hover:scale-105 md:px-4 md:py-2 md:text-sm"
                  >
                    {niche}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопка генерации ниши */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleGenerateNiche}
                disabled={nicheGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 to-brand/5 px-4 py-3 text-sm font-medium text-brand transition-all hover:border-brand/60 hover:from-brand/20 hover:to-brand/10 hover:shadow-lg hover:shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed md:py-3.5"
              >
                {nicheGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Сгенерировать нишу автоматически
                  </>
                )}
              </button>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Целевая аудитория *
              </label>
              <FieldHelpIcon
                fieldKey="channel.audience"
                page="wizard"
                channelContext={{
                  step: "audience",
                  context: "wizard",
                  niche: formData.niche,
                  channelName: formData.name,
                  platform: formData.platform,
                  language: formData.language
                }}
                label="Целевая аудитория"
              />
            </div>
            <textarea
              value={formData.audience}
              onChange={(e) =>
                setFormData({ ...formData, audience: e.target.value })
              }
              placeholder="Например: Молодёжь 18-25 лет, интересующаяся технологиями"
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 focus:shadow-lg focus:shadow-brand/20 md:rounded-2xl md:px-5 md:py-3.5"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Опишите вашу целевую аудиторию
            </p>

            {/* Популярные целевые аудитории (чипсы) */}
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400 md:text-sm">
                Типовые варианты:
              </p>
              <div className="flex flex-wrap gap-2 md:gap-2.5">
                {POPULAR_AUDIENCES.map((audience) => (
                  <button
                    key={audience}
                    type="button"
                    onClick={() => handleAudienceChipClick(audience)}
                    className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-left text-xs text-slate-300 transition-all hover:border-brand/40 hover:bg-brand/10 hover:text-white hover:scale-105 md:px-4 md:py-2.5 md:text-sm"
                  >
                    {audience}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопка генерации целевой аудитории */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleGenerateTargetAudience}
                disabled={audienceGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 to-brand/5 px-4 py-3 text-sm font-medium text-brand transition-all hover:border-brand/60 hover:from-brand/20 hover:to-brand/10 hover:shadow-lg hover:shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed md:py-3.5"
              >
                {audienceGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Сгенерировать целевую аудиторию автоматически
                  </>
                )}
              </button>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Тон / Стиль контента *
              </label>
              <FieldHelpIcon
                fieldKey="channel.tone"
                page="wizard"
                channelContext={{
                  step: "tone",
                  context: "wizard",
                  audience: formData.audience
                }}
                label="Тон / Стиль контента"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
              {TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setFormData({ ...formData, tone })}
                  className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-center text-sm transition md:rounded-xl md:px-4 md:py-3 ${
                    formData.tone === tone
                      ? "border-brand bg-brand/10 text-white"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-brand/40"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 md:text-sm">
              Выберите основной тон для ваших сценариев
            </p>
          </div>
        );

      case 8:
        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Запрещённые темы (опционально)
              </label>
              <FieldHelpIcon
                fieldKey="channel.blockedTopics"
                page="wizard"
                channelContext={{
                  step: "forbidden_topics",
                  context: "wizard",
                  channelName: formData.name,
                  niche: formData.niche,
                  targetAudience: formData.audience,
                  platform: formData.platform,
                  language: formData.language
                }}
                label="Запрещённые темы"
              />
            </div>
            <textarea
              value={formData.blockedTopics}
              onChange={(e) =>
                setFormData({ ...formData, blockedTopics: e.target.value })
              }
              placeholder="Например: Политика, Насилие, Нецензурная лексика"
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 focus:shadow-lg focus:shadow-brand/20 md:rounded-2xl md:px-5 md:py-3.5"
              autoFocus
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Укажите темы, которые не должны появляться в сценариях
            </p>

            {/* Популярные запрещённые темы (чипсы) */}
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400 md:text-sm">
                Типовые варианты:
              </p>
              <div className="flex flex-wrap gap-2 md:gap-2.5">
                {COMMON_FORBIDDEN_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => handleForbiddenTopicChipClick(topic)}
                    className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-brand/40 hover:bg-brand/10 hover:text-white hover:scale-105 md:px-4 md:py-2 md:text-sm"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопка генерации запрещённых тем */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleGenerateForbiddenTopics}
                disabled={forbiddenTopicsGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 to-brand/5 px-4 py-3 text-sm font-medium text-brand transition-all hover:border-brand/60 hover:from-brand/20 hover:to-brand/10 hover:shadow-lg hover:shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed md:py-3.5"
              >
                {forbiddenTopicsGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Сгенерировать запрещённые темы автоматически
                  </>
                )}
              </button>
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Режим генерации *
              </label>
              <FieldHelpIcon
                fieldKey="channel.generationMode"
                page="wizard"
                channelContext={{
                  step: "generationMode",
                  context: "wizard"
                }}
                label="Режим генерации"
              />
            </div>
            
            <p className="text-xs text-slate-400 md:text-sm">
              Выберите, что будет генерироваться при создании сценариев
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-5">
              {/* Карточка "Сценарий" */}
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "script"
                  })
                }
                className={`group relative min-h-[120px] rounded-2xl border-2 px-5 py-4 text-left transition-all duration-300 shadow-lg hover:scale-[1.02] md:min-h-[140px] md:rounded-3xl md:px-6 md:py-5 ${
                  formData.generationMode === "script"
                    ? "border-brand bg-gradient-to-br from-brand/30 via-brand/20 to-brand/10 text-white shadow-brand/30 ring-2 ring-brand/20"
                    : "border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 text-slate-300 hover:border-brand/50 hover:bg-gradient-to-br hover:from-slate-800/80 hover:to-slate-900/80 hover:shadow-xl hover:shadow-brand/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 rounded-xl p-2.5 transition-all duration-300 ${
                    formData.generationMode === "script"
                      ? "bg-brand/30 text-brand-200"
                      : "bg-slate-800/50 text-slate-400 group-hover:bg-brand/20 group-hover:text-brand-300"
                  }`}>
                    <FileText size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold md:text-base">Сценарий</div>
                    <div className="mt-2 text-[11px] leading-relaxed text-slate-400 md:mt-2.5 md:text-xs">
                      Только подробный сценарий
                    </div>
                  </div>
                </div>
              </button>

              {/* Карточка "Сценарий + промпт для видео" */}
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "prompt"
                  })
                }
                className={`group relative min-h-[120px] rounded-2xl border-2 px-5 py-4 text-left transition-all duration-300 shadow-lg hover:scale-[1.02] md:min-h-[140px] md:rounded-3xl md:px-6 md:py-5 ${
                  formData.generationMode === "prompt"
                    ? "border-brand bg-gradient-to-br from-brand/30 via-brand/20 to-brand/10 text-white shadow-brand/30 ring-2 ring-brand/20"
                    : "border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 text-slate-300 hover:border-brand/50 hover:bg-gradient-to-br hover:from-slate-800/80 hover:to-slate-900/80 hover:shadow-xl hover:shadow-brand/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 rounded-xl p-2.5 transition-all duration-300 ${
                    formData.generationMode === "prompt"
                      ? "bg-brand/30 text-brand-200"
                      : "bg-slate-800/50 text-slate-400 group-hover:bg-brand/20 group-hover:text-brand-300"
                  }`}>
                    <FileText size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold md:text-base">Сценарий + промпт для видео</div>
                    <div className="mt-2 text-[11px] leading-relaxed text-slate-400 md:mt-2.5 md:text-xs">
                      Сценарий + VIDEO_PROMPT для Sora/Veo
                    </div>
                  </div>
                </div>
              </button>

              {/* Карточка "Промпт для видео" с badge */}
              <button
                type="button"
                onClick={() =>
                  setFormData({
                    ...formData,
                    generationMode: "video-prompt-only"
                  })
                }
                className={`group relative min-h-[120px] rounded-2xl border-2 px-5 py-4 text-left transition-all duration-300 shadow-lg hover:scale-[1.02] md:min-h-[140px] md:rounded-3xl md:px-6 md:py-5 ${
                  (formData.generationMode || "video-prompt-only") === "video-prompt-only"
                    ? "border-brand bg-gradient-to-br from-brand/30 via-brand/20 to-brand/10 text-white shadow-brand/30 ring-2 ring-brand/20"
                    : "border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 text-slate-300 hover:border-brand/50 hover:bg-gradient-to-br hover:from-slate-800/80 hover:to-slate-900/80 hover:shadow-xl hover:shadow-brand/10"
                }`}
              >
                {/* Badge "Рекомендуется для автоматизации" - сверху слева */}
                <div className="absolute left-3 top-3 z-10 md:left-4 md:top-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500/30 via-emerald-400/25 to-emerald-500/30 px-2.5 py-1 text-[9px] font-semibold text-emerald-200 shadow-lg shadow-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 md:px-3 md:py-1.5 md:text-[10px]">
                    <Zap size={10} className="md:w-3 md:h-3" />
                    <span>Рекомендуется</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-6 md:pt-7">
                  <div className={`flex-shrink-0 rounded-xl p-2.5 transition-all duration-300 ${
                    (formData.generationMode || "video-prompt-only") === "video-prompt-only"
                      ? "bg-brand/30 text-brand-200"
                      : "bg-slate-800/50 text-slate-400 group-hover:bg-brand/20 group-hover:text-brand-300"
                  }`}>
                    <Video size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold md:text-base">Промпт для видео</div>
                    <div className="mt-2 text-[11px] leading-relaxed text-slate-400 md:mt-2.5 md:text-xs">
                      Только VIDEO_PROMPT для Sora/Veo без текста сценария
                    </div>
                  </div>
                </div>
              </button>
            </div>
            
            {/* Информационная подсказка - под карточками */}
            <div className="rounded-xl border border-brand/20 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3 md:rounded-2xl md:px-5 md:py-3.5">
              <p className="text-xs leading-relaxed text-slate-300 md:text-sm">
                <span className="font-semibold text-brand-300">💡 Совет:</span> Для корректной работы автоматической генерации и публикации видео рекомендуется выбирать режим <span className="font-semibold text-white">"Промпт для видео"</span>.
              </p>
            </div>
            
            {/* Предупреждение, если выбран не "video-prompt-only" */}
            {(formData.generationMode || "video-prompt-only") !== "video-prompt-only" && (
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-900/20 via-amber-900/15 to-transparent px-4 py-3 text-xs leading-relaxed text-amber-200 shadow-lg shadow-amber-500/10 md:rounded-2xl md:px-5 md:py-3.5 md:text-sm">
                <span className="font-semibold">⚠️ Обратите внимание:</span> Автоматизация канала (автогенерация и автопубликация видео) работает на основе режима "Промпт для видео". Если вы выбираете другой режим, часть функций может быть недоступна.
              </div>
            )}
          </div>
        );

      case 10: {
        const handleExtraNotesChange = (
          e: React.ChangeEvent<HTMLTextAreaElement>
        ) => {
          const textarea = e.target;
          // Авто-растяжение textarea под контент
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;

          setFormData({ ...formData, extraNotes: textarea.value });
        };

        return (
          <div className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-medium text-slate-200 md:text-sm">
                Дополнительные пожелания (опционально)
              </label>
              <FieldHelpIcon
                fieldKey="channel.extraNotes"
                page="wizard"
                channelContext={{
                  step: "additional_preferences",
                  context: "wizard",
                  channelName: formData.name,
                  platform: formData.platform,
                  language: formData.language,
                  niche: formData.niche,
                  targetAudience: formData.audience,
                  tone: formData.tone,
                  forbiddenTopics: formData.blockedTopics,
                  generationMode: formData.generationMode
                }}
                label="Дополнительные пожелания"
              />
            </div>
            <textarea
              value={formData.extraNotes || ""}
              onChange={handleExtraNotesChange}
              placeholder="Любые дополнительные требования к сценариям... Например: «бабушка и дедушка — казахи», особенности персонажей, сеттинг, стиль съёмки."
              rows={5}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/40 focus:shadow-lg focus:shadow-brand/20 min-h-[120px] h-auto resize-y overflow-auto md:rounded-2xl md:px-5 md:py-3.5 md:min-h-[140px]"
            />
            <p className="text-xs text-slate-400 md:text-sm">
              Этот блок используется как обязательные условия при генерации сценария и VIDEO_PROMPT, поэтому подробно опишите важные детали (национальность, характеры, стиль и т.п.).
            </p>

            {/* Кнопка генерации дополнительных пожеланий */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleGenerateAdditionalPreferences}
                disabled={additionalPreferencesGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 to-brand/5 px-4 py-3 text-sm font-medium text-brand transition-all hover:border-brand/60 hover:from-brand/20 hover:to-brand/10 hover:shadow-lg hover:shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed md:py-3.5"
              >
                {additionalPreferencesGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Сгенерировать дополнительные пожелания автоматически
                  </>
                )}
              </button>
            </div>

            {/* Пометка о возможности редактирования */}
            <p className="text-xs text-slate-500 md:text-sm">
              Эти дополнительные пожелания будут использоваться при генерации промптов и сценариев. Вы всегда можете изменить их позже в настройках вашего канала.
            </p>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-10 lg:px-10">
        {/* Шапка с градиентным фоном */}
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-slate-900/80 via-slate-800/60 to-slate-900/80 p-4 shadow-xl shadow-brand/5 md:mb-8 md:p-6">
          <div className="mb-4 flex items-center gap-3 md:mb-6 md:gap-4">
            <button
              type="button"
              onClick={() => navigate("/channels")}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-slate-300 transition-all hover:border-brand/40 hover:bg-brand/10 hover:text-white md:px-4 md:py-2.5"
              title="Назад"
            >
              <ArrowLeft size={18} className="md:mr-2" />
              <span className="hidden md:inline">Назад</span>
            </button>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Sparkles size={20} className="text-brand-light flex-shrink-0 md:w-6 md:h-6" />
              <h1 className="text-xl font-bold truncate bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent md:text-3xl">
                Мастер создания канала
              </h1>
            </div>
          </div>

          {/* Индикатор шагов - адаптивный stepper */}
          <div>
            {/* Десктопная версия (≥1024px) - двухуровневый stepper */}
            <div className="hidden lg:block">
              {/* Верхний уровень: заголовок с текущим шагом */}
              <div className="mb-4 text-center">
                <h2 className="text-lg font-bold text-white md:text-xl">
                  Шаг {currentStep} из {totalSteps}:{" "}
                  <span className="text-brand-light">
                    {effectiveSteps[currentStep - 1]?.title || "Неизвестный шаг"}
                  </span>
                </h2>
              </div>

              {/* Нижний уровень: индикаторы-кружки с автоматическим переносом */}
              <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
                {effectiveSteps.map((step, index) => {
                  const stepNumber = index + 1;
                  const isCompleted = currentStep > stepNumber;
                  const isActive = currentStep === stepNumber;
                  
                  return (
                    <div
                      key={step.id}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 flex-shrink-0 ${
                        isCompleted
                          ? "border-brand bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg shadow-brand/30 scale-100"
                          : isActive
                          ? "border-brand bg-brand/20 text-brand-light shadow-lg shadow-brand/20 scale-110 ring-2 ring-brand/30"
                          : "border-white/20 bg-slate-900/60 text-slate-400 hover:border-white/30 hover:bg-slate-800/60"
                      }`}
                      title={`${stepNumber}. ${step.title}`}
                    >
                      {isCompleted ? (
                        <Check size={14} className="text-white" />
                      ) : (
                        <span className="text-xs font-bold">{stepNumber}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Планшетная версия (768px - 1023px) - компактные кружки с переносом */}
            <div className="hidden md:block lg:hidden">
              {/* Верхний уровень: заголовок */}
              <div className="mb-3 text-center">
                <h2 className="text-base font-bold text-white">
                  Шаг {currentStep} из {totalSteps}:{" "}
                  <span className="text-brand-light">
                    {effectiveSteps[currentStep - 1]?.title || "Неизвестный шаг"}
                  </span>
                </h2>
              </div>

              {/* Нижний уровень: компактные индикаторы */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {effectiveSteps.map((step, index) => {
                  const stepNumber = index + 1;
                  const isCompleted = currentStep > stepNumber;
                  const isActive = currentStep === stepNumber;
                  
                  return (
                    <div
                      key={step.id}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300 flex-shrink-0 ${
                        isCompleted
                          ? "border-brand bg-gradient-to-br from-brand to-brand-dark text-white shadow-md shadow-brand/20"
                          : isActive
                          ? "border-brand bg-brand/20 text-brand-light shadow-md shadow-brand/15 scale-110"
                          : "border-white/20 bg-slate-900/60 text-slate-400"
                      }`}
                      title={`${stepNumber}. ${step.title}`}
                    >
                      {isCompleted ? (
                        <Check size={12} className="text-white" />
                      ) : (
                        <span className="text-[10px] font-bold">{stepNumber}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Мобильная версия (<768px) - только progress bar */}
            <div className="md:hidden">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-white">
                  Шаг {currentStep} из {totalSteps}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {Math.round((currentStep / totalSteps) * 100)}%
                </span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-800/60 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand via-brand-light to-brand-dark transition-all duration-500 ease-out shadow-lg shadow-brand/40"
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-brand-light text-center">
                {effectiveSteps[currentStep - 1]?.title || "Неизвестный шаг"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/80 p-5 shadow-2xl shadow-brand/10 backdrop-blur-sm md:rounded-3xl md:p-8 lg:p-10">
            <div className="mb-4 md:mb-6" ref={contentRef}>
              <h2 className="text-lg font-bold text-white md:text-2xl lg:hidden">
                {effectiveSteps[currentStep - 1]?.title || "Неизвестный шаг"}
              </h2>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 md:mb-6 md:px-4 md:py-3 md:text-sm">
                {error}
              </div>
            )}

            <div className="min-h-[200px] md:min-h-[300px] pb-24 md:pb-0 fade-in">
              {renderStepContent()}
            </div>

            {/* Кнопки навигации */}
            <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col-reverse gap-2 border-t border-white/10 bg-slate-950/95 p-4 backdrop-blur-md sm:flex-row md:relative md:bottom-auto md:left-auto md:right-auto md:z-auto md:mt-8 md:border-t-0 md:bg-transparent md:backdrop-blur-none md:p-0">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-300 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:border-brand/40 hover:bg-brand/10 hover:text-white md:flex-initial md:px-6 md:py-3"
              >
                <ArrowLeft size={18} />
                <span>Назад</span>
              </button>

              {currentStep < totalSteps ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/40 md:flex-initial md:px-6 md:py-3"
                >
                  <span>Далее</span>
                  <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !canGoNext()}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/40 md:flex-initial md:px-6 md:py-3"
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
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChannelWizardPage;
