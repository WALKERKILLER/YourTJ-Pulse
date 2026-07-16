import { useEffect, useRef } from 'react';
import { useMap } from '../../components/map/map';
import type { PulseQuality } from './quality';
import type { CampusThreeLayer } from './three/CampusThreeLayer';
import type { AvatarSnapshot } from './three/scene';

interface PulseTownThreeLayerProps {
  avatar: AvatarSnapshot;
  avatarAnimation: boolean;
  onUnavailable: (reason: string) => void;
  particles: boolean;
  quality: PulseQuality;
  shadows: boolean;
  weather: boolean;
}

export function PulseTownThreeLayer(props: PulseTownThreeLayerProps) {
  const map = useMap();
  const layerRef = useRef<CampusThreeLayer | null>(null);
  const avatarRef = useRef(props.avatar);
  avatarRef.current = props.avatar;

  useEffect(() => {
    if (props.quality === 'low') return undefined;
    let cancelled = false;
    const ensureLayer = async () => {
      if (cancelled || !map.isStyleLoaded() || map.getLayer('pulsetown-hd2d')) return;
      try {
        const { CampusThreeLayer } = await import('./three/CampusThreeLayer');
        if (cancelled || map.getLayer('pulsetown-hd2d')) return;
        const layer = new CampusThreeLayer({
          quality: props.quality,
          avatarAnimation: props.avatarAnimation,
          particles: props.particles,
          shadows: props.shadows,
          weather: props.weather,
        }, avatarRef.current, props.onUnavailable);
        layerRef.current = layer;
        map.addLayer(layer);
      } catch (error) {
        props.onUnavailable(error instanceof Error ? error.message : 'Three.js unavailable');
      }
    };
    const onStyleData = () => void ensureLayer();
    map.on('styledata', onStyleData);
    void ensureLayer();
    return () => {
      cancelled = true;
      map.off('styledata', onStyleData);
      if (map.getLayer('pulsetown-hd2d')) map.removeLayer('pulsetown-hd2d');
      layerRef.current = null;
    };
  }, [map, props.avatarAnimation, props.onUnavailable, props.particles, props.quality, props.shadows, props.weather]);

  useEffect(() => layerRef.current?.updateAvatar(props.avatar), [props.avatar]);
  return null;
}
