import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateCollision } from '../src/compiler/collision.mjs';
import { findRoute, generateNavigationGraph } from '../src/compiler/navigation.mjs';
import { pointInPolygon, segmentCrossesAreaFeature } from '../src/compiler/geo.mjs';
import { lngLatToScene, sceneToLngLat } from '../src/compiler/projection.mjs';
import { stableFeatureId } from '../src/compiler/stable-ids.mjs';

const config = {
  version: 1,
  campusId: 'tongji-siping',
  origin: { longitude: 121.5, latitude: 31.28 },
  bounds: { west: 121.49, south: 31.27, east: 121.51, north: 31.29 },
  metersPerSceneUnit: 1,
  rotationDegrees: 0,
  coordinatePrecision: 3,
  navigation: { entranceConnectionMeters: 55, placeConnectionMeters: 250, minimumEdgeMeters: 0.15 },
};

describe('campus world compiler', () => {
  it('round-trips local scene coordinates within a strict WGS84 threshold', () => {
    const scene = lngLatToScene(121.50321, 31.28654, config);
    const lngLat = sceneToLngLat(scene.x, scene.y, config);
    assert.ok(Math.abs(lngLat.longitude - 121.50321) < 1e-9);
    assert.ok(Math.abs(lngLat.latitude - 31.28654) < 1e-9);
  });

  it('prefers explicit and OSM IDs without using names', () => {
    const stableMap = { version: 1, ids: {} };
    assert.equal(stableFeatureId({ type: 'Feature', id: 'way/42', geometry: { type: 'Point', coordinates: [121.5, 31.28] }, properties: { name: '任意名称' } }, config.campusId, stableMap), 'tongji-siping-way-42');
    assert.equal(stableFeatureId({ type: 'Feature', geometry: { type: 'Point', coordinates: [121.5, 31.28] }, properties: { stable_id: 'library-main', name: '名称可变' } }, config.campusId, stableMap), 'tongji-siping-library-main');
    assert.equal(stableFeatureId({ type: 'Feature', geometry: { type: 'Point', coordinates: [121.501, 31.28] }, properties: { stable_id: '图书馆-主楼' } }, config.campusId, stableMap), 'tongji-siping-图书馆-主楼');
    const generated = stableFeatureId({ type: 'Feature', geometry: { type: 'Point', coordinates: [121.502, 31.282] }, properties: { name: '旧名称' } }, config.campusId, stableMap);
    assert.equal(stableFeatureId({ type: 'Feature', geometry: { type: 'Point', coordinates: [121.502, 31.282] }, properties: { name: '新名称' } }, config.campusId, stableMap), generated);
    assert.equal(Object.keys(stableMap.ids).length, 1);
  });

  it('does not treat a distant point as lying on a short polygon edge', () => {
    const polygon = [[[121.4924662, 31.2864686], [121.4931679, 31.2864685], [121.4931679, 31.2869385], [121.4924662, 31.2864686]]];
    assert.equal(pointInPolygon([121.5012, 31.2825], polygon), false);
  });

  it('detects a narrow obstacle between coarse segment samples', () => {
    const obstacle = /** @type {{type:'Feature',geometry:{type:string,coordinates:number[][][]},properties:Record<string,unknown>}} */ ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0.49, -0.1], [0.51, -0.1], [0.51, 0.1], [0.49, 0.1], [0.49, -0.1]]] },
      properties: { building: 'yes' },
    });
    assert.equal(segmentCrossesAreaFeature([0, 0], [1, 0], obstacle), true);
    assert.equal(segmentCrossesAreaFeature([0, 0.2], [1, 0.2], obstacle), false);
  });

  it('splits crossing walkways into a connected intersection', () => {
    /** @type {Array<{type:'Feature',id:string,geometry:{type:string,coordinates:number[][]},properties:Record<string,unknown>}>} */
    const features = [
      { type: 'Feature', id: 'way/1', geometry: { type: 'LineString', coordinates: [[121.499, 31.28], [121.501, 31.28]] }, properties: { highway: 'footway' } },
      { type: 'Feature', id: 'way/2', geometry: { type: 'LineString', coordinates: [[121.5, 31.279], [121.5, 31.281]] }, properties: { highway: 'path' } },
    ];
    const graph = generateNavigationGraph(features, new Map([['way/1', 'tongji-siping-way-1'], ['way/2', 'tongji-siping-way-2']]), config);
    const center = graph.nodes.find((node) => Math.abs(node.longitude - 121.5) < 1e-7 && Math.abs(node.latitude - 31.28) < 1e-7);
    assert.ok(center);
    assert.equal(graph.edges.filter((edge) => edge.from === center.id).length, 4);
  });

  it('excludes stairs from wheelchair routing', () => {
    /** @type {Array<{id:string,longitude:number,latitude:number,x:number,y:number,kind:'path'|'entrance'}>} */
    const nodes = [
      { id: 'a', longitude: 0, latitude: 0, x: 0, y: 0, kind: 'path' },
      { id: 'b', longitude: 0, latitude: 0, x: 1, y: 0, kind: 'path' },
      { id: 'c', longitude: 0, latitude: 0, x: 0, y: 2, kind: 'path' },
    ];
    /** @param {string} id @param {string} from @param {string} to @param {number} distance @param {boolean} wheelchair @param {boolean} stairs */
    const edge = (id, from, to, distance, wheelchair, stairs) => ({ id, from, to, distance, walking: true, cycling: false, wheelchair, stairs, covered: false, indoor: false, surface: null, access: null, sourceId: id });
    const graph = { nodes, edges: [edge('stairs', 'a', 'b', 1, false, true), edge('ramp-1', 'a', 'c', 2, true, false), edge('ramp-2', 'c', 'b', 2, true, false)] };
    assert.deepEqual(findRoute(graph, 'a', 'b')?.nodeIds, ['a', 'b']);
    assert.deepEqual(findRoute(graph, 'a', 'b', { wheelchair: true })?.nodeIds, ['a', 'c', 'b']);
  });

  it('closes polygon rings in generated collision data', () => {
    /** @type {{type:'Feature',id:string,geometry:{type:string,coordinates:number[][][]},properties:Record<string,unknown>}} */
    const feature = { type: 'Feature', id: 'way/9', geometry: { type: 'Polygon', coordinates: [[[121.5, 31.28], [121.501, 31.28], [121.501, 31.281], [121.5, 31.281]]] }, properties: { building: 'yes' } };
    const collision = generateCollision([feature], new Map([['way/9', 'tongji-siping-way-9']]), config);
    const collisionFeature = collision.features[0];
    assert.ok(collisionFeature);
    const ring = /** @type {number[][]} */ (/** @type {number[][][]} */ (collisionFeature.geometry.coordinates)[0]);
    assert.deepEqual(ring[0], ring.at(-1));
  });
});
