import * as THREE from "three/webgpu";
import {
  Fn,
  normalMap,
  positionWorld,
  rangeFogFactor,
  screenUV,
  texture,
  uniform,
  uv,
  vec4,
} from "three/tsl";
import { createRainRipples } from "../../tsl/rainRipples.js";
import { performanceProfile } from "../../platform/performanceProfile.js";
import { RAIN_LAYER } from "../weather/createCollisionRain.js";

const ALBEDO_PATH = "/textures/wet-puddles-albedo.jpg";
const ROUGHNESS_PATH = "/textures/wet-puddles-roughness.jpg";
const NORMAL_PATH = "/textures/wet-puddles-normal.jpg";

const _size = new THREE.Vector2();
const _normal = new THREE.Vector3();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _lookAtPosition = new THREE.Vector3();
const _camWorldPos = new THREE.Vector3();
const _reflectorWorldPos = new THREE.Vector3();
const _rotationMatrix = new THREE.Matrix4();
const _reflectorPlane = new THREE.Plane();
const _clipPlane = new THREE.Vector4();
const _q = new THREE.Vector4();

/**
 * Wet reflective ground. Manual planar reflection (separate renderer.render)
 * avoids WebGPU TextureBinding|RenderAttachment from TSL reflector() inside
 * PassNode. Composes like webgpu_reflection (albedo + emissive reflection)
 * with normal UV warp from webgpu_reflection_roughness.
 */
