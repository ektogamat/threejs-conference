import {
  CubeCamera,
  CubeRenderTarget,
  RGBAFormat,
  UnsignedByteType,
} from "three/webgpu";
import { LightProbeGenerator } from "three/addons/lights/LightProbeGenerator.js";

function copyProbeSH(target, source) {
  for (let i = 0; i < target.sh.coefficients.length; i++) {
    target.sh.coefficients[i].copy(source.sh.coefficients[i]);
  }
}

export function createProbeBaker(
  renderer,
  scene,
  position,
  { resolution = 128, debounceMs = 400, onRebakeComplete } = {},
) {
  const cubeRT = new CubeRenderTarget(resolution, {
    format: RGBAFormat,
    type: UnsignedByteType,
  });

  const cubeCamera = new CubeCamera(0.1, 100, cubeRT);
  let debounceTimer = null;
  let rebakeInProgress = false;
  let rebakeQueued = false;
  let pendingProbe = null;

  async function captureProbe(excludeProbe = null) {
    const previousIntensity = excludeProbe?.intensity ?? null;

    if (excludeProbe) {
      excludeProbe.intensity = 0;
    }

    cubeCamera.position.set(position.x, position.y, position.z);
    scene.add(cubeCamera);

    try {
      await cubeCamera.update(renderer, scene);
      return LightProbeGenerator.fromCubeRenderTarget(renderer, cubeRT);
    } finally {
      scene.remove(cubeCamera);

      if (excludeProbe && previousIntensity !== null) {
        excludeProbe.intensity = previousIntensity;
      }
    }
  }

  async function rebake(probe) {
    if (!probe) {
      return;
    }

    if (rebakeInProgress) {
      rebakeQueued = true;
      pendingProbe = probe;
      return;
    }

    rebakeInProgress = true;

    try {
      const baked = await captureProbe(probe);
      copyProbeSH(probe, baked);
      onRebakeComplete?.();
    } finally {
      rebakeInProgress = false;

      if (rebakeQueued && pendingProbe) {
        rebakeQueued = false;
        const nextProbe = pendingProbe;
        pendingProbe = null;
        await rebake(nextProbe);
      }
    }
  }

  function scheduleRebake(probe) {
    if (!probe) {
      return;
    }

    pendingProbe = probe;
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      rebake(pendingProbe).catch((error) => {
        console.error("Failed to rebake light probe:", error);
      });
    }, debounceMs);
  }

  async function bakeInitial(intensity = 1.2) {
    const probe = await captureProbe();
    probe.intensity = intensity;
    scene.add(probe);
    return probe;
  }

  function dispose() {
    clearTimeout(debounceTimer);
    cubeRT.dispose();
  }

  return { bakeInitial, scheduleRebake, rebake, dispose };
}

/** @deprecated Use createProbeBaker().bakeInitial() instead. */
export async function bakeProbe(renderer, scene, position, intensity = 1.2) {
  const baker = createProbeBaker(renderer, scene, position);
  const probe = await baker.bakeInitial(intensity);
  baker.dispose();
  return probe;
}
