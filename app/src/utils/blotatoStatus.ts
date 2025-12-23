export interface BlotatoPublishSettings {
  enabled: boolean;
  inputFolderId?: string | null;
  archiveFolderId?: string | null;
  blotatoApiKey?: string | null;
  youtubeId?: string | null;
  tiktokId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  threadsId?: string | null;
  pinterestId?: string | null;
  blueskyId?: string | null;
}

export type BlotatoStatus =
  | { status: 'ok'; message: string }
  | { status: 'needs_setup'; message: string; missing: string[] };

/**
 * Проверяет статус настройки автопубликации через Blotato
 */
export function getBlotatoPublishStatus(settings: BlotatoPublishSettings): BlotatoStatus {
  const { enabled, inputFolderId, archiveFolderId, blotatoApiKey, youtubeId, tiktokId, instagramId, facebookId, threadsId, pinterestId, blueskyId } = settings;

  // Если автопубликация выключена
  if (!enabled) {
    return {
      status: 'needs_setup',
      message: 'Автопубликация выключена. Для запуска заполните API-ключ и ID соцсетей.',
      missing: []
    };
  }

  // Если автопубликация включена, проверяем обязательные поля
  const missing: string[] = [];

  if (!inputFolderId || inputFolderId.trim() === '') {
    missing.push('ID входной папки на сервере');
  }

  if (!archiveFolderId || archiveFolderId.trim() === '') {
    missing.push('ID архивной папки на сервере');
  }

  if (!blotatoApiKey || blotatoApiKey.trim() === '') {
    missing.push('Blotato API key');
  }

  // Проверяем, есть ли хотя бы один ID соцсети
  const hasSocialMediaId = !!(
    youtubeId?.trim() ||
    tiktokId?.trim() ||
    instagramId?.trim() ||
    facebookId?.trim() ||
    threadsId?.trim() ||
    pinterestId?.trim() ||
    blueskyId?.trim()
  );

  if (!hasSocialMediaId) {
    missing.push('ID хотя бы одной соцсети (YouTube/TikTok/Instagram и т.д.)');
  }

  if (missing.length === 0) {
    return {
      status: 'ok',
      message: 'Автопубликация настроена и включена.'
    };
  }

  return {
    status: 'needs_setup',
    message: `Чтобы автопубликация работала, заполните: ${missing.join(', ')}.`,
    missing
  };
}

