import type { RealtimeMember, ServerMessage } from '@yourtj/contracts';
import { create } from 'zustand';

import { smoothLocation } from '../features/realtime/location-policy';

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'expired' | 'error';

function freshness(updatedAt: number, now: number): RealtimeMember['connectionStatus'] {
  const age = now - updatedAt;
  if (age <= 10_000) return 'live';
  if (age <= 30_000) return 'delayed';
  if (age <= 90_000) return 'stale';
  return 'offline';
}

interface RealtimeState {
  connectionStatus: RealtimeConnectionStatus;
  error: string | null;
  lastSequence: number;
  members: Record<string, RealtimeMember>;
  applyMessage: (message: ServerMessage) => void;
  refreshMembers: (now: number) => void;
  reset: () => void;
  setConnectionStatus: (status: RealtimeConnectionStatus, error?: string | null) => void;
}

const initialState = {
  connectionStatus: 'disconnected' as const,
  error: null,
  lastSequence: 0,
  members: {} as Record<string, RealtimeMember>,
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  ...initialState,
  applyMessage: (message) => set((state) => {
    if (message.sequence <= state.lastSequence) return state;
    const members = { ...state.members };
    switch (message.type) {
      case 'room.snapshot':
        return { ...state, lastSequence: message.sequence, members: Object.fromEntries(message.payload.members.map((member) => [member.userId, member])) };
      case 'member.joined':
        members[message.payload.member.userId] = message.payload.member;
        break;
      case 'member.left':
        delete members[message.payload.userId];
        break;
      case 'member.location': {
        const current = members[message.payload.userId];
        if (!current || (current.location && current.location.seq >= message.payload.location.seq)) break;
        members[message.payload.userId] = {
          ...current,
          connectionStatus: 'live',
          location: smoothLocation(current.location, message.payload.location),
          sharingLocation: true,
          updatedAt: message.payload.receivedAt,
        };
        break;
      }
      case 'member.presence': {
        const current = members[message.payload.userId];
        if (!current) break;
        const next = { ...current, presence: message.payload.presence, sharingLocation: message.payload.sharingLocation, updatedAt: message.payload.updatedAt };
        if (!message.payload.sharingLocation) delete next.location;
        members[message.payload.userId] = next;
        break;
      }
      case 'room.error':
        return { ...state, error: message.payload.message, lastSequence: message.sequence };
      default:
        break;
    }
    return { ...state, lastSequence: message.sequence, members };
  }),
  refreshMembers: (now) => set((state) => ({
    members: Object.fromEntries(Object.values(state.members)
      .map((member) => ({ ...member, connectionStatus: freshness(member.updatedAt, now) }))
      .filter((member) => member.connectionStatus !== 'offline')
      .map((member) => [member.userId, member])),
  })),
  reset: () => set(initialState),
  setConnectionStatus: (connectionStatus, error = null) => set({ connectionStatus, error }),
}));
