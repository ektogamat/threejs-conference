import { findMaterialsByName } from "../loaders/meshUtils.js";
import {
  applyBillboardFace,
  BILLBOARD_MATERIAL_NAMES,
} from "./materials/billboardFace.js";

function findAllBillboardEntries(root) {
  return BILLBOARD_MATERIAL_NAMES.flatMap((name) =>
    findMaterialsByName(root, name),
  );
}

export function applyBillboardMaterials(root) {
  const disposables = [];

  const billboard = applyBillboardFace(findAllBillboardEntries(root), { root });

  if (billboard) {
    disposables.push(billboard.dispose);
  }

  function dispose() {
    for (const disposeResource of disposables) {
      disposeResource();
    }
  }

  return { dispose, billboard };
}
