import { RenderPipeline, BlendMode, NormalBlending } from "three/webgpu";
import {
  pass,
  mrt,
  output,
  emissive,
  normalView,
  materialMetalness,
  materialRoughness,
  diffuseColor,
  velocity,
  packNormalToRGB,
  unpackRGBToNormal,
  sample,
  vec2,
  vec4,
  add,
  mix,
  float,
  step,
  luminance,
  uniform,
  dot,
  exp,
  abs,
  convertToTexture,
  textureSize,
} from "three/tsl";
import { UnsignedByteType } from "three";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import {
  DEFAULT_RENDER_MODE,
  RENDER_MODES,
  isGiRenderMode,
  isRenderMode,
  DEFAULT_FSR_TUNING,
} from "./renderModes.js";
import { temporalReproject } from "three/addons/tsl/display/TemporalReprojectNode.js";
import { recurrentDenoise } from "three/addons/tsl/display/RecurrentDenoiseNode.js";
import { ssgi, applySSGIQualityMode } from "./ssgi/SSGINode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fsr1 } from "three/addons/tsl/display/FSR1Node.js";

function enableResolutionScale(passNode) {
  const setSize = passNode.setSize.bind(passNode);

  passNode.resolutionScale = 1;
  passNode.setSize = (width, height) => {
    setSize(
      Math.round(passNode.resolutionScale * width),
      Math.round(passNode.resolutionScale * height),
    );
  };
}

const defaultSsgiDenoiseParams = {
  enabled: true,
  lumaPhi: 0.75,
  depthPhi: 20,
  normalPhi: 0.3,
  radius: 1.5,
  alphaPhi: 5,
  strength: 0.725,
  adapt: 0.5,
  smoothDisocclusions: true,
  flickerSuppression: 1,
  adaptiveTrust: 1,
};

const defaultSsgiTemporalParams = {
  maxFrames: 8,
  clampIntensity: 0.25,
  flickerSuppression: 1,
};

const defaultAoSoftParams = {
  radius: 2.25,
  depthPhi: 20,
  normalPhi: 0.3,
};

function createSoftSsgiAo({
  giTexture,
  scenePassDepth,
  scenePassNormal,
  radius,
  depthPhi,
  normalPhi,
}) {
  return sample((uvCoord) => {
    const texSize = vec2(textureSize(convertToTexture(giTexture)));
    const texel = vec2(1).div(texSize).mul(radius);

    const centerAo = giTexture.sample(uvCoord).a;
    const centerDepth = scenePassDepth.sample(uvCoord).r;
    const centerNormal = unpackRGBToNormal(scenePassNormal.sample(uvCoord).rgb);

    const neighborUvUp = uvCoord.add(vec2(0, -1).mul(texel));
    const neighborUvLeft = uvCoord.add(vec2(-1, 0).mul(texel));
    const neighborUvRight = uvCoord.add(vec2(1, 0).mul(texel));
    const neighborUvDown = uvCoord.add(vec2(0, 1).mul(texel));

    const aoUp = giTexture.sample(neighborUvUp).a;
    const aoLeft = giTexture.sample(neighborUvLeft).a;
    const aoRight = giTexture.sample(neighborUvRight).a;
    const aoDown = giTexture.sample(neighborUvDown).a;

    const depthUp = scenePassDepth.sample(neighborUvUp).r;
    const depthLeft = scenePassDepth.sample(neighborUvLeft).r;
    const depthRight = scenePassDepth.sample(neighborUvRight).r;
    const depthDown = scenePassDepth.sample(neighborUvDown).r;

    const normalUp = unpackRGBToNormal(
      scenePassNormal.sample(neighborUvUp).rgb,
    );
    const normalLeft = unpackRGBToNormal(
      scenePassNormal.sample(neighborUvLeft).rgb,
    );
    const normalRight = unpackRGBToNormal(
      scenePassNormal.sample(neighborUvRight).rgb,
    );
    const normalDown = unpackRGBToNormal(
      scenePassNormal.sample(neighborUvDown).rgb,
    );

    const weightUp = exp(
      abs(centerDepth.sub(depthUp)).negate().mul(depthPhi),
    ).mul(exp(dot(centerNormal, normalUp).oneMinus().negate().mul(normalPhi)));
    const weightLeft = exp(
      abs(centerDepth.sub(depthLeft)).negate().mul(depthPhi),
    ).mul(
      exp(dot(centerNormal, normalLeft).oneMinus().negate().mul(normalPhi)),
    );
    const weightRight = exp(
      abs(centerDepth.sub(depthRight)).negate().mul(depthPhi),
    ).mul(
      exp(dot(centerNormal, normalRight).oneMinus().negate().mul(normalPhi)),
    );
    const weightDown = exp(
      abs(centerDepth.sub(depthDown)).negate().mul(depthPhi),
    ).mul(
      exp(dot(centerNormal, normalDown).oneMinus().negate().mul(normalPhi)),
    );

    const totalWeight = float(1)
      .add(weightUp)
      .add(weightLeft)
      .add(weightRight)
      .add(weightDown);

    return centerAo
      .add(aoUp.mul(weightUp))
      .add(aoLeft.mul(weightLeft))
      .add(aoRight.mul(weightRight))
      .add(aoDown.mul(weightDown))
      .div(totalWeight);
  });
}

