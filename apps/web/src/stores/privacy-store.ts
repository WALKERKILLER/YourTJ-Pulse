import type { LocationSharingLevel } from '@yourtj/contracts';
import { create } from 'zustand';

interface PrivacyState {
  locationSharingLevel: LocationSharingLevel;
  setLocationSharingLevel: (level: LocationSharingLevel) => void;
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  locationSharingLevel: 'approximate',
  setLocationSharingLevel: (locationSharingLevel) => set({ locationSharingLevel }),
}));
