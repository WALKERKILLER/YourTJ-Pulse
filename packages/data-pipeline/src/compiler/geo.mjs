import { lngLatToScene, round } from './projection.mjs';

/** @typedef {[number,number]} Position */
/** @typedef {{type:string,coordinates:unknown}} Geometry */
/** @typedef {{type:'Feature',id?:string|number,geometry:Geometry,properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{west:number,south:number,east:number,north:number}} GeographicBounds */

/** @param {unknown} coordinates @returns {Position[]} */
export function flattenPositions(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return [[coordinates[0], coordinates[1]]];
  }
  return coordinates.flatMap((child) => flattenPositions(child));
}

/** @param {Position} point @param {GeographicBounds} bounds */
export function pointInBounds(point, bounds) {
  return point[0] >= bounds.west && point[0] <= bounds.east && point[1] >= bounds.south && point[1] <= bounds.north;
}

/** @param {GeoJsonFeature} feature @param {GeographicBounds} bounds */
export function featureIntersectsBounds(feature, bounds) {
  const positions = flattenPositions(feature.geometry.coordinates);
  if (positions.some((position) => pointInBounds(position, bounds))) return true;
  if (positions.length === 0) return false;
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  return Math.min(...longitudes) <= bounds.east && Math.max(...longitudes) >= bounds.west && Math.min(...latitudes) <= bounds.north && Math.max(...latitudes) >= bounds.south;
}

/** @param {Position[]} positions */
export function centroid(positions) {
  if (positions.length === 0) throw new Error('Cannot calculate centroid of empty geometry');
  const total = positions.reduce((sum, position) => [sum[0] + position[0], sum[1] + position[1]], /** @type {Position} */ ([0, 0]));
  return /** @type {Position} */ ([total[0] / positions.length, total[1] / positions.length]);
}

/** @param {GeoJsonFeature} feature @returns {Position} */
export function representativePoint(feature) {
  const positions = flattenPositions(feature.geometry.coordinates);
  if (feature.geometry.type === 'Point' && positions[0]) return positions[0];
  return centroid(positions);
}

/** @param {Position} point @param {Position} start @param {Position} end @param {number} [epsilon] */
export function pointOnSegment(point, start, end, epsilon = 1e-12) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < -epsilon) return false;
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot <= squaredLength + epsilon;
}

/** @param {Position} point @param {Position[]} ring */
export function pointInRing(point, ring) {
  if (ring.length < 3) return false;
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  if (point[0] < Math.min(...longitudes) || point[0] > Math.max(...longitudes)
    || point[1] < Math.min(...latitudes) || point[1] > Math.max(...latitudes)) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && point[0] < (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

/** @param {Position} point @param {unknown} polygonCoordinates */
export function pointInPolygon(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || !Array.isArray(polygonCoordinates[0])) return false;
  const rings = /** @type {Position[][]} */ (polygonCoordinates);
  const outer = rings[0];
  if (!outer || !pointInRing(point, outer)) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

/** @param {Position} point @param {GeoJsonFeature} feature */
export function pointInAreaFeature(point, feature) {
  if (feature.geometry.type === 'Polygon') return pointInPolygon(point, feature.geometry.coordinates);
  if (feature.geometry.type === 'MultiPolygon' && Array.isArray(feature.geometry.coordinates)) {
    return feature.geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

/** @param {Position} left @param {Position} right */
export function distance2d(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

/** @param {Position} start @param {Position} end @param {number} t @returns {Position} */
export function interpolate(start, end, t) {
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
}

/**
 * @param {Position} firstStart
 * @param {Position} firstEnd
 * @param {Position} secondStart
 * @param {Position} secondEnd
 * @param {number} tolerance
 */
export function segmentIntersection(firstStart, firstEnd, secondStart, secondEnd, tolerance = 1e-9) {
  const firstX = firstEnd[0] - firstStart[0];
  const firstY = firstEnd[1] - firstStart[1];
  const secondX = secondEnd[0] - secondStart[0];
  const secondY = secondEnd[1] - secondStart[1];
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) <= tolerance) return null;
  const deltaX = secondStart[0] - firstStart[0];
  const deltaY = secondStart[1] - firstStart[1];
  const firstT = (deltaX * secondY - deltaY * secondX) / denominator;
  const secondT = (deltaX * firstY - deltaY * firstX) / denominator;
  if (firstT < -tolerance || firstT > 1 + tolerance || secondT < -tolerance || secondT > 1 + tolerance) return null;
  return { firstT: Math.max(0, Math.min(1, firstT)), secondT: Math.max(0, Math.min(1, secondT)), point: interpolate(firstStart, firstEnd, firstT) };
}

/** @param {unknown} coordinates @returns {Position[][][]} */
function polygonParts(coordinates) {
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return [];
  if (typeof coordinates[0]?.[0]?.[0] === 'number') return [/** @type {Position[][]} */ (coordinates)];
  return /** @type {Position[][][]} */ (coordinates);
}

/**
 * Detects whether any non-zero interval of a segment lies inside an area.
 * Isolated touches at a polygon vertex do not count as crossing.
 * @param {Position} start
 * @param {Position} end
 * @param {GeoJsonFeature} feature
 */
export function segmentCrossesAreaFeature(start, end, feature) {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return false;
  for (const polygon of polygonParts(feature.geometry.coordinates)) {
    const splitValues = [0, 1];
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const ringStart = ring[index - 1];
        const ringEnd = ring[index];
        if (!ringStart || !ringEnd) continue;
        const intersection = segmentIntersection(start, end, ringStart, ringEnd, 1e-14);
        if (intersection) splitValues.push(intersection.firstT);
      }
    }
    const ordered = [...new Set(splitValues.map((value) => Math.round(value * 1e12) / 1e12))].sort((left, right) => left - right);
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      if (left === undefined || right === undefined || right - left < 1e-12) continue;
      if (pointInPolygon(interpolate(start, end, (left + right) / 2), polygon)) return true;
    }
  }
  return false;
}

/** @param {unknown} coordinates @returns {unknown} */
export function closePolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) return coordinates;
  return coordinates.map((ringValue) => {
    if (!Array.isArray(ringValue)) return ringValue;
    if (typeof ringValue[0]?.[0] !== 'number') return closePolygonCoordinates(ringValue);
    const ring = /** @type {Position[]} */ (ringValue.map((position) => [...position]));
    const first = ring[0];
    const last = ring.at(-1);
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
    return ring;
  });
}

/** @param {Geometry} geometry @param {import('./config.mjs').WorldCompilerConfig} config */
export function geometryToScene(geometry, config) {
  /** @param {unknown} value @returns {unknown} */
  const convert = (value) => {
    if (!Array.isArray(value)) return value;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const point = lngLatToScene(value[0], value[1], config);
      return [round(point.x, config.coordinatePrecision), round(point.y, config.coordinatePrecision)];
    }
    return value.map(convert);
  };
  return { type: geometry.type, coordinates: convert(geometry.coordinates) };
}
