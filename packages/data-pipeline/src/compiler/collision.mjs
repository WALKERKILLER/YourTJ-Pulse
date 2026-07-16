import { closePolygonCoordinates, featureIntersectsBounds } from './geo.mjs';
import { featureLookupKey } from './stable-ids.mjs';

/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */

const SOLID_BARRIERS = new Set(['wall', 'fence', 'hedge', 'retaining_wall', 'city_wall', 'guard_rail']);

/** @param {GeoJsonFeature} feature */
function collisionType(feature) {
  const properties = feature.properties ?? {};
  if (properties.building) return 'building';
  if (properties.natural === 'water' || properties.water || properties.waterway) return 'water';
  if (typeof properties.barrier === 'string' && SOLID_BARRIERS.has(properties.barrier)) return 'barrier';
  if (properties.access === 'no' || properties.access === 'private' || properties.access === 'restricted') return 'restricted';
  if (properties.construction || properties.highway === 'construction' || properties.access === 'permit') return 'closed';
  return null;
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
export function generateCollision(features, stableIds, config) {
  const collisionFeatures = features.flatMap((feature) => {
    if (!featureIntersectsBounds(feature, config.bounds)) return [];
    const type = collisionType(feature);
    if (!type) return [];
    if (!['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(feature.geometry.type)) return [];
    const id = stableIds.get(featureLookupKey(feature));
    if (!id) return [];
    const coordinates = feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
      ? closePolygonCoordinates(feature.geometry.coordinates)
      : feature.geometry.coordinates;
    return [{
      type: 'Feature',
      id,
      geometry: { type: feature.geometry.type, coordinates },
      properties: { stable_id: id, collision_type: type, source_id: String(feature.id ?? '') },
    }];
  });
  collisionFeatures.sort((left, right) => left.id.localeCompare(right.id));
  return { type: 'FeatureCollection', features: collisionFeatures };
}
