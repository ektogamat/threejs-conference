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
import { attachRendererInspector } from "./debug/inspectorControls.js";
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
import { performanceProfile } from "./platform/performanceProfile.js";
import { getStoredLookPreset } from "./platform/userPreferences.js";
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
  syncLayoutClass();

  loaderOverlay.setProgress(0.03);
  loaderOverlay.setStatus("Creating scene...");

  const camera = createCamera();
  const sceneResult = createScene();
  const { scene, sunLight } = sceneResult;

  loaderOverlay.setProgress(0.1);
  loaderOverlay.setStatus("Preparing renderer...");

  const { renderer, inspector: inspectorInstance } = await createRenderer();

  loaderOverlay.setProgress(0.2);
  loaderOverlay.setStatus("Initializing WebGPU...");

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
  loaderOverlay.setStatus("Configuring post-processing...");

  const pipeline = createPostProcessing(renderer, scene, camera, {
    rain: world.rain,
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
    // Once FPS forces the pixel ratio down, also shed DOF and billboard
    // video decode — both are comparatively expensive and not worth the
    // cost once we already know the device is struggling.
    onForcedLow: () => {
      performanceProfile.dof = false;
      pipeline.perf.setDofEnabled(false);
      world.billboards?.userData?.billboardMaterials?.billboard?.disable();
    },
  });
  adaptiveDpr.onResize();

  const performanceTools = createPerformanceDevTools({
    pipeline,
    ground: world.ground,
    adaptiveDpr,
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
    inspectorInstance,
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

  const { carEngineAudio, planeEngineAudio } = await appShell.initAudio();
  attachDevAudio(devApp, carEngineAudio, planeEngineAudio);

  appShell.bindIdleListeners();
  appShell.bindOrbitIdleListeners(cameraDirector.controls);

  cameraDirector.preparePreRevealPose();

  const introFlow = createIntroFlow({
    pipeline,
    renderer,
    loaderOverlay,
    revealAppUi: () => appShell.revealAppUi(),
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

  attachRendererInspector(renderer, inspectorInstance);
  inspectorSession.bootstrapInspector(appShell.settingsPanel);

  renderLoop.startLoop();

  // Rain / smoke / planes compile in parallel with the intro (canvas starts hidden).
  const deferredCompile = compileDeferredStartup({
    renderer,
    scene,
    pipeline,
  }).catch((error) => {
    console.warn("[warmup] Deferred shader compile failed:", error);
  });

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
  await deferredCompile;
}
