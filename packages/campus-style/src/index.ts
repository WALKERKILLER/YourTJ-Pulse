import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { BUILDING_LAYER_ID, createBuildingLayers } from './buildings';
import { createLabelLayers } from './labels';
import { createLanduseLayers } from './landuse';
import { createPoiLayers, POI_LAYER_ID } from './pois';
import { createRoadLayers } from './roads';
import { campusSources } from './sources';
import { darkTheme } from './theme-dark';
import { lightTheme } from './theme-light';
import type { CampusTheme } from './types';
import { createWaterLayers } from './water';

export { BUILDING_LAYER_ID, POI_LAYER_ID, campusSources, darkTheme, lightTheme };
export type { CampusTheme } from './types';

export const INTERACTIVE_LAYER_IDS = [BUILDING_LAYER_ID, POI_LAYER_ID] as const;

export function createCampusStyle(mode: 'light' | 'dark' = 'light'): StyleSpecification {
  const theme: CampusTheme = mode === 'dark' ? darkTheme : lightTheme;
  const layers: LayerSpecification[] = [
    { id: 'campus-background', type: 'background', paint: { 'background-color': theme.background } },
    {
      id: 'campus-misc-fill',
      type: 'fill',
      source: 'tongji',
      'source-layer': 'misc',
      paint: { 'fill-color': theme.misc, 'fill-opacity': 0.7 },
    },
    {
      id: 'campus-boundaries',
      type: 'line',
      source: 'tongji',
      'source-layer': 'misc-line',
      paint: { 'line-color': theme.boundary, 'line-width': 1.25, 'line-dasharray': [3, 2] },
    },
    ...createLanduseLayers(theme),
    ...createWaterLayers(theme),
    ...createRoadLayers(theme),
    ...createBuildingLayers(theme),
    ...createPoiLayers(theme),
    {
      id: 'campus-misc-points',
      type: 'circle',
      source: 'tongji',
      'source-layer': 'misc-point',
      minzoom: 16,
      paint: { 'circle-color': theme.boundary, 'circle-radius': 2.5 },
    },
    ...createLabelLayers(theme),
  ];

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: campusSources,
    layers,
  };
}
