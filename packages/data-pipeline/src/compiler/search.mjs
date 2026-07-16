import { pinyin } from 'pinyin-pro';

import { featureLookupKey } from './stable-ids.mjs';

/** @typedef {{type:'Feature',id?:string|number,properties?:Record<string,unknown>|null}} GeoJsonFeature */
/** @typedef {{id:string,name:string,aliases:string[],category:string,longitude:number,latitude:number,entranceNodeIds:string[]}} Place */

/** @param {unknown} value */
export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKD').replaceAll(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

/** @param {Record<string,unknown>} properties @param {string[]} keys */
function values(properties, keys) {
  return keys.flatMap((key) => typeof properties[key] === 'string' ? String(properties[key]).split(';') : []).map((value) => value.trim()).filter(Boolean);
}

/**
 * @param {Place[]} places
 * @param {GeoJsonFeature[]} features
 * @param {Map<string,string>} stableIds
 * @param {import('./config.mjs').WorldCompilerConfig} config
 */
export function generateSearchIndex(places, features, stableIds, config) {
  const featureByStableId = new Map(features.flatMap((feature) => {
    const stableId = stableIds.get(featureLookupKey(/** @type {Parameters<typeof featureLookupKey>[0]} */ (feature)));
    return stableId ? [[stableId, feature]] : [];
  }));
  const documents = places.map((place) => {
    const properties = featureByStableId.get(place.id)?.properties ?? {};
    const aliases = [...new Set([
      ...place.aliases,
      ...values(properties, ['name:en', 'name:zh', 'alt_name:en', 'alt_name:zh', 'official_name', 'loc_name']),
    ])];
    const description = values(properties, ['description', 'note', 'operator', 'cuisine']).join(' · ');
    const number = values(properties, ['ref', 'building:ref', 'addr:housenumber']).join(' ');
    const sourcePinyin = values(properties, ['name:zh-Latn-pinyin']).join(' ');
    const generatedPinyin = pinyin(place.name, { toneType: 'none' });
    const initials = pinyin(place.name, { toneType: 'none', pattern: 'first', type: 'array' }).join('');
    const terms = [place.name, ...aliases, place.category, description, number, sourcePinyin, generatedPinyin, initials]
      .map(normalizeSearchText)
      .filter(Boolean);
    const compactTerms = terms.map((term) => term.replaceAll(' ', ''));
    return {
      id: place.id,
      name: place.name,
      aliases,
      category: place.category,
      description,
      number,
      pinyin: normalizeSearchText(sourcePinyin || generatedPinyin),
      initials,
      longitude: place.longitude,
      latitude: place.latitude,
      entranceNodeIds: place.entranceNodeIds,
      searchText: [...new Set([...terms, ...compactTerms])].join(' '),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return { version: 1, campusId: config.campusId, documents };
}
