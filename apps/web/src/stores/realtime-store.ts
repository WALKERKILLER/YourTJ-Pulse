import type { RealtimeMember, RealtimePin, ServerMessage } from '@yourtj/contracts';
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
  errorCode: string | null;
  errorRequestId: string | null;
  lastSequence: number;
  members: Record<string, RealtimeMember>;
  pins: Record<string, RealtimePin>;
  applyMessage: (message: ServerMessage) => void;
  refreshMembers: (now: number) => void;
  reset: () => void;
  setPins: (pins: RealtimePin[]) => void;
  setConnectionStatus: (status: RealtimeConnectionStatus, error?: string | null) => void;
}

const initialState = {
  connectionStatus: 'disconnected' as const,
  error: null,
  errorCode: null,
  errorRequestId: null,
  lastSequence: 0,
  members: {} as Record<string, RealtimeMember>,
  pins: {} as Record<string, RealtimePin>,
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  ...initialState,
  applyMessage: (message) => set((state) => {
    if (message.sequence <= state.lastSequence) return state;
    const members = { ...state.members };
    const pins = { ...state.pins };
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
      case 'pin.created':
      case 'pin.updated':
        pins[message.payload.pin.id] = message.payload.pin;
        return {
          ...state,
          error: null,
          errorCode: null,
          errorRequestId: null,
          lastSequence: message.sequence,
          pins,
        };
      case 'pin.deleted':
        delete pins[message.payload.pinId];
        return {
          ...state,
          error: null,
          errorCode: null,
          errorRequestId: null,
          lastSequence: message.sequence,
          pins,
        };
      case 'room.error':
        return {
          ...state,
          error: message.payload.message,
          errorCode: message.payload.code,
          errorRequestId: message.requestId ?? null,
          lastSequence: message.sequence,
        };
      default:
        break;
    }
    return { ...state, lastSequence: message.sequence, members, pins };
  }),
  refreshMembers: (now) => set((state) => ({
    members: Object.fromEntries(Object.values(state.members)
      .map((member) => ({ ...member, connectionStatus: freshness(member.updatedAt, now) }))
      .filter((member) => member.connectionStatus !== 'offline')
      .map((member) => [member.userId, member])),
  })),
  reset: () => set(initialState),
  setPins: (records) => set((state) => {
    const pins = { ...state.pins };
    for (const pin of records) {
      const current = pins[pin.id];
      if (!current || pin.version >= current.version) pins[pin.id] = pin;
    }
    return { pins };
  }),
  setConnectionStatus: (connectionStatus, error = null) => set({ connectionStatus, error }),
}));
