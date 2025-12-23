import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Logger } from "../utils/logger";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!apiId || !apiHash) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
}

export async function createTelegramClientFromStringSession(
  stringSession: string
): Promise<TelegramClient> {
  const session = new StringSession(stringSession);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    // Используем TCP для большей стабильности
    useWSS: false
  });
  
  // Увеличиваем таймаут подключения до 30 секунд
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000)
      )
    ]);
  } catch (error) {
    Logger.error("Failed to connect Telegram client", error);
    throw error;
  }
  
  return client;
}

type TempClientState = {
  client: TelegramClient;
  phone: string;
  createdAt: number;
};

const tempStates = new Map<string, TempClientState>();

export async function createTempClientState(stateId: string, phone: string) {
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false
  });
  
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000)
      )
    ]);
  } catch (error) {
    Logger.error("Failed to connect temp Telegram client", error);
    throw error;
  }

  tempStates.set(stateId, { client, phone, createdAt: Date.now() });
}

export function getTempClientState(stateId: string): TempClientState | null {
  return tempStates.get(stateId) ?? null;
}

export function deleteTempClientState(stateId: string): void {
  const state = tempStates.get(stateId);
  if (state) {
    try {
      void state.client.disconnect();
    } catch (e) {
      Logger.warn("Error disconnecting temp client", e);
    }
    tempStates.delete(stateId);
  }
}
