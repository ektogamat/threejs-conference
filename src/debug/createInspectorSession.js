import { FEATURES } from "../world/features.js";
import { setupInspector } from "./setupInspector.js";
import {
  isDevelopmentModeEnabled,
  setDevelopmentModeEnabled,
} from "../platform/userPreferences.js";
import {
  attachRendererInspector,
  openInspector,
  hideInspector,
} from "./inspectorControls.js";

export function createInspectorSession({
  renderer,
  pipeline,
  sceneResult,
  world,
  cameraDirector,
  cameraParams,
  applyCameraFovForLayout,
  syncWalkEyeHeight,
  syncLighting,
  syncEnvironmentIntensity,
  envMapBaseIntensity,
  requestShadowMapUpdate,
  inspectorInstance,
  adaptiveDpr = null,
}) {
  let setupDone = false;

  function ensureInspectorSetup() {
    if (!FEATURES.inspector || setupDone) {
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
        scene: sceneResult.scene,
        onParamInteractionStart: () => {},
        onParamInteraction: () => {},
        onParamInteractionEnd: () => {},
        onLightingParamChanged: () =>
          requestShadowMapUpdate?.("inspector-lighting"),
      },
      world.ground,
      {
        params: cameraParams,
        walkSettings: cameraDirector.walkControls?.settings,
        syncFov: applyCameraFovForLayout,
        syncWalkEyeHeight,
        cameraModeState: cameraDirector.cameraModeState,
        setCameraMode: cameraDirector.setCameraMode,
      },
      world.rain,
      world.smoke,
      world.planes,
      world.sky,
      world.billboards?.userData?.billboardMaterials ?? null,
      adaptiveDpr,
    );
    setupDone = true;
  }

  function applyDevelopmentMode(enabled, settingsPanel) {
    if (!FEATURES.inspector) {
      setDevelopmentModeEnabled(false);
      settingsPanel?.syncDevelopmentMode(false);
      return;
    }
    setDevelopmentModeEnabled(enabled);
    settingsPanel?.syncDevelopmentMode(enabled);

    if (enabled) {
      attachRendererInspector(renderer, inspectorInstance);
      ensureInspectorSetup();
      openInspector(inspectorInstance);
    } else {
      hideInspector(inspectorInstance);
    }
  }

  function bootstrapInspector(settingsPanel) {
    hideInspector(inspectorInstance);

    if (isDevelopmentModeEnabled()) {
      ensureInspectorSetup();
    }
  }

  function revealInspector() {
    if (!isDevelopmentModeEnabled()) {
      return;
    }

    if (renderer.inspector !== inspectorInstance) {
      return;
    }

    ensureInspectorSetup();
    openInspector(inspectorInstance);
  }

  return {
    ensureInspectorSetup,
    applyDevelopmentMode,
    bootstrapInspector,
    revealInspector,
  };
}
