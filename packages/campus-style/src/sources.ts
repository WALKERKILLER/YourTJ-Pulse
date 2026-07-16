import type { SourceSpecification } from 'maplibre-gl';

export const CAMPUS_SOURCE_ID = 'tongji';

export const campusSources: Record<string, SourceSpecification> = {
  [CAMPUS_SOURCE_ID]: {
    type: 'vector',
    url: 'pmtiles:///tiles/tongji.pmtiles',
    attribution: '© OpenStreetMap contributors',
  },
};
