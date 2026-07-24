import * as THREE from "three/webgpu";
import {
  Fn,
  float,
  instancedBufferAttribute,
  mod,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

export const RAIN_LAYER = 2;

const RAIN_TEXTURE_PATH = "/textures/rainDrop.png";
const MAX_COUNT = 9000;
const DEFAULT_COUNT = 7000;
const REFRACT_MAX_COUNT = 2000;
const DEFAULT_REFRACT_COUNT = 800;
const DEFAULT_RADIUS = 10;
const DEFAULT_HEIGHT = 18;
const Y_OFFSET = 3;
const BASE_SIZE = 6;
const REFRACT_SIZE_MULTIPLIER = 2.8;
const REFRACT_INNER_RADIUS = 0.55;
const MIN_ANGLE_UV_SQUASH = 0.05;
const MIN_ANGLE_SIZE_SCALE = 0.7;

const _cameraDirection = new THREE.Vector3();
const _cameraPosition = new THREE.Vector3();

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(path, resolve, undefined, reject);
  });
}

function setRainLayer(object) {
  object.layers.disable(0);
  object.layers.enable(RAIN_LAYER);
}

function fillInstanceData(localPositions, speeds, count, radius, height) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;

    localPositions[i * 3] = Math.cos(angle) * r;
    localPositions[i * 3 + 1] = Math.random() * height;
    localPositions[i * 3 + 2] = Math.sin(angle) * r;
    speeds[i] = 0.5 + Math.random() * 0.5;
  }
}

function fillRefractInstanceData(localPositions, speeds, count, radius, height) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius * REFRACT_INNER_RADIUS;

    localPositions[i * 3] = Math.cos(angle) * r;
    localPositions[i * 3 + 1] = Math.random() * height;
    localPositions[i * 3 + 2] = Math.sin(angle) * r;
    speeds[i] = 0.5 + Math.random() * 0.5;
  }
}

function createAnimatedLocal(instanceLocal, aSpeed, uTime, uOverallSpeed, uHeight) {
  return Fn(() => {
    const wrappedY = mod(
      instanceLocal.y.sub(uTime.mul(uOverallSpeed).mul(aSpeed)),
      uHeight,
    );
    return vec3(
      instanceLocal.x,
      wrappedY.sub(float(Y_OFFSET)),
      instanceLocal.z,
    );
  })();
}

function createStreakAlphaNode(rainTexture, uUvSquash, uOpacity, uIntensity) {
  return Fn(() => {
    const squashedUv = vec2(
      uv().x.sub(0.5).mul(uUvSquash).add(0.5),
      uv().y,
    );
    return texture(rainTexture, squashedUv)
      .a.mul(uOpacity)
      .mul(uIntensity);
  })();
}

function createDistortionOffsetNode(rainTexture, uUvSquash) {
  return Fn(() => {
    const squashedUv = vec2(
      uv().x.sub(0.5).mul(uUvSquash).add(0.5),
      uv().y,
    );
    const streakAlpha = texture(rainTexture, squashedUv).a;
    return vec3(
      uv().x.sub(0.5).mul(streakAlpha),
      uv().y.sub(0.5).mul(streakAlpha).mul(0.2),
      0,
    );
  })();
}

