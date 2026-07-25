import "./ui/core/global.css";
import * as THREE from "three/webgpu";
import { createScene } from "./world/scene.js";
import { createWorld, createLightingController } from "./world/createWorld.js";
import { applyEnvironmentMap } from "./world/envMap.js";
import { createPostProcessing } from "./post/postprocessing.js";
import { createLoaderOverlay } from "./app/createLoaderOverlay.js";
import { createAppShell } from "./app/createAppShell.js";
import { createIntroFlow } from "./app/createIntroFlow.js";
import {
  createCamera,
  createCameraLayoutSync,
  cameraParams,
} from "./bootstrap/createCamera.js";
import {
  createRenderer,
  createShadowUpdater,
  resizeRenderer,
} from "./bootstrap/createRenderer.js";
import { createCameraDirector } from "./runtime/createCameraDirector.js";
import { createRenderLoop } from "./runtime/createRenderLoop.js";
import {
  compileDeferredStartup,
  finalizeStartupLighting,
} from "./runtime/warmup.js";
import { createPerformanceDevTools } from "./debug/createPerformanceDevTools.js";
import { createInspectorSession } from "./debug/createInspectorSession.js";
import {
  createDevAppApi,
  attachDevAudio,
  attachDevPerf,
} from "./debug/createDevAppApi.js";
import {
  syncLayoutClass,
  onMobileLayoutChange,
} from "./platform/deviceLayout.js";
import { createAdaptiveDprController } from "./platform/adaptiveDpr.js";
import {
  performanceProfile,
  applyDevicePerformanceDefaults,
  shouldCompileBeforeRenderLoop,
} from "./platform/performanceProfile.js";
import { getStoredLookPreset, isDevelopmentModeEnabled } from "./platform/userPreferences.js";
import {
  DEFAULT_LOOK_PRESET,
  LOOK_PRESETS,
} from "./post/look/cyberpunkLook.js";

const loader = createLoaderOverlay();

init(loader).catch((error) => {
  loader.fail("Failed to load. Check the console for details.");
  console.error("Failed to initialize scene:", error);
});

