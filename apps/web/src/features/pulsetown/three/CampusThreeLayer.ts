import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl';
import * as THREE from 'three';
import worldConfig from '../../../../../../data/generated/world-config.json';
import { PrototypeScene, type AvatarSnapshot, type PrototypeOptions } from './scene';

export class CampusThreeLayer implements CustomLayerInterface {
  readonly id = 'pulsetown-hd2d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private camera: THREE.Camera | null = null;
  private map: MapLibreMap | null = null;
  private prototype: PrototypeScene | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private avatar: AvatarSnapshot;
  private readonly contextLost = (event: Event) => {
    event.preventDefault();
    this.onUnavailable('WebGL context lost');
  };
  private readonly contextRestored = () => {
    this.renderer?.resetState();
    this.map?.triggerRepaint();
  };

  constructor(private readonly options: PrototypeOptions, initialAvatar: AvatarSnapshot, private readonly onUnavailable: (reason: string) => void) {
    this.avatar = initialAvatar;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.dispose();
    this.map = map;
    this.camera = new THREE.Camera();
    this.prototype = new PrototypeScene(this.options, this.avatar);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: this.options.quality === 'high' });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = this.options.shadows && this.options.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    map.getCanvas().addEventListener('webglcontextlost', this.contextLost);
    map.getCanvas().addEventListener('webglcontextrestored', this.contextRestored);
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    if (!this.camera || !this.renderer || !this.prototype || !this.map) return;
    const origin = maplibregl.MercatorCoordinate.fromLngLat([worldConfig.origin.longitude, worldConfig.origin.latitude], 0);
    const scale = origin.meterInMercatorCoordinateUnits() / worldConfig.metersPerSceneUnit;
    const matrix = new THREE.Matrix4().fromArray(input.modelViewProjectionMatrix as unknown as number[])
      .multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z))
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix.copy(matrix);
    this.prototype.updateAvatar(this.avatar, performance.now());
    this.renderer.resetState();
    this.renderer.render(this.prototype.scene, this.camera);
    if (this.options.avatarAnimation) this.map.triggerRepaint();
  }

  updateAvatar(avatar: AvatarSnapshot): void {
    this.avatar = avatar;
    this.map?.triggerRepaint();
  }

  onRemove(): void {
    this.dispose();
  }

  private dispose(): void {
    const canvas = this.map?.getCanvas();
    canvas?.removeEventListener('webglcontextlost', this.contextLost);
    canvas?.removeEventListener('webglcontextrestored', this.contextRestored);
    this.prototype?.dispose();
    this.renderer?.dispose();
    this.prototype = null;
    this.renderer = null;
    this.camera = null;
    this.map = null;
  }
}
