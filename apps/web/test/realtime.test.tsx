import { act, renderHook } from '@testing-library/react';
import type { ServerMessage } from '@yourtj/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { locationIntervalMs, shouldSendLocation, smoothLocation } from '../src/features/realtime/location-policy';
import { REALTIME_PROTOCOL, RoomRealtimeClient } from '../src/features/realtime/realtime-client';
import { useDeviceLocation } from '../src/features/realtime/use-device-location';
import { useRealtimeStore } from '../src/stores/realtime-store';

class TestWebSocket {
  readyState: number = WebSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(message: string): void { this.sent.push(message); }
  close(code = 1000): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
  open(): void {
    this.readyState = WebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  message(message: ServerMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

function serverMessage(message: Omit<ServerMessage, 'eventId' | 'sentAt'>): ServerMessage {
  return { ...message, eventId: crypto.randomUUID(), sentAt: Date.now() } as ServerMessage;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useRealtimeStore.getState().reset();
});

describe('adaptive realtime location policy', () => {
  const base = { longitude: 121.5, latitude: 31.28, accuracy: 12, speed: 1, timestamp: 1 };

  it('uses movement-aware intervals and rejects poor or insignificant updates', () => {
    expect(locationIntervalMs(4, false)).toBe(2_500);
    expect(locationIntervalMs(1, false)).toBe(4_000);
    expect(locationIntervalMs(0, false)).toBe(15_000);
    expect(locationIntervalMs(4, true)).toBe(30_000);
    expect(shouldSendLocation(null, base, 1_000, false)).toBe(true);
    expect(shouldSendLocation({ location: base, sentAt: 0 }, { ...base, accuracy: 150 }, 10_000, false)).toBe(false);
    expect(shouldSendLocation({ location: base, sentAt: 0 }, { ...base, longitude: 121.500001 }, 5_000, false)).toBe(false);
    expect(shouldSendLocation({ location: base, sentAt: 0 }, { ...base, speed: 0 }, 15_000, false)).toBe(true);
  });

  it('interpolates member positions instead of jumping directly', () => {
    const previous = { seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 10, kind: 'gps' as const };
    const next = { seq: 2, longitude: 121.51, latitude: 31.29, accuracy: 9, kind: 'gps' as const };
    const smoothed = smoothLocation(previous, next);
    expect(smoothed.longitude).toBeGreaterThan(previous.longitude);
    expect(smoothed.longitude).toBeLessThan(next.longitude);
    expect(smoothed.seq).toBe(2);
  });
});

describe('useDeviceLocation', () => {
  it('exposes requesting, active, paused, stopped, and permission states', () => {
    let success: PositionCallback | undefined;
    let failure: PositionErrorCallback | undefined;
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn((nextSuccess: PositionCallback, nextFailure: PositionErrorCallback) => {
          success = nextSuccess;
          failure = nextFailure;
          return 7;
        }),
        clearWatch,
      },
    });
    const { result } = renderHook(() => useDeviceLocation());
    act(() => result.current.start());
    expect(result.current.status).toBe('requesting');
    act(() => success?.({
      coords: { longitude: 121.5, latitude: 31.28, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: 100,
    } as GeolocationPosition));
    expect(result.current.status).toBe('active');
    expect(result.current.location?.accuracy).toBe(8);
    act(() => result.current.pause());
    expect(result.current.paused).toBe(true);
    expect(clearWatch).toHaveBeenCalledWith(7);
    act(() => result.current.start());
    act(() => failure?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
    expect(result.current.status).toBe('denied');
    act(() => result.current.stop());
    expect(result.current.location).toBeNull();
  });
});

describe('RoomRealtimeClient and member store', () => {
  it('authenticates by subprotocol, waits for snapshot, and replays pending requests', async () => {
    let socket: TestWebSocket | undefined;
    let protocols: string[] = [];
    const messages: ServerMessage[] = [];
    const client = new RoomRealtimeClient({
      baseUrl: 'https://example.test/map',
      roomId: 'room-1',
      tokenProvider: () => 'secret session',
      webSocketFactory: (_url, offered) => {
        protocols = offered;
        socket = new TestWebSocket();
        return socket as unknown as WebSocket;
      },
      onMessage: (message) => messages.push(message),
      onStatus: vi.fn(),
    });
    client.start();
    await vi.waitFor(() => expect(socket).toBeDefined());
    socket!.open();
    const join = JSON.parse(socket!.sent[0]!) as { requestId: string; type: string };
    expect(join.type).toBe('room.join');
    expect(protocols[0]).toBe(REALTIME_PROTOCOL);
    expect(protocols.join(',')).not.toContain('secret session');

    client.sendLocation({ seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 10, kind: 'gps' });
    expect(socket!.sent).toHaveLength(1);
    socket!.message(serverMessage({
      type: 'room.snapshot', sequence: 1, requestId: join.requestId, payload: { roomId: 'room-1', members: [] },
    }));
    expect(socket!.sent.some((encoded) => JSON.parse(encoded).type === 'location.update')).toBe(true);
    client.createPin({
      roomId: 'room-1', type: 'meeting', title: '集合点', longitude: 121.5, latitude: 31.28,
      status: 'active', visibility: 'room',
    });
    client.updatePin('pin-1', { expectedVersion: 1, title: '新集合点' });
    client.deletePin('pin-1', 2);
    expect(socket!.sent.map((encoded) => JSON.parse(encoded).type)).toEqual(expect.arrayContaining(['pin.create', 'pin.update', 'pin.delete']));
    expect(messages).toHaveLength(1);
    client.stop();
  });

  it('applies snapshots, smooths new locations, and discards old sequences', () => {
    const store = useRealtimeStore.getState();
    store.applyMessage(serverMessage({
      type: 'room.snapshot', sequence: 10, payload: { roomId: 'room-1', members: [{
        userId: 'alice', displayName: 'Alice', presence: 'available', sharingLocation: true, locationSharingLevel: 'precise',
        connectionStatus: 'live', joinedAt: 1, updatedAt: 10,
        location: { seq: 1, longitude: 121.5, latitude: 31.28, accuracy: 10, kind: 'gps' },
      }] },
    }));
    store.applyMessage(serverMessage({
      type: 'member.location', sequence: 11,
      payload: { userId: 'alice', receivedAt: 20, location: { seq: 2, longitude: 121.51, latitude: 31.29, accuracy: 9, kind: 'gps' } },
    }));
    const smoothed = useRealtimeStore.getState().members.alice?.location;
    expect(smoothed?.longitude).toBeGreaterThan(121.5);
    expect(smoothed?.longitude).toBeLessThan(121.51);
    store.applyMessage(serverMessage({
      type: 'member.location', sequence: 9,
      payload: { userId: 'alice', receivedAt: 30, location: { seq: 3, longitude: 122, latitude: 32, accuracy: 9, kind: 'gps' } },
    }));
    expect(useRealtimeStore.getState().members.alice?.location?.longitude).toBe(smoothed?.longitude);
  });

  it('merges REST pins with realtime versions and exposes version conflicts', () => {
    const store = useRealtimeStore.getState();
    const pin = {
      id: 'pin-1', roomId: 'room-1', creatorId: 'alice', type: 'meeting' as const, title: '初始集合点',
      description: null, longitude: 121.5, latitude: 31.28, status: 'active' as const,
      visibility: 'room' as const, version: 1, expiresAt: null,
      createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
    };
    store.setPins([pin]);
    store.applyMessage(serverMessage({
      type: 'pin.updated', sequence: 1, requestId: 'update-1',
      payload: { pin: { ...pin, title: '实时新版本', version: 2 } },
    }));
    useRealtimeStore.getState().setPins([pin]);
    expect(useRealtimeStore.getState().pins['pin-1']).toMatchObject({ title: '实时新版本', version: 2 });

    useRealtimeStore.getState().applyMessage(serverMessage({
      type: 'room.error', sequence: 2, requestId: 'update-stale',
      payload: { code: 'PIN_VERSION_CONFLICT', message: 'Pin was updated by another client', retryable: false },
    }));
    expect(useRealtimeStore.getState()).toMatchObject({
      errorCode: 'PIN_VERSION_CONFLICT', errorRequestId: 'update-stale',
    });
    useRealtimeStore.getState().applyMessage(serverMessage({
      type: 'pin.deleted', sequence: 3, requestId: 'delete-1',
      payload: { pinId: 'pin-1', version: 3, deletedAt: '2026-07-17T00:10:00.000Z' },
    }));
    expect(useRealtimeStore.getState().pins['pin-1']).toBeUndefined();
  });

  it('requests refreshed credentials before reconnecting after close code 4001', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const telemetry = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const sockets: TestWebSocket[] = [];
    const offeredProtocols: string[][] = [];
    const tokenProvider = vi.fn((forceRefresh?: boolean) => forceRefresh ? 'fresh-token' : 'expired-token');
    const client = new RoomRealtimeClient({
      baseUrl: 'https://example.test', roomId: 'room-1', tokenProvider,
      webSocketFactory: (_url, protocols) => {
        const socket = new TestWebSocket();
        sockets.push(socket);
        offeredProtocols.push(protocols);
        return socket as unknown as WebSocket;
      },
      onMessage: vi.fn(), onStatus: vi.fn(),
    });
    client.start();
    await Promise.resolve();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    sockets[0]!.close(4001);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(sockets).toHaveLength(2);
    expect(tokenProvider).toHaveBeenLastCalledWith(true);
    expect(offeredProtocols[1]).not.toEqual(offeredProtocols[0]);
    expect(telemetry).not.toHaveBeenCalled();
    sockets[1]!.open();
    expect(telemetry).toHaveBeenCalledWith('/api/telemetry', expect.objectContaining({
      body: JSON.stringify({ event: 'realtime.reconnect', result: 'recovered' }),
    }));
    client.stop();
  });
});
