import { addModel } from "./scene.js";
import { loadCityModel } from "./city/loadCity.js";
import { loadQuadraCar } from "./car/loadCar.js";
import { loadEnvironmentMap } from "./envMap.js";
import { createGround } from "./ground/createGround.js";
import { createRainStreaks } from "./weather/createRainStreaks.js";
import { createSmoke } from "./effects/createSmoke.js";
import { createFlyingPlanes } from "./effects/createFlyingPlanes.js";
import { FEATURES } from "./features.js";

function buildColliders({ city, carCollider }) {
  const colliders = [];

  if (city) {
    colliders.push(city);
  }

  if (carCollider) {
    colliders.push(carCollider);
  }

  return colliders;
}

function buildFocusTargets({ city, car, ground }) {
  const targets = [];

  if (city) {
    targets.push(city);
  }

  if (car) {
    targets.push(car);
  }

  if (ground?.mesh) {
    targets.push(ground.mesh);
  }

  return targets;
}

export async function createWorld({
  scene,
  renderer,
  loaderOverlay,
  requestShadowMapUpdate,
}) {
  loaderOverlay.setProgress(0.35);

  const loadTasks = [];

  if (FEATURES.city) {
    loadTasks.push(loadCityModel(renderer));
  } else {
    loadTasks.push(Promise.resolve(null));
  }

  if (FEATURES.car) {
    loadTasks.push(loadQuadraCar(renderer));
  } else {
    loadTasks.push(Promise.resolve(null));
  }

  loadTasks.push(loadEnvironmentMap());

  const [city, quadra, envTexture] = await Promise.all(loadTasks);
  const quadraCar = quadra?.car ?? null;
  const quadraCollider = quadra?.collider ?? null;

  loaderOverlay.setProgress(0.7);

  if (city) {
    addModel(scene, city);
  }

  if (quadraCar) {
    addModel(scene, quadraCar);
  }

  if (quadraCollider) {
    scene.add(quadraCollider);
    requestShadowMapUpdate?.("quadra-car");
  }

  const ground = FEATURES.ground ? createGround(scene) : null;

  let rain = null;
  if (FEATURES.rain) {
    rain = await createRainStreaks({ scene });
  }

  let smoke = null;
  if (FEATURES.smoke && quadraCar) {
    smoke = await createSmoke({ scene, car: quadraCar });
  }

  let planes = null;
  if (FEATURES.planes) {
    planes = await createFlyingPlanes({ scene, renderer });
  }

  const colliders = buildColliders({ city, carCollider: quadraCollider });
  const focusTargets = buildFocusTargets({ city, car: quadraCar, ground });

  return {
    city,
    car: quadraCar,
    carCollider: quadraCollider,
    envTexture,
    ground,
    rain,
    smoke,
    planes,
    colliders,
    focusTargets,
    primaryPlaneAnchor: planes?.primaryAnchor ?? null,
  };
}

export function createLightingController({
  sceneResult,
  envMapBaseIntensity,
  requestShadowMapUpdate,
}) {
  function syncEnvironmentIntensity() {
    sceneResult.scene.environmentIntensity = envMapBaseIntensity.value;
  }

  function syncLighting() {
    sceneResult.applySun();
    syncEnvironmentIntensity();
    requestShadowMapUpdate?.("lighting");
  }

  return {
    syncEnvironmentIntensity,
    syncLighting,
  };
}