async function init(loaderOverlay) {
  // Must run before createRenderer so the initial setPixelRatio sees iOS caps.
  applyDevicePerformanceDefaults();
  syncLayoutClass();

  loaderOverlay.setProgress(0.03);
  loaderOverlay.setStatus("BOOTING SCENE");

  const camera = createCamera();
  const sceneResult = createScene();
  const { scene, sunLight } = sceneResult;

  loaderOverlay.setProgress(0.1);
  loaderOverlay.setStatus("SPINNING UP RENDERER");

  const { renderer } = await createRenderer();

  loaderOverlay.setProgress(0.2);
  loaderOverlay.setStatus("LINKING WEBGPU");

  const { requestShadowMapUpdate } = createShadowUpdater({
    renderer,
    getSunLight: () => sunLight,
  });

  const world = await createWorld({
    scene,
    renderer,
    loaderOverlay,
    requestShadowMapUpdate,
  });

  const envMapBaseIntensity = { value: 0.08 };
  const lighting = createLightingController({
    sceneResult,
    envMapBaseIntensity,
    requestShadowMapUpdate,
  });

  lighting.syncLighting();
  requestShadowMapUpdate("init");

  loaderOverlay.setProgress(0.8);

  applyEnvironmentMap(scene, renderer, world.envTexture, {
    intensity: envMapBaseIntensity.value,
  });
  scene.environmentRotation.set(
    0,
    THREE.MathUtils.degToRad(70),
    THREE.MathUtils.degToRad(51),
  );

  loaderOverlay.setProgress(0.85);
  loaderOverlay.setStatus("WIRING POST FX");

  const pipeline = createPostProcessing(renderer, scene, camera, {
    rain: world.rain,
    smoke: world.smoke,
  });
  const post = pipeline.post;

  const storedLookPreset = getStoredLookPreset();
  const initialLookPreset =
    storedLookPreset && LOOK_PRESETS[storedLookPreset]
      ? storedLookPreset
      : DEFAULT_LOOK_PRESET;

  pipeline.applyLookPreset(initialLookPreset, {
    bloomPass: pipeline.bloomPass,
    lensflare: pipeline.lensflare,
  });

  const adaptiveDpr = createAdaptiveDprController({
    renderer,
    pipeline,
    // Once FPS forces the pixel ratio down, also shed DOF, lensflare, and
    // billboard video decode — all comparatively expensive once we know the
    // device is struggling.
    onForcedLow: () => {
      performanceProfile.dof = false;
      pipeline.perf.setDofEnabled(false);
      performanceProfile.lensflare = false;
      pipeline.perf.setLensflareEnabled(false);
      world.billboards?.userData?.billboardMaterials?.billboard?.disable();
    },
  });
  adaptiveDpr.onResize();

  // Adaptive DPR must not react to intro / rain-glass FPS — that hitch was
  // permanently locking capable Androids into the low-DPR path before ENTER.
  const adaptiveSampleGate = { allow: false };

  const performanceTools = createPerformanceDevTools({
    pipeline,
    ground: world.ground,
    adaptiveDpr,
    getAllowAdaptiveSample: () => adaptiveSampleGate.allow,
  });

  const walkModeBridge = { onChange: null };

  const cameraDirector = createCameraDirector({
    camera,
    renderer,
    world,
    getFinishedIntro: () => appShell?.isFinishedIntro?.() ?? false,
    onWalkModeChange: (walk) => walkModeBridge.onChange?.(walk),
  });

  const cameraLayout = createCameraLayoutSync({
    camera,
    getWalkControls: () => cameraDirector.walkControls,
  });

  const inspectorSession = createInspectorSession({
    renderer,
    pipeline,
    sceneResult,
    world,
    cameraDirector,
    cameraParams,
    applyCameraFovForLayout: cameraLayout.applyCameraFovForLayout,
    syncWalkEyeHeight: cameraLayout.syncWalkEyeHeight,
    syncLighting: lighting.syncLighting,
    syncEnvironmentIntensity: lighting.syncEnvironmentIntensity,
    envMapBaseIntensity,
    requestShadowMapUpdate,
    adaptiveDpr,
  });

  const appShell = createAppShell({
    renderer,
    camera,
    cameraDirector,
    world,
    pipeline,
    inspectorSession,
    syncLighting: lighting.syncLighting,
  });

  walkModeBridge.onChange = appShell.onWalkModeChange;

  const devApp = createDevAppApi({
    scene,
    world,
    camera,
    controls: cameraDirector.controls,
  });
  attachDevPerf(devApp, performanceTools.perfApi);

  const { carEngineAudio, planeEngineAudio, wetFootstepAudio } =
    await appShell.initAudio();
  cameraDirector.setFootstepAudio(wetFootstepAudio);
  attachDevAudio(devApp, carEngineAudio, planeEngineAudio, wetFootstepAudio);

  appShell.bindIdleListeners();
  appShell.bindOrbitIdleListeners(cameraDirector.controls);

  cameraDirector.preparePreRevealPose();

  const introFlow = createIntroFlow({
    pipeline,
    renderer,
    loaderOverlay,
    revealAppUi: () => {
      appShell.revealAppUi();
      adaptiveSampleGate.allow = true;
    },
    world,
  });

  const renderLoop = createRenderLoop({
    camera,
    cameraDirector,
    world,
    pipeline,
    post,
    performanceTools,
    renderer,
    getRainGlassIntro: introFlow.getRainGlassIntro,
    getIntroActive: introFlow.isIntroActive,
    onFrame: (delta) => appShell.updateHud(delta),
  });

  await finalizeStartupLighting({
    loaderOverlay,
    syncLighting: lighting.syncLighting,
    requestShadowMapUpdate,
    renderer,
    scene,
    pipeline,
    camera,
    world,
    post,
  });

  const deferredCompile = compileDeferredStartup({
    renderer,
    scene,
    pipeline,
  }).catch((error) => {
    console.warn("[warmup] Deferred shader compile failed:", error);
  });

  if (shouldCompileBeforeRenderLoop()) {
    await deferredCompile;
  }

  renderLoop.startLoop();

  window.addEventListener("resize", () => {
    syncLayoutClass();
    cameraLayout.onWindowResizeAspect();
    resizeRenderer(renderer, pipeline, adaptiveDpr);
    requestShadowMapUpdate("resize");
  });

  onMobileLayoutChange(() => {
    syncLayoutClass();
    cameraLayout.applyCameraFovForLayout();
  });

  await introFlow.run();

  if (!shouldCompileBeforeRenderLoop()) {
    await deferredCompile;
  }

  // Inspector attaches only via Development Mode (never on load).
  inspectorSession.bootstrapInspector(appShell.settingsPanel);

  if (isDevelopmentModeEnabled()) {
    inspectorSession.revealInspector();
  }
}
