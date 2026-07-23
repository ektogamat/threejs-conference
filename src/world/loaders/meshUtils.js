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

export function findMaterialsByName(root, name) {
  const matches = [];

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    getMeshMaterials(child).forEach((material, materialIndex) => {
      if (material?.name !== name) {
        return;
      }

      matches.push({ mesh: child, material, materialIndex });
    });
  });

  return matches;
}
