import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { Logger } from "../utils/logger";
import { encrypt } from "../crypto/aes";
import {
  findTelegramIntegrationByUserId,
  createTelegramIntegration,
  updateTelegramIntegration,
  deleteTelegramIntegration
} from "../repositories/telegramUserIntegrationRepo";
import type { TelegramIntegrationStatus } from "../types/telegramUserIntegration";
import { getClientForUser, clearClientCache } from "../integrations/telegram/TelegramUserClient";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!apiId || !apiHash) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
}

// Временное хранилище для клиентов в процессе авторизации
const authClients = new Map<string, { client: TelegramClient; phone: string; createdAt: number }>();

const AUTH_CLIENT_TTL = 10 * 60 * 1000; // 10 минут

/**
 * Очищает временное состояние авторизации для пользователя
 */
async function clearPendingAuthState(userId: string): Promise<void> {
  const integration = await findTelegramIntegrationByUserId(userId);
  if (integration && integration.meta?.stateId) {
    const stateId = integration.meta.stateId as string;
    const authState = authClients.get(stateId);
    if (authState) {
      try {
        await authState.client.disconnect();
        Logger.info("Disconnected auth client during cleanup", { userId, stateId });
      } catch (e) {
        Logger.warn("Error disconnecting auth client during cleanup", e);
      }
      authClients.delete(stateId);
    }
    
    // Очищаем временные метаданные, если статус waiting_code
    if (integration.status === "waiting_code") {
      await updateTelegramIntegration(integration.id, {
        status: "not_connected",
        meta: null,
        lastError: null
      });
      Logger.info("Cleared pending auth state", { userId, integrationId: integration.id });
    }
  }
}

/**
 * Очищает устаревшие клиенты авторизации
 */
function cleanupAuthClients(): void {
  const now = Date.now();
  for (const [stateId, state] of authClients.entries()) {
    if (now - state.createdAt > AUTH_CLIENT_TTL) {
      try {
        void state.client.disconnect();
      } catch (e) {
        Logger.warn("Error disconnecting expired auth client", e);
      }
      authClients.delete(stateId);
    }
  }
}

setInterval(cleanupAuthClients, 60000); // каждую минуту

/**
 * Запрашивает код подтверждения для номера телефона
 */
export async function requestCode(
  userId: string,
  phoneNumber: string
): Promise<{ phoneCodeHash: string }> {
  try {
    // Проверяем, есть ли уже активная интеграция
    const existing = await findTelegramIntegrationByUserId(userId);
    if (existing && existing.status === "active") {
      throw new Error("Telegram already connected");
    }
    
    // Очищаем предыдущее временное состояние, если есть
    await clearPendingAuthState(userId);

    // Создаем временный клиент для авторизации
    const stateId = `${userId}_${Date.now()}`;
    const session = new StringSession("");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false
    });

    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 30000)
      )
    ]);

    // Запрашиваем код через высокоуровневый API
    const result = await client.sendCode(
      {
        apiId,
        apiHash
      },
      phoneNumber
    );

    const phoneCodeHash = result.phoneCodeHash;

    // Сохраняем клиент во временное хранилище
    authClients.set(stateId, {
      client,
      phone: phoneNumber,
      createdAt: Date.now()
    });

    // Создаем или обновляем интеграцию
    if (existing) {
      await updateTelegramIntegration(existing.id, {
        status: "waiting_code",
        lastError: null,
        meta: { phoneCodeHash, stateId }
      });
    } else {
      await createTelegramIntegration(
        userId,
        phoneNumber,
        "waiting_code",
        "",
        { phoneCodeHash, stateId }
      );
    }

    return { phoneCodeHash };
  } catch (error: any) {
    Logger.error("Error requesting telegram code", error);
    
    if (error.message?.includes("FLOOD_WAIT")) {
      throw new Error("FLOOD_WAIT: Too many requests, please wait");
    }
    
    throw error;
  }
}

