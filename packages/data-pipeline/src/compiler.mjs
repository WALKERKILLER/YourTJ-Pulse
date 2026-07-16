import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validateFeatureCollection } from './validate.mjs';
import { classifyFeatures, MAP_LAYER_ORDER } from './compiler/classify.mjs';
import { loadWorldConfig, publicWorldConfig } from './compiler/config.mjs';
import { generateCollision } from './compiler/collision.mjs';
import { generateNavigationGraph } from './compiler/navigation.mjs';
import { generatePlaces } from './compiler/places.mjs';
import { generateCampusScene } from './compiler/scene.mjs';
import { featureLookupKey, stableFeatureId } from './compiler/stable-ids.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const generatedRoot = resolve(repositoryRoot, 'data/generated');
const sourcePath = resolve(repositoryRoot, 'data/full.geojson');
const stableMapPath = resolve(repositoryRoot, 'data/stable-id-map.json');
const outputPaths = {
  places: resolve(generatedRoot, 'places.json'),
  worldConfig: resolve(generatedRoot, 'world-config.json'),
  navigation: resolve(generatedRoot, 'navigation-graph.json'),
  scene: resolve(generatedRoot, 'campus-scene.json'),
  collision: resolve(generatedRoot, 'collision.geojson'),
  pmtiles: resolve(generatedRoot, 'tongji.pmtiles'),
  manifest: resolve(generatedRoot, 'manifest.json'),
  custom: resolve(repositoryRoot, 'public/assets/data/custom.geojson'),
  rootPmtiles: resolve(repositoryRoot, 'tongji.pmtiles'),
};

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} path @param {string|Buffer} contents */
async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, path);
}

/** @param {string} path @param {unknown} value */
async function writeJson(path, value) {
  await writeAtomic(path, `${JSON.stringify(value)}\n`);
}

/**
 * @param {string} command
 * @param {string[]} argumentsList
 * @param {string} cwd
 */
async function run(command, argumentsList, cwd) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, argumentsList, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise(undefined) : reject(new Error(`${command} exited with status ${String(code)}`)));
  });
}

/** @param {string} temporaryRoot @param {Record<string,{type:'FeatureCollection',features:unknown[]}>} layers */
async function buildPmtiles(temporaryRoot, layers) {
  const layerPaths = [];
  for (const layerName of MAP_LAYER_ORDER) {
    const layerPath = resolve(temporaryRoot, `${layerName}.geojson`);
    const layer = layers[layerName];
    if (!layer) throw new Error(`Missing classified layer ${layerName}`);
    const tileLayer = {
      ...layer,
      features: layer.features.map((feature) => {
        if (!feature || typeof feature !== 'object') throw new Error(`Invalid feature in classified layer ${layerName}`);
        return Object.fromEntries(Object.entries(/** @type {Record<string,unknown>} */ (feature)).filter(([key]) => key !== 'id'));
      }),
    };
    await writeJson(layerPath, tileLayer);
    layerPaths.push('-L', `${layerName}:${layerName}.geojson`);
  }
  const temporaryOutput = resolve(temporaryRoot, 'tongji.pmtiles');
  await run('tippecanoe', [
    '-o', 'tongji.pmtiles',
    '-Z0', '-z14',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--preserve-input-order',
    '--quiet',
    '--force',
    ...layerPaths,
  ], temporaryRoot);
  const metadata = await stat(temporaryOutput);
  if (metadata.size < 1_024) throw new Error('tippecanoe produced an unexpectedly small PMTiles file');
  const bytes = await readFile(temporaryOutput);
  await writeAtomic(outputPaths.pmtiles, bytes);
  await writeAtomic(outputPaths.rootPmtiles, bytes);
}

/** @param {string} path */
async function artifactMetadata(path) {
  const bytes = await readFile(path);
  return {
    path: relative(repositoryRoot, path).replaceAll('\\', '/'),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

export async function compileCampusWorld() {
  const startedAt = performance.now();
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'yourtj-world-'));
  try {
    const [sourceContents, stableMapContents, config] = await Promise.all([
      readFile(sourcePath, 'utf8'),
      readFile(stableMapPath, 'utf8'),
      loadWorldConfig(repositoryRoot),
    ]);
    const source = /** @type {{type:'FeatureCollection',features:Array<{type:'Feature',id?:string|number,geometry:{type:string,coordinates:unknown},properties?:Record<string,unknown>|null}>}} */ (JSON.parse(sourceContents));
    const validation = validateFeatureCollection(source, 'data/full.geojson');
    const stableMap = /** @type {{version:number,ids:Record<string,string>}} */ (JSON.parse(stableMapContents));
    /** @type {Map<string,string>} */
    const stableIds = new Map();
    const seenStableIds = new Set();
    for (const feature of source.features) {
      const lookupKey = featureLookupKey(feature);
      const stableId = stableFeatureId(feature, config.campusId, stableMap);
      if (seenStableIds.has(stableId)) throw new Error(`Stable id collision: ${stableId}`);
      seenStableIds.add(stableId);
      stableIds.set(lookupKey, stableId);
    }

    const classified = classifyFeatures(source.features, stableIds);
    const navigation = generateNavigationGraph(source.features, stableIds, config);
    const places = generatePlaces(source.features, stableIds, navigation, config);
    const scene = generateCampusScene(source.features, stableIds, places, config);
    const collision = generateCollision(source.features, stableIds, config);

    await Promise.all([
      writeJson(outputPaths.worldConfig, publicWorldConfig(config)),
      writeJson(outputPaths.places, places),
      writeJson(outputPaths.navigation, navigation),
      writeJson(outputPaths.scene, scene),
      writeJson(outputPaths.collision, collision),
      writeJson(outputPaths.custom, classified.custom),
      writeJson(stableMapPath, stableMap),
    ]);
    await buildPmtiles(temporaryRoot, classified.layers);

    const artifactPaths = [
      outputPaths.worldConfig,
      outputPaths.places,
      outputPaths.navigation,
      outputPaths.scene,
      outputPaths.collision,
      outputPaths.pmtiles,
      outputPaths.custom,
      outputPaths.rootPmtiles,
    ];
    const artifacts = (await Promise.all(artifactPaths.map(artifactMetadata))).sort((left, right) => left.path.localeCompare(right.path));
    const manifest = {
      version: 1,
      compilerVersion: '1.0.0',
      campusId: config.campusId,
      source: {
        path: relative(repositoryRoot, sourcePath).replaceAll('\\', '/'),
        bytes: Buffer.byteLength(sourceContents),
        sha256: sha256(sourceContents),
        featureCount: validation.featureCount,
      },
      configSha256: sha256(JSON.stringify(config)),
      counts: {
        places: places.length,
        navigationNodes: navigation.nodes.length,
        navigationEdges: navigation.edges.length,
        sceneBuildings: scene.buildings.length,
        collisions: collision.features.length,
      },
      artifacts,
    };
    await writeJson(outputPaths.manifest, manifest);
    console.log(`Campus world: ${places.length} places, ${navigation.nodes.length} nodes, ${navigation.edges.length} directed edges`);
    console.log(`Generated ${artifacts.length} artifacts in ${Math.round(performance.now() - startedAt)} ms`);
    return manifest;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function verifyCompilerTools() {
  await access(sourcePath, constants.R_OK);
  await run('tippecanoe', ['--version'], repositoryRoot);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyCompilerTools();
  await compileCampusWorld();
}
