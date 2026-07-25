import { buildModelBvh } from "../bvh.js";
import { getGltfLoader } from "../loaders/createGltfLoaders.js";

const CITY_PATH = "/models/cyberpunk_compressed.glb";
const BOUNDS_COLLIDER_PATH = "/models/colider.glb";

/** Vertical offset applied to the loaded root. */
export const CITY_OFFSET_Y = -20;

function prepareCity(city) {
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

/**
 * Invisible collision mesh that keeps walk mode inside the playable bounds.
 */
function prepareBoundsCollider(root) {
  root.name = "city-bounds-collider";
  root.position.y = CITY_OFFSET_Y;
  root.visible = false;

  root.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
    if (child.isMesh) {
      child.visible = false;
    }
  });

  buildModelBvh(root);

  return root;
}

export async function loadCityModel(renderer) {
  const gltfLoader = getGltfLoader(renderer);
  const [cityGltf, colliderGltf] = await Promise.all([
    gltfLoader.loadAsync(CITY_PATH),
    gltfLoader.loadAsync(BOUNDS_COLLIDER_PATH),
  ]);

  const city = prepareCity(cityGltf.scene);
  const boundsCollider = prepareBoundsCollider(colliderGltf.scene);

  return { city, boundsCollider };
}
