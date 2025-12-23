import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, FolderPlus, AlertCircle } from "lucide-react";
import { generateDriveFoldersForWizard } from "../../api/channelDriveFolders";
import { FieldHelpIcon } from "../aiAssistant/FieldHelpIcon";

interface WizardDriveFoldersStepProps {
  channelName: string;
  channelUuid?: string;
  onComplete: (rootFolderId: string, archiveFolderId: string) => void;
}

type FolderCreationStep = 
  | "idle"
  | "creating_root"
  | "root_created"
  | "creating_archive"
  | "archive_created"
  | "saving_ids"
  | "completed"
  | "error";

export function WizardDriveFoldersStep({
  channelName,
  channelUuid,
  onComplete
}: WizardDriveFoldersStepProps) {
  const [creationStep, setCreationStep] = useState<FolderCreationStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);
  const [archiveFolderId, setArchiveFolderId] = useState<string | null>(null);
  const [rootFolderName, setRootFolderName] = useState<string | null>(null);
  const [archiveFolderName, setArchiveFolderName] = useState<string | null>(null);
  const hasAutoStartedRef = useRef(false);
  const minDisplayTimeRef = useRef<number | null>(null);

  const handleGenerate = async () => {
    if (!channelName || channelName.trim().length === 0) {
      setError("Название канала не может быть пустым");
      setCreationStep("error");
      return;
    }

    // Устанавливаем минимальное время отображения
    minDisplayTimeRef.current = Date.now();
    
    setCreationStep("creating_root");
    setError(null);

    try {
      // Шаг 1: Создание основной папки
      setCreationStep("creating_root");
      
      const result = await generateDriveFoldersForWizard({
        channelName: channelName.trim(),
        channelUuid
      });

      if (!result.success || !result.rootFolderId || !result.archiveFolderId) {
        throw new Error(result.message || result.error || "Неизвестная ошибка");
      }

      // Шаг 2: Основная папка создана
      setRootFolderId(result.rootFolderId);
      setRootFolderName(result.rootFolderName || `${channelName.trim()} — ${channelUuid || "канал"}`);
      setCreationStep("root_created");
      
      // Небольшая задержка для визуализации
      await new Promise(resolve => setTimeout(resolve, 300));

      // Шаг 3: Создание архивной папки
      setCreationStep("creating_archive");
      await new Promise(resolve => setTimeout(resolve, 300));

      // Шаг 4: Архивная папка создана
      setArchiveFolderId(result.archiveFolderId);
      setArchiveFolderName(result.archiveFolderName || "uploaded");
      setCreationStep("archive_created");
      await new Promise(resolve => setTimeout(resolve, 300));

      // Шаг 5: Сохранение ID
      setCreationStep("saving_ids");
      await new Promise(resolve => setTimeout(resolve, 200));

      // Шаг 6: Завершено
      setCreationStep("completed");

      // Обеспечиваем минимальное время отображения (1 секунда)
      const elapsed = Date.now() - (minDisplayTimeRef.current || Date.now());
      const remainingTime = Math.max(0, 1000 - elapsed);
      
      setTimeout(() => {
        onComplete(result.rootFolderId!, result.archiveFolderId!);
      }, remainingTime);
      
    } catch (error: any) {
      console.error("[WizardDriveFoldersStep] Failed to generate drive folders:", error);
      
      let errorMessage = "Не удалось создать папки для канала";
      
      if (error.message) {
        const errorCode = error.code || error.message;
        const errorText = error.message.toLowerCase();
        
        if (errorCode === "INVALID_CHANNEL_NAME") {
          errorMessage = "Название канала не может быть пустым";
        } else {
          errorMessage = error.message || errorMessage;
        }
      }

      setError(errorMessage);
      setCreationStep("error");
    }
  };

  // Автоматически запускаем создание папок при монтировании
  useEffect(() => {
    if (
      !hasAutoStartedRef.current &&
      channelName &&
      channelName.trim().length > 0 &&
      creationStep === "idle"
    ) {
      hasAutoStartedRef.current = true;
      // Небольшая задержка для лучшего UX
      const timer = setTimeout(() => {
        void handleGenerate();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    channelName,
    creationStep
  ]);


  // Если папки уже созданы, показываем успешное сообщение
  if (creationStep === "completed") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div className="flex-1">
            <div className="font-medium text-white">✅ Папки успешно созданы</div>
            {rootFolderName && (
              <div className="mt-1 text-sm text-slate-400">
                Основная папка: {rootFolderName}
              </div>
            )}
            {archiveFolderName && (
              <div className="mt-1 text-sm text-slate-400">
                Архивная папка: {archiveFolderName}
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-400">Завершаем создание канала...</p>
      </div>
    );
  }

  // Если произошла ошибка, показываем сообщение с кнопкой повтора
  if (creationStep === "error") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold md:text-lg">Создание папок для канала</h3>
          <FieldHelpIcon
            fieldKey="wizard.drive_folders"
            page="wizard"
            channelContext={{
              step: "drive_folders",
              context: "wizard",
              channelName
            }}
            label="Создание папок для канала"
          />
        </div>
        
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-900/20 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
          <div className="flex-1">
            <div className="font-medium text-red-300">Не удалось создать папки</div>
            <div className="mt-1 text-sm text-red-200">{error || "Произошла ошибка при создании папок"}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            hasAutoStartedRef.current = false;
            setCreationStep("idle");
            setError(null);
            void handleGenerate();
          }}
          className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark flex items-center justify-center gap-2"
        >
          <FolderPlus className="h-4 w-4" />
          Повторить создание папок
        </button>
      </div>
    );
  }

  // Показываем процесс создания папок
  const isProcessing = creationStep !== "idle" && creationStep !== "completed" && creationStep !== "error";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold md:text-lg">Создание папок для канала</h3>
        <FieldHelpIcon
          fieldKey="wizard.drive_folders"
          page="wizard"
          channelContext={{
            step: "drive_folders",
            context: "wizard",
            channelName
          }}
          label="Создание папок для канала"
        />
      </div>
      
      <div className="rounded-xl border border-brand/20 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3 md:rounded-2xl md:px-5 md:py-3.5">
        <p className="text-xs leading-relaxed text-slate-300 md:text-sm">
          <span className="font-semibold text-brand-300">📁 Создаём папки для канала автоматически</span> на сервере. Будет создана основная папка канала и подпапка «uploaded». Система автоматически заполнит настройки канала.
        </p>
      </div>

      {/* Прогресс создания папок */}
      {isProcessing && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/50 p-4">
          <div className="flex items-center gap-3">
            {creationStep === "creating_root" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
                <span className="text-sm text-slate-300">Создаём основную папку...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-slate-300">☑ Создана основная папка</span>
              </>
            )}
          </div>
          
          {creationStep !== "creating_root" && (
            <div className="flex items-center gap-3">
              {creationStep === "creating_archive" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-brand" />
                  <span className="text-sm text-slate-300">Создаём архивную папку...</span>
                </>
              ) : creationStep === "archive_created" || creationStep === "saving_ids" || creationStep === "completed" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <span className="text-sm text-slate-300">☑ Создана архивная папка</span>
                </>
              ) : null}
            </div>
          )}
          
          {(creationStep === "saving_ids" || creationStep === "completed") && (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm text-slate-300">☑ Привязка ID сохранена</span>
            </div>
          )}
        </div>
      )}

      {/* Кнопка создания папок (если ещё не начато) */}
      {creationStep === "idle" && (
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={false}
          className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <FolderPlus className="h-4 w-4" />
          Создать папки для канала автоматически
        </button>
      )}
    </div>
  );
}

