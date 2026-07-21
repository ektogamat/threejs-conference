import {
  Box3,
  BoxGeometry,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
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

const MODEL_PATH = "/models/cyberpunk_compressed.glb";
const QUADRA_PATH = "/models/quadra.glb";

/** Vertical offset applied to the loaded root. */
export const MODEL_OFFSET_Y = -20;

/** Alley placement near the free-camera start. */
export const QUADRA_START = {
  position: [-128, -5.47, 33],
  rotationY: Math.PI / 2 + 0.6,
  scale: 1.26,
};

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
 * Invisible box used for walk walls. High-poly car meshes stay out of
 * ground probes (firstHitOnly=false) so they cannot stall the frame.
 */
function createCarCollider(car) {
  car.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(car);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  const collider = new Mesh(
    new BoxGeometry(size.x, size.y, size.z),
    new MeshBasicMaterial(),
  );
  collider.name = "quadra-collider";
  collider.position.copy(center);
  collider.visible = false;
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
