/**
 * Утилиты для работы с названием канала и channelFolderKey
 */

import * as admin from "firebase-admin";
import { Logger } from "./logger";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { channelNameToSlug } from "./fileUtils";

/**
 * Получает initialName канала из Firestore
 * Если initialName нет, создаёт его из текущего name
 * 
 * @param userId - ID пользователя
 * @param channelId - ID канала
 * @returns initialName (первичное название при создании канала)
 */
export async function getOrCreateChannelInitialName(userId: string, channelId: string): Promise<string> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("getOrCreateChannelInitialName: Firestore not available", { userId, channelId });
    return "channel";
  }

  try {
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      Logger.warn("getOrCreateChannelInitialName: channel not found", { userId, channelId });
      return "channel";
    }

    const channelData = channelSnap.data();
    
    // Проверяем, есть ли initialName
    if (channelData?.initialName && typeof channelData.initialName === "string") {
      Logger.info("getOrCreateChannelInitialName: found initialName in Firestore", {
        userId,
        channelId,
        initialName: channelData.initialName
      });
      return channelData.initialName;
    }

    // initialName нет - получаем текущий name
    const currentName = channelData?.name || "channel";

    // Сохраняем initialName в Firestore
    await channelRef.set(
      {
        initialName: currentName,
        initialNameSetAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    Logger.info("getOrCreateChannelInitialName: created initialName in Firestore", {
      userId,
      channelId,
      initialName: currentName
    });

    return currentName;
  } catch (error) {
    Logger.error("getOrCreateChannelInitialName: error", {
      userId,
      channelId,
      error: error instanceof Error ? error.message : String(error)
    });

    return "channel";
  }
}

/**
 * Формирует channelFolderKey из названия канала и channelId
 * Формат: {channelSlug}__{channelId}
 * 
 * @param channelName - Название канала (initialName)
 * @param channelId - ID канала
 * @returns channelFolderKey для использования в путях
 * 
 * @example
 * buildChannelFolderKey('PostroimDom.kz', 'abc123') -> 'postroimdom-kz__abc123'
 * buildChannelFolderKey('Surprise Unbox Planet', 'xyz789') -> 'surprise-unbox-planet__xyz789'
 */
export function buildChannelFolderKey(channelName: string, channelId: string): string {
  const channelSlug = channelNameToSlug(channelName);
  return `${channelSlug}__${channelId}`;
}

/**
 * Получает channelFolderKey для канала
 * Автоматически получает initialName и формирует ключ
 * 
 * @param userId - ID пользователя
 * @param channelId - ID канала
 * @returns channelFolderKey
 */
export async function getChannelFolderKey(userId: string, channelId: string): Promise<string> {
  const initialName = await getOrCreateChannelInitialName(userId, channelId);
  const folderKey = buildChannelFolderKey(initialName, channelId);

  Logger.info("getChannelFolderKey: computed", {
    userId,
    channelId,
    initialName,
    folderKey
  });

  return folderKey;
}



