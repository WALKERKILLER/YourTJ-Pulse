import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

export const POI_LAYER_ID = 'campus-pois';

export function createPoiLayers(theme: CampusTheme): LayerSpecification[] {
  return [{
    id: POI_LAYER_ID,
    type: 'circle',
    source: CAMPUS_SOURCE_ID,
    'source-layer': 'pois',
    minzoom: 14,
    paint: {
      'circle-color': theme.poi,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 18, 6],
      'circle-stroke-color': theme.labelHalo,
      'circle-stroke-width': 1.5,
    },
  }];
}
