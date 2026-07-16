import { createHash } from 'node:crypto';

/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{version:number,ids:Record<string,string>}} StableIdMap */

/** @param {string} value */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} value */
function slug(value) {
  const normalized = value.normalize('NFKC').trim().toLowerCase().replaceAll(/[^\p{Letter}\p{Number}_-]+/gu, '-').replaceAll(/^-+|-+$/g, '');
  return normalized || sha256(value).slice(0, 16);
}

/** @param {GeoJsonFeature} feature */
export function featureFingerprint(feature) {
  return sha256(JSON.stringify({ geometry: feature.geometry, sourceId: feature.id ?? feature.properties?.id ?? null }));
}

/** @param {GeoJsonFeature} feature */
export function featureLookupKey(feature) {
  const sourceId = feature.id ?? feature.properties?.id;
  return sourceId === undefined ? `generated:${featureFingerprint(feature)}` : String(sourceId);
}

/**
 * @param {GeoJsonFeature} feature
 * @param {string} campusId
 * @param {StableIdMap} stableMap
 */
export function stableFeatureId(feature, campusId, stableMap) {
  const ownId = feature.properties?.stable_id;
  if (typeof ownId === 'string' && ownId.trim()) {
    return ownId.startsWith(`${campusId}-`) ? ownId : `${campusId}-${slug(ownId)}`;
  }

  const sourceId = feature.id ?? feature.properties?.id;
  if (typeof sourceId === 'string' || typeof sourceId === 'number') {
    const match = /^(node|way|relation)\/(.+)$/.exec(String(sourceId));
    if (match) return `${campusId}-${match[1]}-${slug(match[2] ?? '')}`;
  }

  const fingerprint = featureFingerprint(feature);
  const existing = stableMap.ids[fingerprint];
  if (existing) return existing;
  const generated = `${campusId}-generated-${fingerprint.slice(0, 16)}`;
  stableMap.ids[fingerprint] = generated;
  return generated;
}

/** @param {[number,number]} coordinate @param {string} campusId */
export function stableNavigationNodeId(coordinate, campusId) {
  const canonical = `${coordinate[0].toFixed(7)},${coordinate[1].toFixed(7)}`;
  return `${campusId}-nav-${sha256(canonical).slice(0, 16)}`;
}
