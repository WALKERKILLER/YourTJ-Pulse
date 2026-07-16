import type { CampusRoute, NavigationCoordinate, RouteProfile } from '@yourtj/campus-navigation';
import { create } from 'zustand';

export interface NavigationEndpoint extends NavigationCoordinate {
  name: string;
  placeId?: string;
}

export type NavigationStatus = 'arrived' | 'error' | 'following' | 'idle' | 'preview' | 'routing';

interface NavigationState {
  activeRouteIndex: number;
  currentPosition: (NavigationCoordinate & { accuracy: number }) | null;
  destination: NavigationEndpoint | null;
  message: string | null;
  origin: NavigationEndpoint | null;
  profile: RouteProfile;
  routes: CampusRoute[];
  selectingDestination: boolean;
  status: NavigationStatus;
  clearNavigation: () => void;
  setActiveRouteIndex: (index: number) => void;
  setCurrentPosition: (position: NavigationState['currentPosition']) => void;
  setDestination: (destination: NavigationEndpoint | null) => void;
  setMessage: (message: string | null) => void;
  setOrigin: (origin: NavigationEndpoint | null) => void;
  setProfile: (profile: RouteProfile) => void;
  setRoutes: (routes: CampusRoute[]) => void;
  setSelectingDestination: (selecting: boolean) => void;
  setStatus: (status: NavigationStatus) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeRouteIndex: 0,
  currentPosition: null,
  destination: null,
  message: null,
  origin: null,
  profile: 'walking',
  routes: [],
  selectingDestination: false,
  status: 'idle',
  clearNavigation: () => set({ activeRouteIndex: 0, destination: null, message: null, origin: null, routes: [], selectingDestination: false, status: 'idle' }),
  setActiveRouteIndex: (activeRouteIndex) => set({ activeRouteIndex, message: null, status: 'preview' }),
  setCurrentPosition: (currentPosition) => set({ currentPosition }),
  setDestination: (destination) => set({ destination, routes: [], activeRouteIndex: 0, message: null, origin: null, status: 'idle' }),
  setMessage: (message) => set({ message }),
  setOrigin: (origin) => set({ origin }),
  setProfile: (profile) => set({ profile, routes: [], activeRouteIndex: 0, message: null, status: 'idle' }),
  setRoutes: (routes) => set({ routes, activeRouteIndex: 0, status: routes.length ? 'preview' : 'error' }),
  setSelectingDestination: (selectingDestination) => set({ selectingDestination }),
  setStatus: (status) => set({ status }),
}));
