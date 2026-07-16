/** @typedef {{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{type:'FeatureCollection',features:GeoJsonFeature[]}} FeatureCollection */

import { featureLookupKey } from './stable-ids.mjs';

export const MAP_LAYER_ORDER = ['buildings', 'roads', 'water', 'waterway', 'pois', 'landuse', 'misc', 'misc-line', 'misc-point'];

/** @param {GeoJsonFeature} feature */
function isLinear(feature) {
  return feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
}

/** @param {GeoJsonFeature} feature */
function matchesWater(feature) {
  const properties = feature.properties ?? {};
  return properties.natural === 'water' || Boolean(properties.waterway) || Boolean(properties.water);
}

/**
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 */
export function classifyFeatures(features, stableIds) {
  /** @type {Record<string,FeatureCollection>} */
  const layers = Object.fromEntries(MAP_LAYER_ORDER.map((name) => [name, { type: 'FeatureCollection', features: [] }]));
  /** @type {GeoJsonFeature[]} */
  const customFeatures = [];
  const seen = new Set();

  for (const feature of features) {
    const lookupKey = featureLookupKey(feature);
    const stableId = stableIds.get(lookupKey);
    if (!stableId) throw new Error(`Missing stable id for source feature ${lookupKey}`);
    /** @type {Record<string,unknown>} */
    const properties = { ...(feature.properties ?? {}), stable_id: stableId };
    const enriched = /** @type {GeoJsonFeature} */ ({ ...feature, properties });
    /** @type {string[]} */
    const matches = [];
    if (properties.building) matches.push('buildings');
    if (properties.highway) matches.push('roads');
    if (matchesWater(enriched)) matches.push(isLinear(enriched) ? 'waterway' : 'water');
    if (properties.name && enriched.geometry.type === 'Point') matches.push('pois');
    if (properties.landuse || properties.leisure || properties.natural) matches.push('landuse');
    if (matches.length === 0) {
      if (isLinear(enriched)) matches.push('misc-line');
      else if (enriched.geometry.type === 'Point' || enriched.geometry.type === 'MultiPoint') matches.push('misc-point');
      else matches.push('misc');
    }

    for (const layer of matches) layers[layer]?.features.push(enriched);
    const primaryLayer = MAP_LAYER_ORDER.find((layer) => matches.includes(layer));
    if (!seen.has(stableId) && primaryLayer) {
      seen.add(stableId);
      customFeatures.push({
        ...enriched,
        properties: { ...properties, _layer: primaryLayer, _geom_type: feature.geometry.type },
      });
    }
  }

  for (const layer of Object.values(layers)) {
    layer.features.sort((left, right) => String(left.properties?.stable_id).localeCompare(String(right.properties?.stable_id)));
  }
  customFeatures.sort((left, right) => String(left.properties?.stable_id).localeCompare(String(right.properties?.stable_id)));
  const custom = /** @type {FeatureCollection} */ ({ type: 'FeatureCollection', features: customFeatures });
  return { layers, custom };
}
