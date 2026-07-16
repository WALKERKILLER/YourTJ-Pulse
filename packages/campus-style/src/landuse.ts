import type { LayerSpecification } from 'maplibre-gl';
import { CAMPUS_SOURCE_ID } from './sources';
import type { CampusTheme } from './types';

export function createLanduseLayers(theme: CampusTheme): LayerSpecification[] {
  return [{
    id: 'campus-landuse',
    type: 'fill',
    source: CAMPUS_SOURCE_ID,
    'source-layer': 'landuse',
    paint: { 'fill-color': theme.landuse, 'fill-opacity': 0.72 },
  }];
}