const defaultSsrParams = {
  ssr: {
    quality: 0.8,
    intensity: 5,
    opacity: 1,
    maxDistance: 50,
    thickness: 0.1,
    resolutionScale: 0.9,
    mirrorBias: 0.5,
    stepExponent: 3,
    binaryRefine: false,
    maxLuminance: 1,
    screenEdgeFade: 0.2,
    screenEdgeFadeBlack: true,
    // SSR miss fallback — keep 0 so scene.environment lights materials only.
    environmentIntensity: 0.1,
  },
  temporalReproject: {
    maxFrames: 8,
    clampIntensity: 0.25,
    flickerSuppression: 1,
    hitPointReprojection: true,
  },
  denoise: {
    enabled: true,
    lumaPhi: 0.75,
    depthPhi: 20,
    normalPhi: 0.3,
    roughnessPhi: 100,
    radius: 1.5,
    alphaPhi: 5,
    strength: 0.725,
    adapt: 0.5,
    smoothDisocclusions: true,
    flickerSuppression: 1,
    adaptiveTrust: 1,
  },
  emissiveRejectThreshold: 0.03,
};

function retuneEffectResolutionScales(
  scenePassScale,
  {
    giPass,
    ssrParams,
    applySsrParams,
    ssrNode,
    temporalReprojectNode,
    denoiseNode,
    denoiseGiNode,
    ssgiDenoiseParams,
    applySsgiDenoiseParams,
    temporalGiPass,
    ssgiTemporalParams,
  },
) {
  const boost = scenePassScale < 1 ? Math.min(2, 1 / scenePassScale) : 1;

  giPass.resolutionScale = 1;

  ssrParams.ssr.resolutionScale = Math.min(
    1,
    defaultSsrParams.ssr.resolutionScale * boost,
  );

  if (scenePassScale < 1) {
    ssgiDenoiseParams.radius = defaultSsgiDenoiseParams.radius * 1.15;
    ssgiDenoiseParams.strength = Math.min(
      0.85,
      defaultSsgiDenoiseParams.strength * 1.08,
    );
    ssgiTemporalParams.maxFrames = Math.min(
      10,
      defaultSsgiTemporalParams.maxFrames + 1,
    );
  } else {
    Object.assign(ssgiDenoiseParams, structuredClone(defaultSsgiDenoiseParams));
    Object.assign(
      ssgiTemporalParams,
      structuredClone(defaultSsgiTemporalParams),
    );
  }

  applySsrParams({
    ssrNode,
    temporalReprojectNode,
    denoiseNode,
    ssrParams,
  });

  applySsgiDenoiseParams({
    temporalGiPass,
    denoiseGiNode,
    ssgiDenoiseParams,
    ssgiTemporalParams,
  });
}

export function applySsgiDenoiseParams(
  { temporalGiPass, denoiseGiNode, ssgiDenoiseParams, ssgiTemporalParams },
  params = ssgiDenoiseParams,
  temporalParams = ssgiTemporalParams,
) {
  if (temporalGiPass) {
    temporalGiPass.maxFrames.value = temporalParams.maxFrames;
    temporalGiPass.clampIntensity.value = temporalParams.clampIntensity;
    temporalGiPass.flickerSuppression.value = temporalParams.flickerSuppression;
  }

  if (denoiseGiNode) {
    denoiseGiNode.lumaPhi.value = params.lumaPhi;
    denoiseGiNode.depthPhi.value = params.depthPhi;
    denoiseGiNode.normalPhi.value = params.normalPhi;
    denoiseGiNode.radius.value = params.enabled ? params.radius : 0;
    denoiseGiNode.alphaPhi.value = params.alphaPhi;
    denoiseGiNode.strength.value = params.strength;
    denoiseGiNode.adapt.value = params.adapt;
    denoiseGiNode.smoothDisocclusions.value = params.smoothDisocclusions;
    denoiseGiNode.flickerSuppression.value = params.flickerSuppression;
    denoiseGiNode.adaptiveTrust.value = params.adaptiveTrust;
  }
}

