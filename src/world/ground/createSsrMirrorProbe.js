import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";

/**
 * Small opaque mirror plane to validate SSR (metalness 1, near-zero roughness).
 * Sits slightly above the wet ground so it cannot z-fight.
 */
export function createSsrMirrorProbe(
  scene,
  {
    groundY = -5.4,
    offsetY = 0.05,
    x = 0,
    z = 0,
    size = 32,
    metalness = 1,
    roughness = 0.02,
    color = 0xe8e8e8,
    visible = true,
  } = {},
) {
  const uMetalness = uniform(metalness);
  const uRoughness = uniform(roughness);

  const material = new THREE.MeshStandardNodeMaterial();
  material.name = "SsrMirrorProbe";
  material.transparent = false;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.color = new THREE.Color(color);
  // Scalar + node: guarantees metalness/roughness land in the MRT (diffuse.a / normal.a).
  material.metalness = metalness;
  material.roughness = roughness;
  material.metalnessNode = uMetalness;
  material.roughnessNode = uRoughness;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.name = "SsrMirrorProbe";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, groundY + offsetY, z);
  mesh.visible = visible;
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  scene.add(mesh);

  function setVisible(value) {
    mesh.visible = Boolean(value);
  }

  function setSize(nextSize) {
    const s = Math.max(1, nextSize);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(s, s);
  }

  function setMetalness(value) {
    uMetalness.value = value;
    uMetalness.needsUpdate = true;
    material.metalness = value;
  }

  function setRoughness(value) {
    uRoughness.value = value;
    uRoughness.needsUpdate = true;
    material.roughness = value;
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  }

  return {
    mesh,
    material,
    uniforms: {
      metalness: uMetalness,
      roughness: uRoughness,
    },
    setVisible,
    setSize,
    setMetalness,
    setRoughness,
    dispose,
  };
}
