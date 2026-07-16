import { featureSchema, type GeoJsonFeature } from '@yourtj/contracts';
import type { MapGeoJSONFeature } from 'maplibre-gl';

export interface EditorFields {
  aliases: string;
  category: string;
  description: string;
  entrance: string;
  image: string;
  name: string;
  openingHours: string;
  wheelchair: string;
}

function text(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  return typeof value === 'string' ? value : '';
}

export function fieldsFromFeature(feature: GeoJsonFeature): EditorFields {
  const properties = feature.properties ?? {};
  return {
    aliases: text(properties, 'alt_name'),
    category: text(properties, 'category') || text(properties, 'amenity') || text(properties, 'building'),
    description: text(properties, 'description'),
    entrance: text(properties, 'entrance'),
    image: text(properties, 'image'),
    name: text(properties, 'name'),
    openingHours: text(properties, 'opening_hours'),
    wheelchair: text(properties, 'wheelchair'),
  };
}

export function editableFeature(feature: MapGeoJSONFeature): GeoJsonFeature | null {
  const candidate = {
    type: 'Feature',
    ...(feature.properties.id === undefined && feature.id === undefined ? {} : { id: feature.properties.id ?? feature.id }),
    geometry: feature.geometry,
    properties: { ...feature.properties },
  };
  const result = featureSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function applyEditorFields(
  feature: GeoJsonFeature,
  fields: EditorFields,
  advancedProperties?: Record<string, unknown>,
  advancedGeometry?: unknown,
): GeoJsonFeature {
  const properties: Record<string, unknown> = { ...(advancedProperties ?? feature.properties ?? {}) };
  const values: Array<[string, string]> = [
    ['name', fields.name],
    ['category', fields.category],
    ['alt_name', fields.aliases],
    ['description', fields.description],
    ['opening_hours', fields.openingHours],
    ['entrance', fields.entrance],
    ['wheelchair', fields.wheelchair],
    ['image', fields.image],
  ];
  for (const [key, value] of values) {
    if (value.trim()) properties[key] = value.trim();
    else delete properties[key];
  }
  return featureSchema.parse({ ...feature, geometry: advancedGeometry ?? feature.geometry, properties });
}
