const EARTH_RADIUS_METERS = 6_378_137;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** @typedef {import('./config.mjs').WorldCompilerConfig} WorldCompilerConfig */

/**
 * @param {number} longitude
 * @param {number} latitude
 * @param {WorldCompilerConfig} config
 */
export function lngLatToScene(longitude, latitude, config) {
  const latitude0 = config.origin.latitude * DEGREES_TO_RADIANS;
  const eastMeters = EARTH_RADIUS_METERS * Math.cos(latitude0) * (longitude - config.origin.longitude) * DEGREES_TO_RADIANS;
  const northMeters = EARTH_RADIUS_METERS * (latitude - config.origin.latitude) * DEGREES_TO_RADIANS;
  const rotation = config.rotationDegrees * DEGREES_TO_RADIANS;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const xMeters = eastMeters * cosine - northMeters * sine;
  const yMeters = eastMeters * sine + northMeters * cosine;
  return {
    x: xMeters / config.metersPerSceneUnit,
    y: yMeters / config.metersPerSceneUnit,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {WorldCompilerConfig} config
 */
export function sceneToLngLat(x, y, config) {
  const rotation = -config.rotationDegrees * DEGREES_TO_RADIANS;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const xMeters = x * config.metersPerSceneUnit;
  const yMeters = y * config.metersPerSceneUnit;
  const eastMeters = xMeters * cosine - yMeters * sine;
  const northMeters = xMeters * sine + yMeters * cosine;
  const latitude0 = config.origin.latitude * DEGREES_TO_RADIANS;
  return {
    longitude: config.origin.longitude + eastMeters / (EARTH_RADIUS_METERS * Math.cos(latitude0)) / DEGREES_TO_RADIANS,
    latitude: config.origin.latitude + northMeters / EARTH_RADIUS_METERS / DEGREES_TO_RADIANS,
  };
}

/** @param {number} value @param {number} precision */
export function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