export function applySsrParams(
  { ssrNode, temporalReprojectNode, denoiseNode, ssrParams, ssrOpacity },
  params = ssrParams,
) {
  if (!ssrNode) {
    return;
  }

  ssrNode.resolutionScale = params.ssr.resolutionScale;
  ssrNode.quality.value = params.ssr.quality;
  ssrNode.mirrorBias.value = params.ssr.mirrorBias;
  ssrNode.stepExponent = params.ssr.stepExponent;
  ssrNode.binaryRefine = params.ssr.binaryRefine;
  ssrNode.maxDistance.value = params.ssr.maxDistance;
  ssrNode.intensity.value = params.ssr.intensity;
  ssrNode.thickness.value = params.ssr.thickness;
  ssrNode.maxLuminance.value = params.ssr.maxLuminance;
  ssrNode.screenEdgeFade.value = params.ssr.screenEdgeFade;
  ssrNode.screenEdgeFadeBlack = params.ssr.screenEdgeFadeBlack;
  ssrNode.environmentIntensity.value = params.ssr.environmentIntensity;

  if (ssrOpacity) {
    ssrOpacity.value = params.ssr.opacity;
  }

  if (temporalReprojectNode) {
    temporalReprojectNode.maxFrames.value = params.temporalReproject.maxFrames;
    temporalReprojectNode.clampIntensity.value =
      params.temporalReproject.clampIntensity;
    temporalReprojectNode.flickerSuppression.value =
      params.temporalReproject.flickerSuppression;
    temporalReprojectNode.hitPointReprojection.value =
      params.temporalReproject.hitPointReprojection;
  }

  if (denoiseNode) {
    denoiseNode.lumaPhi.value = params.denoise.lumaPhi;
    denoiseNode.depthPhi.value = params.denoise.depthPhi;
    denoiseNode.normalPhi.value = params.denoise.normalPhi;
    denoiseNode.roughnessPhi.value = params.denoise.roughnessPhi;
    denoiseNode.radius.value = params.denoise.enabled
      ? params.denoise.radius
      : 0;
    denoiseNode.alphaPhi.value = params.denoise.alphaPhi;
    denoiseNode.strength.value = params.denoise.strength;
    denoiseNode.adapt.value = params.denoise.adapt;
    denoiseNode.smoothDisocclusions.value = params.denoise.smoothDisocclusions;
    denoiseNode.flickerSuppression.value = params.denoise.flickerSuppression;
    denoiseNode.adaptiveTrust.value = params.denoise.adaptiveTrust;
  }
}

