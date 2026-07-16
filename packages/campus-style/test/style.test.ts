import { describe, expect, it } from 'vitest';
import { createCampusStyle, INTERACTIVE_LAYER_IDS } from '../src';

const EXPECTED_SOURCE_LAYERS = [
  'misc',
  'misc-line',
  'misc-point',
  'landuse',
  'water',
  'waterway',
  'roads',
  'buildings',
  'pois',
];

describe('campus style', () => {
  it('covers every PMTiles source layer', () => {
    const style = createCampusStyle();
    const sourceLayers = new Set(style.layers.flatMap((layer) => 'source-layer' in layer ? [layer['source-layer']] : []));
    expect([...sourceLayers].sort()).toEqual([...EXPECTED_SOURCE_LAYERS].sort());
  });

  it('keeps interactive layers available in both themes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const ids = new Set(createCampusStyle(mode).layers.map(({ id }) => id));
      expect(INTERACTIVE_LAYER_IDS.every((id) => ids.has(id))).toBe(true);
    }
  });
});
