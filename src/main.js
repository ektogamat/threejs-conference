import "./ui/global.css";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Inspector } from "three/addons/inspector/Inspector.js";
import {
  addModel,
  createScene,
  computeProbeIntensity,
  PROBE_INTENSITY,
} from "./scene.js";
import { loadLoftModel } from "./loadModel.js";
import { createPostProcessing } from "./postprocessing.js";
import { setupInspector } from "./setupInspector.js";
import { createSunControls } from "./sunControls.js";
import { loadEnvironmentMap, applyEnvironmentMap } from "./envMap.js";
import { createAdaptiveDprLoop } from "./adaptiveDprLoop.js";
import { createCloudSky } from "./clouds/createCloudSky.js";
import { createLoaderOverlay } from "./loaderOverlay.js";
import { createAppUiState } from "./ui/appUiState.js";
import { createHeader } from "./ui/createHeader.js";
import { createAboutPanel } from "./ui/createAboutPanel.js";
import { createSettingsPanel } from "./ui/createSettingsPanel.js";
import { createPerformanceSuggestion } from "./ui/createPerformanceBanner.js";
import { createResizeWarningBanner } from "./ui/createResizeWarningBanner.js";
import { createScreenshotButton } from "./ui/createScreenshotButton.js";
import { createAudioButton } from "./ui/createAudioButton.js";
import { createCardInstructions } from "./ui/createCardInstructions.js";
import { createRadialColorMenu } from "./ui/createRadialColorMenu.js";
import { subscribeRadialMenu } from "./ui/radialMenuState.js";
import { createPaintController } from "./createPaintController.js";
import { createMeshColorPicker } from "./createMeshColorPicker.js";
import { createPaintHoverHint } from "./ui/createPaintHoverHint.js";
import { createFpsWalkHint } from "./ui/createFpsWalkHint.js";
import { createWalkControls } from "./controls/createWalkControls.js";
import {
  createUiIdleManager,
  createUiVisibilityCoordinator,
} from "./ui/createUiVisibilityCoordinator.js";
import { createIntroOverlay } from "./ui/createIntroOverlay.js";
import { createFirefliesOverlay } from "./intro/createFirefliesOverlay.js";
import { createRenderModeController } from "./renderModeController.js";
import {
  installIndirectSpecularPatch,
  syncIndirectSpecularPatch,
  invalidatePhysicalMaterials,
} from "./materials/indirectSpecularPatch.js";
import {
  RENDER_MODES,
  applyRenderModeSettings,
  getRenderModeRuntimeTuning,
} from "./renderModes.js";
import {
  getRenderMode,
  getInitialRenderMode,
  hasUserChosenRenderMode,
  isDevelopmentModeEnabled,
  setDevelopmentModeEnabled,
  clearAllStoredPreferences,
} from "./userPreferences.js";
import {
  applyProjectState,
  buildSnapshot,
  clearProjectState,
  loadProjectState,
  saveProjectState,
} from "./projectPersistence.js";
import { createSsrMotionProfile } from "./ssrMotion.js";
import { captureCanvasScreenshot } from "./captureScreenshot.js";
import { runFsrBenchmark, shouldRunFsrBenchmark } from "./fsrBenchmark.js";
import {
  openInspector,
  hideInspector,
  clearInspectorLayout,
} from "./inspectorControls.js";
import {
  isMobileLayout,
  onMobileLayoutChange,
  syncLayoutClass,
} from "./ui/deviceLayout.js";

const INTRO_ENABLED = false;

/** TEMP perf test: continuous rAF, no idle sleep. Set false to restore. */
const CONTINUOUS_FRAME_LOOP = true;

/** TEMP perf test: keep full SSR while dragging. Set true to restore. */
const SSR_DRAG_DEGRADATION_ENABLED = false;

const DESKTOP_FOV = 85;
const MOBILE_FOV = 100;
const FREE_CAMERA_START = {
  position: [-138.564, -3.417, 34.181],
  target: [-120, 0, 30],
};

