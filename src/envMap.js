import * as THREE from "three/webgpu";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const DEFAULT_HDR_URL = "/hdri/sunflowers_puresky_1k.hdr";

export async function loadEnvironmentMap(url = DEFAULT_HDR_URL) {
  const loader = new HDRLoader();
  const texture = await loader.loadAsync(url);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

export function applyEnvironmentMap(
  scene,
  renderer,
  texture,
  { intensity = 1 } = {},
) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;

  pmremGenerator.dispose();

  scene.environment = envMap;
  scene.environmentIntensity = intensity;

  return { envMap, hdrTexture: texture };
}
