import { useCallback, useEffect, useRef, useState } from 'react';

export type DeviceLocationStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

export interface DeviceLocation {
  longitude: number;
  latitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

function fromPosition(position: GeolocationPosition): DeviceLocation {
  const { coords } = position;
  return {
    longitude: coords.longitude,
    latitude: coords.latitude,
    accuracy: coords.accuracy,
    ...(coords.altitude === null ? {} : { altitude: coords.altitude }),
    ...(coords.heading === null ? {} : { heading: coords.heading }),
    ...(coords.speed === null ? {} : { speed: coords.speed }),
    timestamp: position.timestamp,
  };
}

function errorState(error: GeolocationPositionError): { message: string; status: DeviceLocationStatus } {
  if (error.code === error.PERMISSION_DENIED) return { status: 'denied', message: '定位权限已拒绝，请在浏览器设置中允许后重试。' };
  if (error.code === error.POSITION_UNAVAILABLE) return { status: 'unavailable', message: '设备暂时无法提供位置。' };
  return { status: 'error', message: '定位请求超时或发生错误，请稍后重试。' };
}

export function useDeviceLocation() {
  const watchId = useRef<number | null>(null);
  const [status, setStatus] = useState<DeviceLocationStatus>('idle');
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const clearWatch = useCallback(() => {
    if (watchId.current === null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    clearWatch();
    setError(null);
    setPaused(false);
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setError('当前浏览器不支持定位。');
      return;
    }
    setStatus('requesting');
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(fromPosition(position));
        setStatus('active');
        setError(null);
      },
      (positionError) => {
        const next = errorState(positionError);
        setStatus(next.status);
        setError(next.message);
        clearWatch();
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    );
  }, [clearWatch]);

  const pause = useCallback(() => {
    clearWatch();
    setPaused(true);
    setStatus('idle');
  }, [clearWatch]);

  const stop = useCallback(() => {
    clearWatch();
    setPaused(false);
    setStatus('idle');
    setLocation(null);
    setError(null);
  }, [clearWatch]);

  useEffect(() => clearWatch, [clearWatch]);

  return { error, location, pause, paused, start, status, stop };
}
