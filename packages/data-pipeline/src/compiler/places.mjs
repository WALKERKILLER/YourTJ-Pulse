import { featureIntersectsBounds, pointInAreaFeature, representativePoint } from './geo.mjs';
import { lngLatToScene, round } from './projection.mjs';
import { featureLookupKey, stableNavigationNodeId } from './stable-ids.mjs';

/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{id:string,x:number,y:number,kind:'path'|'entrance'}} NavigationNode */
/** @typedef {{from:string,to:string,walking:boolean}} NavigationEdge */
/** @typedef {{nodes:NavigationNode[],edges:NavigationEdge[]}} NavigationGraph */

/** @param {NavigationGraph} graph */
function primaryWalkingNodes(graph) {
  /** @type {Map<string,string[]>} */
  const adjacency = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    if (!edge.walking) continue;
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }
  const visited = new Set();
  /** @type {string[]} */
  let largest = [];
  for (const node of graph.nodes) {
    if (visited.has(node.id) || (adjacency.get(node.id)?.length ?? 0) === 0) continue;
    const component = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const largestIds = new Set(largest);
  return graph.nodes.filter((node) => largestIds.has(node.id));
}

/** @param {Record<string,unknown>} properties */
function aliases(properties) {
  const values = ['alt_name', 'name:en', 'name:zh', 'old_name', 'short_name']
    .flatMap((key) => typeof properties[key] === 'string' ? String(properties[key]).split(';') : [])
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

/** @param {Record<string,unknown>} properties */
function category(properties) {
  for (const key of ['amenity', 'shop', 'tourism', 'leisure', 'building', 'entrance', 'highway', 'place']) {
    const value = properties[key];
    if (typeof value === 'string' && value) return value;
  }
  return 'place';
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {NavigationGraph} navigation
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
export function generatePlaces(features, stableIds, navigation, config) {
  const campusFeatures = features.filter((feature) => featureIntersectsBounds(feature, config.bounds));
  const buildings = campusFeatures.filter((feature) => Boolean(feature.properties?.building) && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'));
  const entrances = campusFeatures.filter((feature) => feature.geometry.type === 'Point' && Boolean(feature.properties?.entrance));
  const navigationNodeIds = new Set(navigation.nodes.map((node) => node.id));
  const primaryNodes = primaryWalkingNodes(navigation);
  /** @type {Map<string,string[]>} */
  const entrancesByBuilding = new Map();

  for (const entrance of entrances) {
    const coordinate = representativePoint(entrance);
    const building = buildings.find((candidate) => pointInAreaFeature(coordinate, candidate));
    if (!building) continue;
    const buildingId = stableIds.get(featureLookupKey(building));
    if (!buildingId) continue;
    const nodeId = stableNavigationNodeId(coordinate, config.campusId);
    entrancesByBuilding.set(buildingId, [...(entrancesByBuilding.get(buildingId) ?? []), nodeId]);
  }

  const candidates = campusFeatures.filter((feature) => {
    const properties = feature.properties ?? {};
    if (typeof properties.name !== 'string' || !properties.name.trim()) return false;
    return (Boolean(properties.building) && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) || feature.geometry.type === 'Point';
  });

  return candidates.map((feature) => {
    const properties = feature.properties ?? {};
    const lookupKey = featureLookupKey(feature);
    const id = stableIds.get(lookupKey);
    if (!id) throw new Error(`Missing stable id for place ${lookupKey}`);
    const [longitude, latitude] = representativePoint(feature);
    const scene = lngLatToScene(longitude, latitude, config);
    const containingBuilding = feature.geometry.type === 'Point'
      ? buildings.find((building) => pointInAreaFeature([longitude, latitude], building))
      : feature;
    const buildingId = containingBuilding ? stableIds.get(featureLookupKey(containingBuilding)) : undefined;
    const explicitEntranceIds = buildingId
      ? [...new Set(entrancesByBuilding.get(buildingId) ?? [])].filter((nodeId) => navigationNodeIds.has(nodeId))
      : [];
    const nearestPrimaryNode = primaryNodes.reduce((best, node) => {
      const distance = Math.hypot(node.x - scene.x, node.y - scene.y) * config.metersPerSceneUnit;
      return !best || distance < best.distance ? { id: node.id, distance } : best;
    }, /** @type {{id:string,distance:number}|null} */ (null));
    const entranceNodeIds = [...new Set([
      ...explicitEntranceIds,
      ...(nearestPrimaryNode && nearestPrimaryNode.distance <= config.navigation.placeConnectionMeters ? [nearestPrimaryNode.id] : []),
    ])].sort();
    const sourceId = feature.id ?? properties.id;
    return {
      id,
      campusId: config.campusId,
      name: String(properties.name),
      aliases: aliases(properties),
      category: category(properties),
      longitude,
      latitude,
      ...(buildingId ? { buildingId } : {}),
      entranceNodeIds,
      sceneX: round(scene.x, config.coordinatePrecision),
      sceneY: round(scene.y, config.coordinatePrecision),
      source: properties.stable_id ? 'yourtj' : 'osm',
      ...(sourceId === undefined ? {} : { sourceId: String(sourceId) }),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}
