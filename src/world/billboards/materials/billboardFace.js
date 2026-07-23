import * as THREE from "three/webgpu";
import { createVideoTexture } from "./createVideoTexture.js";
import {
  createBillboardFaceOutput,
  createBillboardVignetteUniforms,
} from "./billboardFaceShader.js";
import { createShuffledVideoPool } from "./billboardVideos.js";

export const BILLBOARD_MATERIAL_NAMES = [
  "billboard_face",
  "billboard_fireguy",
  "billboard_3",
];

function ensureStandardNodeMaterial(source) {
  if (source?.isMeshStandardNodeMaterial) {
    return source;
  }

  const material = new THREE.MeshStandardNodeMaterial();
  material.name = source.name;
  material.roughness = source.roughness ?? 0.5;
  material.metalness = source.metalness ?? 0;
  material.transparent = source.transparent ?? false;
  material.opacity = source.opacity ?? 1;
  material.side = source.side ?? THREE.FrontSide;
  return material;
}

function replaceMeshMaterial(mesh, materialIndex, material) {
  if (Array.isArray(mesh.material)) {
    mesh.material[materialIndex] = material;
    return;
  }

  mesh.material = material;
}

export function applyBillboardFace(entries) {
  if (!entries.length) {
    return null;
  }

  const pool = createShuffledVideoPool();
  const vignetteUniforms = createBillboardVignetteUniforms();
  const disposables = [];

  for (let i = 0; i < entries.length; i++) {
    const { mesh, material, materialIndex } = entries[i];
    const videoPath = pool[i % pool.length];
    const video = createVideoTexture(videoPath);
    const { output } = createBillboardFaceOutput(video.texture, vignetteUniforms);

    disposables.push(video.dispose);

    const nodeMaterial = ensureStandardNodeMaterial(material);
    nodeMaterial.colorNode = output;
    nodeMaterial.emissiveNode = output.rgb;
    nodeMaterial.emissiveIntensity = 0.65;
    nodeMaterial.needsUpdate = true;

    if (nodeMaterial !== material) {
      replaceMeshMaterial(mesh, materialIndex, nodeMaterial);
    }
  }

  function dispose() {
    for (const disposeResource of disposables) {
      disposeResource();
    }
  }

  return {
    dispose,
    uniforms: vignetteUniforms,
  };
}
