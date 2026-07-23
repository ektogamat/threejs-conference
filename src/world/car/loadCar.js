import {
  Box3,
  BoxGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three/webgpu";
import { buildModelBvh, installBvhRaycast } from "../bvh.js";
import { getGltfLoader } from "../loaders/createGltfLoaders.js";
import { applyCarSurfaceRain } from "./applyCarSurfaceRain.js";

const QUADRA_PATH = "/models/quadra.glb";

/** Alley placement near the free-camera start. */
export const QUADRA_START = {
  position: [-128, -5.47, 33],
  rotationY: Math.PI / 2 + 0.6,
  scale: 1.1,
};

/** Extra XZ padding around the car walk hitbox (meters). */
const CAR_COLLIDER_PAD_XZ = -0.5;
/**
 * Minimum collider height so eye/chest walk rays cannot skim over the roof.
 * Expanded upward from the local bottom.
 */
const CAR_COLLIDER_MIN_HEIGHT = 2.2;

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
    size.x += CAR_COLLIDER_PAD_XZ * 1.5;
    size.z += CAR_COLLIDER_PAD_XZ * 1.5;
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
  const gltfLoader = getGltfLoader(renderer);
  const gltf = await gltfLoader.loadAsync(QUADRA_PATH);
  const car = gltf.scene;

  car.position.set(...QUADRA_START.position);
  car.rotation.y = QUADRA_START.rotationY;
  car.scale.set(QUADRA_START.scale, QUADRA_START.scale, QUADRA_START.scale);
  car.updateWorldMatrix(true, true);
  const surfaceRain = applyCarSurfaceRain(car);

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

  return { car, collider, surfaceRain };
}