export function createGround(scene, {
  size = 400,
  y = -5.4,
  uvRepeat = 14.9,
  fogNear = 0,
  fogFar = 51,
  roughnessScale = 0.55,
  reflectionStrength = 0.08,
  normalWarp = 0.035,
  rippleAmount = 1,
  rippleScale = 4.83,
  rippleSpeed = 3,
  rippleStrength = 0.08,
  rippleNormalStrength = 0.015,
} = {}) {
  const textureLoader = new THREE.TextureLoader();

  const albedoMap = textureLoader.load(ALBEDO_PATH);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.colorSpace = THREE.SRGBColorSpace;

  const roughnessMap = textureLoader.load(ROUGHNESS_PATH);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  const normalMapTex = textureLoader.load(NORMAL_PATH);
  normalMapTex.wrapS = THREE.RepeatWrapping;
  normalMapTex.wrapT = THREE.RepeatWrapping;

  const renderTarget = new THREE.RenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  renderTarget.texture.name = "GroundPlanarReflection";
  renderTarget.texture.minFilter = THREE.LinearFilter;
  renderTarget.texture.magFilter = THREE.LinearFilter;
  renderTarget.texture.generateMipmaps = false;

  const mirrorCamera = new THREE.PerspectiveCamera();

  const uUvRepeat = uniform(uvRepeat);
  const uRoughnessScale = uniform(roughnessScale);
  const uReflectionStrength = uniform(reflectionStrength);
  const uReflectionEnabled = uniform(1);
  const uNormalWarp = uniform(normalWarp);
  const uFogNear = uniform(fogNear);
  const uFogFar = uniform(fogFar);
  const uTime = uniform(0);
  const uRippleAmount = uniform(rippleAmount);
  const uRippleScale = uniform(rippleScale);
  const uRippleSpeed = uniform(rippleSpeed);
  const uRippleStrength = uniform(rippleStrength);
  const uRippleNormalStrength = uniform(rippleNormalStrength);

  const getRipples = createRainRipples({ uTime, uRippleSpeed });

  // Shared tiling for albedo, roughness, and normal.
  const tiledUV = uv().mul(uUvRepeat);
  const roughness = texture(roughnessMap, tiledUV).r;
  const albedo = texture(albedoMap, tiledUV);
  const normalSample = texture(normalMapTex, tiledUV);
  const rippleSample = getRipples(positionWorld.xz.mul(uRippleScale));
  const rippleReflectionOffset = rippleSample.xy
    .mul(uRippleAmount)
    .mul(uRippleStrength);
  const rippleNormalOffset = rippleSample.xy
    .mul(uRippleAmount)
    .mul(uRippleNormalStrength);
  const perturbedNormalSample = vec4(
    normalSample.xy.add(rippleNormalOffset),
    normalSample.zw,
  );

  // Warp reflection UV by normal map and rain ripples.
  const normalOffset = normalSample.xy.mul(2).sub(1).mul(uNormalWarp);
  const reflectionUV = screenUV
    .flipX()
    .add(normalOffset)
    .add(rippleReflectionOffset);
  const reflectionTex = texture(renderTarget.texture, reflectionUV);

  const material = new THREE.MeshStandardNodeMaterial();
  material.transparent = true;
  material.depthWrite = true;
  material.metalness = 0;
  material.roughnessNode = roughness.mul(uRoughnessScale);
  material.normalNode = normalMap(perturbedNormalSample);
  material.colorNode = Fn(() => {
    const opacity = rangeFogFactor(uFogNear, uFogFar).oneMinus();
    return vec4(albedo.rgb, opacity);
  })();
  material.emissiveNode = Fn(() => {
    const wetness = roughness.oneMinus();
    const opacity = rangeFogFactor(uFogNear, uFogFar).oneMinus();
    return reflectionTex.rgb
      .mul(wetness)
      .mul(uReflectionStrength)
      .mul(uReflectionEnabled)
      .mul(opacity);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.name = "ReflectiveGround";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);

  function update(delta) {
    uTime.value += delta;
    uTime.needsUpdate = true;
  }

  function setRippleAmount(value) {
    uRippleAmount.value = value;
    uRippleAmount.needsUpdate = true;
  }

  function setRippleScale(value) {
    uRippleScale.value = value;
    uRippleScale.needsUpdate = true;
  }

  function setRippleSpeed(value) {
    uRippleSpeed.value = value;
    uRippleSpeed.needsUpdate = true;
  }

  let reflectionFrameCounter = 0;

  function syncReflectionSize(renderer) {
    renderer.getDrawingBufferSize(_size);
    const width = Math.max(
      1,
      Math.round(_size.width * performanceProfile.groundResolutionScale),
    );
    const height = Math.max(
      1,
      Math.round(_size.height * performanceProfile.groundResolutionScale),
    );
    if (renderTarget.width !== width || renderTarget.height !== height) {
      renderTarget.setSize(width, height);
    }
  }

  function setReflectionEnabled(enabled) {
    uReflectionEnabled.value = enabled ? 1 : 0;
    uReflectionEnabled.needsUpdate = true;
  }

  function updateReflection(renderer, camera) {
    if (uReflectionEnabled.value < 0.5) {
      return;
    }

    const frameSkip = Math.max(1, performanceProfile.groundReflectionFrameSkip);
    reflectionFrameCounter += 1;
    if (reflectionFrameCounter % frameSkip !== 0) {
      return;
    }

    syncReflectionSize(renderer);

    _reflectorWorldPos.setFromMatrixPosition(mesh.matrixWorld);
    _camWorldPos.setFromMatrixPosition(camera.matrixWorld);

    _rotationMatrix.extractRotation(mesh.matrixWorld);
    _normal.set(0, 0, 1).applyMatrix4(_rotationMatrix);

    _view.subVectors(_reflectorWorldPos, _camWorldPos);
    _view.reflect(_normal).negate().add(_reflectorWorldPos);

    _rotationMatrix.extractRotation(camera.matrixWorld);
    _lookAtPosition.set(0, 0, -1).applyMatrix4(_rotationMatrix).add(_camWorldPos);
    _target.subVectors(_reflectorWorldPos, _lookAtPosition);
    _target.reflect(_normal).negate().add(_reflectorWorldPos);

    mirrorCamera.coordinateSystem = camera.coordinateSystem;
    mirrorCamera.fov = camera.fov;
    mirrorCamera.aspect = camera.aspect;
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.position.copy(_view);
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(_rotationMatrix).reflect(_normal);
    mirrorCamera.lookAt(_target);
    mirrorCamera.updateMatrixWorld(true);
    mirrorCamera.layers.disable(RAIN_LAYER);
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

    _reflectorPlane.setFromNormalAndCoplanarPoint(
      _normal,
      _reflectorWorldPos,
    );
    _reflectorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
    _clipPlane.set(
      _reflectorPlane.normal.x,
      _reflectorPlane.normal.y,
      _reflectorPlane.normal.z,
      _reflectorPlane.constant,
    );

    const projectionMatrix = mirrorCamera.projectionMatrix;
    _q.x =
      (Math.sign(_clipPlane.x) + projectionMatrix.elements[8]) /
      projectionMatrix.elements[0];
    _q.y =
      (Math.sign(_clipPlane.y) + projectionMatrix.elements[9]) /
      projectionMatrix.elements[5];
    _q.z = -1;
    _q.w =
      (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    _clipPlane.multiplyScalar(1 / _clipPlane.dot(_q));
    projectionMatrix.elements[2] = _clipPlane.x;
    projectionMatrix.elements[6] = _clipPlane.y;
    projectionMatrix.elements[10] =
      renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
        ? _clipPlane.z
        : _clipPlane.z + 1;
    projectionMatrix.elements[14] = _clipPlane.w;

    const wasVisible = mesh.visible;
    mesh.visible = false;

    const prevTarget = renderer.getRenderTarget();
    const prevMRT = renderer.getMRT?.() ?? null;
    const prevAutoClear = renderer.autoClear;

    renderer.setMRT?.(null);
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = true;
    renderer.render(scene, mirrorCamera);

    renderer.setMRT?.(prevMRT);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    mesh.visible = wasVisible;
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    renderTarget.dispose();
    albedoMap.dispose();
    roughnessMap.dispose();
    normalMapTex.dispose();
  }

  return {
    mesh,
    material,
    renderTarget,
    uniforms: {
      uvRepeat: uUvRepeat,
      roughnessScale: uRoughnessScale,
      reflectionStrength: uReflectionStrength,
      reflectionEnabled: uReflectionEnabled,
      normalWarp: uNormalWarp,
      fogNear: uFogNear,
      fogFar: uFogFar,
      rippleAmount: uRippleAmount,
      rippleScale: uRippleScale,
      rippleSpeed: uRippleSpeed,
      rippleStrength: uRippleStrength,
      rippleNormalStrength: uRippleNormalStrength,
    },
    update,
    setRippleAmount,
    setRippleScale,
    setRippleSpeed,
    setReflectionEnabled,
    syncReflectionSize,
    updateReflection,
    dispose,
  };
}
