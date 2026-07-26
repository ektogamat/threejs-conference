import {
  RenderPipeline,
  BlendMode,
  NormalBlending,
  PhysicalLightingModel,
} from "three/webgpu";
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
  vec2,
  screenUV,
  sample,
  normalView,
  packNormalToRGB,
  unpackRGBToNormal,
  diffuseColor,
  materialMetalness,
  materialRoughness,
  velocity,
} from "three/tsl";
import { AdditiveBlending, HalfFloatType, UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { lensflare } from "three/addons/tsl/display/LensflareNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { ssr } from "three/addons/tsl/display/SSRNode.js";
import { temporalReproject } from "three/addons/tsl/display/TemporalReprojectNode.js";
import { recurrentDenoise } from "three/addons/tsl/display/RecurrentDenoiseNode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";
import { boxBlurSeparable } from "../tsl/boxBlur.js";
import { applyRainGlass, createRainGlassUniforms } from "../tsl/rainGlass.js";
import { performanceProfile } from "../platform/performanceProfile.js";
import { isSafari } from "../platform/deviceLayout.js";
import { FEATURES } from "../world/features.js";

const DEFAULT_REFRACTION_STRENGTH = 0.45;

let originalIndirectSpecular = null;

function suppressIndirectSpecular() {
  if (originalIndirectSpecular) {
    return;
  }

  originalIndirectSpecular = PhysicalLightingModel.prototype.indirectSpecular;
  PhysicalLightingModel.prototype.indirectSpecular = function indirectSpecular(builder) {
    builder.context.radiance = vec3(0);

    if (this.clearcoatRadiance) {
      this.clearcoatRadiance.assign(vec3(0));
    }

    originalIndirectSpecular.call(this, builder);
  };
}

function restoreIndirectSpecular() {
  if (!originalIndirectSpecular) {
    return;
  }

  PhysicalLightingModel.prototype.indirectSpecular = originalIndirectSpecular;
  originalIndirectSpecular = null;
}

export function createPostProcessing(
  renderer,
  scene,
  camera,
  { rain, smoke, hdrTexture = null } = {},
) {
  const post = new RenderPipeline(renderer);
  const rainLayer = rain?.layer ?? null;
  const smokeLayer = smoke?.layer ?? null;

  const aoCamera = camera.clone();
  if (rainLayer !== null) {
    aoCamera.layers.disable(rainLayer);
  }
  if (smokeLayer !== null) {
    aoCamera.layers.disable(smokeLayer);
  }

  const sceneCamera = camera.clone();
  if (rainLayer !== null) {
    sceneCamera.layers.disable(rainLayer);
  }
  if (smokeLayer !== null) {
    sceneCamera.layers.enable(smokeLayer);
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
    aoCamera.copy(sourceCamera, false);
    if (rainLayer !== null) {
      aoCamera.layers.disable(rainLayer);
    }
    if (smokeLayer !== null) {
      aoCamera.layers.disable(smokeLayer);
    }
    aoCamera.updateMatrixWorld(true);

    sceneCamera.copy(sourceCamera, false);
    if (rainLayer !== null) {
      sceneCamera.layers.disable(rainLayer);
    }
    if (smokeLayer !== null) {
      sceneCamera.layers.enable(smokeLayer);
    }
    sceneCamera.updateMatrixWorld(true);

    if (rainCamera) {
      rainCamera.copy(sourceCamera, false);
      rainCamera.layers.disable(0);
      rainCamera.layers.enable(rainLayer);
      rainCamera.updateMatrixWorld(true);
    }
  }

  syncCameras(camera);

  const aoPrePass = pass(scene, aoCamera);
  aoPrePass.transparent = true;
  aoPrePass.setMRT(
    mrt({
      output: packNormalToRGB(normalView),
    }),
  );
  aoPrePass.getTexture("output").type = UnsignedByteType;

  const aoPrePassDepth = aoPrePass.getTextureNode("depth");
  const aoPrePassNormal = sample((uv) =>
    unpackRGBToNormal(aoPrePass.getTextureNode("output").sample(uv)),
  );

  const scenePass = pass(scene, sceneCamera);
  const mrtNode = mrt({
    output,
    emissive: vec4(emissive, output.a),
    diffuseColor: vec4(diffuseColor.rgb, materialMetalness),
    normal: vec4(packNormalToRGB(normalView).rgb, materialRoughness),
    velocity,
  });
  mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
  scenePass.setMRT(mrtNode);

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassEmissive = scenePass.getTextureNode("emissive");
  const scenePassDepth = scenePass.getTextureNode("depth");
  const scenePassNormalTex = scenePass.getTextureNode("normal");
  const scenePassVelocity = scenePass.getTextureNode("velocity");
  const scenePassDiffuseColor = scenePass.getTextureNode("diffuseColor");

  const scenePassNormal = sample((uv) =>
    unpackRGBToNormal(scenePassNormalTex.sample(uv).rgb),
  );

  const scenePassMetalRough = sample((uv) =>
    vec2(
      scenePassDiffuseColor.sample(uv).a,
      scenePassNormalTex.sample(uv).a,
    ),
  );

  scenePass.getTexture("output").type = HalfFloatType;
  scenePass.getTexture("emissive").type = UnsignedByteType;
  // Keep beauty as HalfFloat so SSR can sample dark non-emissive surfaces;
  // UnsignedByte crushes night-scene midtones and leaves only neon in reflections.
  scenePass.getTexture("diffuseColor").type = UnsignedByteType;
  scenePass.getTexture("normal").type = UnsignedByteType;

  let ssrNode = null;
  let temporalReprojectNode = null;
  let denoiseNode = null;
  const ssrEmissiveBoost = uniform(performanceProfile.ssrEmissiveBoost);

  if (hdrTexture) {
    // Sample beauty only. Lit output already contains emissive contribution;
    // adding emissive MRT again made reflections look neon-only.
    const ssrColorInput = scenePassColor;

    ssrNode = ssr(ssrColorInput, scenePassDepth, scenePassNormal, {
      stochastic: true,
      diffuseNode: scenePassDiffuseColor,
      metalnessNode: scenePassDiffuseColor.a,
      roughnessNode: scenePassNormalTex.a,
      environmentNode: hdrTexture,
      camera: sceneCamera,
    });
    ssrNode.resolutionScale = performanceProfile.ssrResolutionScale;
    ssrNode.quality.value = performanceProfile.ssrQuality;
    ssrNode.maxDistance.value = performanceProfile.ssrMaxDistance;
    ssrNode.intensity.value = performanceProfile.ssrIntensity;
    ssrNode.thickness.value = performanceProfile.ssrThickness;
    ssrNode.mirrorBias.value = performanceProfile.ssrMirrorBias;
    ssrNode.environmentIntensity.value = performanceProfile.ssrEnvironmentIntensity;
    ssrNode.maxLuminance.value = performanceProfile.ssrMaxLuminance;
    ssrNode.screenEdgeFade.value = performanceProfile.ssrScreenEdgeFade;
    ssrNode.screenEdgeFadeBlack = performanceProfile.ssrScreenEdgeFadeBlack;
    ssrNode.stepExponent = performanceProfile.ssrStepExponent;
    ssrNode.setEnvMap(hdrTexture);

    temporalReprojectNode = temporalReproject(
      ssrNode,
      scenePassDepth,
      scenePassNormalTex,
      scenePassVelocity,
      sceneCamera,
      {
        mode: "specular",
        accumulate: false,
        hitPointReprojection: true,
      },
    );
    temporalReprojectNode.maxFrames.value = performanceProfile.ssrTemporalMaxFrames;
    temporalReprojectNode.clampIntensity.value =
      performanceProfile.ssrTemporalClampIntensity;
    temporalReprojectNode.flickerSuppression.value =
      performanceProfile.ssrTemporalFlickerSuppression;

    denoiseNode = recurrentDenoise(temporalReprojectNode, sceneCamera, {
      depth: scenePassDepth,
      normal: scenePassNormalTex,
      raw: ssrNode,
      metalRoughness: scenePassMetalRough,
      mode: "specular",
      accumulate: true,
    });
    denoiseNode.alphaSource = "raylength";
    denoiseNode.lumaPhi.value = performanceProfile.ssrDenoiseLumaPhi;
    denoiseNode.depthPhi.value = performanceProfile.ssrDenoiseDepthPhi;
    denoiseNode.normalPhi.value = performanceProfile.ssrDenoiseNormalPhi;
    denoiseNode.radius.value = performanceProfile.ssrDenoiseRadius;
    denoiseNode.strength.value = performanceProfile.ssrDenoiseStrength;
    denoiseNode.adapt.value = performanceProfile.ssrDenoiseAdapt;
    denoiseNode.alphaPhi.value = performanceProfile.ssrDenoiseAlphaPhi;

    ssrNode.setHistory(denoiseNode, scenePassVelocity);
    temporalReprojectNode.setHistoryTexture(denoiseNode);

    if (import.meta.env.DEV) {
      console.info("[ssr] pipeline ready", {
        ssrActive: performanceProfile.ssr,
        hdrSize: hdrTexture?.image?.width
          ? `${hdrTexture.image.width}x${hdrTexture.image.height}`
          : null,
        hdrHasData: Boolean(hdrTexture?.image?.data),
        quality: performanceProfile.ssrQuality,
        maxDistance: performanceProfile.ssrMaxDistance,
      });
    }
  } else if (import.meta.env.DEV) {
    console.warn("[ssr] disabled — no HDR equirect (world.envTexture missing)");
  }

  const aoPass = ao(aoPrePassDepth, aoPrePassNormal, aoCamera);
  aoPass.resolutionScale = performanceProfile.aoResolutionScale;
  aoPass.samples.value = performanceProfile.aoSamples;
  aoPass.radius.value = performanceProfile.aoRadius;
  aoPass.scale.value = performanceProfile.aoScale;
  aoPass.thickness.value = performanceProfile.aoThickness;
  aoPass.distanceExponent.value = performanceProfile.aoDistanceExponent;
  aoPass.distanceFallOff.value = performanceProfile.aoDistanceFallOff;
  // Temporal filtering needs TRAA; we use SMAA, so keep noise lower via half-res + samples.
  aoPass.useTemporalFiltering = false;

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
    if (isSafari()) {
      // Dual-MRT rain refraction offsets are unstable on Safari WebGPU.
      rainPassColor = rainPass.getTextureNode("output");
    } else {
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
  }

  const distortionOffset = rainPassOffset
    ? rainPassOffset.rg.mul(refractionStrength).mul(refractionEnabled)
    : null;

  const bloomPass = bloom(scenePassEmissive, 2.5, 0.45);
  bloomPass.setResolutionScale(performanceProfile.bloomResolutionScale);

  const lensflareThreshold = uniform(0.09);
  const lensflareGhostAttenuation = uniform(50);
  const lensflareGhostSpacing = uniform(0.27);
  const lensflareStrength = uniform(0.3);
  const lensflareBlurRadius = uniform(performanceProfile.lensflareBlurRadius);

  const flarePass = lensflare(bloomPass, {
    threshold: lensflareThreshold,
    ghostAttenuationFactor: lensflareGhostAttenuation,
    ghostSpacing: lensflareGhostSpacing,
  });
  const flareBlurred = gaussianBlur(flarePass, lensflareBlurRadius, 4, {
    resolutionScale: performanceProfile.lensflareResolutionScale,
  });

  const look = createCyberpunkLook({ scenePass });

  const blurSize = uniform(3);
  const blurSpread = uniform(2);
  const minDistance = uniform(36);
  const maxDistance = uniform(75);
  const focusPointView = uniform(vec3());

  const scenePassViewZ = scenePass.getViewZNode();

  const blurFactor = smoothstep(
    minDistance,
    maxDistance,
    scenePassViewZ.sub(focusPointView.z).abs(),
  );

  let bloomActive = performanceProfile.bloom;
  let dofActive = performanceProfile.dof;
  let lensflareActive = performanceProfile.lensflare;
  let aoActive = performanceProfile.ao;
  let ssrActive = performanceProfile.ssr && Boolean(denoiseNode);
  let rainPassActive = rain?.params?.enabled ?? Boolean(rainPassColor);
  const dofEnabled = uniform(dofActive ? 1 : 0);

  if (ssrActive) {
    suppressIndirectSpecular();
  }

  let steadyOutput = null;
  let steadyOutputWithSmaa = null;
  let composedOutputRef = null;
  let introOutput = null;
  let introRainGlassActive = FEATURES.intro;
  let introRainGlassRef = null;
  let introRainGlassUniformsRef = null;
  let smaaActive = performanceProfile.smaa;

  if (FEATURES.intro) {
    introRainGlassUniformsRef = createRainGlassUniforms();
    introRainGlassRef = {
      speed: introRainGlassUniformsRef.speed,
      intensity: introRainGlassUniformsRef.intensity,
      distortionStrength: introRainGlassUniformsRef.distortionStrength,
      dropSize: introRainGlassUniformsRef.dropSize,
      blurRadius: introRainGlassUniformsRef.blurRadius,
      amount: introRainGlassUniformsRef.amount,
    };
  }

  function buildBloomContribution() {
    if (bloomActive && lensflareActive) {
      return bloomPass.add(flareBlurred.mul(lensflareStrength));
    }

    if (bloomActive) {
      return bloomPass;
    }

    if (lensflareActive) {
      return flareBlurred.mul(lensflareStrength);
    }

    return null;
  }

  function buildBeautyInput() {
    const useRainDistortion = rainPassActive && distortionOffset;
    const sampleUv = useRainDistortion
      ? screenUV.add(distortionOffset)
      : null;

    let beauty = sampleUv
      ? scenePassColor.sample(sampleUv)
      : scenePassColor;

    // Match official SSR example: add denoised reflections on beauty rgb before AO/fog.
    if (ssrActive && denoiseNode) {
      beauty = vec4(beauty.rgb.add(denoiseNode.rgb), beauty.a);
    }

    if (aoActive) {
      const aoValue = sampleUv
        ? aoPass.getTextureNode().sample(sampleUv).r
        : aoPass.getTextureNode().r;
      // Post-multiply GTAO onto beauty (smoke is in scenePass; excluded from aoPrePass).
      beauty = beauty.mul(vec4(vec3(aoValue), 1));
    }

    if (rainPassActive && rainPassColor) {
      beauty = beauty.add(rainPassColor.rgb.mul(rainPassColor.a));
    }

    return beauty;
  }

  function rebuildSteadyOutput() {
    let beauty = buildBeautyInput();

    if (dofActive && !isSafari()) {
      const blurredBeauty = boxBlurSeparable(beauty, {
        size: blurSize,
        separation: blurSpread,
        premultipliedAlpha: true,
      });
      beauty = mix(beauty, blurredBeauty, blurFactor);
    }

    const bloomContribution = buildBloomContribution();
    const preAA = look.buildComposite(beauty, { bloomContribution });
    const aaOutput = smaa(preAA);
    steadyOutput = look.applyFilmGrain(preAA);
    steadyOutputWithSmaa = look.applyFilmGrain(aaOutput);
    composedOutputRef = steadyOutput;

    if (introRainGlassActive && introRainGlassUniformsRef) {
      const rainGlassOut = applyRainGlass(steadyOutput, introRainGlassUniformsRef);
      introOutput = mix(steadyOutput, rainGlassOut, introRainGlassUniformsRef.amount);
    }

    post.outputNode = getActiveOutput();
    post.needsUpdate = true;
  }

  rebuildSteadyOutput();

  function getActiveOutput() {
    if (introRainGlassActive && introOutput) {
      return introOutput;
    }

    return smaaActive ? steadyOutputWithSmaa : steadyOutput;
  }

  post.outputNode = getActiveOutput();

  function disposeIntroRainGlass() {
    if (!introRainGlassActive) {
      return;
    }

    introRainGlassActive = false;
    introRainGlassUniformsRef = null;
    introOutput = null;
    introRainGlassRef = null;
    post.outputNode = getActiveOutput();
    post.needsUpdate = true;
  }

  function setRainPassEnabled(enabled) {
    const nextActive = Boolean(enabled);
    if (nextActive === rainPassActive) {
      return;
    }

    rainPassActive = nextActive;
    rebuildSteadyOutput();
  }

  if (rain?.setEnabled) {
    const originalSetEnabled = rain.setEnabled.bind(rain);
    rain.setEnabled = (value) => {
      originalSetEnabled(value);
      setRainPassEnabled(value);
    };
  }

  function updateFocusPoint(focusPoint, activeCamera) {
    activeCamera.updateMatrixWorld();
    focusPointView.value.copy(focusPoint).applyMatrix4(activeCamera.matrixWorldInverse);
  }

  function restoreCombinedOutput() {
    post.outputNode = getActiveOutput();
    post.needsUpdate = true;
  }

  function setBloomEnabled(enabled) {
    bloomActive = Boolean(enabled);
    rebuildSteadyOutput();
  }

  function setBloomResolutionScale(scale) {
    bloomPass.setResolutionScale(scale);
  }

  function setDofEnabled(enabled) {
    dofActive = Boolean(enabled);
    dofEnabled.value = dofActive ? 1 : 0;
    dofEnabled.needsUpdate = true;
    rebuildSteadyOutput();
  }

  function setLensflareEnabled(enabled) {
    lensflareActive = Boolean(enabled);
    rebuildSteadyOutput();
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
    post.outputNode = getActiveOutput();
    post.needsUpdate = true;
  }

  function setAoEnabled(enabled) {
    aoActive = Boolean(enabled);
    rebuildSteadyOutput();
  }

  function setAoResolutionScale(scale) {
    aoPass.resolutionScale = scale;
  }

  function setAoSamples(samples) {
    aoPass.samples.value = samples;
  }

  function applySsrParams() {
    if (!ssrNode) {
      return;
    }

    ssrNode.resolutionScale = performanceProfile.ssrResolutionScale;
    ssrNode.quality.value = performanceProfile.ssrQuality;
    ssrNode.maxDistance.value = performanceProfile.ssrMaxDistance;
    ssrNode.intensity.value = performanceProfile.ssrIntensity;
    ssrNode.thickness.value = performanceProfile.ssrThickness;
    ssrNode.mirrorBias.value = performanceProfile.ssrMirrorBias;
    ssrNode.environmentIntensity.value = performanceProfile.ssrEnvironmentIntensity;
    ssrNode.maxLuminance.value = performanceProfile.ssrMaxLuminance;
    ssrNode.screenEdgeFade.value = performanceProfile.ssrScreenEdgeFade;
    ssrEmissiveBoost.value = performanceProfile.ssrEmissiveBoost;
    ssrEmissiveBoost.needsUpdate = true;

    if (ssrNode.screenEdgeFadeBlack !== performanceProfile.ssrScreenEdgeFadeBlack) {
      ssrNode.screenEdgeFadeBlack = performanceProfile.ssrScreenEdgeFadeBlack;
    }

    if (ssrNode.stepExponent !== performanceProfile.ssrStepExponent) {
      ssrNode.stepExponent = performanceProfile.ssrStepExponent;
    }

    if (temporalReprojectNode) {
      temporalReprojectNode.maxFrames.value = performanceProfile.ssrTemporalMaxFrames;
      temporalReprojectNode.clampIntensity.value =
        performanceProfile.ssrTemporalClampIntensity;
      temporalReprojectNode.flickerSuppression.value =
        performanceProfile.ssrTemporalFlickerSuppression;
    }

    if (denoiseNode) {
      denoiseNode.lumaPhi.value = performanceProfile.ssrDenoiseLumaPhi;
      denoiseNode.depthPhi.value = performanceProfile.ssrDenoiseDepthPhi;
      denoiseNode.normalPhi.value = performanceProfile.ssrDenoiseNormalPhi;
      denoiseNode.radius.value = performanceProfile.ssrDenoiseRadius;
      denoiseNode.strength.value = performanceProfile.ssrDenoiseStrength;
      denoiseNode.adapt.value = performanceProfile.ssrDenoiseAdapt;
      denoiseNode.alphaPhi.value = performanceProfile.ssrDenoiseAlphaPhi;
    }
  }

  function setSsrEnabled(enabled) {
    if (!denoiseNode) {
      return;
    }

    const nextActive = Boolean(enabled);
    performanceProfile.ssr = nextActive;
    if (nextActive === ssrActive) {
      return;
    }

    ssrActive = nextActive;
    if (ssrActive) {
      suppressIndirectSpecular();
    } else {
      restoreIndirectSpecular();
    }
    rebuildSteadyOutput();
  }

  function setSsrResolutionScale(scale) {
    performanceProfile.ssrResolutionScale = scale;
    if (ssrNode) {
      ssrNode.resolutionScale = scale;
    }
  }

  function setSsrQuality(quality) {
    performanceProfile.ssrQuality = quality;
    if (ssrNode) {
      ssrNode.quality.value = quality;
    }
  }

  function setSsrIntensity(intensity) {
    performanceProfile.ssrIntensity = intensity;
    if (ssrNode) {
      ssrNode.intensity.value = intensity;
    }
  }

  function setSsrMaxDistance(distance) {
    performanceProfile.ssrMaxDistance = distance;
    if (ssrNode) {
      ssrNode.maxDistance.value = distance;
    }
  }

  function setSsrThickness(thickness) {
    performanceProfile.ssrThickness = thickness;
    if (ssrNode) {
      ssrNode.thickness.value = thickness;
    }
  }

  function setSsrEmissiveBoost(boost) {
    performanceProfile.ssrEmissiveBoost = boost;
    ssrEmissiveBoost.value = boost;
    ssrEmissiveBoost.needsUpdate = true;
  }

  function setSsrEnvironmentIntensity(intensity) {
    performanceProfile.ssrEnvironmentIntensity = intensity;
    if (ssrNode) {
      ssrNode.environmentIntensity.value = intensity;
    }
  }

  function setSsrMaxLuminance(luminance) {
    performanceProfile.ssrMaxLuminance = luminance;
    if (ssrNode) {
      ssrNode.maxLuminance.value = luminance;
    }
  }

  function setSsrMirrorBias(bias) {
    performanceProfile.ssrMirrorBias = bias;
    if (ssrNode) {
      ssrNode.mirrorBias.value = bias;
    }
  }

  function setSsrScreenEdgeFade(fade) {
    performanceProfile.ssrScreenEdgeFade = fade;
    if (ssrNode) {
      ssrNode.screenEdgeFade.value = fade;
    }
  }

  function setSsrScreenEdgeFadeBlack(enabled) {
    performanceProfile.ssrScreenEdgeFadeBlack = Boolean(enabled);
    if (ssrNode) {
      ssrNode.screenEdgeFadeBlack = performanceProfile.ssrScreenEdgeFadeBlack;
    }
  }

  function setSsrStepExponent(exponent) {
    performanceProfile.ssrStepExponent = exponent;
    if (ssrNode) {
      ssrNode.stepExponent = exponent;
    }
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
    aoPrePass.setSize(width, height);
    scenePass.setSize(width, height);
    rainPass?.setSize(width, height);
  }

  return {
    post,
    beautyCamera: sceneCamera,
    sceneCamera,
    aoCamera,
    rainCamera,
    syncCameras,
    bloomPass,
    aoPass,
    ssrNode,
    denoiseNode,
    temporalReprojectNode,
    ssrEmissiveBoost,
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
    get composedOutput() {
      return composedOutputRef;
    },
    setRainPassEnabled,
    get introRainGlass() {
      return introRainGlassRef;
    },
    disposeIntroRainGlass,
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
      setAoEnabled,
      setAoResolutionScale,
      setAoSamples,
      setSsrEnabled,
      setSsrResolutionScale,
      setSsrQuality,
      setSsrIntensity,
      setSsrMaxDistance,
      setSsrThickness,
      setSsrEmissiveBoost,
      setSsrEnvironmentIntensity,
      setSsrMaxLuminance,
      setSsrMirrorBias,
      setSsrScreenEdgeFade,
      setSsrScreenEdgeFadeBlack,
      setSsrStepExponent,
      applySsrParams,
    },
  };
}
