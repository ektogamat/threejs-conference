import * as THREE from "three/webgpu";
import { loadCloudNoiseTextures } from "./noiseTextures.js";
import { createCloudsMaterial } from "./cloudsMaterial.js";

const CLOUD_DAY = {
  windDirection: new THREE.Vector2(0.5, 0.25),
  cloudDensity: 0.9,
  noiseScale: 12.5,
  distortionStrength: 1.8,
  contrast: 0.9,
  opacity: 0.95,
  cloudDarkColor: new THREE.Color("#b1b6d7"),
  cloudLightColor: new THREE.Color("#f8f2fb"),
  lightMultiplier: new THREE.Vector3(1.55, 1.4, 1.16),
  densityStrength: 0.0001,
  speed: 1.45,
  detailAmount: 1,
  smoothness: 1,
};

const CLOUD_EVENING = {
  windDirection: new THREE.Vector2(-0.5, 0.2),
  cloudDensity: 0.8,
  noiseScale: 15,
  distortionStrength: 1.2,
  contrast: 1,
  opacity: 0.9,
  cloudDarkColor: new THREE.Color("#dd954e"),
  cloudLightColor: new THREE.Color("#ffe4bf"),
  lightMultiplier: new THREE.Vector3(1.4, 1.32, 1.18),
  densityStrength: 0.2,
  speed: 1.45,
  detailAmount: 1,
  smoothness: 1,
};

const CLOUD_NIGHT = {
  windDirection: new THREE.Vector2(0.35, -0.15),
  cloudDensity: 0.64,
  noiseScale: 10.5,
  distortionStrength: 1.6,
  contrast: 1.3,
  opacity: 0.36,
  cloudDarkColor: new THREE.Color("#d8d0e8"),
  cloudLightColor: new THREE.Color("#595a7d"),
  lightMultiplier: new THREE.Vector3(0.58, 0.58, 0.82),
  densityStrength: 0.56,
  speed: 1.8,
  detailAmount: 1,
  smoothness: 1,
};

function colorToHex(color) {
  return `#${color.getHexString()}`;
}

function normalizeColorInput(value) {
  if (typeof value === "number") {
    return `#${value.toString(16).padStart(6, "0")}`;
  }
  return value;
}

function lerpPreset(a, b, t) {
  return {
    windDirection: a.windDirection.clone().lerp(b.windDirection, t),
    cloudDensity: THREE.MathUtils.lerp(a.cloudDensity, b.cloudDensity, t),
    noiseScale: THREE.MathUtils.lerp(a.noiseScale, b.noiseScale, t),
    distortionStrength: THREE.MathUtils.lerp(
      a.distortionStrength,
      b.distortionStrength,
      t,
    ),
    contrast: THREE.MathUtils.lerp(a.contrast, b.contrast, t),
    opacity: THREE.MathUtils.lerp(a.opacity, b.opacity, t),
    cloudDarkColor: a.cloudDarkColor.clone().lerp(b.cloudDarkColor, t),
    cloudLightColor: a.cloudLightColor.clone().lerp(b.cloudLightColor, t),
    lightMultiplier: a.lightMultiplier.clone().lerp(b.lightMultiplier, t),
    densityStrength: THREE.MathUtils.lerp(
      a.densityStrength,
      b.densityStrength,
      t,
    ),
    speed: THREE.MathUtils.lerp(a.speed, b.speed, t),
    detailAmount: THREE.MathUtils.lerp(a.detailAmount, b.detailAmount, t),
    smoothness: THREE.MathUtils.lerp(a.smoothness, b.smoothness, t),
  };
}

function createSkySphereGeometry(radius) {
  return new THREE.SphereGeometry(radius, 32, 32, 0, Math.PI * 2, 0, Math.PI);
}

