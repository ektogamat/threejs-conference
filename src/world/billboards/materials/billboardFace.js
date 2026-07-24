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

const PLAY_DISTANCE = 140;
const PAUSE_DISTANCE = 170;

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
  const videos = [];
  const disposables = [];
  const faceMeshes = [];
  const facePosition = new THREE.Vector3();
  let playing = false;

  for (let i = 0; i < entries.length; i++) {
    const { mesh, material, materialIndex } = entries[i];
    const videoPath = pool[i % pool.length];
    const video = createVideoTexture(videoPath, { autoplay: false });
    const { output } = createBillboardFaceOutput(video.texture, vignetteUniforms);

    videos.push(video);
    disposables.push(video.dispose);
    faceMeshes.push(mesh);

    const nodeMaterial = ensureStandardNodeMaterial(material);
    nodeMaterial.colorNode = output;
    nodeMaterial.emissiveNode = output.rgb;
    nodeMaterial.emissiveIntensity = 0.65;
    nodeMaterial.needsUpdate = true;

    if (nodeMaterial !== material) {
      replaceMeshMaterial(mesh, materialIndex, nodeMaterial);
    }
  }

  function getNearestFaceDistance(camera) {
    let nearestDistance = Infinity;

    for (let i = 0; i < faceMeshes.length; i++) {
      faceMeshes[i].getWorldPosition(facePosition);
      const distance = camera.position.distanceTo(facePosition);
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }

    return nearestDistance;
  }

  function setPlaying(nextPlaying) {
    if (nextPlaying === playing) {
      return;
    }

    playing = nextPlaying;

    for (let i = 0; i < videos.length; i++) {
      if (playing) {
        videos[i].play();
      } else {
        videos[i].pause();
      }
    }
  }

  function update(camera) {
    if (!camera || !faceMeshes.length) {
      return;
    }

    const distance = getNearestFaceDistance(camera);

    if (!playing && distance < PLAY_DISTANCE) {
      setPlaying(true);
      return;
    }

    if (playing && distance > PAUSE_DISTANCE) {
      setPlaying(false);
    }
  }

  function dispose() {
    setPlaying(false);

    for (const disposeResource of disposables) {
      disposeResource();
    }
  }

  return {
    dispose,
    update,
    uniforms: vignetteUniforms,
  };
}
