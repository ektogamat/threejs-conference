import * as THREE from "three/webgpu";
import {
  Fn,
  normalMap,
  rangeFogFactor,
  screenUV,
  texture,
  textureBicubic,
  uniform,
  uv,
  vec4,
} from "three/tsl";

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
 * with roughness blur and normal UV warp from webgpu_reflection_roughness.
 */
export function createGround(scene, {
  size = 400,
  y = -5.5,
  uvRepeat = 14.9,
  resolutionScale = 0.5,
  fogNear = 0,
  fogFar = 51,
  roughnessScale = 0.55,
  reflectionBlur = 1.52,
  reflectionStrength = 0.005,
  normalWarp = 0.035,
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
  renderTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
  renderTarget.texture.magFilter = THREE.LinearFilter;
  renderTarget.texture.generateMipmaps = true;

  const mirrorCamera = new THREE.PerspectiveCamera();

  const uUvRepeat = uniform(uvRepeat);
  const uRoughnessScale = uniform(roughnessScale);
  const uReflectionBlur = uniform(reflectionBlur);
  const uReflectionStrength = uniform(reflectionStrength);
  const uNormalWarp = uniform(normalWarp);
  const uFogNear = uniform(fogNear);
  const uFogFar = uniform(fogFar);

  // Shared tiling for albedo, roughness, and normal.
  const tiledUV = uv().mul(uUvRepeat);
  const roughness = texture(roughnessMap, tiledUV).r;
  const albedo = texture(albedoMap, tiledUV);
  const normalSample = texture(normalMapTex, tiledUV);

  // Warp reflection UV by normal map (webgpu_reflection style).
  const normalOffset = normalSample.xy.mul(2).sub(1).mul(uNormalWarp);
  const reflectionUV = screenUV.flipX().add(normalOffset);
  const reflectionTex = texture(renderTarget.texture, reflectionUV);

  const material = new THREE.MeshStandardNodeMaterial();
  material.transparent = true;
  material.metalness = 0;
  material.roughnessNode = roughness.mul(uRoughnessScale);
  material.normalNode = normalMap(normalSample);
  material.colorNode = Fn(() => {
    const opacity = rangeFogFactor(uFogNear, uFogFar).oneMinus();
    return vec4(albedo.rgb, opacity);
  })();
  material.emissiveNode = Fn(() => {
    const dirtyReflection = textureBicubic(
      reflectionTex,
      roughness.mul(uReflectionBlur),
    );
    const wetness = roughness.oneMinus();
    const opacity = rangeFogFactor(uFogNear, uFogFar).oneMinus();
    return dirtyReflection.rgb.mul(wetness).mul(uReflectionStrength).mul(opacity);
  })();

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.name = "ReflectiveGround";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);

  function updateReflection(renderer, camera) {
    renderer.getDrawingBufferSize(_size);
    const width = Math.max(1, Math.round(_size.width * resolutionScale));
    const height = Math.max(1, Math.round(_size.height * resolutionScale));
    if (renderTarget.width !== width || renderTarget.height !== height) {
      renderTarget.setSize(width, height);
    }

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
      reflectionBlur: uReflectionBlur,
      reflectionStrength: uReflectionStrength,
      normalWarp: uNormalWarp,
      fogNear: uFogNear,
      fogFar: uFogFar,
    },
    updateReflection,
    dispose,
  };
}
