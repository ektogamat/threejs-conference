import {
  Box3,
  BoxGeometry,
  DataTexture,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RGBAFormat,
  RGBFormat,
  RGFormat,
  RedFormat,
  Vector3,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { buildModelBvh, installBvhRaycast } from "./bvh.js";

const MODEL_PATH = "/models/cyberpunk.glb";
const QUADRA_PATH = "/models/quadra.glb";
export const PLANE_PATH = "/models/plane.glb";

/** Vertical offset applied to the loaded root. */
export const MODEL_OFFSET_Y = -20;

/** Alley placement near the free-camera start. */
export const QUADRA_START = {
  position: [-128, -5.47, 33],
  rotationY: Math.PI / 2 + 0.6,
  scale: 1.1,
};

/** Extra XZ padding around the car walk hitbox (meters). */
const CAR_COLLIDER_PAD_XZ = 0.45;
/**
 * Minimum collider height so eye/chest walk rays cannot skim over the roof.
 * Expanded upward from the local bottom.
 */
const CAR_COLLIDER_MIN_HEIGHT = 2.2;

export function getMeshMaterials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/**
 * Transmission allocates HalfFloat screen RTs per camera. With beauty + rain
 * + ground mirror cameras that thrashing hits WebGPU ("Destroyed texture
 * used in a submit"). Cheap glass is enough for a parked prop.
 */
function simplifyCarGlassMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    for (const material of getMeshMaterials(child)) {
      if (!material || !(material.transmission > 0)) {
        continue;
      }

      material.transmission = 0;
      material.thickness = 0;
      material.attenuationDistance = Infinity;
      material.transparent = true;
      material.opacity =
        material.opacity > 0 && material.opacity < 1 ? material.opacity : 0.35;
      material.depthWrite = false;
      material.roughness = Math.max(material.roughness ?? 0, 0.08);
      material.metalness = 0;
      material.needsUpdate = true;
    }
  });
}

export function findMeshByName(root, name) {
  let mesh = null;

  root.traverse((child) => {
    if (mesh || !child.isMesh || child.name !== name) {
      return;
    }

    mesh = child;
  });

  return mesh;
}

const UNCOMPRESSED_FORMATS = new Set([
  RGBAFormat,
  RGBFormat,
  RGFormat,
  RedFormat,
]);

let dracoLoader;
let ktx2Loader;
let gltfLoader;

// KTX2 RGBA fallback still wraps as CompressedTexture; WebGPU needs DataTexture.
// Only runs for uncompressed formats — GPU-compressed (BC/ETC/ASTC) pass through.
function patchKTX2UncompressedTextures() {
  if (patchKTX2UncompressedTextures.applied) {
    return;
  }

  const createTextureFrom = KTX2Loader.prototype._createTextureFrom;

  KTX2Loader.prototype._createTextureFrom = function (
    transcodeResult,
    container,
  ) {
    const texture = createTextureFrom.call(this, transcodeResult, container);

    if (
      !texture.isCompressedTexture ||
      !UNCOMPRESSED_FORMATS.has(texture.format)
    ) {
      return texture;
    }

    const mip = texture.mipmaps[0];
    const dataTexture = new DataTexture(
      mip.data,
      mip.width,
      mip.height,
      texture.format,
      texture.type,
    );

    dataTexture.minFilter = LinearFilter;
    dataTexture.magFilter = LinearFilter;
    dataTexture.colorSpace = texture.colorSpace;
    dataTexture.premultiplyAlpha = texture.premultiplyAlpha;
    dataTexture.wrapS = texture.wrapS;
    dataTexture.wrapT = texture.wrapT;
    dataTexture.needsUpdate = true;

    return dataTexture;
  };

  patchKTX2UncompressedTextures.applied = true;
}

function initLoaders(renderer) {
  patchKTX2UncompressedTextures();

  // Avoid disposing mid-flight when city + car load in parallel.
  if (gltfLoader) {
    return;
  }

  dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/libs/draco/");

  ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath("/libs/basis/");
  // Keep hardware compression (BC/ETC2/ASTC). Do NOT force RGBA32 —
  // that was the walk-mode FPS collapse from texture bandwidth.
  ktx2Loader.detectSupport(renderer);

  gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);
}

