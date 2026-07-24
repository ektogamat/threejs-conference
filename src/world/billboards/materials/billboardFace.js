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

const PLAY_DISTANCE = 20;
const PAUSE_DISTANCE = 50;

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

// Several billboard meshes in the source GLB were exported with their vertex
// data offset hundreds of units away from the node's own origin (bad/shared
// pivots — some nodes even share the exact same translation). `mesh.position`
// / `getWorldPosition()` therefore does not represent where the face is
// actually rendered. The geometry's bounding-box center, transformed into
// world space, does. Billboards are static, so this is computed once.
function computeFaceWorldPosition(mesh) {
  const geometry = mesh.geometry;

  if (geometry && !geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  mesh.updateWorldMatrix(true, false);

  const position = new THREE.Vector3();
  if (geometry?.boundingBox) {
    geometry.boundingBox.getCenter(position);
  }

  return position.applyMatrix4(mesh.matrixWorld);
}

// Some billboards sit high up on buildings — tens of units above the camera's
// walking height. A full 3D distance would always include that huge vertical
// gap, so it could exceed PLAY_DISTANCE even while the camera is standing
// right below the billboard. Comparing only the horizontal (XZ) distance
// makes "is the viewer nearby" match what a person on the ground actually
// perceives, regardless of how high the billboard is mounted.
function horizontalDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function applyBillboardFace(entries) {
  if (!entries.length) {
    return null;
  }

  const pool = createShuffledVideoPool();
  const vignetteUniforms = createBillboardVignetteUniforms();
  const disposables = [];
  // Each face tracks its own play state — a billboard near the camera must
  // not force every other (possibly distant) billboard to play too.
  const faces = [];
  let disabled = false;

  for (let i = 0; i < entries.length; i++) {
    const { mesh, material, materialIndex } = entries[i];
    const videoPath = pool[i % pool.length];
    const video = createVideoTexture(videoPath, { autoplay: false });
    const { output } = createBillboardFaceOutput(video.texture, vignetteUniforms);

    disposables.push(video.dispose);

    const nodeMaterial = ensureStandardNodeMaterial(material);
    nodeMaterial.colorNode = output;
    // Multiply here: emissiveNode replaces the default path, so
    // material.emissiveIntensity has no effect on the MRT bloom buffer.
    nodeMaterial.emissiveNode = output.rgb.mul(vignetteUniforms.emissiveIntensity);
    nodeMaterial.needsUpdate = true;

    if (nodeMaterial !== material) {
      replaceMeshMaterial(mesh, materialIndex, nodeMaterial);
    }

    faces.push({
      mesh,
      video,
      playing: false,
      worldPosition: computeFaceWorldPosition(mesh),
    });
  }

  function setFacePlaying(face, nextPlaying) {
    if (face.playing === nextPlaying) {
      return;
    }

    face.playing = nextPlaying;

    if (nextPlaying) {
      face.video.play();
    } else {
      face.video.pause();
    }
  }

  function update(camera) {
    if (!camera || disabled) {
      return;
    }

    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      const distance = horizontalDistance(camera.position, face.worldPosition);

      if (!face.playing && distance < PLAY_DISTANCE) {
        setFacePlaying(face, true);
      } else if (face.playing && distance > PAUSE_DISTANCE) {
        setFacePlaying(face, false);
      }
    }
  }

  /**
   * Permanently stops and hides every billboard face. One-way — used when the
   * app decides to shed GPU/decode cost (e.g. after a sustained low-FPS DPR
   * drop). Only a page reload restores billboards.
   */
  function disable() {
    if (disabled) {
      return;
    }

    disabled = true;

    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      setFacePlaying(face, false);
      face.mesh.visible = false;
    }
  }

  function dispose() {
    for (let i = 0; i < faces.length; i++) {
      setFacePlaying(faces[i], false);
    }

    for (const disposeResource of disposables) {
      disposeResource();
    }
  }

  return {
    dispose,
    update,
    disable,
    uniforms: vignetteUniforms,
  };
}
