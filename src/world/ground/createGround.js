import * as THREE from "three/webgpu";
import {
  float,
  mix,
  normalMap,
  positionWorld,
  texture,
  uniform,
  uv,
  vec4,
} from "three/tsl";
import { createRainRipples } from "../../tsl/rainRipples.js";
import { createSsrMirrorProbe } from "./createSsrMirrorProbe.js";

const ALBEDO_PATH = "/textures/wet-puddles-albedo.jpg";
const ROUGHNESS_PATH = "/textures/wet-puddles-roughness.jpg";
const NORMAL_PATH = "/textures/wet-puddles-normal.jpg";

/**
 * Wet ground — SSR-only reflections (no planar mirror RT).
 * Opaque receiver; horizon fade comes from post-process fog.
 */
export function createGround(
  scene,
  {
    size = 400,
    y = -5.4,
    uvRepeat = 14.9,
    roughnessScale = 1,
    rippleAmount = 1,
    rippleScale = 4.1,
    rippleSpeed = 3,
    rippleNormalStrength = 0.14,
    probeSize = 48,
    probeVisible = false,
    probeX = -138,
    probeZ = 34,
  } = {},
) {
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

  const uUvRepeat = uniform(uvRepeat);
  const uRoughnessScale = uniform(roughnessScale);
  const uTime = uniform(0);
  const uRippleAmount = uniform(rippleAmount);
  const uRippleScale = uniform(rippleScale);
  const uRippleSpeed = uniform(rippleSpeed);
  const uRippleNormalStrength = uniform(rippleNormalStrength);

  const uDryMetalness = uniform(1);
  const uWetMetalness = uniform(0);
  const uDryRoughnessMin = uniform(0.05);
  const uWetRoughness = uniform(0.12);
  const uWetnessFloor = uniform(0.65);

  const getRipples = createRainRipples({ uTime, uRippleSpeed });
  const tiledUV = uv().mul(uUvRepeat);
  const roughnessSample = texture(roughnessMap, tiledUV).r;
  const albedo = texture(albedoMap, tiledUV);
  const normalSample = texture(normalMapTex, tiledUV);
  const wetness = roughnessSample.oneMinus().max(uWetnessFloor);

  const rippleSample = getRipples(positionWorld.xz.mul(uRippleScale));
  const rippleNormalOffset = rippleSample.xy
    .mul(uRippleAmount)
    .mul(uRippleNormalStrength);
  const perturbedNormal = vec4(
    normalSample.xy.add(rippleNormalOffset),
    normalSample.zw,
  );

  const material = new THREE.MeshStandardNodeMaterial();
  material.name = "WetGroundSSR";
  material.transparent = false;
  material.depthWrite = true;
  material.metalness = 1;
  material.roughness = 0.05;
  material.colorNode = albedo;
  material.metalnessNode = mix(uDryMetalness, uWetMetalness, wetness);
  material.roughnessNode = mix(
    roughnessSample.mul(uRoughnessScale).max(uDryRoughnessMin),
    uWetRoughness,
    wetness,
  );
  material.normalNode = normalMap(perturbedNormal);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.name = "ReflectiveGround";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const ssrProbe = createSsrMirrorProbe(scene, {
    groundY: y,
    size: probeSize,
    visible: probeVisible,
    x: probeX,
    z: probeZ,
  });

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

  function setDryMetalness(value) {
    uDryMetalness.value = value;
    uDryMetalness.needsUpdate = true;
    material.metalness = value;
  }

  function setWetMetalness(value) {
    uWetMetalness.value = value;
    uWetMetalness.needsUpdate = true;
  }

  function setDryRoughnessMin(value) {
    uDryRoughnessMin.value = value;
    uDryRoughnessMin.needsUpdate = true;
    material.roughness = value;
  }

  function setWetRoughness(value) {
    uWetRoughness.value = value;
    uWetRoughness.needsUpdate = true;
  }

  function setWetnessFloor(value) {
    uWetnessFloor.value = value;
    uWetnessFloor.needsUpdate = true;
  }

  function dispose() {
    ssrProbe.dispose();
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    albedoMap.dispose();
    roughnessMap.dispose();
    normalMapTex.dispose();
  }

  return {
    mesh,
    material,
    ssrProbe,
    uniforms: {
      uvRepeat: uUvRepeat,
      roughnessScale: uRoughnessScale,
      dryMetalness: uDryMetalness,
      wetMetalness: uWetMetalness,
      dryRoughnessMin: uDryRoughnessMin,
      wetRoughness: uWetRoughness,
      wetnessFloor: uWetnessFloor,
      rippleAmount: uRippleAmount,
      rippleScale: uRippleScale,
      rippleSpeed: uRippleSpeed,
      rippleNormalStrength: uRippleNormalStrength,
    },
    update,
    setRippleAmount,
    setRippleScale,
    setRippleSpeed,
    setDryMetalness,
    setWetMetalness,
    setDryRoughnessMin,
    setWetRoughness,
    setWetnessFloor,
    dispose,
  };
}
