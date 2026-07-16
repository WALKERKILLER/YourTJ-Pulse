import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

function labelLayer(id: string, sourceLayer: string, minzoom: number, theme: CampusTheme): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: CAMPUS_SOURCE_ID,
    'source-layer': sourceLayer,
    minzoom,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], minzoom, 10, 18, 14],
      'text-max-width': 12,
    },
    paint: {
      'text-color': theme.label,
      'text-halo-color': theme.labelHalo,
      'text-halo-width': 1.5,
    },
  };
}

export function createLabelLayers(theme: CampusTheme): LayerSpecification[] {
  return [
    labelLayer('campus-building-labels', 'buildings', 15, theme),
    labelLayer('campus-poi-labels', 'pois', 16, theme),
    labelLayer('campus-road-labels', 'roads', 16, theme),
  ];
}
