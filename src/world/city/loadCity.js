import { buildModelBvh } from "../bvh.js";
import { getGltfLoader } from "../loaders/createGltfLoaders.js";

const CITY_PATH = "/models/cyberpunk_compressed.glb";

/** Vertical offset applied to the loaded root. */
export const CITY_OFFSET_Y = -20;

export async function loadCityModel(renderer) {
  const gltfLoader = getGltfLoader(renderer);
  const gltf = await gltfLoader.loadAsync(CITY_PATH);
  const city = gltf.scene;

  city.position.y = CITY_OFFSET_Y;

  // Shadows on for everything for now; trim per-object later.
  city.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });

  // City-scale meshes make naive raycasts unusable in walk mode.
  buildModelBvh(city);

  return city;
}
