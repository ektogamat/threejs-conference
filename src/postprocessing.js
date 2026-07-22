import { RenderPipeline, BlendMode, NormalBlending } from "three/webgpu";
import {
  pass,
  mrt,
  output,
  emissive,
  vec4,
  mix,
  smoothstep,
  uniform,
  vec3,
  screenUV,
} from "three/tsl";
import { AdditiveBlending, UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { lensflare } from "three/addons/tsl/display/LensflareNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";
import { boxBlurSeparable } from "./tsl/boxBlur.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { performanceProfile } from "./performanceProfile.js";

const DEFAULT_REFRACTION_STRENGTH = 0.45;

export function createPostProcessing(renderer, scene, camera, { rain } = {}) {
  const post = new RenderPipeline(renderer);
  const rainLayer = rain?.layer ?? null;

  const beautyCamera = camera.clone();
  if (rainLayer !== null) {
    beautyCamera.layers.disable(rainLayer);
  }

  const rainCamera =
    rainLayer !== null
      ? (() => {
          const nextCamera = camera.clone();
          nextCamera.layers.disable(0);
          nextCamera.layers.enable(rainLayer);
          return nextCamera;
        })()
      : null;

  function syncCameras(sourceCamera) {
    beautyCamera.copy(sourceCamera, false);
    if (rainLayer !== null) {
      beautyCamera.layers.disable(rainLayer);
    }
    beautyCamera.updateMatrixWorld(true);

    if (rainCamera) {
      rainCamera.copy(sourceCamera, false);
      rainCamera.layers.disable(0);
      rainCamera.layers.enable(rainLayer);
      rainCamera.updateMatrixWorld(true);
    }
  }

  syncCameras(camera);

  const scenePass = pass(scene, beautyCamera);
  const mrtNode = mrt({
    output,
    emissive: vec4(emissive, output.a),
  });
  mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
  scenePass.setMRT(mrtNode);

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassEmissive = scenePass.getTextureNode("emissive");

  scenePass.getTexture("emissive").type = UnsignedByteType;
  scenePass.getTexture("output").type = UnsignedByteType;

  const refractionParams = {
    enabled: false,
    strength: DEFAULT_REFRACTION_STRENGTH,
  };
  const refractionEnabled = uniform(refractionParams.enabled ? 1 : 0);
  const refractionStrength = uniform(refractionParams.strength);

  let rainPass = null;
  let rainPassColor = null;
  let rainPassOffset = null;

  if (rainCamera) {
    rainPass = pass(scene, rainCamera);
    const rainMrt = mrt({
      output,
      // Signed UV offsets from the dedicated refract sprites (emissiveNode).
      // Additive keeps overlapping streaks from canceling mid-gray packing.
      offset: vec4(emissive.r, emissive.g, 0, 1),
    });
    rainMrt.setBlendMode("offset", new BlendMode(AdditiveBlending));
    rainPass.setMRT(rainMrt);
    rainPassColor = rainPass.getTextureNode("output");
    rainPassOffset = rainPass.getTextureNode("offset");
  }

  const distortionOffset = rainPassOffset
    ? rainPassOffset.rg.mul(refractionStrength).mul(refractionEnabled)
    : null;
  const warpedBeauty = distortionOffset
    ? scenePassColor.sample(screenUV.add(distortionOffset))
    : scenePassColor;
  const rainStreaks = rainPassColor
    ? rainPassColor.rgb.mul(rainPassColor.a)
    : null;
  const beautyWithRain = rainStreaks
    ? warpedBeauty.add(rainStreaks)
    : warpedBeauty;

  const bloomPass = bloom(scenePassEmissive, 2.5, 0.45);
  bloomPass.setResolutionScale(performanceProfile.bloomResolutionScale);
  const bloomEnabled = uniform(performanceProfile.bloom ? 1 : 0);

  const lensflareThreshold = uniform(0.09);
  const lensflareGhostAttenuation = uniform(50);
  const lensflareGhostSpacing = uniform(0.27);
  const lensflareStrength = uniform(0.3);
  const lensflareEnabled = uniform(performanceProfile.lensflare ? 1 : 0);
  const lensflareBlurRadius = uniform(performanceProfile.lensflareBlurRadius);

  const flarePass = lensflare(bloomPass, {
    threshold: lensflareThreshold,
    ghostAttenuationFactor: lensflareGhostAttenuation,
    ghostSpacing: lensflareGhostSpacing,
  });
  const flareBlurred = gaussianBlur(flarePass, lensflareBlurRadius, 4, {
    resolutionScale: performanceProfile.lensflareResolutionScale,
  });
  const flareContribution = flareBlurred.mul(lensflareStrength).mul(lensflareEnabled);

  const look = createCyberpunkLook({ scenePass });

  const blurSize = uniform(3);
  const blurSpread = uniform(2);
  const minDistance = uniform(36);
  const maxDistance = uniform(75);
  const dofEnabled = uniform(performanceProfile.dof ? 1 : 0);
  const focusPointView = uniform(vec3());

  const scenePassViewZ = scenePass.getViewZNode();

  const blurFactor = smoothstep(
    minDistance,
    maxDistance,
    scenePassViewZ.sub(focusPointView.z).abs(),
  );
  const dofMix = blurFactor.mul(dofEnabled);

  const blurredBeauty = boxBlurSeparable(beautyWithRain, {
    size: blurSize,
    separation: blurSpread,
    premultipliedAlpha: true,
  });
  const beautyWithDof = mix(beautyWithRain, blurredBeauty, dofMix);

  const composed = look.buildComposite(beautyWithDof, {
    bloomContribution: bloomPass.mul(bloomEnabled).add(flareContribution),
  });
  const finalOutputWithSmaa = smaa(composed);
  let smaaActive = performanceProfile.smaa;
  post.outputNode = smaaActive ? finalOutputWithSmaa : composed;

  function updateFocusPoint(focusPoint, activeCamera) {
    activeCamera.updateMatrixWorld();
    focusPointView.value.copy(focusPoint).applyMatrix4(activeCamera.matrixWorldInverse);
  }

  function restoreCombinedOutput() {
    post.outputNode = smaaActive ? finalOutputWithSmaa : composed;
    post.needsUpdate = true;
  }

  function setBloomEnabled(enabled) {
    bloomEnabled.value = enabled ? 1 : 0;
    bloomEnabled.needsUpdate = true;
  }

  function setBloomResolutionScale(scale) {
    bloomPass.setResolutionScale(scale);
  }

  function setDofEnabled(enabled) {
    dofEnabled.value = enabled ? 1 : 0;
    dofEnabled.needsUpdate = true;
  }

  function setLensflareEnabled(enabled) {
    lensflareEnabled.value = enabled ? 1 : 0;
    lensflareEnabled.needsUpdate = true;
  }

  function setLensflareResolutionScale(scale) {
    flareBlurred.resolutionScale = scale;
  }

  function setLensflareBlurRadius(radius) {
    lensflareBlurRadius.value = radius;
    lensflareBlurRadius.needsUpdate = true;
  }

  function setSmaaEnabled(enabled) {
    smaaActive = Boolean(enabled);
    post.outputNode = smaaActive ? finalOutputWithSmaa : composed;
    post.needsUpdate = true;
  }

  function setRefractionEnabled(enabled) {
    refractionParams.enabled = Boolean(enabled);
    refractionEnabled.value = refractionParams.enabled ? 1 : 0;
    refractionEnabled.needsUpdate = true;
    // Skip drawing the dedicated refract sprites when off — main rain cost
    // of the effect. Rain pass still runs for visible streaks.
    rain?.setRefractEnabled?.(refractionParams.enabled);
  }

  setRefractionEnabled(refractionParams.enabled);

  function setRefractionStrength(strength) {
    refractionParams.strength = strength;
    refractionStrength.value = strength;
    refractionStrength.needsUpdate = true;
  }

  function applyLookPreset(id, options = {}) {
    return look.applyPreset(id, {
      bloomPass,
      lensflare: {
        strength: lensflareStrength,
        threshold: lensflareThreshold,
        ghostSpacing: lensflareGhostSpacing,
        ghostAttenuation: lensflareGhostAttenuation,
      },
      ...options,
    });
  }

  function resizePostProcessing() {
    const width = Math.max(1, renderer.domElement.width);
    const height = Math.max(1, renderer.domElement.height);
    scenePass.setSize(width, height);
    rainPass?.setSize(width, height);
  }

  return {
    post,
    beautyCamera,
    rainCamera,
    syncCameras,
    bloomPass,
    lensflare: {
      pass: flareBlurred,
      strength: lensflareStrength,
      threshold: lensflareThreshold,
      ghostSpacing: lensflareGhostSpacing,
      ghostAttenuation: lensflareGhostAttenuation,
    },
    look,
    applyLookPreset,
    restoreCombinedOutput,
    resizePostProcessing,
    scenePassColor,
    scenePassEmissive,
    composedOutput: composed,
    refraction: {
      params: refractionParams,
      enabled: refractionEnabled,
      strength: refractionStrength,
      setEnabled: setRefractionEnabled,
      setStrength: setRefractionStrength,
    },
    dof: {
      blurSize,
      blurSpread,
      minDistance,
      maxDistance,
      enabled: dofEnabled,
      focusPointView,
      updateFocusPoint,
    },
    perf: {
      setBloomEnabled,
      setBloomResolutionScale,
      setDofEnabled,
      setLensflareEnabled,
      setLensflareResolutionScale,
      setLensflareBlurRadius,
      setSmaaEnabled,
    },
  };
}
