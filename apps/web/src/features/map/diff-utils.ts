import type { GeoJsonFeature } from '@yourtj/contracts';

export type DiffKind = 'same' | 'added' | 'removed' | 'changed';

export interface PropertyDiff {
  after?: unknown;
  before?: unknown;
  key: string;
  kind: DiffKind;
}

export function findFeatureById(features: GeoJsonFeature[], feature: GeoJsonFeature): GeoJsonFeature | undefined {
  if (feature.id === undefined) return undefined;
  return features.find(({ id }) => String(id) === String(feature.id));
}

export function propertyDiff(before: GeoJsonFeature | undefined, after: GeoJsonFeature): PropertyDiff[] {
  const beforeProperties = before?.properties ?? {};
  const afterProperties = after.properties ?? {};
  const keys = [...new Set([...Object.keys(beforeProperties), ...Object.keys(afterProperties)])].sort();
  return keys.map((key) => {
    const oldValue = beforeProperties[key];
    const newValue = afterProperties[key];
    let kind: DiffKind = 'same';
    if (!(key in beforeProperties)) kind = 'added';
    else if (!(key in afterProperties)) kind = 'removed';
    else if (oldValue !== newValue) kind = 'changed';
    return { key, kind, ...(oldValue === undefined ? {} : { before: oldValue }), ...(newValue === undefined ? {} : { after: newValue }) };
  });
}

export function geometryChanged(before: GeoJsonFeature | undefined, after: GeoJsonFeature): boolean {
  if (!before) return true;
  return JSON.stringify(before.geometry) !== JSON.stringify(after.geometry);
}
