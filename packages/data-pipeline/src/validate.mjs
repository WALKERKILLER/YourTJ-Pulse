import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const defaultFiles = ['data/full.geojson', 'public/assets/data/custom.geojson'];
const supportedGeometryTypes = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} coordinates
 * @param {string} path
 */
function validateCoordinates(coordinates, path) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error(`${path} must be a non-empty coordinate array`);
  }

  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (typeof longitude === 'number' || typeof latitude === 'number') {
    if (coordinates.length < 2) throw new Error(`${path} must contain longitude and latitude`);
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(`${path} contains an invalid WGS84 position`);
    }
    return;
  }

  coordinates.forEach((child, index) => validateCoordinates(child, `${path}[${index}]`));
}

/**
 * @param {unknown} value
 * @param {string} source
 */
export function validateFeatureCollection(value, source = 'GeoJSON') {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    throw new Error(`${source} must be a GeoJSON FeatureCollection`);
  }

  const ids = new Set();
  value.features.forEach((feature, index) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.geometry)) {
      throw new Error(`${source}.features[${index}] must be a GeoJSON Feature`);
    }
    const geometryType = feature.geometry.type;
    if (typeof geometryType !== 'string' || !supportedGeometryTypes.has(geometryType)) {
      throw new Error(`${source}.features[${index}] has an unsupported geometry type`);
    }
    validateCoordinates(feature.geometry.coordinates, `${source}.features[${index}].geometry.coordinates`);

    if (feature.id !== undefined && feature.id !== null) {
      const id = String(feature.id);
      if (ids.has(id)) throw new Error(`${source} contains duplicate feature id ${id}`);
      ids.add(id);
    }
  });

  return { featureCount: value.features.length, identifiedFeatureCount: ids.size };
}

export async function validateFiles(files = defaultFiles) {
  const results = [];
  for (const relativePath of files) {
    const contents = await readFile(resolve(repositoryRoot, relativePath), 'utf8');
    const value = JSON.parse(contents);
    results.push({ file: relativePath, ...validateFeatureCollection(value, relativePath) });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await validateFiles();
  for (const result of results) {
    console.log(`${result.file}: ${result.featureCount} features (${result.identifiedFeatureCount} with ids)`);
  }
}