function applyCameraFovForLayout() {
  if (!camera) {
    return;
  }

  camera.fov = isMobileLayout() ? MOBILE_FOV : DESKTOP_FOV;
  camera.updateProjectionMatrix();
}

let camera;
let scene;
let renderer;
let post;
let controls;
let renderLoop;
let giPass;
let pipeline;
let ssrMotion;
let cloudSky;
let sunLight;
let paintController;
let walkControls;
let fpsWalkHint;
let inspectorInstance = null;
let inspectorSetupDone = false;

async function getWebGPULimits() {
  if (!navigator.gpu) {
    return {};
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
    featureLevel: "compatibility",
  });
  if (!adapter) {
    return {};
  }

  const desired = 64;
  const supported = adapter.limits.maxColorAttachmentBytesPerSample;
  if (supported >= desired) {
    return { maxColorAttachmentBytesPerSample: desired };
  }
  if (supported > 32) {
    return { maxColorAttachmentBytesPerSample: supported };
  }
  return {};
}

function requestShadowMapUpdate(source = "shadows") {
  sunLight.shadow.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  renderLoop?.invalidate(source);
}

const loader = createLoaderOverlay();

init(loader).catch((error) => {
  loader.fail("Failed to load. Check the console for details.");
  console.error("Failed to initialize scene:", error);
});

