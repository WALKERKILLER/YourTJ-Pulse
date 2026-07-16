import type { CreatePinInput, RealtimePin, UpdatePinInput } from '@yourtj/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest } from '../../lib/api';
import { useRealtimeStore } from '../../stores/realtime-store';
import { shouldSendLocation, type SentLocation } from './location-policy';
import { RoomRealtimeClient } from './realtime-client';
import { useDeviceLocation } from './use-device-location';

export function useRoomRealtime(roomId: string | undefined) {
  const device = useDeviceLocation();
  const clientRef = useRef<RoomRealtimeClient | null>(null);
  const accessTokenRef = useRef('');
  const activeRoomRef = useRef(roomId);
  activeRoomRef.current = roomId;
  const [accessToken, setAccessToken] = useState('');
  const [pinLoadError, setPinLoadError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const lastSentRef = useRef<SentLocation | null>(null);
  const applyMessage = useRealtimeStore((state) => state.applyMessage);
  const reset = useRealtimeStore((state) => state.reset);
  const setConnectionStatus = useRealtimeStore((state) => state.setConnectionStatus);
  const refreshMembers = useRealtimeStore((state) => state.refreshMembers);
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const members = useRealtimeStore((state) => state.members);
  const error = useRealtimeStore((state) => state.error);
  const errorCode = useRealtimeStore((state) => state.errorCode);
  const errorRequestId = useRealtimeStore((state) => state.errorRequestId);
  const pins = useRealtimeStore((state) => state.pins);
  const setPins = useRealtimeStore((state) => state.setPins);

  const refreshPins = useCallback(async () => {
    if (!roomId) return;
    try {
      const records = await apiRequest<RealtimePin[]>(
        `/api/pins?roomId=${encodeURIComponent(roomId)}`,
        accessToken || undefined,
      );
      if (activeRoomRef.current !== roomId) return;
      setPins(records);
      setPinLoadError(null);
    } catch (requestError) {
      if (activeRoomRef.current !== roomId) return;
      setPinLoadError(requestError instanceof Error ? requestError.message : '无法加载协作 Pin');
    }
  }, [accessToken, roomId, setPins]);

  useEffect(() => {
    reset();
    if (!roomId) return;
    const client = new RoomRealtimeClient({
      roomId,
      tokenProvider: () => accessTokenRef.current || undefined,
      onMessage: applyMessage,
      onStatus: (status, message) => setConnectionStatus(status, message ?? null),
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
      device.stop();
    };
  }, [applyMessage, device.stop, reset, roomId, setConnectionStatus]);

  useEffect(() => {
    void refreshPins();
  }, [refreshPins]);

  useEffect(() => {
    if (!roomId) return;
    const timer = window.setInterval(() => refreshMembers(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [refreshMembers, roomId]);

  useEffect(() => {
    if (device.status !== 'active' || !device.location || device.paused) return;
    const timestamp = Date.now();
    if (!shouldSendLocation(lastSentRef.current, device.location, timestamp, document.visibilityState === 'hidden')) return;
    sequenceRef.current += 1;
    clientRef.current?.sendLocation({
      seq: sequenceRef.current,
      longitude: device.location.longitude,
      latitude: device.location.latitude,
      accuracy: device.location.accuracy,
      ...(device.location.altitude === undefined ? {} : { altitude: device.location.altitude }),
      ...(device.location.heading === undefined ? {} : { heading: device.location.heading }),
      ...(device.location.speed === undefined ? {} : { speed: device.location.speed }),
      kind: 'gps',
    });
    lastSentRef.current = { location: device.location, sentAt: timestamp };
  }, [device.location, device.paused, device.status]);

  useEffect(() => {
    const onVisibilityChange = (): void => { clientRef.current?.ping(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const startSharing = useCallback(() => {
    device.start();
    clientRef.current?.updatePresence('available', true);
  }, [device.start]);
  const pauseSharing = useCallback(() => {
    device.pause();
    clientRef.current?.updatePresence('away', false);
  }, [device.pause]);
  const stopSharing = useCallback(() => {
    device.stop();
    lastSentRef.current = null;
    clientRef.current?.updatePresence('available', false);
  }, [device.stop]);
  const configureAccessToken = useCallback((token: string) => {
    const normalized = token.trim();
    accessTokenRef.current = normalized;
    setAccessToken(normalized);
    clientRef.current?.reconnect();
  }, []);
  const createPin = useCallback((pin: CreatePinInput) => clientRef.current?.createPin(pin) ?? null, []);
  const deletePin = useCallback((pinId: string, expectedVersion: number) =>
    clientRef.current?.deletePin(pinId, expectedVersion) ?? null, []);
  const updatePin = useCallback((pinId: string, update: UpdatePinInput) =>
    clientRef.current?.updatePin(pinId, update) ?? null, []);

  useEffect(() => {
    if (connectionStatus !== 'expired') return;
    device.stop();
    lastSentRef.current = null;
  }, [connectionStatus, device.stop]);

  return {
    accessToken,
    connectionStatus,
    configureAccessToken,
    createPin,
    deletePin,
    device,
    error,
    errorCode,
    errorRequestId,
    members: Object.values(members),
    pauseSharing,
    pinLoadError,
    pins: Object.values(pins),
    refreshPins,
    startSharing,
    stopSharing,
    updatePin,
  };
}
