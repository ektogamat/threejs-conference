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

export function createAdaptiveDprController({
  renderer,
  pipeline,
  baseMaxPixels = 3_500_000,
  minMaxPixels = 2_000_000,
  maxMaxPixels = 4_500_000,
  targetFps = 45,
  fastFps = 55,
  fpsBudgetConfirmWindows = 2,
  budgetCooldownWindows = 2,
  minDPR = 0.75,
} = {}) {
  let baseBudget = resolveMaxPixels(baseMaxPixels, minMaxPixels);
  let currentMaxPixels = baseBudget;
  let currentDPR = getStaticPixelRatio();
  let budgetCooldown = 0;
  let consecutiveSlowWindows = 0;
  let consecutiveFastWindows = 0;

  function getTargetDPR() {
    if (!performanceProfile.adaptiveDpr) {
      return getStaticPixelRatio();
    }

    const maxDPR = Math.min(
      performanceProfile.maxPixelRatio,
      window.devicePixelRatio,
    );
    return Math.max(minDPR, calculateAdaptiveDPR(currentMaxPixels, maxDPR));
  }

  function apply() {
    const nextDPR = getTargetDPR();

    if (Math.abs(nextDPR - currentDPR) < 0.01) {
      return false;
    }

    currentDPR = nextDPR;
    applyRendererPixelRatio(renderer, pipeline, nextDPR);
    return true;
  }

  function resetBudgetFromViewport() {
    baseBudget = resolveMaxPixels(baseMaxPixels, minMaxPixels);
    currentMaxPixels = baseBudget;
    consecutiveSlowWindows = 0;
    consecutiveFastWindows = 0;
    budgetCooldown = 0;
  }

  function onResize() {
    resetBudgetFromViewport();
    apply();
  }

  function onFpsSample(fps) {
    if (!performanceProfile.adaptiveDpr || fps <= 0) {
      return;
    }

    if (budgetCooldown > 0) {
      budgetCooldown -= 1;
      return;
    }

    if (fps < targetFps) {
      consecutiveSlowWindows += 1;
      consecutiveFastWindows = 0;

      if (consecutiveSlowWindows < fpsBudgetConfirmWindows) {
        return;
      }

      const nextMaxPixels = currentMaxPixels * 0.94;
      const clamped = clamp(nextMaxPixels, minMaxPixels, maxMaxPixels);

      if (Math.abs(clamped - currentMaxPixels) >= 1000) {
        currentMaxPixels = Math.round(clamped);
        consecutiveSlowWindows = 0;
        apply();
        budgetCooldown = budgetCooldownWindows;
      }

      return;
    }

    if (fps >= fastFps) {
      consecutiveFastWindows += 1;
      consecutiveSlowWindows = 0;

      if (consecutiveFastWindows < fpsBudgetConfirmWindows) {
        return;
      }

      const nextMaxPixels = Math.min(
        currentMaxPixels * 1.03,
        baseBudget,
        maxMaxPixels,
      );
      const clamped = clamp(nextMaxPixels, minMaxPixels, maxMaxPixels);

      if (Math.abs(clamped - currentMaxPixels) >= 1000) {
        currentMaxPixels = Math.round(clamped);
        consecutiveFastWindows = 0;
        apply();
        budgetCooldown = budgetCooldownWindows;
      }

      return;
    }

    consecutiveSlowWindows = 0;
    consecutiveFastWindows = 0;
  }

  function setEnabled(enabled) {
    performanceProfile.adaptiveDpr = Boolean(enabled);

    if (performanceProfile.adaptiveDpr) {
      onResize();
      return;
    }

    resetBudgetFromViewport();
    apply();
  }

  return {
    apply,
    onResize,
    onFpsSample,
    setEnabled,
    getDPR: () => currentDPR,
    getMaxPixels: () => currentMaxPixels,
    getBaseBudget: () => baseBudget,
  };
}
