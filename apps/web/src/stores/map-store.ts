import type { MapGeoJSONFeature } from 'maplibre-gl';
import { create } from 'zustand';
import { displayName } from '../lib/utils';

export interface SelectedPlace {
  id: string;
  layerId: string;
  name: string;
  properties: Record<string, unknown>;
  feature: MapGeoJSONFeature;
}

interface MapState {
  detailsOpen: boolean;
  searchOpen: boolean;
  selectedPlace: SelectedPlace | null;
  sheetHeight: number;
  setDetailsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSelectedFeature: (feature: MapGeoJSONFeature | null) => void;
  setSheetHeight: (height: number) => void;
}

function featureId(feature: MapGeoJSONFeature): string {
  const propertyId = feature.properties.id;
  if (typeof propertyId === 'string' && propertyId) return encodeURIComponent(propertyId.replace('/', '-'));
  return String(feature.id ?? `${feature.layer.id}-${feature.properties.name ?? 'place'}`);
}

export const useMapStore = create<MapState>((set) => ({
  detailsOpen: false,
  searchOpen: false,
  selectedPlace: null,
  sheetHeight: 210,
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSelectedFeature: (feature) => set(feature ? {
    detailsOpen: true,
    selectedPlace: {
      id: featureId(feature),
      layerId: feature.layer.id,
      name: displayName(feature.properties),
      properties: feature.properties,
      feature,
    },
  } : { detailsOpen: false, selectedPlace: null }),
  setSheetHeight: (sheetHeight) => set({ sheetHeight }),
}));
