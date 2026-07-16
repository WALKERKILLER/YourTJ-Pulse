import { featureIntersectsBounds, interpolate, pointInBounds, representativePoint, segmentCrossesAreaFeature, segmentIntersection } from './geo.mjs';
import { lngLatToScene, round, sceneToLngLat } from './projection.mjs';
import { featureLookupKey, sha256, stableNavigationNodeId } from './stable-ids.mjs';

/** @typedef {[number,number]} Position */
/** @typedef {{x:number,y:number}} ScenePoint */
/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{id:string,longitude:number,latitude:number,x:number,y:number,kind:'path'|'entrance'}} NavigationNode */
/** @typedef {{id:string,from:string,to:string,distance:number,walking:boolean,cycling:boolean,wheelchair:boolean,stairs:boolean,covered:boolean,indoor:boolean,surface:string|null,access:string|null,sourceId:string}} NavigationEdge */
/** @typedef {{id:string,sourceId:string,start:Position,end:Position,startScene:ScenePoint,endScene:ScenePoint,properties:Record<string,unknown>}} RawSegment */

const ROUTABLE_HIGHWAYS = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'residential', 'service', 'crossing']);

/** @param {unknown} value */
function truthyTag(value) {
  return value === 'yes' || value === 'true' || value === '1';
}

/** @param {unknown} coordinates @returns {Position[][]} */
function lineParts(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  if (typeof coordinates[0]?.[0] === 'number') return [/** @type {Position[]} */ (coordinates)];
  return /** @type {Position[][]} */ (coordinates);
}

/** @param {RawSegment} segment @param {GeoJsonFeature[]} obstacles */
function crossesObstacle(segment, obstacles) {
  if (segment.properties.indoor === 'yes' || segment.properties.highway === 'corridor' || segment.properties.tunnel === 'yes') return false;
  return obstacles.some((obstacle) => segmentCrossesAreaFeature(segment.start, segment.end, obstacle));
}

