/**
 * Adaptive DPR (Device Pixel Ratio) calculation
 * Ensures performance on high-resolution displays (4K) by limiting total rendered pixels
 */

const REF_1080P = 1920 * 1080;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolution-based pixel budget. Smaller viewports keep the full budget; larger
 * screens scale down proportionally with a safety floor.
 *
 * @param {number} baseMaxPixels
 * @param {number} minMaxPixels
 * @returns {number}
 */
export function resolveMaxPixels(
  baseMaxPixels = 3500000,
  minMaxPixels = 2000000,
) {
  const cssPixels = window.innerWidth * window.innerHeight;

  if (cssPixels <= REF_1080P) {
    return baseMaxPixels;
  }

  const scale = REF_1080P / cssPixels;
  return Math.round(Math.max(minMaxPixels, baseMaxPixels * scale * 1.0));
}

/**
 * @param {number} maxPixels
 * @param {number} maxDPR
 * @returns {number}
 */
export function calculateAdaptiveDPR(maxPixels = 3500000, maxDPR = 1.0) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const idealDPR = maxPixels / (width * height);
  return Math.max(0.5, Math.min(maxDPR, idealDPR));
}

/**
 * @param {number} baseDPR
 * @param {number} reductionFactor
 * @returns {number}
 */
export function calculateInteractionDPR(baseDPR, reductionFactor = 0.8) {
  return Math.max(0.5, baseDPR * reductionFactor);
}

/**
 * @param {boolean} isInteracting
 * @param {number} maxPixels
 * @param {number} maxDPR
 * @returns {number}
 */
export function getOptimalDPR(
  isInteracting = false,
  maxPixels = 3500000,
  maxDPR = 1.0,
) {
  const adaptiveDPR = calculateAdaptiveDPR(maxPixels, maxDPR);

  if (isInteracting) {
    return calculateInteractionDPR(adaptiveDPR);
  }

  return adaptiveDPR;
}

function resolveIdleMaxDPR(idleMaxDPR, idleMinMaxDPR) {
  const pixels = window.innerWidth * window.innerHeight;

  if (pixels <= REF_1080P) {
    return idleMaxDPR;
  }

  if (pixels <= 2560 * 1440) {
    return Math.min(idleMaxDPR, (idleMaxDPR + idleMinMaxDPR) * 0.5);
  }

  return idleMinMaxDPR;
}

/**
 * @param {import("three/webgpu").WebGPURenderer} renderer
 * @param {{
 *   render: () => void,
 *   controls?: import("three/addons/controls/OrbitControls.js").OrbitControls,
 *   settleFrames?: number,
 *   maxPixels?: number,
 *   minMaxPixels?: number,
 *   maxMaxPixels?: number,
 *   targetFps?: number,
 *   fpsAdjustInterval?: number,
 *   fpsBudgetConfirmWindows?: number,
 *   budgetCooldownFrames?: number,
 *   budgetSettleMinFrames?: number,
 *   minDPR?: number,
 *   minInteractionDPR?: number,
 *   interactionReductionFactor?: number,
 *   interactionDPRTarget?: number | null,
 *   idleMaxDPR?: number,
 *   idleMinMaxDPR?: number,
 *   interactionEndDelayMs?: number,
 *   continuous?: boolean,
 *   shouldUpdateControls?: () => boolean,
 *   onLoopStateChange?: (
 *     state: "interacting" | "settling" | "sleeping",
 *     info: { activeSources: Set<string> },
 *   ) => void,
 *   onFrame?: (frameMs: number) => void,
 * }} options
 */
