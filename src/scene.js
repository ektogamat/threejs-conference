import * as THREE from "three/webgpu";
import { createPCSSFilter, computeDirectionalFrustumScale } from "./pcss.js";
import { createSkyGradientBackground } from "./skyGradient.js";

function smoothstep(min, max, value) {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

export const PROBE_INTENSITY = { night: 0.5, day: 1.1 };

/** Hour range for the sun arc (must match sunControls MIN/MAX_HOUR). */
export const SUN_ARC_MIN_HOUR = 5;
export const SUN_ARC_MAX_HOUR = 21;

/**
 * Local sun position on the day arc (morning +X → noon up → evening -X).
 * Main scene and the orb widget share this so dragging stays in sync.
 */
export function getSunArcLocalPosition(hour, radius = 1) {
  const t = THREE.MathUtils.clamp(
    (hour - SUN_ARC_MIN_HOUR) / (SUN_ARC_MAX_HOUR - SUN_ARC_MIN_HOUR),
    0,
    1,
  );
  const theta = (1 - t) * Math.PI;
  return {
    x: -Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    z: 0,
    theta,
  };
}

export function computeSunPhase(hour) {
  const dayCycle = ((hour - 6) / 12) * Math.PI;
  const altitude = Math.sin(dayCycle);
  const daylight = smoothstep(-0.1, 0.2, altitude);
  const noon = smoothstep(0.35, 0.95, altitude);
  const golden = daylight * (1 - noon);
  const evening = golden;
  const night = smoothstep(0.4, 0.05, daylight) * smoothstep(0.55, 0.1, golden);
  return { altitude, daylight, noon, golden, evening, night };
}

export function computeProbeIntensity(hour, { night, day } = PROBE_INTENSITY) {
  const { daylight } = computeSunPhase(hour);
  return THREE.MathUtils.lerp(night, day, daylight);
}

export function freezeStaticTransforms(root) {
  root.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

export function addModel(scene, model) {
  scene.add(model);
  freezeStaticTransforms(model);
  return model.position.clone();
}

export function createScene() {
  const scene = new THREE.Scene();
  const skyGradient = createSkyGradientBackground();
  scene.background = skyGradient.texture;

  // City-scale shadow volume (was loft-sized ±10 / far 40).
  const SHADOW_EXTENT = 200;
  const SUN_DISTANCE = 150;

  const sunLight = new THREE.DirectionalLight("#fff0d9", 2.5);
  sunLight.position.set(18, 14, 10);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_DISTANCE + SHADOW_EXTENT * 2;
  sunLight.shadow.camera.left = -SHADOW_EXTENT;
  sunLight.shadow.camera.right = SHADOW_EXTENT;
  sunLight.shadow.camera.top = SHADOW_EXTENT;
  sunLight.shadow.camera.bottom = -SHADOW_EXTENT;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0009;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.autoUpdate = false;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // const pcss = createPCSSFilter({
  //   lightSize: 60,
  //   nearPlane: sunLight.shadow.camera.near,
  //   frustumScale: computeDirectionalFrustumScale(sunLight),
  //   sampling: "poisson",
  // });
  // sunLight.shadow.filterNode = pcss.filter;

  const state = {
    hour: 8.3,
    azimuth: 155,
    strength: 2,
  };

  const skyDayTop = new THREE.Color(0x6fc3ff);
  const skyDayBottom = new THREE.Color(0xb5e6ff);
  const skyGoldenTop = new THREE.Color(0x7b729f);
  const skyGoldenBottom = new THREE.Color(0xffaf62);
  const skyNightTop = new THREE.Color(0x141d30);
  const skyNightBottom = new THREE.Color(0x28384f);

  const sunDay = new THREE.Color(0xfff5e6);
  const sunGolden = new THREE.Color(0xffc07a);

  function updateSun({
    hour = state.hour,
    azimuth = state.azimuth,
    strength = state.strength,
    target = sunLight.target.position,
  } = {}) {
    state.hour = hour;
    state.azimuth = azimuth;
    state.strength = strength;

    const { daylight, golden, evening, night } = computeSunPhase(hour);

    // Arc path matching the sun widget: morning → noon (zenith) → evening.
    const local = getSunArcLocalPosition(hour, SUN_DISTANCE);
    const azimuthRad = THREE.MathUtils.degToRad(azimuth);
    // Same Y-rotation convention as the widget (orientationRoot.rotation.y = -azimuth)
    const offsetX = local.x * Math.cos(azimuthRad);
    const offsetZ = local.x * Math.sin(azimuthRad);

    sunLight.position.set(
      target.x + offsetX,
      target.y + local.y,
      target.z + offsetZ,
    );
    sunLight.target.position.copy(target);
    sunLight.target.updateMatrixWorld();

    sunLight.color.copy(sunDay).lerp(sunGolden, golden * 0.95);
    const baseIntensity = THREE.MathUtils.lerp(0.2, 5, daylight);
    sunLight.intensity = baseIntensity * state.strength;

    const skyTop = new THREE.Color().lerpColors(
      skyNightTop,
      skyDayTop,
      daylight,
    );
    const skyBottom = new THREE.Color().lerpColors(
      skyNightBottom,
      skyDayBottom,
      daylight,
    );
    skyTop.lerp(skyGoldenTop, golden * 0.85);
    skyBottom.lerp(skyGoldenBottom, golden);

    skyGradient.update({ top: skyTop, bottom: skyBottom });

    return { skyTop, skyBottom, daylight, golden, evening, night };
  }

  return { scene, sunLight, updateSun, sunState: state, skyGradient };
}
