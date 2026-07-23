import { FEATURES } from "../world/features.js";
import { createAppUiState } from "../ui/core/appUiState.js";
import { createHeader } from "../ui/chrome/createHeader.js";
import { createAboutPanel } from "../ui/chrome/createAboutPanel.js";
import { createSettingsPanel } from "../ui/chrome/createSettingsPanel.js";
import { createAudioButton } from "../ui/chrome/createAudioButton.js";
import {
  createUiIdleManager,
  createUiVisibilityCoordinator,
} from "../ui/chrome/createUiVisibilityCoordinator.js";
import { createWalkControlsHint } from "../ui/walk/createWalkControlsHint.js";
import { createWalkPrompt } from "../ui/walk/createWalkPrompt.js";
import { createMoveHint } from "../ui/walk/createMoveHint.js";
import { createVirtualJoystick } from "../ui/walk/createVirtualJoystick.js";
import { createWalkInputFacade } from "../ui/walk/createWalkInputFacade.js";
import { createCarEngineAudio } from "../audio/createCarEngineAudio.js";
import { createPlaneEngineAudio } from "../audio/createPlaneEngineAudio.js";
import {
  DEFAULT_LOOK_PRESET,
  LOOK_PRESETS,
} from "../post/look/cyberpunkLook.js";
import {
  phosphorCircleHalf,
  phosphorCloudRain,
  phosphorMoonStars,
  phosphorSunHorizon,
} from "../ui/core/phosphorIcons.js";
import {
  isDevelopmentModeEnabled,
  clearAllStoredPreferences,
  setStoredLookPreset,
} from "../platform/userPreferences.js";

const LOOK_OPTIONS = [
  {
    id: "neutral",
    label: LOOK_PRESETS.neutral.label,
    icon: phosphorCircleHalf,
  },
  {
    id: "neonNoir",
    label: LOOK_PRESETS.neonNoir.label,
    icon: phosphorMoonStars,
  },
  {
    id: "magentaRain",
    label: LOOK_PRESETS.magentaRain.label,
    icon: phosphorCloudRain,
  },
  {
    id: "tealDusk",
    label: LOOK_PRESETS.tealDusk.label,
    icon: phosphorSunHorizon,
  },
];

