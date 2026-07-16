export type PulseQuality = 'high' | 'medium' | 'low';

export interface PulseCapabilitySnapshot {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  reducedMotion: boolean;
  webgl: boolean;
  webgl2: boolean;
}

export function resolvePulseQuality(capability: PulseCapabilitySnapshot): PulseQuality {
  if (!capability.webgl) return 'low';
  if (capability.reducedMotion) return 'low';
  if (capability.webgl2 && (capability.deviceMemoryGb ?? 8) >= 8 && (capability.hardwareConcurrency ?? 8) >= 8) return 'high';
  return 'medium';
}

export function detectPulseCapability(): PulseCapabilitySnapshot {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { reducedMotion: true, webgl: false, webgl2: false };
  }
  const hasWebGlConstructor = 'WebGLRenderingContext' in window || 'WebGL2RenderingContext' in window;
  let webgl = false;
  let webgl2 = false;
  if (hasWebGlConstructor) {
    try {
      const canvas = document.createElement('canvas');
      webgl2 = Boolean(canvas.getContext('webgl2'));
      webgl = webgl2 || Boolean(canvas.getContext('webgl'));
    } catch {
      webgl = false;
      webgl2 = false;
    }
  }
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    ...(navigatorWithMemory.deviceMemory === undefined ? {} : { deviceMemoryGb: navigatorWithMemory.deviceMemory }),
    hardwareConcurrency: navigator.hardwareConcurrency,
    reducedMotion: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl,
    webgl2,
  };
}
