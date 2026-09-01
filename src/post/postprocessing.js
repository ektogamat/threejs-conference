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
  sample,
  normalView,
  packNormalToRGB,
  unpackRGBToNormal,
} from "three/tsl";
import { UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { lensflare } from "three/addons/tsl/display/LensflareNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";
import { boxBlurSeparable } from "../tsl/boxBlur.js";
import { applyRainGlass, createRainGlassUniforms } from "../tsl/rainGlass.js";
import { performanceProfile } from "../platform/performanceProfile.js";
import { isSafari } from "../platform/deviceLayout.js";
import { FEATURES } from "../world/features.js";

export function createPostProcessing(renderer, scene, camera, { rain, smoke } = {}) {
  const post = new RenderPipeline(renderer);
  const rainLayer = rain?.layer ?? null;
  const smokeLayer = smoke?.layer ?? null;
  const rainUsesDedicatedPass = rain?.useDedicatedPass !== false && rainLayer !== null;

  const aoCamera = camera.clone();
  if (rainLayer !== null) {
    aoCamera.layers.disable(rainLayer);
  }
  if (smokeLayer !== null) {
    aoCamera.layers.disable(smokeLayer);
  }

  const sceneCamera = camera.clone();
  if (rainLayer !== null) {
    if (rainUsesDedicatedPass) {
      sceneCamera.layers.disable(rainLayer);
    } else {
      sceneCamera.layers.enable(rainLayer);
    }
  }
  if (smokeLayer !== null) {
    sceneCamera.layers.enable(smokeLayer);
  }

  const rainCamera =
    rainUsesDedicatedPass && rainLayer !== null
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
      if (rainUsesDedicatedPass) {
        sceneCamera.layers.disable(rainLayer);
      } else {
        sceneCamera.layers.enable(rainLayer);
      }
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
  scenePass.transparent = true;
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

  let rainPass = null;
  let rainPassColor = null;

  if (rainCamera) {
    rainPass = pass(scene, rainCamera);
    rainPassColor = rainPass.getTextureNode("output");
  }

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
  let rainPassActive = rain?.params?.enabled ?? Boolean(rainPassColor);
  const dofEnabled = uniform(dofActive ? 1 : 0);

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
    let beauty = scenePassColor;

    if (aoActive) {
      const aoValue = aoPass.getTextureNode().r;
      // Post-multiply GTAO onto beauty (smoke is in scenePass; excluded from aoPrePass).
      beauty = beauty.mul(vec4(vec3(aoValue), 1));
    }

    if (rainUsesDedicatedPass && rainPassActive && rainPassColor) {
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
    },
  };
}
