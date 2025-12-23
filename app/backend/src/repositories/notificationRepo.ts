import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

export type NotificationType = 
  | "video_uploaded" 
  | "video_download_failed" 
  | "video_upload_failed" 
  | "generation_error"
  | "automation_error";

export type NotificationStatus = "success" | "error" | "info";

export interface Notification {
  id: string;
  userId: string;
  channelId: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
  isRead: boolean;
  driveFileUrl?: string;
  telegramMessageUrl?: string;
  metadata?: {
    fileName?: string;
    scheduleId?: string;
    timeSlot?: string;
    errorDetails?: string;
  };
}

export interface NotificationRepository {
  create(notification: Omit<Notification, "id" | "createdAt" | "updatedAt">): Promise<Notification>;
  findByUserId(
    userId: string,
    options?: {
      status?: NotificationStatus;
      isRead?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<Notification[]>;
  markAsRead(notificationId: string, userId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  countUnread(userId: string): Promise<number>;
}

function getNotificationCollectionRef(userId: string) {
  if (!isFirestoreAvailable() || !db) {
    throw new Error("Firestore is not available");
  }
  return db.collection("users").doc(userId).collection("notifications");
}

export const notificationRepository: NotificationRepository = {
  async create(notificationData) {
    if (!isFirestoreAvailable() || !db) {
      Logger.error("notificationRepository.create: Firestore is not available");
      throw new Error("Firestore is not available");
    }

    const now = new Date();
    const notificationRef = getNotificationCollectionRef(notificationData.userId).doc();
    
    const notification: Notification = {
      id: notificationRef.id,
      ...notificationData,
      createdAt: now,
      updatedAt: now
    };

    try {
      await notificationRef.set({
        ...notification,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });

      Logger.info("Notification created", {
        notificationId: notification.id,
        userId: notification.userId,
        channelId: notification.channelId,
        type: notification.type,
        status: notification.status
      });

      return notification;
    } catch (error) {
      Logger.error("Failed to create notification", {
        error: error instanceof Error ? error.message : String(error),
        userId: notificationData.userId,
        channelId: notificationData.channelId
      });
      throw error;
    }
  },

  async findByUserId(userId, options = {}) {
    if (!isFirestoreAvailable() || !db) {
      Logger.error("notificationRepository.findByUserId: Firestore is not available");
      return [];
    }

    try {
      let query: FirebaseFirestore.Query = getNotificationCollectionRef(userId);

      // Фильтры
      if (options.status) {
        query = query.where("status", "==", options.status);
      }
      if (options.isRead !== undefined) {
        query = query.where("isRead", "==", options.isRead);
      }

      // Сортировка по дате создания (новые первыми)
      query = query.orderBy("createdAt", "desc");

      // Пагинация
      if (options.offset) {
        query = query.offset(options.offset);
      }
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();
      
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)
        } as Notification;
      });
    } catch (error) {
      Logger.error("Failed to fetch notifications", {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return [];
    }
  },

  async markAsRead(notificationId, userId) {
    if (!isFirestoreAvailable() || !db) {
      Logger.error("notificationRepository.markAsRead: Firestore is not available");
      throw new Error("Firestore is not available");
    }

    try {
      const notificationRef = getNotificationCollectionRef(userId).doc(notificationId);
      await notificationRef.update({
        isRead: true,
        updatedAt: new Date().toISOString()
      });

      Logger.info("Notification marked as read", {
        notificationId,
        userId
      });
    } catch (error) {
      Logger.error("Failed to mark notification as read", {
        error: error instanceof Error ? error.message : String(error),
        notificationId,
        userId
      });
      throw error;
    }
  },

  async markAllAsRead(userId) {
    if (!isFirestoreAvailable() || !db) {
      Logger.error("notificationRepository.markAllAsRead: Firestore is not available");
      throw new Error("Firestore is not available");
    }

    try {
      const notificationsRef = getNotificationCollectionRef(userId);
      const snapshot = await notificationsRef.where("isRead", "==", false).get();
      
      const batch = db.batch();
      const now = new Date().toISOString();
      
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          isRead: true,
          updatedAt: now
        });
      });

      await batch.commit();

      Logger.info("All notifications marked as read", {
        userId,
        count: snapshot.docs.length
      });
    } catch (error) {
      Logger.error("Failed to mark all notifications as read", {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw error;
    }
  },

  async countUnread(userId) {
    if (!isFirestoreAvailable() || !db) {
      Logger.error("notificationRepository.countUnread: Firestore is not available");
      return 0;
    }

    try {
      const snapshot = await getNotificationCollectionRef(userId)
        .where("isRead", "==", false)
        .get();
      
      return snapshot.size;
    } catch (error) {
      Logger.error("Failed to count unread notifications", {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return 0;
    }
  }
};



