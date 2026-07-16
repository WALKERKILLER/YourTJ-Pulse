import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** @typedef {{west:number,south:number,east:number,north:number}} GeographicBounds */
/** @typedef {{longitude:number,latitude:number}} GeographicOrigin */
/** @typedef {{entranceConnectionMeters:number,placeConnectionMeters:number,minimumEdgeMeters:number}} NavigationConfig */
/** @typedef {{version:number,campusId:string,origin:GeographicOrigin,bounds:GeographicBounds,metersPerSceneUnit:number,rotationDegrees:number,coordinatePrecision:number,navigation:NavigationConfig}} WorldCompilerConfig */

/**
 * @param {string} repositoryRoot
 * @returns {Promise<WorldCompilerConfig>}
 */
export async function loadWorldConfig(repositoryRoot) {
  const path = resolve(repositoryRoot, 'data/world-compiler.config.json');
  const value = /** @type {WorldCompilerConfig} */ (JSON.parse(await readFile(path, 'utf8')));
  validateConfig(value);
  return value;
}

/** @param {WorldCompilerConfig} config */
export function validateConfig(config) {
  if (!config.campusId || !Number.isInteger(config.version) || config.version < 1) {
    throw new Error('World compiler config requires a campusId and positive version');
  }
  const { bounds, origin } = config;
  if (!(bounds.west < bounds.east && bounds.south < bounds.north)) {
    throw new Error('World compiler bounds are invalid');
  }
  if (origin.longitude < bounds.west || origin.longitude > bounds.east || origin.latitude < bounds.south || origin.latitude > bounds.north) {
    throw new Error('World origin must be inside campus bounds');
  }
  if (!(config.metersPerSceneUnit > 0)) throw new Error('metersPerSceneUnit must be positive');
  if (!(config.navigation.entranceConnectionMeters > 0
    && config.navigation.placeConnectionMeters > 0
    && config.navigation.minimumEdgeMeters > 0)) throw new Error('Navigation distances must be positive');
}

/** @param {WorldCompilerConfig} config */
export function publicWorldConfig(config) {
  return {
    version: config.version,
    campusId: config.campusId,
    projection: 'local-equirectangular',
    earthRadiusMeters: 6_378_137,
    origin: config.origin,
    bounds: config.bounds,
    metersPerSceneUnit: config.metersPerSceneUnit,
    rotationDegrees: config.rotationDegrees,
    coordinatePrecision: config.coordinatePrecision,
    axes: { x: 'east', y: 'north' },
  };
}