/**
 * Подтверждает код и завершает авторизацию
 * @param userId - ID пользователя
 * @param code - Код подтверждения
 * @param password - Пароль 2FA (если требуется)
 */
export async function confirmCode(
  userId: string,
  code: string,
  password?: string
): Promise<void> {
  try {
    const integration = await findTelegramIntegrationByUserId(userId);
    
    if (!integration || integration.status !== "waiting_code") {
      throw new Error("No pending authorization found");
    }

    const stateId = integration.meta?.stateId as string | undefined;
    if (!stateId) {
      throw new Error("Authorization state not found");
    }

    const authState = authClients.get(stateId);
    if (!authState) {
      // Проверяем, может быть интеграция уже активна (если код был подтвержден ранее)
      const currentIntegration = await findTelegramIntegrationByUserId(userId);
      if (currentIntegration && currentIntegration.status === "active") {
        Logger.info("confirmCode: Integration already active, skipping confirmation", { userId });
        return; // Уже привязан, ничего не делаем
      }
      
      // Клиент истёк - нужно запросить новый код
      const phoneCodeHash = integration.meta?.phoneCodeHash as string;
      Logger.warn("confirmCode: Authorization client expired", {
        userId,
        stateId,
        integrationStatus: integration.status,
        hasPhoneCodeHash: !!phoneCodeHash
      });
      
      // Очищаем временное состояние
      await updateTelegramIntegration(integration.id, {
        status: "not_connected",
        lastError: "AUTH_CLIENT_EXPIRED",
        meta: null
      });
      
      throw new Error("AUTH_CLIENT_EXPIRED");
    }

    const { client, phone } = authState;
    const phoneCodeHash = integration.meta?.phoneCodeHash as string;

    Logger.info("confirmCode: Starting code confirmation", {
      userId,
      phone: phone.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "+$1***$4"), // Маскируем номер
      phoneCodeHash: phoneCodeHash ? `${phoneCodeHash.substring(0, 8)}...` : "missing",
      codeLength: code.length
    });

    // Подтверждаем код
    let user: Api.TypeUser;
    try {
      Logger.info("confirmCode: Calling Api.auth.SignIn", {
        userId,
        phoneNumber: phone,
        hasPhoneCodeHash: !!phoneCodeHash
      });

      const signInResult = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash: phoneCodeHash,
          phoneCode: code
        })
      );

      Logger.info("confirmCode: Api.auth.SignIn succeeded", {
        userId,
        resultType: signInResult?.constructor?.name || typeof signInResult,
        hasId: !!(signInResult as any)?.id,
        hasFirstName: !!(signInResult as any)?.firstName
      });

      user = signInResult as unknown as Api.TypeUser;
    } catch (error: any) {
      const errorMessage = String(error?.message ?? error?.errorMessage ?? error);
      const errorCode = error?.code;
      const errorClassName = error?.constructor?.name;
      
      Logger.error("confirmCode: Api.auth.SignIn failed", {
        userId,
        errorMessage,
        errorCode,
        errorClassName,
        errorType: typeof error,
        errorKeys: error ? Object.keys(error) : [],
        fullError: error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : "no error object"
      });
      
      // Обработка ошибки 2FA (требуется пароль)
      if (
        errorMessage.includes("SESSION_PASSWORD_NEEDED") ||
        error?.errorMessage?.includes("SESSION_PASSWORD_NEEDED") ||
        errorCode === 401 ||
        error?.className === "SESSION_PASSWORD_NEEDED"
      ) {
        if (!password) {
          await updateTelegramIntegration(integration.id, {
            status: "waiting_code",
            lastError: "PASSWORD_REQUIRED_FOR_2FA",
            meta: {
              ...integration.meta,
              requiresPassword: true
            }
          });
          throw new Error("PASSWORD_REQUIRED_FOR_2FA");
        }

        // Обрабатываем 2FA пароль
        try {
          const pwd = await client.invoke(new Api.account.GetPassword());
          if (!pwd.currentAlgo) {
            throw new Error("PASSWORD_ALGO_NOT_AVAILABLE");
          }

          // Вычисляем хеш пароля
          const { computeCheck } = await import("telegram/Password");
          const passwordHash = await computeCheck(pwd, password);

          // Проверяем пароль
          user = await client.invoke(
            new Api.auth.CheckPassword({
              password: passwordHash
            })
          ) as unknown as Api.TypeUser;
        } catch (pwdError: any) {
          const pwdErrorMessage = String(pwdError?.message ?? pwdError);
          if (pwdErrorMessage.includes("PASSWORD_HASH_INVALID")) {
            await updateTelegramIntegration(integration.id, {
              status: "error",
              lastError: "Invalid password"
            });
            throw new Error("PASSWORD_INVALID");
          }
          throw pwdError;
        }
      } else if (errorMessage.includes("PHONE_CODE_INVALID")) {
        await updateTelegramIntegration(integration.id, {
          status: "error",
          lastError: "Invalid code"
        });
        throw new Error("PHONE_CODE_INVALID");
      } else if (errorMessage.includes("PHONE_CODE_EXPIRED")) {
        await updateTelegramIntegration(integration.id, {
          status: "error",
          lastError: "Code expired"
        });
        throw new Error("PHONE_CODE_EXPIRED");
      } else if (errorMessage.includes("FLOOD_WAIT")) {
        throw new Error("FLOOD_WAIT: Too many attempts, please wait");
      } else {
        throw error;
      }
    }

    // Получаем сессию
    Logger.info("confirmCode: Saving session", { userId });
    
    let sessionString: string;
    try {
      const session = client.session as StringSession;
      if (!session || typeof session.save !== "function") {
        throw new Error("Invalid session object");
      }
      sessionString = session.save() as unknown as string;
      
      if (!sessionString || typeof sessionString !== "string") {
        throw new Error("Failed to save session: invalid result");
      }
      
      Logger.info("confirmCode: Session saved successfully", {
        userId,
        sessionLength: sessionString.length
      });
    } catch (sessionError: any) {
      Logger.error("confirmCode: Failed to save session", {
        userId,
        error: sessionError?.message || String(sessionError),
        sessionType: typeof client.session,
        hasSave: typeof (client.session as any)?.save === "function"
      });
      throw new Error(`Failed to save session: ${sessionError?.message || String(sessionError)}`);
    }
    
    // Шифруем сессию
    Logger.info("confirmCode: Encrypting session", { userId });
    let sessionEncrypted: string;
    try {
      sessionEncrypted = encrypt(sessionString);
      Logger.info("confirmCode: Session encrypted successfully", { userId });
    } catch (encryptError: any) {
      Logger.error("confirmCode: Failed to encrypt session", {
        userId,
        error: encryptError?.message || String(encryptError)
      });
      throw new Error(`Failed to encrypt session: ${encryptError?.message || String(encryptError)}`);
    }

    // Обновляем интеграцию
    Logger.info("confirmCode: Updating integration in database", {
      userId,
      integrationId: integration.id,
      userTelegramId: user.id?.toString(),
      username: (user as any)?.username
    });

    try {
      // Подготавливаем метаданные: очищаем временные поля, сохраняем данные пользователя
      const cleanedMeta: Record<string, any> = {};
      if (user.id) {
        cleanedMeta.userId = user.id.toString();
      }
      if ((user as any)?.username) {
        cleanedMeta.username = (user as any).username;
      }
      
      await updateTelegramIntegration(integration.id, {
        status: "active",
        sessionEncrypted,
        lastError: null,
        meta: Object.keys(cleanedMeta).length > 0 ? cleanedMeta : null
      });
      
      Logger.info("confirmCode: Integration updated successfully", { userId, integrationId: integration.id });
    } catch (updateError: any) {
      Logger.error("confirmCode: Failed to update integration", {
        userId,
        integrationId: integration.id,
        error: updateError?.message || String(updateError),
        errorStack: updateError?.stack
      });
      throw new Error(`Failed to update integration: ${updateError?.message || String(updateError)}`);
    }

    // Очищаем временный клиент
    try {
      await client.disconnect();
      Logger.info("confirmCode: Auth client disconnected", { userId });
    } catch (e) {
      Logger.warn("confirmCode: Error disconnecting auth client (non-critical)", {
        userId,
        error: e instanceof Error ? e.message : String(e)
      });
    }
    authClients.delete(stateId);
    Logger.info("confirmCode: Auth client removed from cache", { userId });

    Logger.info("confirmCode: Telegram integration successfully activated", {
      userId,
      phone: phone.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "+$1***$4"),
      telegramUserId: user.id?.toString(),
      username: (user as any)?.username || "not set"
    });
  } catch (error: any) {
    Logger.error("Error confirming telegram code", error);
    throw error;
  }
}

