import { performanceProfile, getStaticPixelRatio } from "./performanceProfile.js";
import { applyRendererPixelRatio } from "../bootstrap/createRenderer.js";

/**
 * Adaptive DPR — starts at `performanceProfile.maxPixelRatio` (capped by the
 * device's own pixel ratio). If sustained FPS falls below `targetFps`, the
 * pixel ratio drops to `droppedDPR` (1) once and stays there for the rest of
 * the session; it never tries to climb back up automatically (only a page
 * reload resets it).
 */
export function createAdaptiveDprController({
  renderer,
  pipeline,
  targetFps = 50,
  fpsConfirmWindows = 2,
  droppedDPR = 1,
  onForcedLow = null,
} = {}) {
  let currentDPR = getStaticPixelRatio();
  let consecutiveSlowWindows = 0;
  let forcedLow = false;

  function getTargetDPR() {
    if (!performanceProfile.adaptiveDpr) {
      return getStaticPixelRatio();
    }

    if (forcedLow) {
      return droppedDPR;
    }

    return Math.min(performanceProfile.maxPixelRatio, window.devicePixelRatio);
  }

  function apply({ force = false } = {}) {
    const nextDPR = getTargetDPR();
    const changed = Math.abs(nextDPR - currentDPR) >= 0.01;

    if (!changed && !force) {
      return false;
    }

    currentDPR = nextDPR;
    applyRendererPixelRatio(renderer, pipeline, nextDPR);
    return true;
  }

  function onResize() {
    // Always resync the renderer size on resize, even when the computed DPR
    // doesn't change — otherwise the backbuffer keeps its old dimensions and
    // rendering looks broken after resizing the window.
    apply({ force: true });
  }

  function onFpsSample(fps) {
    if (!performanceProfile.adaptiveDpr || fps <= 0 || forcedLow) {
      return;
    }

    if (fps < targetFps) {
      consecutiveSlowWindows += 1;

      if (consecutiveSlowWindows >= fpsConfirmWindows) {
        forcedLow = true;
        apply({ force: true });
        onForcedLow?.();
      }

      return;
    }

    consecutiveSlowWindows = 0;
  }

  function setEnabled(enabled) {
    performanceProfile.adaptiveDpr = Boolean(enabled);
    apply({ force: true });
  }

  return {
    apply,
    onResize,
    onFpsSample,
    setEnabled,
    getDPR: () => currentDPR,
    isForcedLow: () => forcedLow,
  };
}
