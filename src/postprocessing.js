import { RenderPipeline, BlendMode, NormalBlending } from "three/webgpu";
import { pass, mrt, output, emissive, vec4, mix, smoothstep, uniform, vec3 } from "three/tsl";
import { UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { lensflare } from "three/addons/tsl/display/LensflareNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";
import { boxBlurSeparable } from "./tsl/boxBlur.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { performanceProfile } from "./performanceProfile.js";

export function createPostProcessing(renderer, scene, camera) {
  const post = new RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  const mrtNode = mrt({
    output,
    emissive: vec4(emissive, output.a),
  });
  mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
  scenePass.setMRT(mrtNode);

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassEmissive = scenePass.getTextureNode("emissive");

  scenePass.getTexture("emissive").type = UnsignedByteType;

  const bloomPass = bloom(scenePassEmissive, 2.5, 0.45);
  bloomPass.setResolutionScale(performanceProfile.bloomResolutionScale);
  const bloomEnabled = uniform(performanceProfile.bloom ? 1 : 0);

  const lensflareThreshold = uniform(0.09);
  const lensflareGhostAttenuation = uniform(50);
  const lensflareGhostSpacing = uniform(0.27);
  const lensflareStrength = uniform(0.71);
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

  const blurSize = uniform(2);
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

  const blurredBeauty = boxBlurSeparable(scenePassColor, {
    size: blurSize,
    separation: blurSpread,
    premultipliedAlpha: true,
  });
  const beautyWithDof = mix(scenePassColor, blurredBeauty, dofMix);

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
  }

  return {
    post,
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
