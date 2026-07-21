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

const RAIN_TEXTURE_PATH = "/textures/rainDrop.png";
const MAX_COUNT = 15000;
const DEFAULT_COUNT = 15000;
const DEFAULT_RADIUS = 38;
const DEFAULT_HEIGHT = 18;
const Y_OFFSET = 3;
const BASE_SIZE = 6;
const MIN_ANGLE_UV_SQUASH = 0.05;
const MIN_ANGLE_SIZE_SCALE = 0.7;

const _cameraDirection = new THREE.Vector3();
const _cameraPosition = new THREE.Vector3();

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(path, resolve, undefined, reject);
  });
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

export async function createRainStreaks({
  scene,
  count = DEFAULT_COUNT,
  radius = DEFAULT_RADIUS,
  height = DEFAULT_HEIGHT,
} = {}) {
  const activeCount = Math.min(Math.max(200, count), MAX_COUNT);

  const params = {
    enabled: true,
    count: activeCount,
    opacity: 0.25,
    overallSpeed: 56,
    radius,
    height,
    intensity: 0.2,
  };

  const group = new THREE.Group();
  group.name = "RainStreaks";
  scene.add(group);

  const localPositions = new Float32Array(MAX_COUNT * 3);
  const speeds = new Float32Array(MAX_COUNT);
  fillInstanceData(localPositions, speeds, activeCount, params.radius, params.height);

  const instanceLocalAttr = new THREE.InstancedBufferAttribute(localPositions, 3);
  const speedAttr = new THREE.InstancedBufferAttribute(speeds, 1);

  const rainTexture = await loadTexture(RAIN_TEXTURE_PATH);
  rainTexture.colorSpace = THREE.SRGBColorSpace;

  const uTime = uniform(0);
  const uOpacity = uniform(params.opacity);
  const uOverallSpeed = uniform(params.overallSpeed);
  const uHeight = uniform(params.height);
  const uUvSquash = uniform(1);
  const uSize = uniform(BASE_SIZE);
  const uIntensity = uniform(params.intensity);
  const uColor = uniform(new THREE.Color(0.82, 0.88, 0.98));

  const instanceLocal = instancedBufferAttribute(instanceLocalAttr, "vec3");
  const aSpeed = instancedBufferAttribute(speedAttr, "float");

  const animatedLocal = Fn(() => {
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
  rainMaterial.opacityNode = Fn(() => {
    const squashedUv = vec2(
      uv().x.sub(0.5).mul(uUvSquash).add(0.5),
      uv().y,
    );
    return texture(rainTexture, squashedUv)
      .a.mul(uOpacity)
      .mul(uIntensity);
  })();

  const sprite = new THREE.Sprite(rainMaterial);
  sprite.count = activeCount;
  sprite.frustumCulled = false;
  sprite.renderOrder = 10;
  group.add(sprite);

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

  function update(delta, camera) {
    if (!params.enabled) {
      group.visible = false;
      return;
    }

    group.visible = true;
    camera.getWorldPosition(_cameraPosition);
    group.position.copy(_cameraPosition);

    uTime.value += delta;
    uTime.needsUpdate = true;

    camera.getWorldDirection(_cameraDirection);
    const verticalFacing = Math.abs(_cameraDirection.y);
    const uvSquash = THREE.MathUtils.lerp(
      1,
      MIN_ANGLE_UV_SQUASH,
      verticalFacing,
    );
    const sizeScale = THREE.MathUtils.lerp(
      1,
      MIN_ANGLE_SIZE_SCALE,
      verticalFacing,
    );

    uUvSquash.value = uvSquash;
    uUvSquash.needsUpdate = true;
    uSize.value = BASE_SIZE * sizeScale * (0.5 + 0.5 * uvSquash);
    uSize.needsUpdate = true;
  }

  function setEnabled(value) {
    params.enabled = Boolean(value);
    group.visible = params.enabled;
  }

  function setDropCount(value) {
    const nextCount = Math.max(200, Math.min(MAX_COUNT, Math.round(value)));
    params.count = nextCount;
    sprite.count = nextCount;
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

  function setVolumeRadius(value) {
    params.radius = value;
    fillInstanceData(
      localPositions,
      speeds,
      params.count,
      params.radius,
      params.height,
    );
    instanceLocalAttr.needsUpdate = true;
    speedAttr.needsUpdate = true;
  }

  function dispose() {
    scene.remove(group);
    rainMaterial.dispose();
    rainTexture.dispose();
  }

  return {
    group,
    sprite,
    params,
    uniforms: {
      time: uTime,
      opacity: uOpacity,
      overallSpeed: uOverallSpeed,
      height: uHeight,
      uvSquash: uUvSquash,
      size: uSize,
      intensity: uIntensity,
      color: uColor,
    },
    update,
    setEnabled,
    setDropCount,
    setOpacity,
    setOverallSpeed,
    setIntensity,
    setVolumeRadius,
    dispose,
  };
}