export async function createRainStreaks({
  scene,
  count = DEFAULT_COUNT,
  radius = DEFAULT_RADIUS,
  height = DEFAULT_HEIGHT,
  refractCount = DEFAULT_REFRACT_COUNT,
} = {}) {
  const activeCount = Math.min(Math.max(200, count), MAX_COUNT);
  const activeRefractCount = Math.min(
    Math.max(0, refractCount),
    REFRACT_MAX_COUNT,
  );

  const params = {
    enabled: true,
    count: activeCount,
    opacity: 0.25,
    overallSpeed: 30,
    radius,
    height,
    intensity: 1.05,
    // Lower = finer streaks (sprite size + UV pinch).
    thickness: 0.31,
    refractEnabled: false,
    refractCount: activeRefractCount,
    refractSizeScale: REFRACT_SIZE_MULTIPLIER,
  };

  const group = new THREE.Group();
  group.name = "RainStreaks";
  setRainLayer(group);
  scene.add(group);

  const localPositions = new Float32Array(MAX_COUNT * 3);
  const speeds = new Float32Array(MAX_COUNT);
  fillInstanceData(localPositions, speeds, activeCount, params.radius, params.height);

  const refractLocalPositions = new Float32Array(REFRACT_MAX_COUNT * 3);
  const refractSpeeds = new Float32Array(REFRACT_MAX_COUNT);
  fillRefractInstanceData(
    refractLocalPositions,
    refractSpeeds,
    activeRefractCount,
    params.radius,
    params.height,
  );

  const instanceLocalAttr = new THREE.InstancedBufferAttribute(localPositions, 3);
  const speedAttr = new THREE.InstancedBufferAttribute(speeds, 1);
  const refractInstanceLocalAttr = new THREE.InstancedBufferAttribute(
    refractLocalPositions,
    3,
  );
  const refractSpeedAttr = new THREE.InstancedBufferAttribute(refractSpeeds, 1);

  const rainTexture = await loadTexture(RAIN_TEXTURE_PATH);
  rainTexture.colorSpace = THREE.SRGBColorSpace;

  const uTime = uniform(0);
  const uOpacity = uniform(params.opacity);
  const uOverallSpeed = uniform(params.overallSpeed);
  const uHeight = uniform(params.height);
  const uUvSquash = uniform(1);
  const uSize = uniform(BASE_SIZE);
  const uRefractSize = uniform(BASE_SIZE * params.refractSizeScale);
  const uIntensity = uniform(params.intensity);
  const uColor = uniform(new THREE.Color(0.82, 0.88, 0.98));

  const instanceLocal = instancedBufferAttribute(instanceLocalAttr, "vec3");
  const aSpeed = instancedBufferAttribute(speedAttr, "float");
  const refractInstanceLocal = instancedBufferAttribute(refractInstanceLocalAttr, "vec3");
  const refractSpeed = instancedBufferAttribute(refractSpeedAttr, "float");

  const animatedLocal = createAnimatedLocal(
    instanceLocal,
    aSpeed,
    uTime,
    uOverallSpeed,
    uHeight,
  );
  const refractAnimatedLocal = createAnimatedLocal(
    refractInstanceLocal,
    refractSpeed,
    uTime,
    uOverallSpeed,
    uHeight,
  );

  const rainMaterial = new THREE.PointsNodeMaterial({
    positionNode: animatedLocal,
    sizeNode: uSize,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    toneMapped: false,
  });
  rainMaterial.colorNode = uColor;
  rainMaterial.opacityNode = createStreakAlphaNode(
    rainTexture,
    uUvSquash,
    uOpacity,
    uIntensity,
  );

  const sprite = new THREE.Sprite(rainMaterial);
  sprite.count = activeCount;
  sprite.frustumCulled = false;
  sprite.renderOrder = 12;
  setRainLayer(sprite);
  group.add(sprite);

  // Offset-only writers for the rain pass MRT. Invisible in the composite
  // (rgb=0) but larger / denser so refraction reads clearly without touching
  // the look of the main streaks.
  const refractMaterial = new THREE.PointsNodeMaterial({
    positionNode: refractAnimatedLocal,
    sizeNode: uRefractSize,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    toneMapped: false,
  });
  refractMaterial.colorNode = vec3(0);
  refractMaterial.opacityNode = Fn(() => {
    const squashedUv = vec2(
      uv().x.sub(0.5).mul(uUvSquash).add(0.5),
      uv().y,
    );
    return texture(rainTexture, squashedUv).a;
  })();
  refractMaterial.emissiveNode = createDistortionOffsetNode(rainTexture, uUvSquash);

  const refractSprite = new THREE.Sprite(refractMaterial);
  refractSprite.count = activeRefractCount;
  refractSprite.frustumCulled = false;
  refractSprite.renderOrder = 11;
  setRainLayer(refractSprite);
  group.add(refractSprite);

  function syncUniforms() {
    uOpacity.value = params.opacity;
    uOpacity.needsUpdate = true;
    uOverallSpeed.value = params.overallSpeed;
    uOverallSpeed.needsUpdate = true;
    uHeight.value = params.height;
    uHeight.needsUpdate = true;
    uIntensity.value = params.intensity;
    uIntensity.needsUpdate = true;
  }

  syncUniforms();

  function syncVisibility() {
    group.visible = params.enabled;
    sprite.visible = params.enabled;
    refractSprite.visible =
      params.enabled && params.refractEnabled && params.refractCount > 0;
  }

  function updateSizeFromCamera() {
    const verticalFacing = Math.abs(_cameraDirection.y);
    const angleUvSquash = THREE.MathUtils.lerp(
      1,
      MIN_ANGLE_UV_SQUASH,
      verticalFacing,
    );
    const sizeScale = THREE.MathUtils.lerp(
      1,
      MIN_ANGLE_SIZE_SCALE,
      verticalFacing,
    );
    const thickness = Math.max(0.05, params.thickness);
    // Pinch UV more as thickness drops so the opaque core stays hair-thin
    // without only shrinking the whole sprite into short stubs.
    const uvSquash = angleUvSquash / thickness;
    const size = BASE_SIZE * thickness * sizeScale * (0.5 + 0.5 * angleUvSquash);

    uUvSquash.value = uvSquash;
    uUvSquash.needsUpdate = true;
    uSize.value = size;
    uSize.needsUpdate = true;
    uRefractSize.value = size * params.refractSizeScale;
    uRefractSize.needsUpdate = true;
  }

  function update(delta, camera) {
    if (!params.enabled) {
      group.visible = false;
      return;
    }

    group.visible = true;
    syncVisibility();

    camera.getWorldPosition(_cameraPosition);
    group.position.copy(_cameraPosition);

    uTime.value += delta;
    uTime.needsUpdate = true;

    camera.getWorldDirection(_cameraDirection);
    updateSizeFromCamera();
  }

  function setEnabled(value) {
    params.enabled = Boolean(value);
    syncVisibility();
  }

  function setRefractEnabled(value) {
    params.refractEnabled = Boolean(value);
    syncVisibility();
  }

  function setDropCount(value) {
    const nextCount = Math.max(200, Math.min(MAX_COUNT, Math.round(value)));
    params.count = nextCount;
    sprite.count = nextCount;
  }

  function setRefractCount(value) {
    const nextCount = Math.max(0, Math.min(REFRACT_MAX_COUNT, Math.round(value)));
    params.refractCount = nextCount;
    refractSprite.count = nextCount;
    fillRefractInstanceData(
      refractLocalPositions,
      refractSpeeds,
      nextCount,
      params.radius,
      params.height,
    );
    refractInstanceLocalAttr.needsUpdate = true;
    refractSpeedAttr.needsUpdate = true;
    syncVisibility();
  }

  function setOpacity(value) {
    params.opacity = value;
    uOpacity.value = value;
    uOpacity.needsUpdate = true;
  }

  function setOverallSpeed(value) {
    params.overallSpeed = value;
    uOverallSpeed.value = value;
    uOverallSpeed.needsUpdate = true;
  }

  function setIntensity(value) {
    params.intensity = value;
    uIntensity.value = value;
    uIntensity.needsUpdate = true;
  }

  function setThickness(value) {
    params.thickness = Math.max(0.05, value);
    updateSizeFromCamera();
  }

  function setVolumeRadius(value) {
    params.radius = value;
    fillInstanceData(
      localPositions,
      speeds,
      params.count,
      params.radius,
      params.height,
    );
    fillRefractInstanceData(
      refractLocalPositions,
      refractSpeeds,
      params.refractCount,
      params.radius,
      params.height,
    );
    instanceLocalAttr.needsUpdate = true;
    speedAttr.needsUpdate = true;
    refractInstanceLocalAttr.needsUpdate = true;
    refractSpeedAttr.needsUpdate = true;
  }

  function dispose() {
    scene.remove(group);
    rainMaterial.dispose();
    refractMaterial.dispose();
    rainTexture.dispose();
  }

  syncVisibility();

  return {
    group,
    sprite,
    refractSprite,
    layer: RAIN_LAYER,
    params,
    uniforms: {
      time: uTime,
      opacity: uOpacity,
      overallSpeed: uOverallSpeed,
      height: uHeight,
      uvSquash: uUvSquash,
      size: uSize,
      refractSize: uRefractSize,
      intensity: uIntensity,
      color: uColor,
    },
    update,
    setEnabled,
    setRefractEnabled,
    setDropCount,
    setRefractCount,
    setOpacity,
    setOverallSpeed,
    setIntensity,
    setThickness,
    setVolumeRadius,
    dispose,
  };
}
