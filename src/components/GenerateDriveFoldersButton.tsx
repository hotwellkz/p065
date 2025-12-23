import { useState } from "react";
import { Loader2, FolderPlus } from "lucide-react";
import { generateDriveFolders } from "../api/channelDriveFolders";
import { useToast } from "../hooks/useToast";
import { useIntegrationsStatus } from "../hooks/useIntegrationsStatus";
import { useAIAssistant } from "./aiAssistant/useAIAssistant";

interface GenerateDriveFoldersButtonProps {
  channelId: string;
  channelName: string;
  hasExistingFolders: boolean;
  onFoldersGenerated?: (rootFolderId: string, archiveFolderId: string) => void;
}

export function GenerateDriveFoldersButton({
  channelId,
  channelName,
  hasExistingFolders,
  onFoldersGenerated
}: GenerateDriveFoldersButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { showError, showSuccess } = useToast();
  const integrationsStatus = useIntegrationsStatus();
  const { askSectionHelp } = useAIAssistant();

  const handleGenerate = async () => {
    if (hasExistingFolders && !showConfirmDialog) {
      setShowConfirmDialog(true);
      return;
    }

    setIsGenerating(true);
    setShowConfirmDialog(false);

    try {
      const result = await generateDriveFolders(channelId);

      if (result.success && result.rootFolderId && result.archiveFolderId) {
        showSuccess(
          `Папки успешно созданы и подключены!\nОсновная папка: ${result.rootFolderName || "канал"}\nID: ${result.rootFolderId}\nПапка uploaded: ${result.archiveFolderId}`,
          8000
        );

        // Вызываем callback для обновления формы
        if (onFoldersGenerated) {
          onFoldersGenerated(result.rootFolderId, result.archiveFolderId);
        }
      } else {
        throw new Error(result.message || result.error || "Неизвестная ошибка");
      }
    } catch (error: any) {
      console.error("Failed to generate drive folders:", error);
      
      let errorMessage = "Не удалось создать папки Google Drive";
      
      if (error.message) {
        // Проверяем код ошибки или текст сообщения
        const errorCode = error.code || error.message;
        const errorText = error.message.toLowerCase();
        
        if (errorCode === "CHANNEL_NOT_FOUND" || errorText.includes("канал не найден")) {
          errorMessage = "Канал не найден. Обновите страницу и попробуйте снова.";
        } else if (errorCode === "GOOGLE_DRIVE_NOT_CONNECTED" || errorText.includes("google_drive_not_connected")) {
          errorMessage = "Сначала подключите Google Drive в настройках аккаунта";
        } else if (errorCode === "INSUFFICIENT_PERMISSIONS" || errorText.includes("insufficient_permissions")) {
          errorMessage = "Ваш аккаунт Google не выдал необходимые разрешения. Переподключите Google Drive.";
        } else if (errorCode === "SERVICE_ACCOUNT_NOT_CONFIGURED" || errorText.includes("service_account")) {
          errorMessage = "Сервисный аккаунт Google Drive не настроен. Обратитесь к администратору.";
        } else if (errorCode === "FORBIDDEN" || errorText.includes("forbidden")) {
          errorMessage = "Нет доступа к этому каналу";
        } else {
          // Используем сообщение из ошибки, если оно есть
          errorMessage = error.message || errorMessage;
        }
      }

      showError(errorMessage, 6000);
    } finally {
      setIsGenerating(false);
    }
  };

  // Скрываем кнопку, если Google Drive не подключён
  if (!integrationsStatus.status.googleDrive.connected) {
    return null;
  }

  return (
    <div className="mt-4">
      {showConfirmDialog ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-4">
          <div className="mb-3 text-sm font-medium text-amber-300">
            Папки уже указаны
          </div>
          <p className="mb-4 text-xs text-amber-200/80">
            Создать новые папки и перезаписать существующие значения?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
                  Создание...
                </>
              ) : (
                "Да"
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isGenerating}
              className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700/50 disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || integrationsStatus.status.googleDrive.loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 text-sm font-medium text-brand transition hover:bg-brand/20 hover:border-brand/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Создание папок...
              </>
            ) : (
              <>
                <FolderPlus className="h-4 w-4" />
                Создать папки для канала автоматически
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              askSectionHelp({
                sectionKey: "generate_drive_folders",
                page: "channelEdit",
                question: "Что делает эта кнопка и как она работает?",
                sectionContext: {
                  channelName,
                  hasExistingFolders
                }
              });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-slate-800/50 text-slate-400 transition hover:border-brand/40 hover:bg-slate-700/50 hover:text-brand"
            aria-label="Спросить у AI про эту кнопку"
            title="Нажмите, чтобы спросить у AI-ассистента про эту кнопку"
          >
            <span className="text-sm">?</span>
          </button>
        </div>
      )}
    </div>
  );
}

