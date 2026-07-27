import { Fn, texture, uv, min, float, vec2 } from "three/tsl";
import {
  NearestFilter,
  NodeMaterial,
  QuadMesh,
  RedFormat,
  RenderTarget,
} from "three/webgpu";

const _quadMesh = new QuadMesh();

/**
 * Builds a min-depth pyramid (Hi-Z) from the scene depth buffer for hierarchical SSR.
 */
export class HiZDepthPyramid {
  constructor(levelCount = 5) {
    this.levelCount = levelCount;
    this.levels = [];
    this.downsampleMaterials = [];
    this.copyMaterial = new NodeMaterial();
    this.initialized = false;
    this._size = { width: 0, height: 0 };
    this._sourceDepthTexture = null;
    this._copySource = null;
  }

  _ensureLevels(width, height) {
    if (
      this.initialized &&
      this._size.width === width &&
      this._size.height === height
    ) {
      return;
    }

    this.dispose();

    let levelWidth = width;
    let levelHeight = height;

    for (let i = 0; i < this.levelCount; i += 1) {
      levelWidth = Math.max(1, Math.round(levelWidth));
      levelHeight = Math.max(1, Math.round(levelHeight));

      const target = new RenderTarget(levelWidth, levelHeight, {
        format: RedFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
      });
      target.texture.name = `HiZDepth_L${i}`;

      this.levels.push(target);

      if (i > 0) {
        const prev = this.levels[i - 1].texture;
        const w = levelWidth;
        const h = levelHeight;
        const material = new NodeMaterial();
        material.fragmentNode = Fn(() => {
          const coord = uv();
          const half = coord.mul(0.5);
          const tl = texture(prev, half).r;
          const tr = texture(prev, half.add(vec2(float(0.5 / w), float(0)))).r;
          const bl = texture(prev, half.add(vec2(float(0), float(0.5 / h)))).r;
          const br = texture(prev, half.add(vec2(float(0.5 / w), float(0.5 / h)))).r;
          return min(min(tl, tr), min(bl, br));
        })();
        this.downsampleMaterials.push(material);
      }

      levelWidth = Math.max(1, Math.floor(levelWidth / 2));
      levelHeight = Math.max(1, Math.floor(levelHeight / 2));
    }

    this.initialized = true;
    this._size.width = width;
    this._size.height = height;
  }

  _rebuildCopyMaterial() {
    const source = this._sourceDepthTexture;
    if (this._copySource === source && this.copyMaterial.fragmentNode) {
      return;
    }

    this._copySource = source;
    this.copyMaterial.fragmentNode = Fn(() => texture(source, uv()).r)();
    this.copyMaterial.needsUpdate = true;
  }

  /**
   * @param {import('three/webgpu').WebGPURenderer} renderer
   * @param {import('three').Texture} sourceDepthTexture
   * @param {number} width
   * @param {number} height
   */
  update(renderer, sourceDepthTexture, width, height) {
    if (!sourceDepthTexture || width < 1 || height < 1) {
      return;
    }

    this._sourceDepthTexture = sourceDepthTexture;
    this._ensureLevels(width, height);
    this._rebuildCopyMaterial();

    _quadMesh.material = this.copyMaterial;
    renderer.setRenderTarget(this.levels[0]);
    _quadMesh.render(renderer);

    for (let i = 1; i < this.levels.length; i += 1) {
      _quadMesh.material = this.downsampleMaterials[i - 1];
      renderer.setRenderTarget(this.levels[i]);
      _quadMesh.render(renderer);
    }

    renderer.setRenderTarget(null);
  }

  getTexture(level = 0) {
    return this.levels[level]?.texture ?? null;
  }

  get maxLevel() {
    return Math.max(0, this.levels.length - 1);
  }

  dispose() {
    for (const level of this.levels) {
      level.dispose();
    }

    for (const material of this.downsampleMaterials) {
      material.dispose();
    }

    this.levels = [];
    this.downsampleMaterials = [];
    this.initialized = false;
    this._size.width = 0;
    this._size.height = 0;
  }
}
