import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { validateFeatureCollection } from './validate.mjs';
import { MAP_LAYER_ORDER } from './compiler/classify.mjs';
import { findRoute } from './compiler/navigation.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const execFileAsync = promisify(execFile);

/** @param {Buffer|string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function verifyGeneratedArtifacts() {
  const manifestPath = resolve(repositoryRoot, 'data/generated/manifest.json');
  const manifest = /** @type {{version:number,campusId:string,artifacts:Array<{path:string,bytes:number,sha256:string}>,counts:Record<string,number>}} */ (JSON.parse(await readFile(manifestPath, 'utf8')));
  if (manifest.version !== 1 || !manifest.campusId || !Array.isArray(manifest.artifacts) || manifest.artifacts.length < 8) {
    throw new Error('Generated manifest is incomplete');
  }
  for (const artifact of manifest.artifacts) {
    const path = resolve(repositoryRoot, artifact.path);
    const bytes = await readFile(path);
    if (bytes.byteLength !== artifact.bytes) throw new Error(`${artifact.path} size does not match manifest`);
    if (sha256(bytes) !== artifact.sha256) throw new Error(`${artifact.path} checksum does not match manifest`);
  }

  const [places, graph, scene, collision, worldConfig, custom] = await Promise.all([
    readFile(resolve(repositoryRoot, 'data/generated/places.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'data/generated/navigation-graph.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'data/generated/campus-scene.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'data/generated/collision.geojson'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'data/generated/world-config.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repositoryRoot, 'public/assets/data/custom.geojson'), 'utf8').then(JSON.parse),
  ]);
  if (!Array.isArray(places) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Place or navigation output is invalid');
  if (!Array.isArray(scene.places) || scene.places.length !== places.length) throw new Error('Scene and place catalogs disagree');
  if (worldConfig.campusId !== manifest.campusId || graph.campusId !== manifest.campusId) throw new Error('Generated campus IDs disagree');
  const typedPlaces = /** @type {Array<{id:string}>} */ (places);
  const scenePlaces = /** @type {Array<{id:string}>} */ (scene.places);
  const placeIds = new Set(typedPlaces.map((place) => place.id));
  if (placeIds.size !== typedPlaces.length || scenePlaces.some((place) => !placeIds.has(place.id))) throw new Error('Generated place IDs are not stable across artifacts');
  const customIds = new Set(/** @type {Array<{properties?:{stable_id?:string}}>} */ (custom.features).map((feature) => feature.properties?.stable_id).filter((id) => typeof id === 'string'));
  if (customIds.size !== custom.features.length) throw new Error('Map features do not have unique stable IDs');
  const navigationNodeIds = new Set(/** @type {Array<{id:string}>} */ (graph.nodes).map((node) => node.id));
  if (typedPlaces.some((place) => !customIds.has(place.id))) throw new Error('Place IDs are missing from map features');
  const richPlaces = /** @type {Array<{campusId:string,buildingId?:string,entranceNodeIds:string[]}>} */ (places);
  if (richPlaces.some((place) => place.campusId !== manifest.campusId
    || (place.buildingId !== undefined && !customIds.has(place.buildingId))
    || place.entranceNodeIds.some((nodeId) => !navigationNodeIds.has(nodeId)))) throw new Error('Place references are inconsistent with map or navigation artifacts');
  const sceneItems = /** @type {Array<Array<{id:string}>>} */ ([scene.buildings, scene.roads, scene.water, scene.vegetation]);
  if (sceneItems.flat().some((item) => !customIds.has(item.id))) throw new Error('Scene feature IDs are missing from map features');
  const collisionFeatures = /** @type {Array<{id:string,properties?:{stable_id?:string}}>} */ (collision.features);
  if (collisionFeatures.some((feature) => feature.id !== feature.properties?.stable_id || !customIds.has(feature.id))) throw new Error('Collision IDs are missing from map features');
  if (manifest.counts.places !== places.length
    || manifest.counts.navigationNodes !== graph.nodes.length
    || manifest.counts.navigationEdges !== graph.edges.length
    || manifest.counts.sceneBuildings !== scene.buildings.length
    || manifest.counts.collisions !== collision.features.length) throw new Error('Manifest counts do not match generated artifacts');
  const routablePlaces = /** @type {Array<{name:string,category:string,entranceNodeIds:string[]}>} */ (places);
  const dormitories = routablePlaces.filter((place) => place.entranceNodeIds.length > 0
    && (place.category === 'dormitory' || place.category === 'hostel' || /宿舍|学[一二三四五六七八九]楼|西北|西南/.test(place.name)));
  const teachingBuildings = routablePlaces.filter((place) => place.entranceNodeIds.length > 0 && /教学|教室|学院/.test(place.name));
  const campusRoute = dormitories.flatMap((dormitory) => teachingBuildings.flatMap((teachingBuilding) => dormitory.entranceNodeIds.flatMap((startId) => teachingBuilding.entranceNodeIds.map((endId) => findRoute(graph, startId, endId))))).find(Boolean);
  if (!campusRoute) throw new Error('No basic dormitory-to-teaching walking route was generated');
  validateFeatureCollection(collision, 'data/generated/collision.geojson');
  const pmtilesPath = resolve(repositoryRoot, 'data/generated/tongji.pmtiles');
  const pmtiles = await stat(pmtilesPath);
  if (pmtiles.size < 1_024) throw new Error('Generated PMTiles is empty');
  const { stdout } = await execFileAsync('tippecanoe-decode', ['-Z0', '-z0', pmtilesPath], { maxBuffer: 8 * 1_024 * 1_024 });
  const decoded = JSON.parse(stdout);
  const vectorLayers = JSON.parse(decoded.properties?.json ?? '{}').vector_layers;
  const layerIds = Array.isArray(vectorLayers) ? vectorLayers.map((layer) => layer.id).sort() : [];
  if (JSON.stringify(layerIds) !== JSON.stringify([...MAP_LAYER_ORDER].sort())) throw new Error('Generated PMTiles does not contain the expected nine source layers');
  return { artifactCount: manifest.artifacts.length, placeCount: places.length, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyGeneratedArtifacts();
  console.log(`Generated artifacts verified: ${result.artifactCount} files, ${result.placeCount} places, ${result.nodeCount} nodes, ${result.edgeCount} edges`);
}
