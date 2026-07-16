import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

export function createRoadLayers(theme: CampusTheme): LayerSpecification[] {
  return [
    {
      id: 'campus-roads-minor',
      type: 'line',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'roads',
      filter: ['!', ['in', ['get', 'highway'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]]],
      paint: { 'line-color': theme.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 18, 5] },
    },
    {
      id: 'campus-roads-major',
      type: 'line',
      source: CAMPUS_SOURCE_ID,
      'source-layer': 'roads',
      filter: ['in', ['get', 'highway'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': theme.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 18, 8] },
    },
  ];
}
