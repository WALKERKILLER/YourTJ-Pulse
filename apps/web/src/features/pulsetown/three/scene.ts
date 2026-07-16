import * as THREE from 'three';
import sceneData from '../../../../../../data/generated/campus-scene.json';
import type { PulseQuality } from '../quality';

export interface AvatarSnapshot {
  headingDegrees: number;
  state: 'idle' | 'walk' | 'run';
  x: number;
  y: number;
}

export interface PrototypeOptions {
  avatarAnimation: boolean;
  particles: boolean;
  quality: PulseQuality;
  shadows: boolean;
  weather: boolean;
}

interface SceneFeature {
  geometry: { coordinates: number[][] | number[][][]; type: 'LineString' | 'Polygon' };
  id: string;
  properties: Record<string, unknown>;
}

interface CampusSceneData {
  buildings: SceneFeature[];
  roads: SceneFeature[];
}

const prototypeBounds = { minX: -680, maxX: 10, minY: 285, maxY: 485 };
const campusScene = sceneData as unknown as CampusSceneData;

function polygonRing(feature: SceneFeature): number[][] {
  return feature.geometry.type === 'Polygon' ? (feature.geometry.coordinates as number[][][])[0] ?? [] : [];
}

function withinPrototype(feature: SceneFeature): boolean {
  const coordinates = feature.geometry.type === 'Polygon' ? polygonRing(feature) : feature.geometry.coordinates as number[][];
  if (!coordinates.length) return false;
  const bounds = coordinates.reduce((value, [x = 0, y = 0]) => ({
    minX: Math.min(value.minX, x), maxX: Math.max(value.maxX, x), minY: Math.min(value.minY, y), maxY: Math.max(value.maxY, y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  return bounds.maxX >= prototypeBounds.minX && bounds.minX <= prototypeBounds.maxX
    && bounds.maxY >= prototypeBounds.minY && bounds.minY <= prototypeBounds.maxY;
}

function buildingHeight(feature: SceneFeature): number {
  const levels = Number(feature.properties['building:levels']);
  return Number.isFinite(levels) && levels > 0 ? Math.min(36, levels * 3.2) : 9;
}

function avatarTexture(state: AvatarSnapshot['state'], direction: 'up' | 'down' | 'left' | 'right', frame: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 24;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_2D_UNAVAILABLE');
  context.imageSmoothingEnabled = false;
  const stride = state === 'idle' ? 0 : frame ? 1 : -1;
  context.fillStyle = '#f4efe4';
  context.fillRect(5, 1, 6, 5);
  context.fillStyle = '#d9d2c4';
  context.fillRect(direction === 'left' ? 4 : 5, 2, 7, 2);
  context.fillStyle = state === 'run' ? '#e24b74' : '#167765';
  context.fillRect(4, 7, 8, 9);
  context.fillStyle = '#1d2a25';
  context.fillRect(direction === 'left' ? 5 : direction === 'right' ? 9 : 6, 4, 2, 1);
  context.fillRect(4 + stride, 16, 3, 7);
  context.fillRect(9 - stride, 16, 3, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function directionForHeading(heading: number): 'up' | 'down' | 'left' | 'right' {
  const normalized = (heading + 360) % 360;
  if (normalized >= 45 && normalized < 135) return 'right';
  if (normalized >= 135 && normalized < 225) return 'down';
  if (normalized >= 225 && normalized < 315) return 'left';
  return 'up';
}

export class PrototypeScene {
  readonly scene = new THREE.Scene();
  private readonly avatar: THREE.Sprite;
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private avatarSnapshot: AvatarSnapshot;
  private lastTextureKey = '';

  constructor(private readonly options: PrototypeOptions, initialAvatar: AvatarSnapshot) {
    this.avatarSnapshot = initialAvatar;
    this.scene.fog = new THREE.FogExp2(0xb8c7bd, options.quality === 'high' ? 0.0015 : 0.0023);
    this.scene.add(new THREE.HemisphereLight(0xfff4d6, 0x455a50, 2.2));
    const sun = new THREE.DirectionalLight(0xffd7a1, options.quality === 'high' ? 3.6 : 2.4);
    sun.position.set(-120, -60, 260);
    sun.castShadow = options.shadows && options.quality === 'high';
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(720, 230),
      new THREE.MeshStandardMaterial({ color: 0x718d75, roughness: 1, transparent: true, opacity: 0.82 }),
    );
    grass.position.set(-335, 385, -0.6);
    grass.receiveShadow = sun.castShadow;
    this.scene.add(grass);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(28, options.quality === 'high' ? 40 : 18),
      new THREE.MeshStandardMaterial({ color: 0x5c8c9b, metalness: 0.15, roughness: 0.28, transparent: true, opacity: 0.8 }),
    );
    water.scale.set(1.8, 0.7, 1);
    water.position.set(-340, 448, 0.15);
    this.scene.add(water);

    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c7a5, roughness: 0.82, metalness: 0.02 });
    for (const building of campusScene.buildings.filter(withinPrototype).slice(0, options.quality === 'high' ? 80 : 42)) {
      const ring = polygonRing(building);
      if (ring.length < 4) continue;
      const shape = new THREE.Shape();
      ring.forEach(([x = 0, y = 0], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: buildingHeight(building), bevelEnabled: false }), buildingMaterial);
      mesh.castShadow = sun.castShadow;
      mesh.receiveShadow = sun.castShadow;
      this.scene.add(mesh);
    }

    const roadMaterial = new THREE.LineBasicMaterial({ color: 0xd5d0c2, transparent: true, opacity: 0.9 });
    for (const road of campusScene.roads.filter(withinPrototype)) {
      const coordinates = road.geometry.coordinates as number[][];
      const geometry = new THREE.BufferGeometry().setFromPoints(coordinates.map(([x = 0, y = 0]) => new THREE.Vector3(x, y, 0.3)));
      this.scene.add(new THREE.Line(geometry, roadMaterial));
    }

    if (options.weather && options.particles && options.quality !== 'low') {
      const positions: number[] = [];
      const count = options.quality === 'high' ? 260 : 90;
      for (let index = 0; index < count; index += 1) {
        positions.push(-670 + (index * 97) % 670, 300 + (index * 53) % 180, 18 + (index * 31) % 80);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf3f0dd, size: 1.4, transparent: true, opacity: 0.55 })));
    }

    this.avatar = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: true }));
    this.avatar.scale.set(14, 20, 1);
    this.scene.add(this.avatar);
    this.updateAvatar(initialAvatar, 0);
  }

  updateAvatar(snapshot: AvatarSnapshot, timestamp: number): void {
    this.avatarSnapshot = snapshot;
    this.avatar.visible = true;
    this.avatar.position.set(snapshot.x, snapshot.y, 11);
    const frame = this.options.avatarAnimation && snapshot.state !== 'idle' ? Math.floor(timestamp / (snapshot.state === 'run' ? 110 : 180)) % 2 : 0;
    const key = `${snapshot.state}-${directionForHeading(snapshot.headingDegrees)}-${frame}`;
    if (key === this.lastTextureKey) return;
    if (!this.textures.has(key)) this.textures.set(key, avatarTexture(snapshot.state, directionForHeading(snapshot.headingDegrees), frame));
    (this.avatar.material as THREE.SpriteMaterial).map = this.textures.get(key) ?? null;
    (this.avatar.material as THREE.SpriteMaterial).needsUpdate = true;
    this.lastTextureKey = key;
  }

  dispose(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
