import type { GeoJsonFeature } from '@yourtj/contracts';
import { describe, expect, it } from 'vitest';
import { findFeatureById, geometryChanged, propertyDiff } from '../src/features/map/diff-utils';
import { applyEditorFields, fieldsFromFeature } from '../src/features/map/editor-utils';

const original: GeoJsonFeature = {
  type: 'Feature',
  id: 'node/1',
  geometry: { type: 'Point', coordinates: [121.5, 31.28] },
  properties: { name: '旧名称', amenity: 'library', wheelchair: 'no' },
};

describe('editor and review helpers', () => {
  it('maps friendly fields back to a validated feature', () => {
    const fields = fieldsFromFeature(original);
    const updated = applyEditorFields(original, {
      ...fields,
      name: '新名称',
      aliases: '图书馆',
      wheelchair: 'yes',
    });
    expect(updated.properties).toMatchObject({ name: '新名称', alt_name: '图书馆', wheelchair: 'yes' });
    expect(updated.geometry).toEqual(original.geometry);
  });

  it('classifies property and geometry differences', () => {
    const updated = { ...original, properties: { name: '新名称', wheelchair: 'yes', entrance: 'main' } } satisfies GeoJsonFeature;
    expect(propertyDiff(original, updated).map(({ key, kind }) => [key, kind])).toEqual([
      ['amenity', 'removed'],
      ['entrance', 'added'],
      ['name', 'changed'],
      ['wheelchair', 'changed'],
    ]);
    expect(geometryChanged(original, updated)).toBe(false);
  });

  it('matches reviewed features by shared stable ID before source ID', () => {
    const stableOriginal = { ...original, properties: { ...original.properties, stable_id: 'tongji-siping-node-1' } } satisfies GeoJsonFeature;
    const reviewed = { ...stableOriginal, id: 'generated/9' } satisfies GeoJsonFeature;
    expect(findFeatureById([stableOriginal], reviewed)).toBe(stableOriginal);
  });
});
