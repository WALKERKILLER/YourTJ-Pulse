import { useCallback, useEffect, useRef } from 'react';

import { useRealtimeStore } from '../../stores/realtime-store';
import { shouldSendLocation, type SentLocation } from './location-policy';
import { RoomRealtimeClient } from './realtime-client';
import { useDeviceLocation } from './use-device-location';

export function useRoomRealtime(roomId: string | undefined) {
  const device = useDeviceLocation();
  const clientRef = useRef<RoomRealtimeClient | null>(null);
  const accessTokenRef = useRef('');
  const sequenceRef = useRef(0);
  const lastSentRef = useRef<SentLocation | null>(null);
  const applyMessage = useRealtimeStore((state) => state.applyMessage);
  const reset = useRealtimeStore((state) => state.reset);
  const setConnectionStatus = useRealtimeStore((state) => state.setConnectionStatus);
  const refreshMembers = useRealtimeStore((state) => state.refreshMembers);
  const connectionStatus = useRealtimeStore((state) => state.connectionStatus);
  const members = useRealtimeStore((state) => state.members);
  const error = useRealtimeStore((state) => state.error);

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
    accessTokenRef.current = token.trim();
    clientRef.current?.reconnect();
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'expired') return;
    device.stop();
    lastSentRef.current = null;
  }, [connectionStatus, device.stop]);

  return {
    connectionStatus,
    configureAccessToken,
    device,
    error,
    members: Object.values(members),
    pauseSharing,
    startSharing,
    stopSharing,
  };
}
