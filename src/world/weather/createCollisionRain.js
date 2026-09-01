import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  billboarding,
  color,
  float,
  floor,
  fract,
  hash,
  instancedArray,
  instanceIndex,
  mix,
  positionGeometry,
  texture,
  time,
  uniform,
  uint,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { performanceProfile } from "../../platform/performanceProfile.js";

export const RAIN_LAYER = 2;

const RAIN_TEXTURE_PATH = "/textures/rainDrop.png";
const SPLASH_TEXTURE_PATH = "/textures/water-splash.webp";
const MAX_COUNT = 5000;
const DEFAULT_COUNT = performanceProfile.collisionRainCount ?? 5000;
const SPLASH_FRAMES = 5;
const DEFAULT_SPLASH_SPEED = 6;
const DEFAULT_RAIN_AREA = { width: 60, height: 60 };
const DEFAULT_OPACITY = 0.55;
const DEFAULT_RAIN_INTENSITY = 2.5;
const DEFAULT_SPLASH_OPACITY = 0.18;
const DEFAULT_FALL_SPEED = 0.7;
const DEFAULT_FALL_SPEED_VARIANCE = 0.07;
const DEFAULT_SPLASH_START_SCALE = 0.1;
const DEFAULT_SPLASH_END_SCALE = 1.4;
const DEFAULT_SPLASH_SIZE = 1.0;
const SPLASH_GEOMETRY_SIZE = 0.13;
const RAIN_STREAK_WIDTH = 0.12;
const RAIN_STREAK_HEIGHT = 1.1;

const _cameraDirection = new THREE.Vector3();

function setRainLayer(object) {
  object.layers.disable(0);
  object.layers.enable(RAIN_LAYER);
}

function loadTexture(path) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(path, resolve, undefined, reject);
  });
}