export function createAdaptiveDprLoop(renderer, options) {
  const {
    render,
    onLoopStateChange = null,
    onFrame = null,
    controls = null,
    settleFrames = 16,
    maxPixels: baseMaxPixels = 3500000,
    minMaxPixels = 2000000,
    maxMaxPixels = 4500000,
    targetFps = 45,
    fpsAdjustInterval = 24,
    fpsBudgetConfirmWindows = 2,
    budgetCooldownFrames: budgetCooldownDuration = 105,
    budgetSettleMinFrames = 24,
    minDPR = 0.8,
    minInteractionDPR = 0.75,
    interactionReductionFactor = 0.8,
    interactionDPRTarget = 0.7,
    idleMaxDPR: initialIdleMaxDPR = 1.0,
    idleMinMaxDPR: initialIdleMinMaxDPR = 0.9,
    interactionEndDelayMs = 150,
    continuous = false,
    shouldUpdateControls = () => true,
  } = options;

  let idleMaxDPR = initialIdleMaxDPR;
  let idleMinMaxDPR = initialIdleMinMaxDPR;

  /** @type {"interacting" | "settling" | "sleeping"} */
  let state = "sleeping";
  let settleCounter = 0;
  let currentDPR = 1;
  let currentMaxPixels = resolveMaxPixels(baseMaxPixels, minMaxPixels);
  let loopActive = false;
  let interactionEndTimer = null;
  let lastFrameTime = 0;
  let frameTimeEma = 0;
  let framesSinceFpsAdjust = 0;
  let consecutiveSlowWindows = 0;
  let consecutiveFastWindows = 0;
  let budgetCooldownFrames = 0;
  let paused = false;

  /** @type {Set<string>} */
  const interactionSources = new Set();

  function notifyStateChange() {
    onLoopStateChange?.(state, {
      activeSources: new Set(interactionSources),
    });
  }

  function setState(nextState) {
    if (state === nextState) {
      return;
    }

    state = nextState;
    notifyStateChange();
  }

  function resetMaxPixelsBudget() {
    currentMaxPixels = resolveMaxPixels(baseMaxPixels, minMaxPixels);
    frameTimeEma = 0;
    framesSinceFpsAdjust = 0;
    consecutiveSlowWindows = 0;
    consecutiveFastWindows = 0;
    budgetCooldownFrames = 0;
  }

  function getIdleDPR() {
    const maxDPR = resolveIdleMaxDPR(idleMaxDPR, idleMinMaxDPR);
    return Math.max(minDPR, calculateAdaptiveDPR(currentMaxPixels, maxDPR));
  }

  function getInteractionDPR() {
    const base = getIdleDPR();
    const reduced = calculateInteractionDPR(base, interactionReductionFactor);
    const cap = interactionDPRTarget === null ? base : interactionDPRTarget;
    return Math.max(minInteractionDPR, Math.min(cap, reduced));
  }

  function applyDPR(dpr, isInteraction = false) {
    const floor = isInteraction ? minInteractionDPR : minDPR;
    const nextDPR = Math.max(floor, dpr);

    if (Math.abs(nextDPR - currentDPR) < 0.01) {
      return false;
    }

    currentDPR = nextDPR;
    renderer.setPixelRatio(nextDPR);
    return true;
  }

  function syncDPRForState() {
    // Only camera motion benefits from interaction DPR drops. Lighting /
    // inspector interactions leave depth/normals stable, so Temporal GI keeps
    // history "valid" — dropping DPR then restoring on settle hard-restarts
    // accumulation and leaves undenoised blotches when the loop sleeps.
    // Include preset tweens ("camera-preset") — they were left at idle DPR
    // and caused large FPS drops during view switches.
    const reduceDpr =
      interactionSources.has("camera") ||
      interactionSources.has("camera-preset");

    applyDPR(reduceDpr ? getInteractionDPR() : getIdleDPR(), reduceDpr);
  }

  function adjustMaxPixelsFromFps(frameMs) {
    if (frameMs <= 0 || budgetCooldownFrames > 0) {
      return;
    }

    const alpha = 0.15;
    frameTimeEma =
      frameTimeEma === 0
        ? frameMs
        : frameTimeEma * (1 - alpha) + frameMs * alpha;

    framesSinceFpsAdjust += 1;

    if (framesSinceFpsAdjust < fpsAdjustInterval) {
      return;
    }

    framesSinceFpsAdjust = 0;

    const targetMs = 1000 / targetFps;
    const slowThreshold = targetMs * 1.15;
    const fastThreshold = targetMs * 0.85;
    let nextMaxPixels = currentMaxPixels;
    let direction = null;

    if (frameTimeEma > slowThreshold) {
      consecutiveSlowWindows += 1;
      consecutiveFastWindows = 0;

      if (consecutiveSlowWindows < fpsBudgetConfirmWindows) {
        return;
      }

      nextMaxPixels = currentMaxPixels * 0.94;
      direction = "slow";
    } else if (frameTimeEma < fastThreshold) {
      consecutiveFastWindows += 1;
      consecutiveSlowWindows = 0;

      if (consecutiveFastWindows < fpsBudgetConfirmWindows) {
        return;
      }

      nextMaxPixels = currentMaxPixels * 1.03;
      direction = "fast";
    } else {
      consecutiveSlowWindows = 0;
      consecutiveFastWindows = 0;
      return;
    }

    const clamped = clamp(nextMaxPixels, minMaxPixels, maxMaxPixels);

    if (Math.abs(clamped - currentMaxPixels) < 1000) {
      return;
    }

    currentMaxPixels = Math.round(clamped);
    consecutiveSlowWindows = 0;
    consecutiveFastWindows = 0;

    if (applyDPR(getIdleDPR())) {
      budgetCooldownFrames = budgetCooldownDuration;
      settleCounter = Math.max(
        settleCounter,
        Math.min(budgetSettleMinFrames, settleFrames),
      );
    } else if (direction !== null) {
      // Pixel budget moved but DPR stayed the same — still pause re-evaluation.
      budgetCooldownFrames = budgetCooldownDuration;
    }
  }

  function ensureLoopRunning() {
    if (paused || loopActive) {
      return;
    }

    loopActive = true;
    lastFrameTime = 0;
    renderer.setAnimationLoop(tick);
  }

  function stopLoop() {
    if (!loopActive) {
      return;
    }

    // TEMP continuous mode: keep rAF running unless explicitly paused.
    if (continuous && !paused) {
      return;
    }

    loopActive = false;
    setState("sleeping");
    lastFrameTime = 0;
    renderer.setAnimationLoop(null);
  }

  function beginSettlingWith(frames) {
    if (paused || interactionSources.size > 0) {
      return;
    }

    setState("settling");
    // Avoid slashing the pixel budget from the DPR spike right after interaction ends.
    frameTimeEma = 0;
    framesSinceFpsAdjust = 0;
    consecutiveSlowWindows = 0;
    consecutiveFastWindows = 0;
    syncDPRForState();
    settleCounter = continuous ? Number.POSITIVE_INFINITY : frames;
    ensureLoopRunning();
  }

  function beginSettling() {
    beginSettlingWith(settleFrames);
  }

  function tick() {
    const now = performance.now();
    const frameMs = lastFrameTime > 0 ? now - lastFrameTime : 0;
    lastFrameTime = now;

    onFrame?.(frameMs);

    if (
      (state === "interacting" || interactionSources.size > 0) &&
      shouldUpdateControls()
    ) {
      controls?.update();
    }
    render();

    if (state !== "settling") {
      return;
    }

    if (budgetCooldownFrames > 0) {
      budgetCooldownFrames -= 1;
    }

    if (interactionSources.size === 0) {
      adjustMaxPixelsFromFps(frameMs);
    }

    settleCounter -= 1;

    if (
      settleCounter <= 0 &&
      interactionSources.size === 0 &&
      !continuous
    ) {
      stopLoop();
    }
  }

  function startInteraction(source = "unknown") {
    interactionSources.add(source);
    setState("interacting");
    settleCounter = 0;
    syncDPRForState();
    ensureLoopRunning();
  }

  function endInteraction(source = "unknown") {
    interactionSources.delete(source);

    if (interactionSources.size === 0) {
      beginSettling();
    }
  }

  function scheduleInteractionEnd(source = "unknown") {
    clearTimeout(interactionEndTimer);
    interactionEndTimer = setTimeout(() => {
      endInteraction(source);
    }, interactionEndDelayMs);
  }

  function invalidate(source, { frames } = {}) {
    if (paused) {
      return;
    }

    if (state === "sleeping") {
      beginSettlingWith(frames ?? settleFrames);
      return;
    }

    if (
      frames !== undefined &&
      state === "settling" &&
      frames > settleCounter
    ) {
      settleCounter = frames;
    }

    ensureLoopRunning();
  }

  function pause() {
    if (paused) {
      return;
    }

    paused = true;
    clearTimeout(interactionEndTimer);
    interactionEndTimer = null;
    settleCounter = 0;
    stopLoop();
  }

  function resume() {
    if (!paused) {
      return;
    }

    paused = false;

    if (interactionSources.size > 0) {
      setState("interacting");
      syncDPRForState();
      ensureLoopRunning();
      return;
    }

    beginSettling();
  }

  function handleResize() {
    resetMaxPixelsBudget();
    syncDPRForState();

    if (state === "sleeping") {
      beginSettling();
      return;
    }

    if (state === "settling") {
      settleCounter = settleFrames;
    }

    ensureLoopRunning();
  }

  function bootstrap() {
    resetMaxPixelsBudget();
    syncDPRForState();
    beginSettling();
  }

  /**
   * @param {{
   *   frames?: number,
   *   forceMaxPixels?: boolean,
   * }} [options]
   */
  function renderSettledFrame({
    frames = settleFrames,
    forceMaxPixels = true,
  } = {}) {
    if (forceMaxPixels) {
      currentMaxPixels = maxMaxPixels;
    } else {
      resetMaxPixelsBudget();
    }

    applyDPR(getIdleDPR());
    interactionSources.clear();

    if (interactionEndTimer) {
      window.clearTimeout(interactionEndTimer);
      interactionEndTimer = null;
    }

    settleCounter = Math.max(1, frames);
    setState("settling");
    ensureLoopRunning();

    return new Promise((resolve) => {
      if (continuous) {
        let remaining = Math.max(1, frames);
        function pollContinuous() {
          remaining -= 1;
          if (remaining <= 0) {
            settleCounter = Number.POSITIVE_INFINITY;
            resolve();
            return;
          }
          requestAnimationFrame(pollContinuous);
        }
        requestAnimationFrame(pollContinuous);
        return;
      }

      function poll() {
        if (state === "sleeping" && !loopActive) {
          resolve();
          return;
        }

        requestAnimationFrame(poll);
      }

      poll();
    });
  }

  function setIdleMaxDPR(max, minMax = idleMinMaxDPR) {
    idleMaxDPR = max;
    idleMinMaxDPR = minMax;
    syncDPRForState();
  }

  return {
    startInteraction,
    endInteraction,
    scheduleInteractionEnd,
    invalidate,
    pause,
    resume,
    handleResize,
    bootstrap,
    renderSettledFrame,
    setIdleMaxDPR,
    getState: () => state,
    getDPR: () => currentDPR,
    getMaxPixels: () => currentMaxPixels,
    getFrameTimeEma: () => frameTimeEma,
    isLoopActive: () => loopActive,
    isPaused: () => paused,
  };
}