export async function loadLoftModel(renderer) {
  initLoaders(renderer);

  const gltf = await gltfLoader.loadAsync(MODEL_PATH);
  const model = gltf.scene;

  model.position.y = MODEL_OFFSET_Y;

  // Shadows on for everything for now; trim per-object later.
  model.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });

  // City-scale meshes make naive raycasts unusable in walk mode.
  buildModelBvh(model);

  return model;
}

/**
 * Invisible oriented box used for walk walls. High-poly car meshes stay out of
 * ground probes (firstHitOnly=false) so they cannot stall the frame.
 */
function createCarCollider(car) {
  car.updateWorldMatrix(true, true);

  const localBox = new Box3();
  const meshBox = new Box3();
  const meshToCar = new Matrix4();
  const invCarWorld = new Matrix4().copy(car.matrixWorld).invert();

  car.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    const geometry = child.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    meshBox.copy(geometry.boundingBox);
    meshToCar.multiplyMatrices(invCarWorld, child.matrixWorld);
    meshBox.applyMatrix4(meshToCar);
    localBox.union(meshBox);
  });

  if (localBox.isEmpty()) {
    // Fallback: axis-aligned world box (no car-local meshes found).
    const worldBox = new Box3().setFromObject(car);
    const size = worldBox.getSize(new Vector3());
    const center = worldBox.getCenter(new Vector3());
    size.x += CAR_COLLIDER_PAD_XZ * 2;
    size.z += CAR_COLLIDER_PAD_XZ * 2;
    const bottom = worldBox.min.y;
    size.y = Math.max(size.y + 0.2, CAR_COLLIDER_MIN_HEIGHT);
    center.y = bottom + size.y * 0.5;

    const fallback = new Mesh(
      new BoxGeometry(size.x, size.y, size.z),
      new MeshBasicMaterial(),
    );
    fallback.name = "quadra-collider";
    fallback.visible = false;
    fallback.position.copy(center);
    fallback.geometry.computeBoundsTree();
    return fallback;
  }

  const size = localBox.getSize(new Vector3());
  const localCenter = localBox.getCenter(new Vector3());

  size.x += CAR_COLLIDER_PAD_XZ * 2;
  size.z += CAR_COLLIDER_PAD_XZ * 2;

  const localBottom = localBox.min.y;
  size.y = Math.max(size.y + 0.2, CAR_COLLIDER_MIN_HEIGHT);
  localCenter.y = localBottom + size.y * 0.5;

  const collider = new Mesh(
    new BoxGeometry(size.x, size.y, size.z),
    new MeshBasicMaterial(),
  );
  collider.name = "quadra-collider";
  collider.visible = false;

  // Match car pose: local sizes × car scale = world hitbox.
  localCenter.applyMatrix4(car.matrixWorld);
  collider.position.copy(localCenter);
  collider.quaternion.copy(car.getWorldQuaternion(new Quaternion()));
  collider.scale.copy(car.scale);
  collider.updateMatrixWorld(true);
  collider.geometry.computeBoundsTree();

  return collider;
}

export async function loadQuadraCar(renderer) {
  initLoaders(renderer);

  const gltf = await gltfLoader.loadAsync(QUADRA_PATH);
  const car = gltf.scene;

  car.position.set(...QUADRA_START.position);
  car.rotation.y = QUADRA_START.rotationY;
  car.scale.set(QUADRA_START.scale, QUADRA_START.scale, QUADRA_START.scale);
  car.updateWorldMatrix(true, true);
  simplifyCarGlassMaterials(car);

  car.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
  });

  buildModelBvh(car);

  installBvhRaycast();
  const collider = createCarCollider(car);

  return { car, collider };
}

export async function loadPlaneModel(renderer) {
  initLoaders(renderer);

  const gltf = await gltfLoader.loadAsync(PLANE_PATH);
  return gltf.scene;
}
