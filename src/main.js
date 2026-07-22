import "./ui/global.css";
import * as THREE from "three/webgpu";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Inspector } from "three/addons/inspector/Inspector.js";
import { addModel, createScene } from "./scene.js";
import { loadLoftModel, loadQuadraCar } from "./loadModel.js";
import { createGround } from "./createGround.js";
import { createPostProcessing } from "./postprocessing.js";
import { setupInspector } from "./setupInspector.js";
import { loadEnvironmentMap, applyEnvironmentMap } from "./envMap.js";
// import { createCloudSky } from "./clouds/createCloudSky.js";
import { createLoaderOverlay } from "./loaderOverlay.js";
import { createAppUiState } from "./ui/appUiState.js";
import { createHeader } from "./ui/createHeader.js";
import { createAboutPanel } from "./ui/createAboutPanel.js";
import { createSettingsPanel } from "./ui/createSettingsPanel.js";
import { createAudioButton } from "./ui/createAudioButton.js";
import { createCarEngineAudio } from "./audio/createCarEngineAudio.js";
import { createWalkControlsHint } from "./ui/createWalkControlsHint.js";
import { createWalkControls } from "./controls/createWalkControls.js";
import {
  createUiIdleManager,
  createUiVisibilityCoordinator,
} from "./ui/createUiVisibilityCoordinator.js";
import { createIntroOverlay } from "./ui/createIntroOverlay.js";
import { createFirefliesOverlay } from "./intro/createFirefliesOverlay.js";
import { createRainStreaks } from "./weather/createRainStreaks.js";
import {
  isDevelopmentModeEnabled,
  setDevelopmentModeEnabled,
  clearAllStoredPreferences,
} from "./userPreferences.js";
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
import { createPerformanceDevTools } from "./createPerformanceDevTools.js";
import { performanceProfile } from "./performanceProfile.js";

const INTRO_ENABLED = false;
const DESKTOP_FOV = 55;
const MOBILE_FOV = 100;
const cameraParams = {
  fovDesktop: DESKTOP_FOV,
  fovMobile: MOBILE_FOV,
  walkEyeHeight: 1.55,
  walkAcceleration: 10,
  walkDeceleration: 14,
  walkFovBoost: 3,
  sprintFovBoost: 8,
  walkFovBlendSpeed: 2,
  sprintFovBlendSpeed: 2.5,
};
// Y is eye height above the flat ground (createGround default y = -5.5).
const FREE_CAMERA_START = {
  position: [-138.564, -3.95, 34.181],
  target: [-120, -3, 30],
};

function getBaseFovForLayout() {
  return isMobileLayout() ? cameraParams.fovMobile : cameraParams.fovDesktop;
}

