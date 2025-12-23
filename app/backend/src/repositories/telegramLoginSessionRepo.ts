export interface TelegramLoginSession {
  id: string;
  userId: string;
  phone: string;
  mtprotoStateId: string;
  phoneCodeHash: string;
  createdAt: Date;
}

const tempSessions = new Map<string, TelegramLoginSession>();

export const telegramLoginSessionRepository = {
  async create(session: TelegramLoginSession) {
    tempSessions.set(session.id, session);
    return session;
  },

  async findByUserIdAndPhone(userId: string, phone: string) {
    return (
      Array.from(tempSessions.values()).find(
        (s) => s.userId === userId && s.phone === phone
      ) ?? null
    );
  },

  async deleteById(id: string) {
    tempSessions.delete(id);
  }
};


