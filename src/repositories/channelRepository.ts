import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { db } from "../services/firebase";
import type { Channel, ChannelCreatePayload, ChannelAutoSendSchedule } from "../domain/channel";
import { channelConverter } from "../domain/channel";

/**
 * Создаёт 4 расписания по умолчанию для нового канала
 */
function createDefaultSchedules(): ChannelAutoSendSchedule[] {
  return [
    {
      id: crypto.randomUUID(),
      enabled: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
      time: "12:00",
      promptsPerRun: 1
    },
    {
      id: crypto.randomUUID(),
      enabled: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
      time: "15:00",
      promptsPerRun: 1
    },
    {
      id: crypto.randomUUID(),
      enabled: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
      time: "18:00",
      promptsPerRun: 1
    },
    {
      id: crypto.randomUUID(),
      enabled: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Все дни недели
      time: "21:00",
      promptsPerRun: 1
    }
  ];
}

const channelCollection = (uid: string) =>
  collection(db, "users", uid, "channels").withConverter(channelConverter);

export interface ChannelRepository {
  getChannels: (uid: string) => Promise<Channel[]>;
  createChannel: (uid: string, data: ChannelCreatePayload) => Promise<Channel>;
  updateChannel: (uid: string, channel: Channel) => Promise<void>;
  deleteChannel: (uid: string, channelId: string) => Promise<void>;
  reorderChannels: (uid: string, orderedIds: string[]) => Promise<void>;
}

