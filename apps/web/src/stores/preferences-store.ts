import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface PreferencesState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const preferredTheme: ThemeMode = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: preferredTheme,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set(({ theme }) => ({ theme: theme === 'light' ? 'dark' : 'light' })),
}));