export function createAppShell({
  renderer,
  camera,
  cameraDirector,
  world,
  pipeline,
  inspectorSession,
  syncLighting,
}) {
  const uiState = createAppUiState();
  let finishedIntro = false;
  let settingsPanelRef = null;
  let aboutPanelRef = null;

  const header = FEATURES.chromeUi
    ? createHeader({
        state: uiState,
        onOpenSettings: () => settingsPanelRef?.open(),
        onOpenAbout: () => aboutPanelRef?.open(),
      })
    : null;

  const aboutPanel = FEATURES.chromeUi
    ? createAboutPanel({ state: uiState })
    : null;
  aboutPanelRef = aboutPanel;

  const walkFacade = createWalkInputFacade(cameraDirector.walkControls);

  let walkControlsHint = null;
  let walkPrompt = null;
  let moveHint = null;
  let virtualJoystick = null;

  if (FEATURES.walkUi && walkFacade) {
    walkControlsHint = createWalkControlsHint({
      state: uiState,
      domElement: renderer.domElement,
    });

    walkPrompt = createWalkPrompt({
      domElement: renderer.domElement,
      walkControls: walkFacade,
      state: uiState,
    });

    moveHint = createMoveHint({
      walkControls: walkFacade,
      state: uiState,
    });

    virtualJoystick = createVirtualJoystick({
      walkControls: walkFacade,
      state: uiState,
    });

    header?.bindWalkControls?.(cameraDirector.walkControls);
  }

  const settingsPanel = FEATURES.chromeUi
    ? createSettingsPanel({
        state: uiState,
        lookOptions: LOOK_OPTIONS,
        defaultLookPreset: DEFAULT_LOOK_PRESET,
        getDevelopmentMode: isDevelopmentModeEnabled,
        onDevelopmentModeChange: (enabled) =>
          inspectorSession.applyDevelopmentMode(enabled, settingsPanelRef),
        getCurrentLookPreset: () => pipeline.look.getCurrentPresetId(),
        onLookPresetChange: (presetId) => {
          pipeline.applyLookPreset(presetId);
          setStoredLookPreset(presetId);
        },
        onRestart: () => {
          clearAllStoredPreferences();
          inspectorSession.applyDevelopmentMode(false, settingsPanelRef);
          pipeline.applyLookPreset(DEFAULT_LOOK_PRESET);
          settingsPanelRef?.syncLookPreset(DEFAULT_LOOK_PRESET);
          syncLighting?.();
        },
      })
    : null;
  settingsPanelRef = settingsPanel;

  let audioButton = null;
  let carEngineAudio = null;
  let planeEngineAudio = null;

  if (FEATURES.audio) {
    audioButton = createAudioButton();
    audioButton.setVisible(false);
  }

  async function initAudio() {
    if (!FEATURES.audio || !world.car) {
      return { carEngineAudio: null, planeEngineAudio: null };
    }

    carEngineAudio = await createCarEngineAudio({
      camera,
      car: world.car,
    });
    planeEngineAudio = await createPlaneEngineAudio({
      listener: carEngineAudio.listener,
      plane: world.primaryPlaneAnchor,
    });

    return { carEngineAudio, planeEngineAudio };
  }

  const uiVisibilityCoordinator = FEATURES.chromeUi
    ? createUiVisibilityCoordinator({
        state: uiState,
        header,
        audioButton,
        walkControlsHint,
        virtualJoystick,
        isAppReady: () => finishedIntro,
      })
    : null;

  const uiIdleManager = FEATURES.chromeUi
    ? createUiIdleManager({
        state: uiState,
        activityTarget: document,
      })
    : null;

  function bindIdleListeners() {
    if (!uiIdleManager) {
      return;
    }

    uiIdleManager.start();
    renderer.domElement.addEventListener(
      "pointerdown",
      uiIdleManager.resetTimer,
    );
    renderer.domElement.addEventListener(
      "touchstart",
      uiIdleManager.resetTimer,
      { passive: true },
    );
  }

  function bindOrbitIdleListeners(controls) {
    if (!uiIdleManager) {
      return;
    }

    controls.addEventListener("start", () => {
      if (!finishedIntro || cameraDirector.walkControls?.isActive()) {
        return;
      }
      uiIdleManager.resetTimer();
    });
    controls.addEventListener("change", () => {
      if (!finishedIntro || cameraDirector.walkControls?.isActive()) {
        return;
      }
      uiIdleManager.resetTimer();
    });
  }

  function revealAppUi() {
    finishedIntro = true;
    cameraDirector.setCameraMode("walk");
    uiVisibilityCoordinator?.refresh();
    header?.show();
    audioButton?.setVisible(true);
    walkPrompt?.setEnabled(true);
    moveHint?.setEnabled(true);
    virtualJoystick?.setEnabled(true);
    inspectorSession.revealInspector?.();
  }

  function onWalkModeChange(walk) {
    walkControlsHint?.setVisible(walk && finishedIntro);
    virtualJoystick?.setVisible(walk && finishedIntro);
  }

  return {
    header,
    settingsPanel,
    aboutPanel,
    audioButton,
    walkControlsHint,
    walkPrompt,
    moveHint,
    virtualJoystick,
    uiIdleManager,
    uiVisibilityCoordinator,
    initAudio,
    bindIdleListeners,
    bindOrbitIdleListeners,
    revealAppUi,
    onWalkModeChange,
    isFinishedIntro: () => finishedIntro,
    updateHud: (delta) => header?.updateHud?.(delta),
  };
}
