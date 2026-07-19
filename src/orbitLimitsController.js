import { getResolvedPresetView } from "./cameraPresetLimitsDraft.js";
import {
  DEFAULT_ORBIT_LIMITS,
  applyOrbitLimits,
  clearOrbitLimits,
} from "./orbitLimits.js";

export function createOrbitLimitsController({
  controls,
  defaults = DEFAULT_ORBIT_LIMITS,
  isTuningEnabled = () => false,
} = {}) {
  let activePresetId = null;

  function applyLimitsObject(limits, { syncPosition = true } = {}) {
    if (!controls) {
      return;
    }

    if (!limits || Object.keys(limits).length === 0) {
      clearOrbitLimits(controls, defaults);
      if (syncPosition) {
        controls.update();
      }
      return;
    }

    applyOrbitLimits(controls, limits, defaults);
    if (syncPosition) {
      controls.update();
    }
  }

  function applyForPreset(preset, { syncPosition = true } = {}) {
    if (!controls || !preset) {
      return;
    }

    activePresetId = preset.id;

    if (isTuningEnabled()) {
      clearOrbitLimits(controls, defaults);
      if (syncPosition) {
        controls.update();
      }
      return;
    }

    const view = getResolvedPresetView(preset);
    applyLimitsObject(view?.limits, { syncPosition });
  }

  function clear({ syncPosition = true } = {}) {
    if (!controls) {
      return;
    }

    clearOrbitLimits(controls, defaults);
    if (syncPosition) {
      controls.update();
    }
  }

  function reapplyActive(findPreset) {
    if (!activePresetId || !findPreset) {
      return;
    }

    const preset = findPreset(activePresetId);
    if (preset) {
      applyForPreset(preset);
    }
  }

  return {
    applyForPreset,
    clear,
    reapplyActive,
    getActivePresetId: () => activePresetId,
  };
}
