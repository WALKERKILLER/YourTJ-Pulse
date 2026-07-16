import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

export function createWaterLayers(theme: CampusTheme): LayerSpecification[] {
  return [
    {
      id: 'campus-water',
      type: 'fill',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'water',
      paint: { 'fill-color': theme.water },
    },
    {
      id: 'campus-waterways',
      type: 'line',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'waterway',
      paint: { 'line-color': theme.waterway, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 18, 3] },
    },
  ];
}