async function init(loaderOverlay) {
  const uiState = createAppUiState();
  let settingsPanelRef = null;
  let aboutPanelRef = null;
  const header = createHeader({
    state: uiState,
    onOpenSettings: () => settingsPanelRef?.open(),
    onOpenAbout: () => aboutPanelRef?.open(),
  });
  const aboutPanel = createAboutPanel({
    state: uiState,
  });
  aboutPanelRef = aboutPanel;

  loaderOverlay.setProgress(0.03);
  loaderOverlay.setStatus("Creating scene...");

  syncLayoutClass();

  camera = new THREE.PerspectiveCamera(
    DESKTOP_FOV,
    window.innerWidth / window.innerHeight,
    0.25,
    2000,
  );
  camera.position.set(...FREE_CAMERA_START.position);
  applyCameraFovForLayout();

  const sceneResult = createScene();
  scene = sceneResult.scene;
  sunLight = sceneResult.sunLight;

  // Block env-map specular before materials compile (SSR owns reflections).
  installIndirectSpecularPatch();
  syncIndirectSpecularPatch(getInitialRenderMode());

  loaderOverlay.setProgress(0.1);
  loaderOverlay.setStatus("Preparing renderer...");

  const requiredLimits = await getWebGPULimits();

  renderer = new THREE.WebGPURenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    // samples: 0,
    requiredLimits,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  clearInspectorLayout();

  inspectorInstance = new Inspector();
  renderer.inspector = inspectorInstance;

  renderer.colorBufferType = THREE.UnsignedByteType;
  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.zIndex = "14";
  renderer.domElement.style.transition = "opacity 220ms ease";

  document.body.appendChild(renderer.domElement);

  loaderOverlay.setProgress(0.2);
  loaderOverlay.setStatus("Initializing WebGPU...");

  await renderer.init();

  if (import.meta.env.DEV) {
    const backend = renderer.backend.isWebGLBackend
      ? "WebGL2 (fallback)"
      : "WebGPU";
    console.info(`[renderer] ${backend}`);
  }

  loaderOverlay.setProgress(0.35);

  const [cloudSkyResult, model, envTexture] = await Promise.all([
    createCloudSky(scene, {
      radius: 45,
      verticalOffset: 2,
    }),
    loadLoftModel(renderer),
    loadEnvironmentMap(),
  ]);
  cloudSky = cloudSkyResult;

  loaderOverlay.setProgress(0.7);

  const modelCenter = addModel(scene, model).clone();
  // Sun / env lighting aim at scene origin (camera target).
  modelCenter.set(0, 0, 0);

  if (import.meta.env.DEV) {
    window.__app = {
      scene,
      model,
      listObjectNames() {
        const rows = [];

        model.traverse((object) => {
          if (!object.name) {
            return;
          }

          rows.push({
            name: object.name,
            type: object.type,
            castShadow: object.castShadow ?? "",
            receiveShadow: object.receiveShadow ?? "",
          });
        });

        rows.sort((a, b) => a.name.localeCompare(b.name));
        console.table(rows);
        return rows;
      },
    };
  }

  const envMapBaseIntensity = { value: 0.04 };
  const envIntensityCurve = { ...PROBE_INTENSITY };
  let renderModeController;
  let performanceSuggestion;
  let resizeWarningBanner;
  let settingsPanel;
  let screenshotButton;
  let audioButton;
  let cardInstructions;
  let uiIdleManager;
  let sunControls;
  let firefliesOverlay = null;
  let persistProjectDebounceId = null;
  let finishedIntro = false;
  const orbitYawOffset = new THREE.Vector3();

  function notifyLightingChange() {
    pipeline?.softenGiForLightingChange?.();
    renderLoop?.invalidate("lighting");
  }

  function syncEnvironmentIntensity() {
    scene.environmentIntensity =
      computeProbeIntensity(sceneResult.sunState.hour, envIntensityCurve) *
      envMapBaseIntensity.value;
    pipeline?.syncSsrEnvironmentIntensity(scene.environmentIntensity);
  }

  function syncLighting({ hour, azimuth } = {}) {
    const sunVisual = sceneResult.updateSun({
      hour: hour ?? sceneResult.sunState.hour,
      azimuth: azimuth ?? sceneResult.sunState.azimuth,
      strength: sceneResult.sunState.strength,
      target: modelCenter,
    });
    cloudSky?.updateFromSun(sunVisual);
    syncEnvironmentIntensity();
    requestShadowMapUpdate("lighting");
  }

  function syncLightingNoRebake(options) {
    syncLighting(options);
  }

  const sunVisual = sceneResult.updateSun({ target: modelCenter });
  requestShadowMapUpdate("init");
  cloudSky?.updateFromSun(sunVisual);

  loaderOverlay.setProgress(0.8);

  const { hdrTexture } = applyEnvironmentMap(scene, renderer, envTexture, {
    intensity:
      computeProbeIntensity(sceneResult.sunState.hour, envIntensityCurve) *
      envMapBaseIntensity.value,
  });
  scene.environmentRotation.set(0, THREE.MathUtils.degToRad(-150), 0);

  loaderOverlay.setProgress(0.85);
  loaderOverlay.setStatus("Configuring post-processing...");

  pipeline = createPostProcessing(renderer, scene, camera, {
    environmentMap: hdrTexture,
    environmentIntensity: scene.environmentIntensity,
  });
  post = pipeline.post;
  giPass = pipeline.giPass;

  const refreshSun = () => syncLighting();

  renderModeController = createRenderModeController({
    applyRenderMode: (mode, options) => {
      pipeline.applyRenderMode(mode, options);
      applyRenderModeSettings(mode, {
        envMapBaseIntensity,
        envIntensityCurve,
        syncLighting,
      });
      syncIndirectSpecularPatch(mode);
      invalidatePhysicalMaterials(scene);
      const tuning = getRenderModeRuntimeTuning(mode);
      renderLoop?.setIdleMaxDPR(tuning.idleMaxDPR, tuning.idleMinMaxDPR);
      pipeline?.applyFsrTuning?.(tuning.fsr);
      ssrMotion?.setDragProfile(tuning.ssrDrag);
      renderLoop?.invalidate("render-mode");
    },
    getInitialMode: getInitialRenderMode,
  });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...FREE_CAMERA_START.target);
  controls.enablePan = true;
  controls.enableDamping = false;
  controls.dampingFactor = 0.4;
  controls.minDistance = 0.1;
  controls.maxDistance = Infinity;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.update();

  walkControls = createWalkControls({
    camera,
    domElement: renderer.domElement,
    model,
    settings: {
      moveSpeed: 32,
      sprintMultiplier: 1.8,
      eyeHeight: 1.8,
    },
    onLookChange: () => {
      renderLoop?.invalidate("walk-look");
    },
  });

  fpsWalkHint = createFpsWalkHint();

  function isCameraModeInputBlocked(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  const orbitLookTarget = new THREE.Vector3();

  function setCameraMode(mode) {
    const walk = mode === "walk";
    walkControls.setActive(walk);
    controls.enabled = !walk && finishedIntro;
    fpsWalkHint?.setVisible(walk && finishedIntro);

    if (walk) {
      walkControls.syncEulerFromCamera();
      walkControls.snapCameraToGround();
    } else {
      camera.getWorldDirection(orbitLookTarget);
      controls.target
        .copy(camera.position)
        .add(orbitLookTarget.multiplyScalar(12));
      controls.update();
    }

    renderLoop?.invalidate("camera-mode");
  }

  function toggleCameraMode() {
    setCameraMode(walkControls.isActive() ? "orbit" : "walk");
  }

  window.addEventListener("keydown", (event) => {
    if (!finishedIntro || isCameraModeInputBlocked(event.target)) {
      return;
    }

    if (event.code === "KeyF") {
      event.preventDefault();
      toggleCameraMode();
    }
  });

  const timer = new THREE.Timer();
  let cloudAnimTime = 0;

  ssrMotion = createSsrMotionProfile({
    renderer,
    ssrNode: pipeline.ssrNode,
    ssrParams: pipeline.ssrParams,
    applySsrParams: pipeline.applySsrParams,
  });
  ssrMotion.params.enabled = SSR_DRAG_DEGRADATION_ENABLED;

  renderLoop = createAdaptiveDprLoop(renderer, {
    render: () => {
      timer.update();
      const delta = timer.getDelta();
      const elapsed = timer.getElapsed();
      if (
        CONTINUOUS_FRAME_LOOP ||
        renderLoop.getState() === "interacting"
      ) {
        cloudAnimTime = elapsed;
      }
      cloudSky?.update(camera, cloudAnimTime);

      if (walkControls?.isActive()) {
        if (walkControls.update(delta)) {
          renderLoop.startInteraction("camera");
          renderLoop.invalidate("walk");
        }
      }

      post.render();
    },
    controls,
    continuous: CONTINUOUS_FRAME_LOOP,
    shouldUpdateControls: () => !walkControls?.isActive(),
    settleFrames: 48,
    maxPixels: 4800000,
    minMaxPixels: 3200000,
    maxMaxPixels: 6500000,
    targetFps: 45,
    idleMaxDPR: 1.2,
    idleMinMaxDPR: 0.95,
    interactionReductionFactor: 0.25,
    interactionDPRTarget: 0.9,
    minInteractionDPR: 0.85,
    interactionEndDelayMs: 250,
    onLoopStateChange: (state, info) => {
      ssrMotion.onLoopStateChange(state, info);
      // After lighting soft-invalidate, keep low maxFrames through settle so GI
      // converges on the new light, then restore normal temporal confidence.
      if (state === "sleeping") {
        pipeline?.restoreGiTemporalParams?.();
      }
    },
    onFrame: (frameMs) => {
      ssrMotion.tick(frameMs, renderLoop.getState());
      performanceSuggestion?.handleFrame(frameMs);
    },
  });

  {
    const tuning = getRenderModeRuntimeTuning(renderModeController.getMode());
    renderLoop.setIdleMaxDPR(tuning.idleMaxDPR, tuning.idleMinMaxDPR);
    pipeline.applyFsrTuning(tuning.fsr);
    ssrMotion.setDragProfile(tuning.ssrDrag);
  }

  paintController = createPaintController({
    model,
    renderer,
    renderLoop,
  });

  if (import.meta.env.DEV && window.__app) {
    window.__app.paint = paintController;
    window.__app.dumpCamera = () => {
      const pose = {
        position: [
          Number(camera.position.x.toFixed(3)),
          Number(camera.position.y.toFixed(3)),
          Number(camera.position.z.toFixed(3)),
        ],
        target: [
          Number(controls.target.x.toFixed(3)),
          Number(controls.target.y.toFixed(3)),
          Number(controls.target.z.toFixed(3)),
        ],
      };
      console.log(JSON.stringify(pose, null, 2));
      return pose;
    };
    console.info("[dev] Camera pose: run __app.dumpCamera() in the console");
  }

  performanceSuggestion = createPerformanceSuggestion({
    getRenderMode: () => renderModeController.getMode(),
    shouldSuggest: () => {
      if (hasUserChosenRenderMode()) {
        return false;
      }
      const mode = renderModeController.getMode();
      return mode === RENDER_MODES.ultra || mode === RENDER_MODES.highEnd;
    },
    onSwitch: (mode) => {
      renderModeController.setMode(mode);
    },
  });

  resizeWarningBanner = createResizeWarningBanner();

  async function finalizeStartupLighting() {
    loaderOverlay.setProgress(0.88);
    loaderOverlay.setStatus("Preparing lighting...");

    syncLighting();
    requestShadowMapUpdate("startup-lighting");
    renderer.render(scene, camera);

    loaderOverlay.setProgress(0.93);
    loaderOverlay.setStatus("Compiling shaders...");
    await renderer.compileAsync(scene, camera);

    loaderOverlay.setProgress(0.96);
    loaderOverlay.setStatus("Warming up lighting...");
    for (let i = 0; i < 4; i++) {
      post.render();
    }
  }

  async function waitForStartupRenderSettle() {
    loaderOverlay.setProgress(0.98);
    loaderOverlay.setStatus("Settling lighting...");
    pipeline?.resetGiHistory?.();
    pipeline?.softenGiForLightingChange?.();
    renderLoop.invalidate("startup");
    // Short settle at idle DPR — full convergence continues after the loader.
    await renderLoop.renderSettledFrame({
      frames: 12,
      forceMaxPixels: false,
    });
  }

  function persistProjectNow() {
    saveProjectState(
      buildSnapshot({
        sunState: sceneResult.sunState,
        meshColors: paintController?.getSnapshot(),
      }),
    );
  }

  function schedulePersistProject() {
    if (persistProjectDebounceId) {
      window.clearTimeout(persistProjectDebounceId);
    }
    persistProjectDebounceId = window.setTimeout(() => {
      persistProjectDebounceId = null;
      persistProjectNow();
    }, 300);
  }

  let cameraDragging = false;

  const savedProject = loadProjectState();
  if (savedProject) {
    const restored = applyProjectState(savedProject, {
      sunState: sceneResult.sunState,
      syncLighting,
    });
    paintController?.applySavedState(restored?.meshColors);
  }

  const radialColorMenu = createRadialColorMenu({
    onColorSelect: (_color, index, target) => {
      paintController?.setColorIndex(target, index);
      schedulePersistProject();
      renderLoop.invalidate("paint");
    },
  });

  const paintHoverHint = createPaintHoverHint({
    domElement: renderer.domElement,
  });

  const unsubscribeRadialMenuRender = subscribeRadialMenu((menuState) => {
    if (menuState.radialMenuOpen) {
      paintController?.setHoveredTarget(null);
      paintHoverHint.hide();
      renderLoop.invalidate("paint-hover", { frames: 6 });
      // Tap to open menu also starts OrbitControls; pause() cancels the scheduled end.
      renderLoop.endInteraction("camera");
      renderLoop.pause();
      return;
    }

    renderLoop.resume();
  });

  createMeshColorPicker({
    camera,
    renderer,
    model,
    paintController,
    isCameraDragging: () => cameraDragging,
    isEnabled: () => finishedIntro && !walkControls?.isActive(),
    onOpenRadialMenu: (options) => radialColorMenu.open(options),
    onHover: (hover) => {
      if (!hover) {
        paintController?.setHoveredTarget(null);
        paintHoverHint.hide();
        renderLoop.invalidate("paint-hover", { frames: 6 });
        return;
      }

      paintHoverHint.show();

      if (!hover.targetChanged) {
        return;
      }

      paintController?.setHoveredTarget(hover.targetKey);
    },
  });

  sunControls = createSunControls({
    initialHour: sceneResult.sunState.hour,
    initialAzimuth: sceneResult.sunState.azimuth,
    compactWhenIdle: true,
    idleMs: 4000,
    defaultMode: "compact",
    getOrbitYaw: () => {
      orbitYawOffset.subVectors(camera.position, controls.target);
      return Math.atan2(orbitYawOffset.x, orbitYawOffset.z);
    },
    onChange: ({ hour, azimuth }) => {
      syncLighting({ hour, azimuth });
      schedulePersistProject();
    },
    onInteractionStart: () => {
      renderLoop.startInteraction("sun");
      // Soft-invalidate like SSR: keep history, force temporal to trust new GI.
      pipeline?.softenGiForLightingChange?.();
    },
    onInteractionEnd: () => {
      // Stay soft through settle; restoreGiTemporalParams runs on "sleeping".
      renderLoop.endInteraction("sun");
      notifyLightingChange();
    },
  });
  sunControls.setVisible(false);

  screenshotButton = createScreenshotButton({
    onCapture: () =>
      captureCanvasScreenshot({
        renderer,
        renderLoop,
        renderFrame: () => post.render(),
        wasUiVisible: uiState.uiVisible,
        hideUi: () => uiState.hideAllUi(),
        restoreUi: () => uiState.showAllUi(),
      }),
  });
  screenshotButton.setVisible(false);

  audioButton = createAudioButton({ url: "/music.mp3" });
  audioButton.setVisible(false);

  cardInstructions = createCardInstructions({
    onDismiss: () => {},
  });

  function ensureInspectorSetup() {
    if (inspectorSetupDone) {
      return;
    }

    setupInspector(renderer, pipeline, sceneResult.pcss, null, {
      sunState: sceneResult.sunState,
      refreshSun,
      syncLightingNoRebake,
      envMapBaseIntensity,
      syncEnvironmentIntensity,
      scene,
      renderModeController,
      onRenderModeChange: (mode) => {
        renderModeController.setMode(mode);
      },
      onParamInteractionStart: () => renderLoop.startInteraction("inspector"),
      onParamInteraction: () => renderLoop.invalidate("inspector"),
      onParamInteractionEnd: () =>
        renderLoop.scheduleInteractionEnd("inspector"),
      onLightingParamChanged: () =>
        requestShadowMapUpdate("inspector-lighting"),
      ssrMotion,
    });
    inspectorSetupDone = true;
  }

  function applyDevelopmentMode(enabled) {
    setDevelopmentModeEnabled(enabled);
    settingsPanel?.syncDevelopmentMode(enabled);

    if (enabled) {
      ensureInspectorSetup();
      openInspector(inspectorInstance);
    } else {
      hideInspector(inspectorInstance);
    }
  }

  settingsPanel = createSettingsPanel({
    state: uiState,
    getDevelopmentMode: isDevelopmentModeEnabled,
    getRenderMode: () => renderModeController.getMode(),
    onDevelopmentModeChange: applyDevelopmentMode,
    onRenderModeChange: (mode) => {
      renderModeController.setMode(mode);
    },
    onRestart: () => {
      if (persistProjectDebounceId) {
        window.clearTimeout(persistProjectDebounceId);
        persistProjectDebounceId = null;
      }
      clearProjectState();
      clearAllStoredPreferences();
      renderModeController.setMode(RENDER_MODES.ultra, { userChoice: false });
      performanceSuggestion?.reset();
      applyDevelopmentMode(false);
      setCameraMode("orbit");
      camera.position.set(...FREE_CAMERA_START.position);
      controls.target.set(...FREE_CAMERA_START.target);
      controls.update();
      syncLighting();
      renderLoop.invalidate("restart");
    },
  });
  settingsPanelRef = settingsPanel;

  renderModeController.subscribe((mode) => {
    settingsPanel.syncRenderMode(mode);
  });

  const uiVisibilityCoordinator = createUiVisibilityCoordinator({
    state: uiState,
    header,
    screenshotButton,
    audioButton,
    isAppReady: () => finishedIntro,
  });

  uiIdleManager = createUiIdleManager({
    state: uiState,
    activityTarget: document,
  });
  uiIdleManager.start();
  renderer.domElement.addEventListener("pointerdown", uiIdleManager.resetTimer);
  renderer.domElement.addEventListener("touchstart", uiIdleManager.resetTimer, {
    passive: true,
  });

  hideInspector(inspectorInstance);

  camera.position.set(...FREE_CAMERA_START.position);
  controls.target.set(...FREE_CAMERA_START.target);
  controls.enabled = false;
  controls.update();

  await finalizeStartupLighting();

  if (isDevelopmentModeEnabled()) {
    ensureInspectorSetup();
  }

  controls.addEventListener("start", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
    cameraDragging = true;
    uiIdleManager?.resetTimer();
    renderLoop.startInteraction("camera");
  });
  controls.addEventListener("change", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
    uiIdleManager?.resetTimer();

    if (cameraDragging) {
      renderLoop.startInteraction("camera");
      renderLoop.invalidate("camera");
    }
  });
  controls.addEventListener("end", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
    cameraDragging = false;
    renderLoop.scheduleInteractionEnd("camera");
  });

  window.addEventListener("resize", onWindowResize);
  onMobileLayoutChange(() => {
    syncLayoutClass();
    applyCameraFovForLayout();
  });

  renderLoop.bootstrap();
  await waitForStartupRenderSettle();

  function revealAppUi() {
    finishedIntro = true;
    controls.enabled = true;
    uiVisibilityCoordinator.refresh();
    header.show();
    resizeWarningBanner?.arm();
    performanceSuggestion?.arm();
    sunControls?.setVisible(true);
    cardInstructions.show();
    if (isDevelopmentModeEnabled()) {
      openInspector(inspectorInstance);
    }

    if (shouldRunFsrBenchmark()) {
      runFsrBenchmark({
        renderLoop,
        renderModeController,
        pipeline,
        renderFrame: () => post.render(),
      }).catch((error) => {
        console.error("[FSR benchmark] failed", error);
      });
    }
  }

  async function runIntroSequence() {
    renderLoop.pause();
    firefliesOverlay = await createFirefliesOverlay({ opacity: 0.75 });
    firefliesOverlay.startStandaloneLoop({ maxDpr: 0.85 });

    const introOverlay = createIntroOverlay({
      onStart: () => {
        void (async () => {
          firefliesOverlay.stopStandaloneLoop();
          renderLoop.resume();
          post.render();

          audioButton.play().catch(() => {});

          const fadePromise = firefliesOverlay?.fadeOut({ duration: 1.2 });

          await fadePromise;
          firefliesOverlay?.destroy();
          firefliesOverlay = null;

          schedulePersistProject();
          revealAppUi();
        })();
      },
    });

    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.domElement.style.opacity = "1";
    renderer.domElement.style.zIndex = "14";
    firefliesOverlay.setZIndex(18);
    await firefliesOverlay.waitForFirstFrame();
    firefliesOverlay.pauseStandaloneLoop();
    post.render();
    await loaderOverlay.finish();
    firefliesOverlay.resumeStandaloneLoop();
    introOverlay.playEnter();
  }

  async function enterAppWithoutIntro() {
    renderer.domElement.style.opacity = "1";
    renderer.domElement.style.zIndex = "14";
    post.render();
    await loaderOverlay.finish();
    schedulePersistProject();
    revealAppUi();
  }

  if (INTRO_ENABLED) {
    await runIntroSequence();
  } else {
    await enterAppWithoutIntro();
  }
}

function onWindowResize() {
  syncLayoutClass();

  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  applyCameraFovForLayout();

  renderer.setSize(width, height);
  renderLoop?.handleResize();
  paintController?.handleResize();
  pipeline?.resizePostProcessing?.(width, height);
  ssrMotion?.handleResize?.();
  requestShadowMapUpdate("resize");
  giPass?.resetHistory?.();
}
