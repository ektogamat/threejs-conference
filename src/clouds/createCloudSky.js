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
};

const CLOUD_NIGHT = {
  windDirection: new THREE.Vector2(-0.3, 0.1),
  cloudDensity: 0.55,
  noiseScale: 14,
  distortionStrength: 1.6,
  contrast: 1.1,
  opacity: 0.4,
  cloudDarkColor: new THREE.Color("#ffffff"),
  cloudLightColor: new THREE.Color("#6a7fa8"),
  lightMultiplier: new THREE.Vector3(0.65, 0.72, 0.88),
  densityStrength: 0.12,
};

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
  };
}

function createSkySphereGeometry(radius) {
  return new THREE.SphereGeometry(radius, 32, 32, 0, Math.PI * 2, 0, Math.PI);
}

export async function createCloudSky(
  scene,
  { radius = 85, verticalOffset = 12 } = {},
) {
  const { noise, perlin } = await loadCloudNoiseTextures();
  const { material, uniforms } = createCloudsMaterial({
    noiseTex: noise,
    perlinTex: perlin,
  });

  const mesh = new THREE.Mesh(createSkySphereGeometry(radius), material);
  mesh.name = "CloudSky";
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  material.side = THREE.BackSide;

  scene.add(mesh);

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
      camera.position.y - verticalOffset,
      camera.position.z,
    );
    uniforms.uTime.value = elapsedTime;
  }

  function setVisible(visible) {
    mesh.visible = visible;
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
    update,
    updateFromSun,
    setVisible,
    dispose,
  };
}
