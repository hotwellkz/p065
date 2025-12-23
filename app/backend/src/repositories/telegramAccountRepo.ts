export interface TelegramAccount {
  id: string;
  userId: string;
  phone: string;
  sessionEncrypted: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TelegramAccountRepository {
  findActiveByUserId(userId: string): Promise<TelegramAccount | null>;
  upsertForUser(
    userId: string,
    phone: string,
    sessionEncrypted: string
  ): Promise<TelegramAccount>;
  deactivateForUser(userId: string): Promise<void>;
}

const memoryStore = new Map<string, TelegramAccount>();

export const telegramAccountRepository: TelegramAccountRepository = {
  async findActiveByUserId(userId) {
    const acc = Array.from(memoryStore.values()).find(
      (a) => a.userId === userId && a.isActive
    );
    return acc ?? null;
  },

  async upsertForUser(userId, phone, sessionEncrypted) {
    const now = new Date();
    let acc =
      Array.from(memoryStore.values()).find((a) => a.userId === userId) ??
      null;

    if (!acc) {
      acc = {
        id: `${Date.now()}_${Math.random()}`,
        userId,
        phone,
        sessionEncrypted,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };
    } else {
      acc.phone = phone;
      acc.sessionEncrypted = sessionEncrypted;
      acc.isActive = true;
      acc.updatedAt = now;
    }

    memoryStore.set(acc.id, acc);
    return acc;
  },

  async deactivateForUser(userId) {
    const now = new Date();
    for (const acc of memoryStore.values()) {
      if (acc.userId === userId) {
        acc.isActive = false;
        acc.sessionEncrypted = "";
        acc.updatedAt = now;
      }
    }
  }
};







