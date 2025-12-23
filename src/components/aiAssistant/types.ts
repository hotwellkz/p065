export type FieldHelpKey = 
  | "channel.name"
  | "channel.platform"
  | "channel.language"
  | "channel.targetDurationSec"
  | "channel.niche"
  | "channel.audience"
  | "channel.tone"
  | "channel.blockedTopics"
  | "channel.preferences"
  | "channel.preferences.mode"
  | "channel.generationMode"
  | "channel.generationTransport"
  | "channel.autoSendEnabled"
  | "channel.autoSendSchedules"
  | "channel.blotataEnabled"
  | "channel.driveInputFolderId"
  | "channel.driveArchiveFolderId"
  | string; // Для будущих расширений

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  fieldKey?: string;
}

export interface AskFieldHelpParams {
  fieldKey: FieldHelpKey;
  page: string;
  question?: string;
  channelContext?: any;
  currentValue?: any;
}

export type SectionHelpKey = "telegram_integration" | "google_drive_integration" | "profile" | "generate_drive_folders" | "blottata_api_key_default";

export interface AskSectionHelpParams {
  sectionKey: SectionHelpKey;
  page?: string;
  sectionTitle?: string;
  currentStatus?: string;
  question?: string;
  context?: any;
}