export async function createCloudSky(
  scene,
  { radius = 135, verticalOffset = -33.5 } = {},
) {
  const { noise, perlin } = await loadCloudNoiseTextures();
  const { material, uniforms } = createCloudsMaterial({
    noiseTex: noise,
    perlinTex: perlin,
  });

  let currentRadius = radius;
  const mesh = new THREE.Mesh(createSkySphereGeometry(currentRadius), material);
  mesh.name = "CloudSky";
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  material.side = THREE.BackSide;

  scene.add(mesh);

  const params = {
    enabled: true,
    radius: currentRadius,
    verticalOffset,
    speed: uniforms.uSpeed.value,
    cloudDensity: uniforms.uCloudDensity.value,
    noiseScale: uniforms.uNoiseScale.value,
    distortionStrength: uniforms.uDistortionStrength.value,
    detailAmount: uniforms.uDetailAmount.value,
    smoothness: uniforms.uSmoothness.value,
    contrast: uniforms.uContrast.value,
    opacity: uniforms.uOpacity.value,
    densityStrength: uniforms.uDensityStrength.value,
    windX: uniforms.uWindDirection.value.x,
    windY: uniforms.uWindDirection.value.y,
    skyTop: colorToHex(uniforms.uSkyTop.value),
    skyBottom: colorToHex(uniforms.uSkyBottom.value),
    cloudDarkColor: colorToHex(uniforms.uCloudDarkColor.value),
    cloudLightColor: colorToHex(uniforms.uCloudLightColor.value),
  };

  function syncParamsFromUniforms() {
    params.speed = uniforms.uSpeed.value;
    params.cloudDensity = uniforms.uCloudDensity.value;
    params.noiseScale = uniforms.uNoiseScale.value;
    params.distortionStrength = uniforms.uDistortionStrength.value;
    params.detailAmount = uniforms.uDetailAmount.value;
    params.smoothness = uniforms.uSmoothness.value;
    params.contrast = uniforms.uContrast.value;
    params.opacity = uniforms.uOpacity.value;
    params.densityStrength = uniforms.uDensityStrength.value;
    params.windX = uniforms.uWindDirection.value.x;
    params.windY = uniforms.uWindDirection.value.y;
    params.skyTop = colorToHex(uniforms.uSkyTop.value);
    params.skyBottom = colorToHex(uniforms.uSkyBottom.value);
    params.cloudDarkColor = colorToHex(uniforms.uCloudDarkColor.value);
    params.cloudLightColor = colorToHex(uniforms.uCloudLightColor.value);
  }

  function applyCloudPreset(preset) {
    uniforms.uWindDirection.value.copy(preset.windDirection);
    uniforms.uCloudDensity.value = preset.cloudDensity;
    uniforms.uNoiseScale.value = preset.noiseScale;
    uniforms.uDistortionStrength.value = preset.distortionStrength;
    uniforms.uContrast.value = preset.contrast;
    uniforms.uOpacity.value = preset.opacity;
    uniforms.uCloudDarkColor.value.copy(preset.cloudDarkColor);
    uniforms.uCloudLightColor.value.copy(preset.cloudLightColor);
    uniforms.uLightMultiplier.value.copy(preset.lightMultiplier);
    uniforms.uDensityStrength.value = preset.densityStrength;
    if (preset.speed != null) uniforms.uSpeed.value = preset.speed;
    if (preset.detailAmount != null) {
      uniforms.uDetailAmount.value = preset.detailAmount;
    }
    if (preset.smoothness != null) {
      uniforms.uSmoothness.value = preset.smoothness;
    }
    syncParamsFromUniforms();
  }

  function updateFromSun({ evening = 0, night = 0, skyTop, skyBottom }) {
    if (skyTop) uniforms.uSkyTop.value.copy(skyTop);
    if (skyBottom) uniforms.uSkyBottom.value.copy(skyBottom);

    const dayToEvening = lerpPreset(CLOUD_DAY, CLOUD_EVENING, evening);
    const preset = lerpPreset(dayToEvening, CLOUD_NIGHT, night);
    applyCloudPreset(preset);
  }

  function update(camera, elapsedTime) {
    mesh.position.set(
      camera.position.x,
      camera.position.y - params.verticalOffset,
      camera.position.z,
    );
    uniforms.uTime.value = elapsedTime;
  }

  function setEnabled(value) {
    params.enabled = Boolean(value);
    mesh.visible = params.enabled;
  }

  function setVisible(visible) {
    setEnabled(visible);
  }

  function setRadius(value) {
    const next = Math.max(1, value);
    if (next === currentRadius) {
      params.radius = next;
      return;
    }

    currentRadius = next;
    params.radius = next;
    mesh.geometry.dispose();
    mesh.geometry = createSkySphereGeometry(currentRadius);
  }

  function setVerticalOffset(value) {
    params.verticalOffset = value;
  }

  function setSpeed(value) {
    params.speed = value;
    uniforms.uSpeed.value = value;
  }

  function setCloudDensity(value) {
    params.cloudDensity = value;
    uniforms.uCloudDensity.value = value;
  }

  function setNoiseScale(value) {
    params.noiseScale = value;
    uniforms.uNoiseScale.value = value;
  }

  function setDistortionStrength(value) {
    params.distortionStrength = value;
    uniforms.uDistortionStrength.value = value;
  }

  function setDetailAmount(value) {
    params.detailAmount = value;
    uniforms.uDetailAmount.value = value;
  }

  function setSmoothness(value) {
    params.smoothness = value;
    uniforms.uSmoothness.value = value;
  }

  function setContrast(value) {
    params.contrast = value;
    uniforms.uContrast.value = value;
  }

  function setOpacity(value) {
    params.opacity = value;
    uniforms.uOpacity.value = value;
  }

  function setDensityStrength(value) {
    params.densityStrength = value;
    uniforms.uDensityStrength.value = value;
  }

  function setWindX(value) {
    params.windX = value;
    uniforms.uWindDirection.value.x = value;
  }

  function setWindY(value) {
    params.windY = value;
    uniforms.uWindDirection.value.y = value;
  }

  function setSkyTop(value) {
    const hex = normalizeColorInput(value);
    params.skyTop = hex;
    uniforms.uSkyTop.value.set(hex);
  }

  function setSkyBottom(value) {
    const hex = normalizeColorInput(value);
    params.skyBottom = hex;
    uniforms.uSkyBottom.value.set(hex);
  }

  function setCloudDarkColor(value) {
    const hex = normalizeColorInput(value);
    params.cloudDarkColor = hex;
    uniforms.uCloudDarkColor.value.set(hex);
  }

  function setCloudLightColor(value) {
    const hex = normalizeColorInput(value);
    params.cloudLightColor = hex;
    uniforms.uCloudLightColor.value.set(hex);
  }

  function logConfig() {
    console.log("[CloudSky] config", {
      ...params,
      skyTop: normalizeColorInput(params.skyTop),
      skyBottom: normalizeColorInput(params.skyBottom),
      cloudDarkColor: normalizeColorInput(params.cloudDarkColor),
      cloudLightColor: normalizeColorInput(params.cloudLightColor),
    });
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    noise.dispose();
    perlin.dispose();
  }

  return {
    mesh,
    material,
    uniforms,
    params,
    update,
    updateFromSun,
    setEnabled,
    setVisible,
    setRadius,
    setVerticalOffset,
    setSpeed,
    setCloudDensity,
    setNoiseScale,
    setDistortionStrength,
    setDetailAmount,
    setSmoothness,
    setContrast,
    setOpacity,
    setDensityStrength,
    setWindX,
    setWindY,
    setSkyTop,
    setSkyBottom,
    setCloudDarkColor,
    setCloudLightColor,
    logConfig,
    dispose,
  };
}