function applyCameraFovForLayout() {
  if (!camera) {
    return;
  }

  const baseFov = getBaseFovForLayout();

  if (walkControls?.isActive()) {
    walkControls.setBaseFov(baseFov);
  } else {
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
}

function syncWalkEyeHeight() {
  if (!walkControls) {
    return;
  }

  walkControls.setEyeHeight(cameraParams.walkEyeHeight);
}

let camera;
let scene;
let renderer;
let post;
let controls;
let pipeline;
// let cloudSky;
let sunLight;
let walkControls;
let walkControlsHint;
let inspectorInstance = null;
let inspectorSetupDone = false;
let rain = null;
let performanceTools = null;

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
    0.1,
    1000,
  );
  camera.position.set(...FREE_CAMERA_START.position);
  applyCameraFovForLayout();

  const sceneResult = createScene();
  scene = sceneResult.scene;
  sunLight = sceneResult.sunLight;

  loaderOverlay.setProgress(0.1);
  loaderOverlay.setStatus("Preparing renderer...");

  const requiredLimits = await getWebGPULimits();

  renderer = new THREE.WebGPURenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    requiredLimits,
    samples: 0,
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, performanceProfile.maxPixelRatio),
  );
  renderer.colorBufferType = THREE.UnsignedByteType;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  const [model, quadra, envTexture] = await Promise.all([
    loadLoftModel(renderer),
    loadQuadraCar(renderer),
    loadEnvironmentMap(),
  ]);
  const { car: quadraCar, collider: quadraCollider } = quadra;
  // cloudSky = await createCloudSky(scene, {
  //   radius: 45,
  //   verticalOffset: 2,
  // });

  loaderOverlay.setProgress(0.7);

  addModel(scene, model);
  addModel(scene, quadraCar);
  scene.add(quadraCollider);
  requestShadowMapUpdate("quadra-car");

  const ground = createGround(scene);

  rain = await createRainStreaks({ scene });

  if (import.meta.env.DEV) {
    window.__app = {
      scene,
      model,
      quadraCar,
      ground,
      rain,
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

  const envMapBaseIntensity = { value: 0.08 };
  let settingsPanel;
  let audioButton;
  let uiIdleManager;
  let firefliesOverlay = null;
  let finishedIntro = false;

  function syncEnvironmentIntensity() {
    scene.environmentIntensity = envMapBaseIntensity.value;
  }

  function syncLighting() {
    sceneResult.applySun();
    syncEnvironmentIntensity();
    requestShadowMapUpdate("lighting");
  }

  syncLighting();
  requestShadowMapUpdate("init");

  loaderOverlay.setProgress(0.8);

  applyEnvironmentMap(scene, renderer, envTexture, {
    intensity: envMapBaseIntensity.value,
  });
  scene.environmentRotation.set(
    0,
    THREE.MathUtils.degToRad(70),
    THREE.MathUtils.degToRad(51),
  );

  loaderOverlay.setProgress(0.85);
  loaderOverlay.setStatus("Configuring post-processing...");

  pipeline = createPostProcessing(renderer, scene, camera, { rain });
  post = pipeline.post;

  pipeline.applyLookPreset(pipeline.look.getCurrentPresetId(), {
    bloomPass: pipeline.bloomPass,
    lensflare: pipeline.lensflare,
  });

  performanceTools = createPerformanceDevTools({ pipeline, ground });

  if (import.meta.env.DEV && window.__app) {
    window.__app.perf = performanceTools.perfApi;
  }

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...FREE_CAMERA_START.target);
  controls.enablePan = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.1;
  controls.maxDistance = Infinity;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.update();

  const WALK_FOCUS_DISTANCE = 12;
  const focusPoint = controls.target.clone();
  const walkFocusDirection = new THREE.Vector3();
  const dofRaycaster = new THREE.Raycaster();
  const dofPointerCoords = new THREE.Vector2();
  let focusTween = null;

  function focusOnPoint(point) {
    focusTween?.kill();
    focusTween = gsap.to(focusPoint, {
      x: point.x,
      y: point.y,
      z: point.z,
      duration: 0.5,
      ease: "power2.inOut",
    });
  }

  function setWalkFocusPoint() {
    camera.getWorldDirection(walkFocusDirection);
    focusPoint
      .copy(camera.position)
      .addScaledVector(walkFocusDirection, WALK_FOCUS_DISTANCE);
  }

  function syncWalkFocusPoint() {
    focusTween?.kill();
    focusTween = null;
    setWalkFocusPoint();
  }

  function onDofPointerDown(event) {
    if (
      !finishedIntro ||
      walkControls.isActive() ||
      isCameraModeInputBlocked(event.target)
    ) {
      return;
    }

    dofPointerCoords.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );

    dofRaycaster.setFromCamera(dofPointerCoords, camera);
    dofRaycaster.firstHitOnly = true;

    const intersects = dofRaycaster.intersectObject(model, true);
    if (intersects.length > 0) {
      focusOnPoint(intersects[0].point);
    }
  }

  renderer.domElement.addEventListener("pointerdown", onDofPointerDown);

  walkControls = createWalkControls({
    camera,
    domElement: renderer.domElement,
    model,
    colliders: [model, quadraCollider],
    ground: ground.mesh,
    baseFov: getBaseFovForLayout(),
    settings: {
      moveSpeed: 7,
      sprintMultiplier: 3,
      eyeHeight: cameraParams.walkEyeHeight,
      acceleration: cameraParams.walkAcceleration,
      deceleration: cameraParams.walkDeceleration,
      walkFovBoost: cameraParams.walkFovBoost,
      sprintFovBoost: cameraParams.sprintFovBoost,
      walkFovBlendSpeed: cameraParams.walkFovBlendSpeed,
      sprintFovBlendSpeed: cameraParams.sprintFovBlendSpeed,
    },
  });

  walkControlsHint = createWalkControlsHint({
    state: uiState,
    domElement: renderer.domElement,
  });

  const cameraModeState = { orbitEnabled: false };

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
    cameraModeState.orbitEnabled = !walk;
    walkControls.setActive(walk);
    controls.enabled = !walk && finishedIntro;
    walkControlsHint?.setVisible(walk && finishedIntro);

    if (walk) {
      walkControls.setBaseFov(getBaseFovForLayout());
      walkControls.syncEulerFromCamera();
      walkControls.snapCameraToGround();
      syncWalkFocusPoint();
    } else {
      camera.getWorldDirection(orbitLookTarget);
      controls.target
        .copy(camera.position)
        .add(orbitLookTarget.multiplyScalar(WALK_FOCUS_DISTANCE));
      controls.update();
    }
  }

  const timer = new THREE.Timer();

  function renderFrame() {
    timer.update();
    const delta = timer.getDelta();
    // cloudSky?.update(camera, timer.getElapsed());

    if (walkControls?.isActive()) {
      walkControls.update(delta);
      setWalkFocusPoint();
    } else if (controls.enabled) {
      controls.update();
    }

    rain?.update(delta, camera);
    ground.update?.(delta);
    ground.setRippleAmount?.(rain?.params?.enabled ? 1 : 0);
    if (performanceTools?.shouldUpdateGroundReflection()) {
      ground.updateReflection?.(renderer, camera);
    }
    pipeline.syncCameras?.(camera);
    pipeline.dof.updateFocusPoint(focusPoint, camera);
    post.render();
    performanceTools?.sampleFps();
  }

  // Animation loop starts after finalizeStartupLighting (see below).

  if (import.meta.env.DEV && window.__app) {
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

  async function finalizeStartupLighting() {
    loaderOverlay.setProgress(0.88);
    loaderOverlay.setStatus("Preparing lighting...");

    syncLighting();
    requestShadowMapUpdate("startup-lighting");

    loaderOverlay.setProgress(0.93);
    loaderOverlay.setStatus("Compiling shaders...");
    // Size reflection RT before compile so we don't destroy a 1x1 texture
    // that shaders already bound (WebGPU: Destroyed texture used in submit).
    ground.syncReflectionSize?.(renderer);
    await renderer.compileAsync(scene, pipeline.beautyCamera ?? camera);
    if (pipeline.rainCamera) {
      await renderer.compileAsync(scene, pipeline.rainCamera);
    }

    loaderOverlay.setProgress(0.96);
    loaderOverlay.setStatus("Warming up...");
    for (let i = 0; i < 4; i++) {
      rain?.update(1 / 60, camera);
      ground.update?.(1 / 60);
      ground.setRippleAmount?.(rain?.params?.enabled ? 1 : 0);
      ground.updateReflection?.(renderer, camera);
      pipeline.syncCameras?.(camera);
      post.render();
    }
  }

  function ensureInspectorSetup() {
    if (inspectorSetupDone) {
      return;
    }

    setupInspector(
      renderer,
      pipeline,
      {
        sunState: sceneResult.sunState,
        refreshSun: () => syncLighting(),
        syncEnvironmentIntensity,
        envMapBaseIntensity,
        scene,
        onParamInteractionStart: () => {},
        onParamInteraction: () => {},
        onParamInteractionEnd: () => {},
        onLightingParamChanged: () =>
          requestShadowMapUpdate("inspector-lighting"),
      },
      ground,
      {
        params: cameraParams,
        walkSettings: walkControls.settings,
        syncFov: applyCameraFovForLayout,
        syncWalkEyeHeight,
        cameraModeState,
        setCameraMode,
      },
      rain,
    );
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
    onDevelopmentModeChange: applyDevelopmentMode,
    onRestart: () => {
      clearAllStoredPreferences();
      applyDevelopmentMode(false);
      camera.position.set(...FREE_CAMERA_START.position);
      controls.target.set(...FREE_CAMERA_START.target);
      controls.update();
      setCameraMode("walk");
      walkControls.snapCameraToGround();
      syncWalkFocusPoint();
      syncLighting();
    },
  });
  settingsPanelRef = settingsPanel;

  audioButton = createAudioButton();
  const carEngineAudio = await createCarEngineAudio({
    camera,
    car: quadraCar,
  });
  if (import.meta.env.DEV && window.__app) {
    window.__app.carEngineAudio = carEngineAudio;
  }

  audioButton.setVisible(false);

  const uiVisibilityCoordinator = createUiVisibilityCoordinator({
    state: uiState,
    header,
    audioButton,
    walkControlsHint,
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

  // Ground the spawn pose while the loader still covers the canvas so walk
  // activation after the reveal does not pop the camera on Y / DoF focus.
  camera.position.set(...FREE_CAMERA_START.position);
  walkControls.snapCameraToGround();
  controls.target.set(...FREE_CAMERA_START.target);
  controls.enabled = false;
  controls.update();
  syncWalkFocusPoint();

  await finalizeStartupLighting();

  renderer.setAnimationLoop(renderFrame);

  if (isDevelopmentModeEnabled()) {
    ensureInspectorSetup();
  }

  controls.addEventListener("start", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
    uiIdleManager?.resetTimer();
  });
  controls.addEventListener("change", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
    uiIdleManager?.resetTimer();
  });
  controls.addEventListener("end", () => {
    if (!finishedIntro || walkControls?.isActive()) {
      return;
    }
  });

  window.addEventListener("resize", onWindowResize);
  onMobileLayoutChange(() => {
    syncLayoutClass();
    applyCameraFovForLayout();
  });

  function revealAppUi() {
    finishedIntro = true;
    setCameraMode("walk");
    uiVisibilityCoordinator.refresh();
    header.show();
    audioButton?.setVisible(true);
    if (isDevelopmentModeEnabled()) {
      openInspector(inspectorInstance);
    }
  }

  async function runIntroSequence() {
    renderer.setAnimationLoop(null);
    firefliesOverlay = await createFirefliesOverlay({ opacity: 0.75 });
    firefliesOverlay.startStandaloneLoop();

    const introOverlay = createIntroOverlay({
      onStart: () => {
        void (async () => {
          firefliesOverlay.stopStandaloneLoop();
          renderer.setAnimationLoop(renderFrame);
          post.render();

          const fadePromise = firefliesOverlay?.fadeOut({ duration: 1.2 });

          await fadePromise;
          firefliesOverlay?.destroy();
          firefliesOverlay = null;

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

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, performanceProfile.maxPixelRatio),
  );
  renderer.setSize(width, height);
  pipeline?.resizePostProcessing?.(width, height);
  requestShadowMapUpdate("resize");
}
