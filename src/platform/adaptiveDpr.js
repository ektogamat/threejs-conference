import { performanceProfile, getStaticPixelRatio } from "./performanceProfile.js";
import { applyRendererPixelRatio } from "../bootstrap/createRenderer.js";

const REF_1080P = 1920 * 1080;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolution-based pixel budget. Smaller viewports keep the full budget; larger
 * screens scale down proportionally with a safety floor.
 */
export function resolveMaxPixels(
  baseMaxPixels = 3_500_000,
  minMaxPixels = 2_000_000,
) {
  const cssPixels = window.innerWidth * window.innerHeight;

  if (cssPixels <= REF_1080P) {
    return baseMaxPixels;
  }

  const scale = REF_1080P / cssPixels;
  return Math.round(Math.max(minMaxPixels, baseMaxPixels * scale));
}

export function calculateAdaptiveDPR(maxPixels = 3_500_000, maxDPR = 1.0) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const idealDPR = maxPixels / (width * height);
  return Math.max(0.5, Math.min(maxDPR, idealDPR));
}

/**
 * Adaptive DPR — starts from a resolution-based budget. If sustained FPS
 * falls below `targetFps`, the pixel ratio drops to `droppedDPR` (1) once
 * and stays there for the rest of the session; it never tries to climb back
 * up automatically (only a page reload resets it).
 */
export function createAdaptiveDprController({
  renderer,
  pipeline,
  baseMaxPixels = 3_500_000,
  minMaxPixels = 2_000_000,
  targetFps = 50,
  fpsConfirmWindows = 2,
  minDPR = 0.75,
  droppedDPR = 1,
} = {}) {
  let baseBudget = resolveMaxPixels(baseMaxPixels, minMaxPixels);
  let currentMaxPixels = baseBudget;
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

    const maxDPR = Math.min(
      performanceProfile.maxPixelRatio,
      window.devicePixelRatio,
    );
    return Math.max(minDPR, calculateAdaptiveDPR(currentMaxPixels, maxDPR));
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

  function resetBudgetFromViewport() {
    baseBudget = resolveMaxPixels(baseMaxPixels, minMaxPixels);
    currentMaxPixels = clamp(baseBudget, minMaxPixels, baseMaxPixels);
    consecutiveSlowWindows = 0;
  }

  function onResize() {
    // Always resync the renderer size on resize, even when the computed DPR
    // doesn't change — otherwise the backbuffer keeps its old dimensions and
    // rendering looks broken after resizing the window.
    if (!forcedLow) {
      resetBudgetFromViewport();
    }
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
    getMaxPixels: () => currentMaxPixels,
    getBaseBudget: () => baseBudget,
    isForcedLow: () => forcedLow,
  };
}