export const channelRepository: ChannelRepository = {
  async getChannels(uid) {
    // Получаем все каналы без сортировки на уровне запроса
    // (так как orderIndex может отсутствовать у старых каналов)
    const snapshot = await getDocs(channelCollection(uid));
    const channels = snapshot.docs.map((docSnap) => docSnap.data());
    
    // Сортируем на клиенте: сначала по orderIndex, затем по createdAt
    return channels.sort((a, b) => {
      const aOrder = a.orderIndex ?? a.createdAt?.toMillis() ?? 0;
      const bOrder = b.orderIndex ?? b.createdAt?.toMillis() ?? 0;
      return aOrder - bOrder;
    });
  },

  async createChannel(uid, data) {
    const col = channelCollection(uid);
    
    // Если orderIndex не указан, устанавливаем его в максимальное значение + 1
    // чтобы новый канал появлялся в конце списка
    let orderIndex = data.orderIndex;
    if (orderIndex === undefined) {
      const existingChannels = await this.getChannels(uid);
      const maxOrderIndex = existingChannels.reduce(
        (max, ch) => Math.max(max, ch.orderIndex ?? 0),
        -1
      );
      orderIndex = maxOrderIndex + 1;
    }
    
    // Создаём временный Channel объект для использования конвертера
    // Конвертер правильно обработает undefined значения
    const tempChannel: Channel = {
      id: "", // Временный id, будет заменён Firestore
      name: data.name,
      platform: data.platform,
      language: data.language,
      targetDurationSec: data.targetDurationSec,
      niche: data.niche,
      audience: data.audience,
      tone: data.tone,
      blockedTopics: data.blockedTopics,
      generationMode: data.generationMode || "script",
      generationTransport: data.generationTransport || "telegram_global",
      telegramAutoSendEnabled: data.telegramAutoSendEnabled ?? false,
      telegramAutoScheduleEnabled: data.telegramAutoScheduleEnabled ?? false,
      // Для новых каналов: autoSendEnabled по умолчанию true, если не указано явно
      autoSendEnabled: data.autoSendEnabled !== undefined ? data.autoSendEnabled : true,
      // Создаём 4 расписания по умолчанию, если расписаний нет
      autoSendSchedules: data.autoSendSchedules && data.autoSendSchedules.length > 0 
        ? data.autoSendSchedules 
        : createDefaultSchedules(),
      // Для новых каналов: autoDownloadToDriveEnabled по умолчанию true, если не указано явно
      autoDownloadToDriveEnabled: data.autoDownloadToDriveEnabled !== undefined ? data.autoDownloadToDriveEnabled : true,
      autoDownloadDelayMinutes: data.autoDownloadDelayMinutes ?? 10,
      uploadNotificationEnabled: data.uploadNotificationEnabled ?? false,
      uploadNotificationChatId: data.uploadNotificationChatId ?? null,
      // Для новых каналов: Blotato-публикация включена по умолчанию, если не указано явно
      blotataEnabled: data.blotataEnabled !== undefined ? data.blotataEnabled : true,
      driveInputFolderId: data.driveInputFolderId,
      driveArchiveFolderId: data.driveArchiveFolderId,
      blotataApiKey: data.blotataApiKey,
      orderIndex,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      // Опциональные поля
      extraNotes: data.extraNotes,
      youtubeUrl: data.youtubeUrl,
      tiktokUrl: data.tiktokUrl,
      instagramUrl: data.instagramUrl,
      googleDriveFolderId: data.googleDriveFolderId,
      // Для новых каналов: timezone по умолчанию "Asia/Almaty", если не указано явно
      timezone: data.timezone || "Asia/Almaty"
    };
    
    // addDoc с конвертером автоматически вызовет toFirestore(), который отфильтрует undefined
    const docRef = await addDoc(col, tempChannel);
    const createdSnap = await getDoc(docRef.withConverter(channelConverter));
    if (!createdSnap.exists()) {
      throw new Error("Не удалось создать канал");
    }
    return createdSnap.data();
  },

  async updateChannel(uid, channel) {
    const docRef = doc(db, "users", uid, "channels", channel.id);
    
    // Проверяем существование документа перед обновлением
    const docSnap = await getDoc(docRef);
    
    // DEBUG: Логируем, что сохраняется (только в development)
    if (import.meta.env.DEV) {
      console.log("DEBUG updateChannel payload", {
        id: channel.id,
        exists: docSnap.exists(),
        autoSendEnabled: channel.autoSendEnabled,
        timezone: channel.timezone,
        autoSendSchedules: channel.autoSendSchedules,
        autoSendSchedulesCount: channel.autoSendSchedules?.length || 0,
        fullChannel: channel
      });
    }
    
    // Используем channelConverter.toFirestore() для правильной обработки undefined значений
    const firestoreData = channelConverter.toFirestore(channel);
    
    if (docSnap.exists()) {
      // Документ существует - обновляем его
      // Удаляем createdAt из обновления, так как это поле не должно изменяться
      const { createdAt, ...updateData } = firestoreData;
      await updateDoc(docRef, updateData);
    } else {
      // Документ не существует - создаём новый с помощью setDoc
      // Убеждаемся, что createdAt установлен для нового документа
      if (!firestoreData.createdAt) {
        firestoreData.createdAt = serverTimestamp() as any;
      }
      // Используем setDoc без merge для создания нового документа со всеми полями
      await setDoc(docRef, firestoreData);
      
      if (import.meta.env.DEV) {
        console.log("DEBUG updateChannel: создан новый документ", {
          path: docRef.path,
          channelId: channel.id,
          hasCreatedAt: !!firestoreData.createdAt,
          hasUpdatedAt: !!firestoreData.updatedAt
        });
      }
    }
  },

  async deleteChannel(uid, channelId) {
    const docRef = doc(db, "users", uid, "channels", channelId);
    await deleteDoc(docRef);
  },

  async reorderChannels(uid, orderedIds) {
    // Обновляем orderIndex для каждого канала по порядку в массиве
    // Проверяем существование документов перед обновлением
    const updatePromises = orderedIds.map(async (channelId, index) => {
      const docRef = doc(db, "users", uid, "channels", channelId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return updateDoc(docRef, { orderIndex: index });
      } else {
        // Если документ не существует, пропускаем его
        // Это может произойти, если канал был удалён, но остался в списке
        if (import.meta.env.DEV) {
          console.warn("reorderChannels: документ не существует, пропускаем", {
            channelId,
            path: docRef.path
          });
        }
        return Promise.resolve();
      }
    });
    await Promise.all(updatePromises);
  }
};

