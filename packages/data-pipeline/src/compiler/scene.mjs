import { featureIntersectsBounds, geometryToScene, representativePoint } from './geo.mjs';
import { lngLatToScene, round } from './projection.mjs';
import { featureLookupKey } from './stable-ids.mjs';

/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */

/** @param {Record<string,unknown>} properties */
function sceneProperties(properties) {
  const keys = ['name', 'building', 'building:levels', 'highway', 'surface', 'natural', 'water', 'waterway', 'landuse', 'leisure', 'access'];
  return Object.fromEntries(keys.flatMap((key) => properties[key] === undefined ? [] : [[key, properties[key]]]));
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {ReturnType<import('./places.mjs').generatePlaces>} places
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
export function generateCampusScene(features, stableIds, places, config) {
  const campusFeatures = features.filter((feature) => featureIntersectsBounds(feature, config.bounds));
  /** @param {GeoJsonFeature} feature */
  const sceneItem = (feature) => {
    const lookupKey = featureLookupKey(feature);
    return {
      id: stableIds.get(lookupKey) ?? lookupKey,
      geometry: geometryToScene(feature.geometry, config),
      properties: sceneProperties(feature.properties ?? {}),
    };
  };
  const buildings = campusFeatures.filter((feature) => Boolean(feature.properties?.building) && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')).map(sceneItem);
  const roads = campusFeatures.filter((feature) => Boolean(feature.properties?.highway) && (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString')).map(sceneItem);
  const water = campusFeatures.filter((feature) => (feature.properties?.natural === 'water' || Boolean(feature.properties?.water)) && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')).map(sceneItem);
  const vegetation = campusFeatures.filter((feature) => {
    const properties = feature.properties ?? {};
    return ['forest', 'grass', 'meadow', 'recreation_ground'].includes(String(properties.landuse ?? ''))
      || ['wood', 'grassland', 'scrub'].includes(String(properties.natural ?? ''));
  }).filter((feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon').map(sceneItem);
  const spawnPoints = campusFeatures.filter((feature) => feature.geometry.type === 'Point' && Boolean(feature.properties?.entrance)).map((feature) => {
    const lookupKey = featureLookupKey(feature);
    const sourceId = stableIds.get(lookupKey) ?? lookupKey;
    const [longitude, latitude] = representativePoint(feature);
    const scene = lngLatToScene(longitude, latitude, config);
    return {
      id: `${sourceId}-spawn`,
      x: round(scene.x, config.coordinatePrecision),
      y: round(scene.y, config.coordinatePrecision),
      kind: 'entrance',
      sourceId,
    };
  });
  if (spawnPoints.length === 0) spawnPoints.push({ id: `${config.campusId}-spawn-default`, x: 0, y: 0, kind: 'default', sourceId: config.campusId });
  const corners = [
    lngLatToScene(config.bounds.west, config.bounds.south, config),
    lngLatToScene(config.bounds.west, config.bounds.north, config),
    lngLatToScene(config.bounds.east, config.bounds.south, config),
    lngLatToScene(config.bounds.east, config.bounds.north, config),
  ];
  const scenePlaces = places.map((place) => ({ id: place.id, x: place.sceneX, y: place.sceneY, category: place.category, buildingId: place.buildingId ?? null }));
  /** @param {{id:string}} left @param {{id:string}} right */
  const byId = (left, right) => String(left.id).localeCompare(String(right.id));
  return {
    version: 1,
    campusId: config.campusId,
    bounds: {
      minX: round(Math.min(...corners.map(({ x }) => x)), config.coordinatePrecision),
      minY: round(Math.min(...corners.map(({ y }) => y)), config.coordinatePrecision),
      maxX: round(Math.max(...corners.map(({ x }) => x)), config.coordinatePrecision),
      maxY: round(Math.max(...corners.map(({ y }) => y)), config.coordinatePrecision),
    },
    buildings: buildings.sort(byId),
    roads: roads.sort(byId),
    water: water.sort(byId),
    vegetation: vegetation.sort(byId),
    places: scenePlaces.sort(byId),
    spawnPoints: spawnPoints.sort(byId),
  };
}
