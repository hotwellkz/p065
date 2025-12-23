import { useState, useRef } from "react";
import { X, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useChannelStore } from "../stores/channelStore";
import { getAuthToken } from "../utils/auth";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

interface ChannelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors?: Array<{ channelName: string; error: string }>;
}

const ChannelImportModal = ({ isOpen, onClose }: ChannelImportModalProps) => {
  const { user } = useAuthStore((state) => ({ user: state.user }));
  const { fetchChannels } = useChannelStore((state) => ({
    fetchChannels: state.fetchChannels
  }));

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/json" && !selectedFile.name.endsWith(".json")) {
        setError("Пожалуйста, выберите JSON-файл");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file || !user?.uid) {
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      // Читаем содержимое файла
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);

      // Получаем токен авторизации
      const token = await getAuthToken();

      // Проверяем размер файла перед отправкой (10MB лимит)
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 10) {
        throw new Error(`Файл слишком большой (${fileSizeMB.toFixed(2)} MB). Максимальный размер: 10 MB`);
      }

      // Отправляем на сервер
      const response = await fetch(`${backendBaseUrl}/api/channels/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(importData)
      });

      // Проверяем тип ответа перед парсингом JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        // Сервер вернул не JSON (вероятно HTML страницу с ошибкой)
        if (response.status === 413) {
          throw new Error("Файл слишком большой. Максимальный размер: 10 MB");
        }
        const text = await response.text();
        throw new Error(`Сервер вернул ошибку (${response.status}). Проверьте размер файла и формат данных.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Ошибка при импорте каналов (${response.status})`);
      }

      setResult(data);

      // Обновляем список каналов
      if (data.success && data.imported > 0) {
        await fetchChannels(user.uid);
      }
    } catch (err: any) {
      console.error("Import error:", err);
      
      // Улучшенная обработка различных типов ошибок
      let errorMessage = "Не удалось импортировать каналы. Проверьте формат файла.";
      
      if (err instanceof SyntaxError && err.message.includes("Unexpected token")) {
        errorMessage = "Сервер вернул некорректный ответ. Возможно, файл слишком большой или сервер недоступен.";
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
        errorMessage = "Не удалось подключиться к серверу. Проверьте, запущен ли backend.";
      }
      
      setError(errorMessage);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        {/* Кнопка закрытия */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {/* Заголовок */}
        <h2 className="mb-2 text-xl font-bold text-white">Импорт каналов</h2>
        <p className="mb-6 text-sm text-slate-400">
          Выберите JSON-файл, экспортированный из Shorts AI Studio. Каналы будут добавлены в ваш аккаунт. Существующие каналы не будут изменены.
        </p>

        {/* Выбор файла */}
        {!result && (
          <>
            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-slate-300">
                Файл для импорта
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileSelect}
                className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-2 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-brand/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand file:hover:bg-brand/30 file:cursor-pointer cursor-pointer transition-colors"
                disabled={importing}
              />
              {file && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-slate-400">
                    Выбран файл: <span className="font-medium text-slate-300">{file.name}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Размер: {(file.size / (1024 * 1024)).toFixed(2)} MB
                    {file.size > 10 * 1024 * 1024 && (
                      <span className="ml-2 text-red-400">(превышает лимит 10 MB)</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Кнопки */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-white/10 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-white/20 hover:bg-slate-800/80 hover:text-white"
                disabled={importing}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!file || importing}
                className="flex-1 rounded-xl bg-gradient-to-r from-brand to-brand/80 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition-all hover:from-brand/90 hover:to-brand/70 hover:shadow-xl hover:shadow-brand/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="inline mr-2 animate-spin" />
                    Импорт...
                  </>
                ) : (
                  <>
                    <Upload size={16} className="inline mr-2" />
                    Импортировать
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* Результат импорта */}
        {result && (
          <div className="space-y-4">
            {result.success ? (
              <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-green-400" />
                <div className="flex-1">
                  <p className="mb-1 font-semibold text-green-400">
                    Импорт завершён успешно
                  </p>
                  <p className="text-sm text-slate-300">
                    Импортировано каналов: <span className="font-semibold text-green-400">{result.imported}</span>
                    {result.skipped > 0 && (
                      <> · Пропущено: {result.skipped}</>
                    )}
                  </p>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                      <p className="mb-2 text-xs font-medium text-yellow-400">
                        Ошибки при импорте ({result.errors.length}):
                      </p>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {result.errors.map((err, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-yellow-400">•</span>
                            <span>
                              <span className="font-medium">{err.channelName}</span>: {err.error}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="mb-1 font-semibold text-red-400">
                    Ошибка при импорте
                  </p>
                  <p className="text-sm text-slate-300">
                    Не удалось импортировать каналы. Проверьте формат файла и попробуйте снова.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-xl bg-gradient-to-r from-brand to-brand/80 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition-all hover:from-brand/90 hover:to-brand/70 hover:shadow-xl hover:shadow-brand/40"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelImportModal;

