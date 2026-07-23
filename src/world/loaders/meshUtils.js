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
