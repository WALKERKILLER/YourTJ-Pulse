import { create } from 'zustand';
import type { PulseQuality } from '../features/pulsetown/quality';

export type ThemeMode = 'light' | 'dark';

interface PreferencesState {
  avatarAnimation: boolean;
  hd2d: boolean;
  particles: boolean;
  pulseQuality: PulseQuality;
  setAvatarAnimation: (enabled: boolean) => void;
  setHd2d: (enabled: boolean) => void;
  setParticles: (enabled: boolean) => void;
  setPulseQuality: (quality: PulseQuality) => void;
  setShadows: (enabled: boolean) => void;
  theme: ThemeMode;
  shadows: boolean;
  weather: boolean;
  setWeather: (enabled: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const preferredTheme: ThemeMode = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';

export const usePreferencesStore = create<PreferencesState>((set) => ({
  avatarAnimation: true,
  hd2d: true,
  particles: true,
  pulseQuality: 'medium',
  setAvatarAnimation: (avatarAnimation) => set({ avatarAnimation }),
  setHd2d: (hd2d) => set({ hd2d }),
  setParticles: (particles) => set({ particles }),
  setPulseQuality: (pulseQuality) => set({ pulseQuality }),
  setShadows: (shadows) => set({ shadows }),
  setWeather: (weather) => set({ weather }),
  shadows: true,
  theme: preferredTheme,
  weather: true,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set(({ theme }) => ({ theme: theme === 'light' ? 'dark' : 'light' })),
}));
