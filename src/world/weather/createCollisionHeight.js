import * as THREE from "three/webgpu";
import { float, positionWorld, uniform, vec2, vec4 } from "three/tsl";
import { performanceProfile } from "../../platform/performanceProfile.js";

class CollisionHeight {
  constructor({ width, height, depth, resolution }) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.position = new THREE.Vector3();

    const halfW = width / 2;
    const halfH = height / 2;

    this.camera = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.1,
      depth,
    );

    this.renderTarget = new THREE.RenderTarget(resolution, resolution);
    this.renderTarget.texture.type = THREE.HalfFloatType;
    this.renderTarget.texture.magFilter = THREE.NearestFilter;
    this.renderTarget.texture.minFilter = THREE.NearestFilter;
    this.renderTarget.texture.generateMipmaps = false;

    this.material = new THREE.MeshBasicNodeMaterial();
    this.material.outputNode = vec4(positionWorld, 1);

    this._positionNode = uniform(this.position);
    this._frameCounter = 0;
  }

  getPosition(uvNode) {
    const w = float(this.width);
    const h = float(this.height);

    const worldX = uvNode.x
      .mul(w)
      .add(this._positionNode.x.sub(w.div(2)));
    const worldZ = uvNode.y
      .mul(h)
      .add(this._positionNode.z.sub(h.div(2)));

    return vec2(worldX, worldZ);
  }

  getUV(worldPos) {
    const halfW = float(this.width / 2);
    const halfH = float(this.height / 2);

    const u = worldPos.x
      .sub(this._positionNode.x)
      .add(halfW)
      .div(float(this.width));
    const v = worldPos.z
      .sub(this._positionNode.z)
      .add(halfH)
      .div(float(this.height));

    return vec2(u, v);
  }

  dispose() {
    this.renderTarget.dispose();
    this.material.dispose();
  }
}

export function createCollisionHeight({
  scene,
  renderer,
  width = 100,
  height = 100,
  depth = 80,
  resolution = performanceProfile.collisionRainResolution,
  cameraHeight = 50,
} = {}) {
  const collision = new CollisionHeight({ width, height, depth, resolution });
  let frameCounter = 0;

  function update({ camera, hideObjects = [] } = {}) {
    if (!camera) {
      return;
    }

    frameCounter += 1;
    const frameSkip = Math.max(
      1,
      performanceProfile.collisionRainFrameSkip ?? 1,
    );
    if (frameCounter % frameSkip !== 0) {
      return;
    }

    collision.position.set(camera.position.x, cameraHeight, camera.position.z);

    collision.camera.position.set(
      collision.position.x,
      collision.position.y,
      collision.position.z,
    );
    collision.camera.lookAt(collision.position.x, 0, collision.position.z);
    collision.camera.updateMatrixWorld(true);

    const visibilityStates = hideObjects
      .filter(Boolean)
      .map((object) => ({ object, visible: object.visible }));

    for (const { object } of visibilityStates) {
      object.visible = false;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevMRT = renderer.getMRT?.() ?? null;
    const prevOverride = scene.overrideMaterial;

    scene.overrideMaterial = collision.material;
    renderer.setMRT?.(null);
    renderer.setRenderTarget(collision.renderTarget);
    renderer.render(scene, collision.camera);

    renderer.setMRT?.(prevMRT);
    renderer.setRenderTarget(prevTarget);
    scene.overrideMaterial = prevOverride;

    for (const { object, visible } of visibilityStates) {
      object.visible = visible;
    }
  }

  function dispose() {
    collision.dispose();
  }

  return {
    collision,
    renderTarget: collision.renderTarget,
    getUV: (worldPos) => collision.getUV(worldPos),
    getPosition: (uvNode) => collision.getPosition(uvNode),
    update,
    dispose,
  };
}
