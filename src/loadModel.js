import {
  DataTexture,
  LinearFilter,
  RGBAFormat,
  RGBFormat,
  RGFormat,
  RedFormat,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { buildModelBvh } from "./bvh.js";

const MODEL_PATH = "/models/cyberpunk_compressed.glb";

/** Vertical offset applied to the loaded root. */
export const MODEL_OFFSET_Y = -20;

export function getMeshMaterials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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

  dracoLoader?.dispose?.();
  ktx2Loader?.dispose();

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
