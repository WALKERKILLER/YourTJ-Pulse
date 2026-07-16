import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

export const BUILDING_LAYER_ID = 'campus-buildings-3d';

export function createBuildingLayers(theme: CampusTheme): LayerSpecification[] {
  return [
    {
      id: BUILDING_LAYER_ID,
      type: 'fill-extrusion',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'buildings',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'selected'], false], theme.buildingHighlight, theme.building],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['max', 7, ['*', 3.2, ['to-number', ['get', 'building:levels'], 2]]]],
        'fill-extrusion-base': ['*', 3.2, ['to-number', ['get', 'building:min_level'], 0]],
        'fill-extrusion-opacity': 0.9,
      },
    },
    {
      id: 'campus-buildings-outline',
      type: 'line',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'buildings',
      minzoom: 15,
      paint: { 'line-color': theme.buildingOutline, 'line-width': 0.75 },
    },
  ];
}
