import { create } from "zustand";
import type { Channel, ChannelCreatePayload } from "../domain/channel";
import { channelRepository } from "../repositories/channelRepository";

interface ChannelState {
  channels: Channel[];
  loading: boolean;
  error: string | null;
  fetchChannels: (uid: string) => Promise<void>;
  createChannel: (uid: string, payload: ChannelCreatePayload) => Promise<Channel>;
  updateChannel: (uid: string, channel: Channel) => Promise<void>;
  deleteChannel: (uid: string, channelId: string) => Promise<void>;
  reorderChannels: (uid: string, orderedIds: string[]) => Promise<void>;
  setChannels: (channels: Channel[]) => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  loading: false,
  error: null,

  setChannels: (channels) => set({ channels }),

  fetchChannels: async (uid) => {
    set({ loading: true, error: null });
    try {
      const result = await channelRepository.getChannels(uid);
      set({ channels: result, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Load error",
        loading: false
      });
    }
  },

  createChannel: async (uid, payload) => {
    const newChannel = await channelRepository.createChannel(uid, payload);
    set({ channels: [newChannel, ...get().channels] });
    return newChannel;
  },

  updateChannel: async (uid, channel) => {
    await channelRepository.updateChannel(uid, channel);
    set({
      channels: get().channels.map((c) =>
        c.id === channel.id ? channel : c
      )
    });
  },

  deleteChannel: async (uid, channelId) => {
    await channelRepository.deleteChannel(uid, channelId);
    set({
      channels: get().channels.filter((channel) => channel.id !== channelId)
    });
  },

  reorderChannels: async (uid, orderedIds) => {
    await channelRepository.reorderChannels(uid, orderedIds);
    // Обновляем локальное состояние: пересортировываем каналы по новому порядку
    const currentChannels = get().channels;
    const channelMap = new Map(currentChannels.map((ch) => [ch.id, ch]));
    const reorderedChannels = orderedIds
      .map((id) => channelMap.get(id))
      .filter((ch): ch is Channel => ch !== undefined);
    // Добавляем каналы, которых нет в orderedIds (на случай, если что-то пошло не так)
    const remainingChannels = currentChannels.filter(
      (ch) => !orderedIds.includes(ch.id)
    );
    set({ channels: [...reorderedChannels, ...remainingChannels] });
  }
}));

