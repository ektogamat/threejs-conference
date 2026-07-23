import {
  Mesh,
  BufferGeometry,
} from "three/webgpu";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";

let installed = false;

/** Patch Mesh/BufferGeometry so raycasts use BVH when present. */
export function installBvhRaycast() {
  if (installed) {
    return;
  }

  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  Mesh.prototype.raycast = acceleratedRaycast;
  installed = true;
}

/**
 * Build BVH trees for every mesh under `root`.
 * Shared geometries are only built once.
 */
export function buildModelBvh(root) {
  installBvhRaycast();

  const seen = new Set();

  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    const geometry = child.geometry;
    if (seen.has(geometry) || geometry.boundsTree) {
      return;
    }

    seen.add(geometry);
    geometry.computeBoundsTree();
  });
}
