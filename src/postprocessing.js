import { RenderPipeline, BlendMode, NormalBlending } from "three/webgpu";
import { pass, mrt, output, emissive, vec4, mix, smoothstep, uniform, vec3 } from "three/tsl";
import { UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { lensflare } from "three/addons/tsl/display/LensflareNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";
import { boxBlur } from "./tsl/boxBlur.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";

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

  const bloomPass = bloom(scenePassEmissive, 1.5, 0.16);
  const bloomPassWide = bloom(scenePassEmissive, 2.2, 0.85);

  // Bloom-based lens flares from neon/emissive glows (webgpu_postprocessing_lensflare).
  const lensflareThreshold = uniform(0.09);
  const lensflareGhostAttenuation = uniform(50);
  const lensflareGhostSpacing = uniform(0.27);
  const lensflareStrength = uniform(0.71);

  const flarePass = lensflare(bloomPass, {
    threshold: lensflareThreshold,
    ghostAttenuationFactor: lensflareGhostAttenuation,
    ghostSpacing: lensflareGhostSpacing,
  });
  const flareBlurred = gaussianBlur(flarePass, 8);
  const flareContribution = flareBlurred.mul(lensflareStrength);

  const look = createCyberpunkLook({ scenePass });

  const blurSize = uniform(2);
  const blurSpread = uniform(2);
  const minDistance = uniform(36);
  const maxDistance = uniform(75);
  const dofEnabled = uniform(1);
  const focusPointView = uniform(vec3());

  const scenePassViewZ = scenePass.getViewZNode();

  const blurFactor = smoothstep(
    minDistance,
    maxDistance,
    scenePassViewZ.sub(focusPointView.z).abs(),
  );
  const dofMix = blurFactor.mul(dofEnabled);

  // DOF on the beauty pass only (before grade/chroma/grain/bloom), matching the
  // three.js example. Mixing sharp vs blurred *after* those effects causes edge
  // shimmer that reads as aliasing at the focus band.
  const blurredBeauty = boxBlur(scenePassColor, {
    size: blurSize,
    separation: blurSpread,
    premultipliedAlpha: true,
  });
  const beautyWithDof = mix(scenePassColor, blurredBeauty, dofMix);

  // FXAA wants tone-mapped / graded input (unlike SMAA, which prefers linear).
  // Applying after look also avoids SMAA's multi-target RenderAttachment conflicts.
  const composed = look.buildComposite(beautyWithDof, {
    bloomContribution: bloomPass.add(bloomPassWide).add(flareContribution),
  });
  const finalOutput = smaa(composed);
  post.outputNode = finalOutput;

  function updateFocusPoint(focusPoint, activeCamera) {
    activeCamera.updateMatrixWorld();
    focusPointView.value.copy(focusPoint).applyMatrix4(activeCamera.matrixWorldInverse);
  }

  function restoreCombinedOutput() {
    post.outputNode = finalOutput;
    post.needsUpdate = true;
  }

  function applyLookPreset(id, options = {}) {
    return look.applyPreset(id, {
      bloomPass,
      bloomPassWide,
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
    bloomPassWide,
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
  };
}