export function createPostProcessing(
  renderer,
  scene,
  camera,
  { environmentMap = null, environmentIntensity = 1 } = {},
) {
  const post = new RenderPipeline(renderer);

  const ssrParams = structuredClone(defaultSsrParams);

  const ssgiDenoiseParams = structuredClone(defaultSsgiDenoiseParams);
  const ssgiTemporalParams = structuredClone(defaultSsgiTemporalParams);

  const fsrSharpness = uniform(DEFAULT_FSR_TUNING.sharpness);
  let fsrEnabled = DEFAULT_FSR_TUNING.enabled;
  let fsrDenoise = DEFAULT_FSR_TUNING.denoise;

  const aoSoftRadius = uniform(defaultAoSoftParams.radius);
  const aoSoftDepthPhi = uniform(defaultAoSoftParams.depthPhi);
  const aoSoftNormalPhi = uniform(defaultAoSoftParams.normalPhi);

  const scenePass = pass(scene, camera);
  enableResolutionScale(scenePass);
  scenePass.resolutionScale = DEFAULT_FSR_TUNING.scenePassResolutionScale;

  const mrtNode = mrt({
    output,
    diffuseColor: vec4(diffuseColor.rgb, materialMetalness),
    normal: vec4(packNormalToRGB(normalView).rgb, materialRoughness),
    velocity,
    emissive: vec4(emissive, output.a),
  });
  mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));

  scenePass.setMRT(mrtNode);

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassDiffuse = scenePass.getTextureNode("diffuseColor");
  const scenePassNormal = scenePass.getTextureNode("normal");
  const scenePassDepth = scenePass.getTextureNode("depth");
  const scenePassVelocity = scenePass.getTextureNode("velocity");
  const scenePassEmissive = scenePass.getTextureNode("emissive");

  scenePass.getTexture("normal").type = UnsignedByteType;
  scenePass.getTexture("diffuseColor").type = UnsignedByteType;
  scenePass.getTexture("emissive").type = UnsignedByteType;

  const sceneNormal = sample((uvCoord) => {
    return unpackRGBToNormal(scenePassNormal.sample(uvCoord).rgb);
  });

  const scenePassMetalRough = sample((uvCoord) =>
    vec2(scenePassDiffuse.sample(uvCoord).a, scenePassNormal.sample(uvCoord).a),
  );

  const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
  applySSGIQualityMode(giPass, "Medium");
  giPass.radius.value = 12;
  giPass.expFactor.value = 2;
  giPass.thickness.value = 1;
  giPass.backfaceLighting.value = 0.2;
  giPass.giIntensity.value = 28;
  giPass.aoIntensity.value = 0.6;
  giPass.useLinearThickness.value = false;
  giPass.useScreenSpaceSampling.value = true;
  giPass.useTemporalFiltering = true;
  giPass.giOcclusionStrength.value = 1;
  enableResolutionScale(giPass);
  giPass.resolutionScale = 1;

  const temporalGiPass = temporalReproject(
    giPass,
    scenePassDepth,
    scenePassNormal,
    scenePassVelocity,
    camera,
    { mode: "diffuse", accumulate: false },
  );

  const denoiseGiNode = recurrentDenoise(temporalGiPass, camera, {
    depth: scenePassDepth,
    normal: scenePassNormal,
    raw: giPass,
    mode: "diffuse",
    accumulate: true,
  });
  denoiseGiNode.alphaSource = "ao";

  temporalGiPass.setHistoryTexture(denoiseGiNode);

  applySsgiDenoiseParams({
    temporalGiPass,
    denoiseGiNode,
    ssgiDenoiseParams,
    ssgiTemporalParams,
  });

  // Hard resize-reset (used for true resolution changes). Avoid for lighting —
  // SSR never does that; it adapts via temporal clamp / low maxFrames instead.
  function resetGiHistory() {
    const width = Math.max(1, renderer.domElement.width);
    const height = Math.max(1, renderer.domElement.height);

    if (width > 1) {
      temporalGiPass.setSize(width - 1, height);
      denoiseGiNode.setSize(width - 1, height);
    }

    temporalGiPass.setSize(width, height);
    denoiseGiNode.setSize(width, height);
  }

  let giLightingSoftActive = false;

  // Soft-invalidate GI temporal confidence when lighting changes without camera
  // motion (depth/velocity stay valid, so history would otherwise cling to the
  // previous GI). Matches SSR's approach: prefer new samples via clamp + low
  // maxFrames instead of clearing the history buffer.
  function softenGiForLightingChange() {
    giLightingSoftActive = true;
    temporalGiPass.maxFrames.value = 2;
    temporalGiPass.clampIntensity.value = 1;
    denoiseGiNode.strength.value = Math.min(denoiseGiNode.strength.value, 0.55);
  }

  function restoreGiTemporalParams() {
    if (!giLightingSoftActive) {
      return;
    }

    giLightingSoftActive = false;
    applySsgiDenoiseParams({
      temporalGiPass,
      denoiseGiNode,
      ssgiDenoiseParams,
      ssgiTemporalParams,
    });
  }

  giPass.resetHistory = resetGiHistory;

  // HDR is registered for the miss path API, but environmentIntensity stays 0
  // so SSR does not add env reflections (scene.environment still lights materials).
  const ssrNode = ssr(scenePassColor, scenePassDepth, sceneNormal, {
    stochastic: true,
    diffuseNode: scenePassDiffuse,
    metalnessNode: scenePassDiffuse.a,
    roughnessNode: scenePassNormal.a,
    environmentNode: environmentMap,
    envImportanceSampling: false,
    binaryRefine: ssrParams.ssr.binaryRefine,
    camera,
  });

  if (environmentMap) {
    ssrNode.setEnvMap(environmentMap);
  }
  ssrNode.environmentIntensity.value = ssrParams.ssr.environmentIntensity;

  enableResolutionScale(ssrNode);

  const temporalReprojectNode = temporalReproject(
    ssrNode,
    scenePassDepth,
    scenePassNormal,
    scenePassVelocity,
    camera,
    { mode: "specular", accumulate: false },
  );

  const denoiseNode = recurrentDenoise(temporalReprojectNode, camera, {
    depth: scenePassDepth,
    normal: scenePassNormal,
    raw: ssrNode,
    metalRoughness: scenePassMetalRough,
    mode: "specular",
    accumulate: true,
  });
  denoiseNode.alphaSource = "raylength";

  ssrNode.setHistory(denoiseNode, scenePassVelocity);
  temporalReprojectNode.setHistoryTexture(denoiseNode);

  const emissiveRejectThreshold = uniform(ssrParams.emissiveRejectThreshold);
  const ssrOpacity = uniform(ssrParams.ssr.opacity);

  applySsrParams({
    ssrNode,
    temporalReprojectNode,
    denoiseNode,
    ssrParams,
    ssrOpacity,
  });

  const denoisePassBlend = vec4(
    denoiseNode.rgb,
    ssrNode.a.greaterThan(0).toVar(),
  );

  const emissiveMask = step(
    emissiveRejectThreshold,
    luminance(scenePassEmissive.rgb).oneMinus(),
  );

  const gi = denoiseGiNode.rgb;
  const ao = createSoftSsgiAo({
    giTexture: giPass.getTextureNode(),
    scenePassDepth,
    scenePassNormal,
    radius: aoSoftRadius,
    depthPhi: aoSoftDepthPhi,
    normalPhi: aoSoftNormalPhi,
  });
  const giMasked = gi.mul(mix(float(1), ao, giPass.giOcclusionStrength));

  const ssrContribution = denoisePassBlend.rgb
    .mul(emissiveMask)
    .mul(ssrOpacity);

  const ultraComposite = vec4(
    add(
      add(scenePassColor.rgb.mul(ao), scenePassDiffuse.rgb.mul(giMasked)),
      ssrContribution,
    ),
    scenePassColor.a,
  );
  ultraComposite.name = "UltraComposite";

  const highEndComposite = vec4(
    add(scenePassColor.rgb, ssrContribution),
    scenePassColor.a,
  );
  highEndComposite.name = "HighEndComposite";

  const defaultComposite = vec4(scenePassColor.rgb, scenePassColor.a);
  defaultComposite.name = "DefaultComposite";

  const traaPass = traa(
    ultraComposite,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  const traaPassDefault = traa(
    defaultComposite,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  const traaPassHighEnd = traa(
    highEndComposite,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  const traaPassBeauty = traa(
    scenePassColor,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  const traaPassEmissive = traa(
    scenePassEmissive,
    scenePassDepth,
    scenePassVelocity,
    camera,
  );

  const bloomPass = bloom(traaPassEmissive, 3, 0.5);
  const bloomPassWide = bloom(traaPassEmissive, 1.25, 1);

  function buildModeOutput(traaNode) {
    const core = fsrEnabled
      ? fsr1(traaNode, fsrSharpness, fsrDenoise)
      : traaNode;
    return core.add(bloomPass).add(bloomPassWide);
  }

  const outputByMode = {
    [RENDER_MODES.default]: buildModeOutput(traaPassDefault),
    [RENDER_MODES.highEnd]: buildModeOutput(traaPassHighEnd),
    [RENDER_MODES.ultra]: buildModeOutput(traaPass),
    [RENDER_MODES.insane]: buildModeOutput(traaPass),
  };

  const compositeWithBloom = ultraComposite.add(bloomPass).add(bloomPassWide);

  let currentMode = DEFAULT_RENDER_MODE;

  function refreshModeOutputs() {
    outputByMode[RENDER_MODES.default] = buildModeOutput(traaPassDefault);
    outputByMode[RENDER_MODES.highEnd] = buildModeOutput(traaPassHighEnd);
    outputByMode[RENDER_MODES.ultra] = buildModeOutput(traaPass);
    outputByMode[RENDER_MODES.insane] = buildModeOutput(traaPass);
    post.outputNode = outputByMode[currentMode];
    post.needsUpdate = true;
  }

  function applyRenderMode(mode, { previousMode = null } = {}) {
    const nextMode = isRenderMode(mode) ? mode : DEFAULT_RENDER_MODE;
    const priorMode = previousMode ?? currentMode;

    currentMode = nextMode;
    post.outputNode = outputByMode[nextMode];
    post.needsUpdate = true;

    if (isGiRenderMode(priorMode) || isGiRenderMode(nextMode)) {
      giPass.resetHistory?.();
    }
  }

  function getRenderMode() {
    return currentMode;
  }

  function syncScenePassSize() {
    const width = Math.max(1, renderer.domElement.width);
    const height = Math.max(1, renderer.domElement.height);
    scenePass.setSize(width, height);
  }

  function applyFsrTuning({
    enabled = DEFAULT_FSR_TUNING.enabled,
    sharpness = DEFAULT_FSR_TUNING.sharpness,
    denoise = DEFAULT_FSR_TUNING.denoise,
    scenePassResolutionScale = DEFAULT_FSR_TUNING.scenePassResolutionScale,
  } = {}) {
    const prevScale = scenePass.resolutionScale;
    const prevEnabled = fsrEnabled;
    const prevDenoise = fsrDenoise;

    fsrEnabled = enabled;
    fsrDenoise = denoise;
    fsrSharpness.value = sharpness;
    scenePass.resolutionScale = scenePassResolutionScale;

    const scaleChanged = Math.abs(prevScale - scenePassResolutionScale) > 0.001;
    const fsrToggled = prevEnabled !== enabled;
    const fsrDenoiseChanged = prevDenoise !== denoise;

    if (scaleChanged) {
      syncScenePassSize();
      retuneEffectResolutionScales(scenePassResolutionScale, {
        giPass,
        ssrParams,
        applySsrParams,
        ssrNode,
        temporalReprojectNode,
        denoiseNode,
        denoiseGiNode,
        ssgiDenoiseParams,
        applySsgiDenoiseParams,
        temporalGiPass,
        ssgiTemporalParams,
      });
      resetGiHistory();
    }

    if (fsrToggled || fsrDenoiseChanged) {
      refreshModeOutputs();
    }
  }

  function resizePostProcessing() {
    syncScenePassSize();
  }

  post.outputNode = outputByMode[currentMode];

  return {
    post,
    scenePass,
    scenePassColor,
    scenePassEmissive,
    scenePassDepth,
    scenePassVelocity,
    giPass,
    temporalGiPass,
    denoiseGiNode,
    ssgiDenoiseParams,
    ssgiTemporalParams,
    resetGiHistory,
    softenGiForLightingChange,
    restoreGiTemporalParams,
    ssrNode,
    temporalReprojectNode,
    denoiseNode,
    ssrParams,
    emissiveRejectThreshold,
    bloomPass,
    bloomPassWide,
    ultraComposite,
    highEndComposite,
    defaultComposite,
    compositePass: ultraComposite,
    compositeWithBloom,
    traaPass,
    traaPassBeauty,
    finalPass: outputByMode[RENDER_MODES.ultra],
    finalPassDefault: outputByMode[RENDER_MODES.default],
    finalPassHighEnd: outputByMode[RENDER_MODES.highEnd],
    finalPassBeauty: buildModeOutput(traaPassBeauty),
    gi,
    ao,
    applyRenderMode,
    getRenderMode,
    resizePostProcessing,
    applyFsrTuning,
    fsrSharpness,
    getFsrEnabled: () => fsrEnabled,
    getFsrDenoise: () => fsrDenoise,
    getScenePassResolutionScale: () => scenePass.resolutionScale,
    aoSoftRadius,
    aoSoftDepthPhi,
    aoSoftNormalPhi,
    syncScenePassSize,
    applySsrParams: (params) =>
      applySsrParams(
        {
          ssrNode,
          temporalReprojectNode,
          denoiseNode,
          ssrParams,
          ssrOpacity,
        },
        params,
      ),
    applySsgiDenoiseParams: (params, temporalParams) =>
      applySsgiDenoiseParams(
        {
          temporalGiPass,
          denoiseGiNode,
          ssgiDenoiseParams,
          ssgiTemporalParams,
        },
        params,
        temporalParams,
      ),
    syncSsrEnvironmentIntensity: () => {
      // Intentionally no-op: scene.environmentIntensity must not drive SSR misses.
    },
  };
}