export async function createCollisionRain({
  scene,
  renderer,
  collisionHeight,
  camera = null,
  count = DEFAULT_COUNT,
  rainArea = DEFAULT_RAIN_AREA,
} = {}) {
  const activeCount = Math.min(Math.max(500, count), MAX_COUNT);
  const rainHalfW = rainArea.width / 2;
  const rainHalfH = rainArea.height / 2;

  const params = {
    enabled: true,
    count: activeCount,
    opacity: DEFAULT_OPACITY,
    intensity: DEFAULT_RAIN_INTENSITY,
    splashOpacity: DEFAULT_SPLASH_OPACITY,
    splashSpeed: DEFAULT_SPLASH_SPEED,
    fallSpeed: DEFAULT_FALL_SPEED,
    splashSize: DEFAULT_SPLASH_SIZE,
    splashStartScale: DEFAULT_SPLASH_START_SCALE,
    splashEndScale: DEFAULT_SPLASH_END_SCALE,
    rainAreaWidth: rainArea.width,
    rainAreaHeight: rainArea.height,
    cameraForwardOffset: 15,
  };

  const group = new THREE.Group();
  group.name = "CollisionRain";
  scene.add(group);

  const uCameraPos = uniform(new THREE.Vector3());
  const uCameraDir = uniform(new THREE.Vector3());
  const uOpacity = uniform(params.opacity);
  const uIntensity = uniform(params.intensity);
  const uSplashOpacity = uniform(params.splashOpacity);
  const uSplashSpeed = uniform(params.splashSpeed);
  const uFallSpeed = uniform(params.fallSpeed);
  const uFallSpeedVariance = uniform(DEFAULT_FALL_SPEED_VARIANCE);
  const uSplashSize = uniform(params.splashSize);
  const uSplashStartScale = uniform(params.splashStartScale);
  const uSplashEndScale = uniform(params.splashEndScale);
  const uRainAreaWidth = uniform(params.rainAreaWidth);
  const uRainAreaHeight = uniform(params.rainAreaHeight);
  const uRainHalfW = uniform(rainHalfW);
  const uRainHalfH = uniform(rainHalfH);
  const uCameraForwardOffset = uniform(params.cameraForwardOffset);

  const positionBuffer = instancedArray(activeCount, "vec3");
  const velocityBuffer = instancedArray(activeCount, "vec3");
  const splashPositionBuffer = instancedArray(activeCount, "vec3");
  const splashCycleBuffer = instancedArray(activeCount, "uint");

  const randUint = () => uint(Math.random() * 0xffffff);

  const computeInit = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    const randX = hash(instanceIndex);
    const randY = hash(instanceIndex.add(randUint()));
    const randZ = hash(instanceIndex.add(randUint()));

    const centerPos = uCameraPos.add(uCameraDir.mul(uCameraForwardOffset));

    position.x = randX
      .mul(uRainAreaWidth)
      .sub(uRainHalfW)
      .add(centerPos.x);
    position.z = randZ
      .mul(uRainAreaHeight)
      .sub(uRainHalfH)
      .add(centerPos.z);
    position.y = randY.mul(25);
    velocity.y = randX
      .mul(uFallSpeedVariance)
      .sub(uFallSpeedVariance.mul(0.5))
      .sub(uFallSpeed);
  })().compute(activeCount);

  const computeUpdate = Fn(() => {
    const position = positionBuffer.element(instanceIndex);
    const velocity = velocityBuffer.element(instanceIndex);

    position.addAssign(velocity);

    const centerPos = uCameraPos.add(uCameraDir.mul(uCameraForwardOffset));

    const dx = position.x.sub(centerPos.x);
    const dz = position.z.sub(centerPos.z);

    const wrappedDx = fract(dx.add(uRainHalfW).div(uRainAreaWidth))
      .mul(uRainAreaWidth)
      .sub(uRainHalfW);
    position.x = centerPos.x.add(wrappedDx);

    const wrappedDz = fract(dz.add(uRainHalfH).div(uRainAreaHeight))
      .mul(uRainAreaHeight)
      .sub(uRainHalfH);
    position.z = centerPos.z.add(wrappedDz);

    const coords = collisionHeight.getUV(position);
    const collisionData = texture(collisionHeight.renderTarget.texture, coords);
    const floorHeight = collisionData.y;
    const floorPosition = floorHeight.add(float(0.05));

    If(position.y.lessThan(floorPosition), () => {
      const seed = float(instanceIndex).add(time.mul(1000));

      position.y = hash(seed.add(77.7)).mul(15).add(20);
      position.x = hash(seed.add(11.1))
        .mul(uRainAreaWidth)
        .sub(uRainHalfW)
        .add(centerPos.x);
      position.z = hash(seed.add(44.4))
        .mul(uRainAreaHeight)
        .sub(uRainHalfH)
        .add(centerPos.z);
      velocity.y = hash(seed.add(99.9))
        .mul(uFallSpeedVariance)
        .sub(uFallSpeedVariance.mul(0.5))
        .sub(uFallSpeed);
    });
  });

  const computeParticles = computeUpdate().compute(activeCount);

  const computeSplashUpdate = Fn(() => {
    const splashPos = splashPositionBuffer.element(instanceIndex);
    const lastCycle = splashCycleBuffer.element(instanceIndex);

    const centerPos = uCameraPos.add(uCameraDir.mul(uCameraForwardOffset));
    const phase = hash(instanceIndex).mul(6.28);
    const cycleIndex = floor(time.mul(uSplashSpeed).add(phase)).toUint();

    If(cycleIndex.notEqual(lastCycle), () => {
      lastCycle.assign(cycleIndex);

      const seed = instanceIndex.add(cycleIndex.mul(uint(196613)));
      const randX = hash(seed);
      const randZ = hash(seed.add(uint(77777)));

      const offsetX = randX.mul(uRainAreaWidth).sub(uRainHalfW);
      const offsetZ = randZ.mul(uRainAreaHeight).sub(uRainHalfH);

      splashPos.x = centerPos.x.add(offsetX);
      splashPos.z = centerPos.z.add(offsetZ);

      const coords = collisionHeight.getUV(splashPos);
      const floorY = texture(collisionHeight.renderTarget.texture, coords).y;
      splashPos.y = floorY.add(0.06);
    });

    const dx = splashPos.x.sub(centerPos.x);
    const dz = splashPos.z.sub(centerPos.z);

    const wrappedDx = fract(dx.add(uRainHalfW).div(uRainAreaWidth))
      .mul(uRainAreaWidth)
      .sub(uRainHalfW);
    const newX = centerPos.x.add(wrappedDx);

    const wrappedDz = fract(dz.add(uRainHalfH).div(uRainAreaHeight))
      .mul(uRainAreaHeight)
      .sub(uRainHalfH);
    const newZ = centerPos.z.add(wrappedDz);

    If(newX.notEqual(splashPos.x).or(newZ.notEqual(splashPos.z)), () => {
      splashPos.x = newX;
      splashPos.z = newZ;

      const coords = collisionHeight.getUV(splashPos);
      const floorY = texture(collisionHeight.renderTarget.texture, coords).y;
      splashPos.y = floorY.add(0.06);
    });
  });

  const computeSplash = computeSplashUpdate().compute(activeCount);

  function syncCameraUniforms(activeCamera) {
    uCameraPos.value.copy(activeCamera.position);
    activeCamera.getWorldDirection(_cameraDirection);
    _cameraDirection.y = 0;
    if (_cameraDirection.lengthSq() > 0) {
      _cameraDirection.normalize();
    }
    uCameraDir.value.copy(_cameraDirection);
    uCameraPos.needsUpdate = true;
    uCameraDir.needsUpdate = true;
  }

  if (camera) {
    syncCameraUniforms(camera);
  }

  renderer.compute(computeInit);
  renderer.compute(computeParticles);

  const [rainTexture, splashSheet] = await Promise.all([
    loadTexture(RAIN_TEXTURE_PATH),
    loadTexture(SPLASH_TEXTURE_PATH),
  ]);
  rainTexture.colorSpace = THREE.SRGBColorSpace;
  splashSheet.colorSpace = THREE.SRGBColorSpace;

  const rainStreakScale = vec3(
    float(RAIN_STREAK_WIDTH),
    float(RAIN_STREAK_HEIGHT),
    float(1),
  );

  const rainMaterial = new THREE.MeshBasicNodeMaterial();
  rainMaterial.colorNode = color(0xdcf4ff);
  rainMaterial.opacityNode = texture(rainTexture, uv())
    .a.mul(uOpacity)
    .mul(uIntensity);
  rainMaterial.positionNode = positionGeometry.mul(rainStreakScale);
  rainMaterial.vertexNode = billboarding({
    position: positionBuffer.toAttribute(),
    horizontal: true,
    vertical: true,
  });
  rainMaterial.depthWrite = false;
  rainMaterial.depthTest = true;
  rainMaterial.transparent = true;
  rainMaterial.toneMapped = false;

  const rainGeometry = new THREE.PlaneGeometry(1, 1);
  rainGeometry.translate(0, 0.5, 0);

  const rainParticles = new THREE.Mesh(rainGeometry, rainMaterial);
  rainParticles.count = activeCount;
  rainParticles.frustumCulled = false;
  rainParticles.renderOrder = 12;
  setRainLayer(rainParticles);
  group.add(rainParticles);

  const splashPhase = hash(instanceIndex).mul(6.28);
  const splashCycleTime = fract(time.mul(uSplashSpeed).add(splashPhase));
  const framePos = splashCycleTime.mul(float(SPLASH_FRAMES));
  const frameA = floor(framePos).toFloat();
  const frameB = frameA.add(1).min(float(SPLASH_FRAMES - 1));
  const frameMix = fract(framePos);

  const splashUV = uv();
  const uvA = vec2(
    splashUV.x.div(float(SPLASH_FRAMES)).add(frameA.div(float(SPLASH_FRAMES))),
    splashUV.y,
  );
  const uvB = vec2(
    splashUV.x.div(float(SPLASH_FRAMES)).add(frameB.div(float(SPLASH_FRAMES))),
    splashUV.y,
  );

  const sampleA = texture(splashSheet, uvA);
  const sampleB = texture(splashSheet, uvB);
  const splashSample = mix(sampleA, sampleB, frameMix);

  const splashBaseScale = hash(instanceIndex.add(uint(12345)))
    .mul(0.7)
    .add(0.3);
  const splashScale = splashBaseScale
    .mul(mix(uSplashStartScale, uSplashEndScale, splashCycleTime))
    .mul(uSplashSize);

  const splashFade = splashCycleTime.oneMinus().smoothstep(0, 0.5);

  const splashMaterial = new THREE.MeshBasicNodeMaterial();
  splashMaterial.colorNode = color(0xdcf4ff);
  // water-splash.webp has no real alpha channel (always opaque); the sprite
  // shape is encoded as grayscale luminance (r === g === b), so use .r as
  // the opacity mask instead of .a which is always 1.0.
  splashMaterial.opacityNode = splashSample.r
    .mul(uSplashOpacity)
    .mul(splashFade);
  splashMaterial.positionNode = positionGeometry.mul(splashScale);
  splashMaterial.vertexNode = billboarding({
    position: splashPositionBuffer.toAttribute(),
    horizontal: true,
    vertical: true,
  });
  splashMaterial.depthWrite = false;
  splashMaterial.depthTest = true;
  splashMaterial.transparent = true;

  const splashGeometry = new THREE.PlaneGeometry(
    SPLASH_GEOMETRY_SIZE,
    SPLASH_GEOMETRY_SIZE,
  );

  const splashParticles = new THREE.Mesh(splashGeometry, splashMaterial);
  splashParticles.count = activeCount;
  splashParticles.frustumCulled = false;
  splashParticles.renderOrder = 11;
  setRainLayer(splashParticles);
  group.add(splashParticles);

  function syncVisibility() {
    group.visible = params.enabled;
    rainParticles.visible = params.enabled;
    splashParticles.visible = params.enabled;
  }

  function update(_delta, camera) {
    if (!params.enabled) {
      group.visible = false;
      return;
    }

    syncVisibility();

    syncCameraUniforms(camera);

    renderer.compute(computeParticles);
    renderer.compute(computeSplash);
  }

  function setEnabled(value) {
    params.enabled = Boolean(value);
    syncVisibility();
  }

  function setDropCount(value) {
    const nextCount = Math.max(500, Math.min(MAX_COUNT, Math.round(value)));
    params.count = nextCount;
    rainParticles.count = nextCount;
    splashParticles.count = nextCount;
  }

  function setOpacity(value) {
    params.opacity = value;
    uOpacity.value = value;
    uOpacity.needsUpdate = true;
  }

  function setIntensity(value) {
    params.intensity = value;
    uIntensity.value = value;
    uIntensity.needsUpdate = true;
  }

  function setSplashOpacity(value) {
    params.splashOpacity = value;
    uSplashOpacity.value = value;
    uSplashOpacity.needsUpdate = true;
  }

  function setSplashSpeed(value) {
    params.splashSpeed = value;
    uSplashSpeed.value = value;
    uSplashSpeed.needsUpdate = true;
  }

  function setFallSpeed(value) {
    params.fallSpeed = value;
    uFallSpeed.value = value;
    uFallSpeed.needsUpdate = true;
  }

  function setSplashSize(value) {
    params.splashSize = value;
    uSplashSize.value = value;
    uSplashSize.needsUpdate = true;
  }

  function setSplashStartScale(value) {
    params.splashStartScale = value;
    uSplashStartScale.value = value;
    uSplashStartScale.needsUpdate = true;
  }

  function setSplashEndScale(value) {
    params.splashEndScale = value;
    uSplashEndScale.value = value;
    uSplashEndScale.needsUpdate = true;
  }

  function setRainAreaWidth(value) {
    params.rainAreaWidth = value;
    uRainAreaWidth.value = value;
    uRainAreaWidth.needsUpdate = true;
    uRainHalfW.value = value / 2;
    uRainHalfW.needsUpdate = true;
  }

  function setRainAreaHeight(value) {
    params.rainAreaHeight = value;
    uRainAreaHeight.value = value;
    uRainAreaHeight.needsUpdate = true;
    uRainHalfH.value = value / 2;
    uRainHalfH.needsUpdate = true;
  }

  function dispose() {
    scene.remove(group);
    rainGeometry.dispose();
    rainMaterial.dispose();
    rainTexture.dispose();
    splashGeometry.dispose();
    splashMaterial.dispose();
    splashSheet.dispose();
  }

  syncVisibility();

  return {
    group,
    rainParticles,
    splashParticles,
    layer: RAIN_LAYER,
    useDedicatedPass: false,
    params,
    update,
    setEnabled,
    setDropCount,
    setOpacity,
    setIntensity,
    setSplashOpacity,
    setSplashSpeed,
    setFallSpeed,
    setSplashSize,
    setSplashStartScale,
    setSplashEndScale,
    setRainAreaWidth,
    setRainAreaHeight,
    dispose,
  };
}