/**
 * Отключает Telegram интеграцию пользователя
 */
export async function disconnectTelegram(userId: string): Promise<void> {
  try {
    const integration = await findTelegramIntegrationByUserId(userId);
    
    if (!integration) {
      return; // Уже отключено
    }

    // Очищаем кэш клиента
    clearClientCache(userId);

    // Удаляем интеграцию
    await deleteTelegramIntegration(integration.id);

    Logger.info(`Telegram integration disconnected for user ${userId}`);
  } catch (error) {
    Logger.error("Error disconnecting telegram", error);
    throw error;
  }
}

/**
 * Получает статус интеграции пользователя
 */
export async function getIntegrationStatus(
  userId: string
): Promise<{
  status: TelegramIntegrationStatus;
  phoneNumber?: string;
  lastError?: string | null;
}> {
  Logger.info("getIntegrationStatus: Getting status for user", { userId });
  
  const integration = await findTelegramIntegrationByUserId(userId);
  
  if (!integration) {
    Logger.info("getIntegrationStatus: No integration found", { userId });
    return { status: "not_connected" };
  }

  Logger.info("getIntegrationStatus: Integration found", {
    userId,
    integrationId: integration.id,
    status: integration.status,
    phoneNumber: integration.phoneNumber ? integration.phoneNumber.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "+$1***$4") : undefined,
    hasSession: !!integration.sessionEncrypted,
    lastError: integration.lastError
  });

  return {
    status: integration.status,
    phoneNumber: integration.phoneNumber,
    lastError: integration.lastError
  };
}

/**
 * Отправляет сообщение через клиент пользователя
 */
export async function sendMessageAsUser(
  userId: string,
  peer: string | number,
  message: string
): Promise<{ messageId: number; chatId: string }> {
  const client = await getClientForUser(userId);
  
  try {
    const sentMessage = await client.sendMessage(peer, { message });
    const messageId = (sentMessage as any).id;
    const chatId = typeof peer === "string" ? peer : peer.toString();

    if (!messageId || typeof messageId !== "number") {
      throw new Error("Failed to get messageId from sent message");
    }

    return {
      messageId,
      chatId
    };
  } catch (err: any) {
    const message = String(err?.message ?? err);
    
    // Проверяем ошибки сессии
    if (
      message.includes("AUTH_KEY_UNREGISTERED") ||
      message.includes("SESSION_REVOKED") ||
      message.includes("USER_DEACTIVATED") ||
      message.includes("PASSWORD_HASH_INVALID")
    ) {
      // Обновляем статус интеграции
      const integration = await findTelegramIntegrationByUserId(userId);
      if (integration) {
        await updateTelegramIntegration(integration.id, {
          status: "error",
          lastError: "Session expired"
        });
      }
      
      throw new Error("TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN");
    }
    
    throw err;
  }
}

