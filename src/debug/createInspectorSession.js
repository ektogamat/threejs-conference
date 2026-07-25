import { Inspector } from "three/addons/inspector/Inspector.js";
import { FEATURES } from "../world/features.js";
import { setupInspector } from "./setupInspector.js";
import {
  isDevelopmentModeEnabled,
  setDevelopmentModeEnabled,
} from "../platform/userPreferences.js";
import {
  attachRendererInspector,
  detachRendererInspector,
  disableRendererTimestamps,
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
  adaptiveDpr = null,
}) {
  let setupDone = false;
  let inspectorInstance = null;

  function getOrCreateInspector() {
    if (!FEATURES.inspector) {
      return null;
    }

    if (!inspectorInstance) {
      inspectorInstance = new Inspector();
    }

    return inspectorInstance;
  }

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
      const inspector = getOrCreateInspector();
      attachRendererInspector(renderer, inspector);
      ensureInspectorSetup();
      openInspector(inspector);
    } else {
      hideInspector(inspectorInstance);
      detachRendererInspector(renderer);
    }
  }

  function bootstrapInspector(settingsPanel) {
    disableRendererTimestamps(renderer);

    if (isDevelopmentModeEnabled()) {
      const inspector = getOrCreateInspector();
      attachRendererInspector(renderer, inspector);
      ensureInspectorSetup();
      openInspector(inspector);
      return;
    }

    hideInspector(inspectorInstance);
    detachRendererInspector(renderer);
  }

  function revealInspector() {
    if (!isDevelopmentModeEnabled()) {
      return;
    }

    const inspector = getOrCreateInspector();
    if (renderer.inspector !== inspector) {
      attachRendererInspector(renderer, inspector);
    }

    ensureInspectorSetup();
    openInspector(inspector);
  }

  return {
    ensureInspectorSetup,
    applyDevelopmentMode,
    bootstrapInspector,
    revealInspector,
  };
}