/** @param {RawSegment} left @param {RawSegment} right */
function sameLevel(left, right) {
  const leftLayer = String(left.properties.layer ?? '0');
  const rightLayer = String(right.properties.layer ?? '0');
  if (leftLayer !== rightLayer) return false;
  const leftSeparated = truthyTag(left.properties.bridge) || truthyTag(left.properties.tunnel);
  const rightSeparated = truthyTag(right.properties.bridge) || truthyTag(right.properties.tunnel);
  return leftSeparated === rightSeparated;
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
function extractSegments(features, stableIds, config) {
  /** @type {RawSegment[]} */
  const segments = [];
  const roadFeatures = features.filter((feature) => {
    const highway = feature.properties?.highway;
    return typeof highway === 'string' && ROUTABLE_HIGHWAYS.has(highway) && (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') && featureIntersectsBounds(feature, config.bounds);
  });
  for (const feature of roadFeatures) {
    const lookupKey = featureLookupKey(feature);
    const sourceId = stableIds.get(lookupKey);
    if (!sourceId) throw new Error(`Missing stable id for navigation source ${lookupKey}`);
    const properties = feature.properties ?? {};
    for (const part of lineParts(feature.geometry.coordinates)) {
      for (let index = 1; index < part.length; index += 1) {
        const start = part[index - 1];
        const end = part[index];
        if (!start || !end || !pointInBounds(start, config.bounds) || !pointInBounds(end, config.bounds)) continue;
        const startScene = lngLatToScene(start[0], start[1], config);
        const endScene = lngLatToScene(end[0], end[1], config);
        segments.push({ id: `${sourceId}:${index - 1}`, sourceId, start, end, startScene, endScene, properties });
      }
    }
  }
  return segments;
}

/** @param {RawSegment[]} segments */
function intersectionSplits(segments) {
  /** @type {Map<number,number[]>} */
  const splits = new Map(segments.map((_, index) => [index, [0, 1]]));
  /** @type {Map<string,number[]>} */
  const grid = new Map();
  const cellSize = 60;
  segments.forEach((segment, index) => {
    const minimumX = Math.floor(Math.min(segment.startScene.x, segment.endScene.x) / cellSize);
    const maximumX = Math.floor(Math.max(segment.startScene.x, segment.endScene.x) / cellSize);
    const minimumY = Math.floor(Math.min(segment.startScene.y, segment.endScene.y) / cellSize);
    const maximumY = Math.floor(Math.max(segment.startScene.y, segment.endScene.y) / cellSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const key = `${x}:${y}`;
        grid.set(key, [...(grid.get(key) ?? []), index]);
      }
    }
  });

  const compared = new Set();
  for (const indices of grid.values()) {
    for (let leftOffset = 0; leftOffset < indices.length; leftOffset += 1) {
      for (let rightOffset = leftOffset + 1; rightOffset < indices.length; rightOffset += 1) {
        const leftIndex = indices[leftOffset];
        const rightIndex = indices[rightOffset];
        if (leftIndex === undefined || rightIndex === undefined) continue;
        const pairKey = leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`;
        if (compared.has(pairKey)) continue;
        compared.add(pairKey);
        const left = segments[leftIndex];
        const right = segments[rightIndex];
        if (!left || !right || !sameLevel(left, right)) continue;
        const intersection = segmentIntersection(
          [left.startScene.x, left.startScene.y],
          [left.endScene.x, left.endScene.y],
          [right.startScene.x, right.startScene.y],
          [right.endScene.x, right.endScene.y],
          1e-7,
        );
        if (!intersection) continue;
        splits.get(leftIndex)?.push(intersection.firstT);
        splits.get(rightIndex)?.push(intersection.secondT);
      }
    }
  }
  return splits;
}

/** @param {Record<string,unknown>} properties */
function accessFlags(properties) {
  const highway = String(properties.highway ?? '');
  const access = typeof properties.access === 'string' ? properties.access : null;
  const foot = typeof properties.foot === 'string' ? properties.foot : null;
  const bicycle = typeof properties.bicycle === 'string' ? properties.bicycle : null;
  const restricted = access === 'no' || access === 'private';
  const walking = foot === 'yes' || foot === 'designated' || foot === 'permissive' || (!restricted && foot !== 'no');
  const stairs = highway === 'steps';
  const cycling = !stairs && bicycle !== 'no' && (bicycle === 'yes' || bicycle === 'designated' || !restricted);
  const wheelchair = walking && !stairs && properties.wheelchair !== 'no';
  return { access, walking, cycling, wheelchair, stairs };
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
export function generateNavigationGraph(features, stableIds, config) {
  const obstacles = features.filter((feature) => featureIntersectsBounds(feature, config.bounds)
    && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
    && (Boolean(feature.properties?.building) || feature.properties?.natural === 'water' || Boolean(feature.properties?.water)));
  const segments = extractSegments(features, stableIds, config);
  const splits = intersectionSplits(segments);
  /** @type {Map<string,NavigationNode>} */
  const nodes = new Map();
  /** @type {Map<string,NavigationEdge>} */
  const edges = new Map();

  /** @param {Position} coordinate @param {'path'|'entrance'} kind */
  const ensureNode = (coordinate, kind) => {
    const id = stableNavigationNodeId(coordinate, config.campusId);
    const scene = lngLatToScene(coordinate[0], coordinate[1], config);
    if (!nodes.has(id)) nodes.set(id, {
      id,
      longitude: coordinate[0],
      latitude: coordinate[1],
      x: round(scene.x, config.coordinatePrecision),
      y: round(scene.y, config.coordinatePrecision),
      kind,
    });
    return id;
  };

  /** @param {string} from @param {string} to @param {number} distance @param {Record<string,unknown>} properties @param {string} sourceId */
  const addEdge = (from, to, distance, properties, sourceId) => {
    const flags = accessFlags(properties);
    if (!flags.walking && !flags.cycling) return;
    const id = `${config.campusId}-edge-${sha256(`${sourceId}|${from}|${to}`).slice(0, 18)}`;
    edges.set(id, {
      id,
      from,
      to,
      distance: round(distance * config.metersPerSceneUnit, 3),
      walking: flags.walking,
      cycling: flags.cycling,
      wheelchair: flags.wheelchair,
      stairs: flags.stairs,
      covered: truthyTag(properties.covered),
      indoor: truthyTag(properties.indoor) || properties.highway === 'corridor',
      surface: typeof properties.surface === 'string' ? properties.surface : null,
      access: flags.access,
      sourceId,
    });
  };

  segments.forEach((segment, segmentIndex) => {
    const splitValues = [...new Set((splits.get(segmentIndex) ?? [0, 1]).map((value) => Math.round(value * 1e9) / 1e9))].sort((left, right) => left - right);
    for (let index = 1; index < splitValues.length; index += 1) {
      const startT = splitValues[index - 1];
      const endT = splitValues[index];
      if (startT === undefined || endT === undefined || endT <= startT) continue;
      const startScene = interpolate([segment.startScene.x, segment.startScene.y], [segment.endScene.x, segment.endScene.y], startT);
      const endScene = interpolate([segment.startScene.x, segment.startScene.y], [segment.endScene.x, segment.endScene.y], endT);
      const distance = Math.hypot(endScene[0] - startScene[0], endScene[1] - startScene[1]);
      if (distance * config.metersPerSceneUnit < config.navigation.minimumEdgeMeters) continue;
      const startLngLatValue = sceneToLngLat(startScene[0], startScene[1], config);
      const endLngLatValue = sceneToLngLat(endScene[0], endScene[1], config);
      const startLngLat = /** @type {Position} */ ([startLngLatValue.longitude, startLngLatValue.latitude]);
      const endLngLat = /** @type {Position} */ ([endLngLatValue.longitude, endLngLatValue.latitude]);
      const splitSegment = { ...segment, start: startLngLat, end: endLngLat };
      if (crossesObstacle(splitSegment, obstacles)) continue;
      const from = ensureNode(startLngLat, 'path');
      const to = ensureNode(endLngLat, 'path');
      const oneway = segment.properties.oneway;
      if (oneway === '-1') addEdge(to, from, distance, segment.properties, segment.sourceId);
      else {
        addEdge(from, to, distance, segment.properties, segment.sourceId);
        if (!truthyTag(oneway)) addEdge(to, from, distance, segment.properties, segment.sourceId);
      }
    }
  });

  const pathNodes = [...nodes.values()];
  const entrances = features.filter((feature) => feature.geometry.type === 'Point' && Boolean(feature.properties?.entrance) && featureIntersectsBounds(feature, config.bounds));
  for (const entrance of entrances) {
    const coordinate = representativePoint(entrance);
    const entranceId = ensureNode(coordinate, 'entrance');
    const entranceNode = nodes.get(entranceId);
    if (!entranceNode) continue;
    const nearest = pathNodes.reduce((best, candidate) => {
      const distance = Math.hypot(candidate.x - entranceNode.x, candidate.y - entranceNode.y) * config.metersPerSceneUnit;
      return !best || distance < best.distance ? { node: candidate, distance } : best;
    }, /** @type {{node:NavigationNode,distance:number}|null} */ (null));
    if (!nearest || nearest.distance > config.navigation.entranceConnectionMeters) continue;
    const sourceId = stableIds.get(featureLookupKey(entrance)) ?? entranceId;
    const properties = { highway: 'footway', foot: 'yes', bicycle: 'no', wheelchair: entrance.properties?.wheelchair ?? 'yes' };
    addEdge(entranceId, nearest.node.id, nearest.distance / config.metersPerSceneUnit, properties, sourceId);
    addEdge(nearest.node.id, entranceId, nearest.distance / config.metersPerSceneUnit, properties, sourceId);
  }

  const sortedNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const sortedEdges = [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    version: 1,
    campusId: config.campusId,
    directed: true,
    nodes: sortedNodes,
    edges: sortedEdges,
    stats: navigationStats(sortedNodes, sortedEdges),
  };
}

/** @param {NavigationNode[]} nodes @param {NavigationEdge[]} edges */
function navigationStats(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, /** @type {string[]} */ ([])]));
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }
  const visited = new Set();
  /** @type {number[]} */
  const componentSizes = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    visited.add(node.id);
    let size = 0;
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      size += 1;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    componentSizes.push(size);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    componentCount: componentSizes.length,
    largestComponentNodes: Math.max(0, ...componentSizes),
    stairsEdges: edges.filter((edge) => edge.stairs).length,
    wheelchairEdges: edges.filter((edge) => edge.wheelchair).length,
  };
}

/**
 * @param {{nodes:NavigationNode[],edges:NavigationEdge[]}} graph
 * @param {string} startId
 * @param {string} endId
 * @param {{wheelchair?:boolean,cycling?:boolean}} [options]
 */
export function findRoute(graph, startId, endId, options = {}) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodes.has(startId) || !nodes.has(endId)) return null;
  const adjacency = new Map(graph.nodes.map((node) => [node.id, /** @type {NavigationEdge[]} */ ([])]));
  for (const edge of graph.edges) {
    if (options.wheelchair && !edge.wheelchair) continue;
    if (options.cycling ? !edge.cycling : !edge.walking) continue;
    adjacency.get(edge.from)?.push(edge);
  }
  const target = nodes.get(endId);
  if (!target) return null;
  const distance = new Map([[startId, 0]]);
  const previous = new Map();
  const open = new Set([startId]);
  while (open.size) {
    let current = '';
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const node = nodes.get(candidate);
      if (!node) continue;
      const heuristic = Math.hypot(target.x - node.x, target.y - node.y);
      const score = (distance.get(candidate) ?? Number.POSITIVE_INFINITY) + heuristic;
      if (score < bestScore) { bestScore = score; current = candidate; }
    }
    if (!current) break;
    if (current === endId) {
      const nodeIds = [current];
      while (previous.has(current)) { current = previous.get(current); nodeIds.push(current); }
      nodeIds.reverse();
      return { nodeIds, distance: round(distance.get(endId) ?? 0, 3) };
    }
    open.delete(current);
    for (const edge of adjacency.get(current) ?? []) {
      const candidateDistance = (distance.get(current) ?? Number.POSITIVE_INFINITY) + edge.distance;
      if (candidateDistance < (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distance.set(edge.to, candidateDistance);
        previous.set(edge.to, current);
        open.add(edge.to);
      }
    }
  }
  return null;
}
