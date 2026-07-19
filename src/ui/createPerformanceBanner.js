import "./performanceBanner.css";
import { RENDER_MODE_LABELS, RENDER_MODES } from "../renderModes.js";

const SESSION_DISMISS_KEY = "lumen-performance-suggestion-dismissed";
const LOW_FPS_THRESHOLD = 25;
const LOW_FPS_DURATION_MS = 4000;
const WARMUP_MS = 10000;
const FRAME_EMA_ALPHA = 0.15;

function readSessionDismissed() {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionDismissed() {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    // sessionStorage may be unavailable
  }
}

function getSuggestedMode(currentMode) {
  if (currentMode === RENDER_MODES.insane) {
    return RENDER_MODES.ultra;
  }

  if (currentMode === RENDER_MODES.ultra) {
    return RENDER_MODES.highEnd;
  }

  if (currentMode === RENDER_MODES.highEnd) {
    return RENDER_MODES.default;
  }

  return null;
}

export function createPerformanceSuggestion({
  getRenderMode,
  onSwitch,
  shouldSuggest = () => true,
} = {}) {
  const root = document.createElement("div");
  root.className = "performance-banner";
  root.hidden = true;
  root.innerHTML = `
    <div class="performance-banner-glass" role="status" aria-live="polite">
      <p class="performance-banner-text"></p>
      <div class="performance-banner-actions">
        <button type="button" class="performance-banner-btn performance-banner-btn--primary" data-switch></button>
        <button type="button" class="performance-banner-btn" data-dismiss>
          Dismiss
        </button>
      </div>
    </div>
  `;

  const textElement = root.querySelector(".performance-banner-text");
  const switchButton = root.querySelector("[data-switch]");
  const dismissButton = root.querySelector("[data-dismiss]");

  let frameTimeEma = 0;
  let lowFpsAccumMs = 0;
  let dismissed = readSessionDismissed();
  let visible = false;
  let armed = false;
  let armedAt = 0;
  let warmupComplete = false;

  function hide() {
    visible = false;
    root.hidden = true;
    root.classList.remove("performance-banner--visible");
  }

  function updateBannerCopy() {
    const currentMode = getRenderMode?.();
    const suggestedMode = getSuggestedMode(currentMode);

    if (!suggestedMode) {
      return null;
    }

    const label = RENDER_MODE_LABELS[suggestedMode];
    textElement.textContent = `Performance is low. Switch to ${label} quality for a smoother experience?`;
    switchButton.textContent = `Switch to ${label}`;
    return suggestedMode;
  }

  function show() {
    if (visible || dismissed || !shouldSuggest()) {
      return;
    }

    const suggestedMode = updateBannerCopy();
    if (!suggestedMode) {
      return;
    }

    visible = true;
    root.hidden = false;
    requestAnimationFrame(() => {
      root.classList.add("performance-banner--visible");
    });
  }

  function dismiss() {
    dismissed = true;
    writeSessionDismissed();
    lowFpsAccumMs = 0;
    hide();
  }

  function beginWarmup() {
    armedAt = performance.now();
    warmupComplete = false;
    frameTimeEma = 0;
    lowFpsAccumMs = 0;
  }

  function arm() {
    armed = true;
    beginWarmup();
  }

  function handleFrame(frameMs) {
    if (!armed || dismissed || visible || !shouldSuggest()) {
      return;
    }

    if (!warmupComplete) {
      if (performance.now() - armedAt < WARMUP_MS) {
        return;
      }

      warmupComplete = true;
      frameTimeEma = 0;
      lowFpsAccumMs = 0;
    }

    if (frameMs <= 0) {
      return;
    }

    frameTimeEma =
      frameTimeEma === 0
        ? frameMs
        : frameTimeEma * (1 - FRAME_EMA_ALPHA) + frameMs * FRAME_EMA_ALPHA;

    const lowFpsMs = 1000 / LOW_FPS_THRESHOLD;

    if (frameTimeEma > lowFpsMs) {
      lowFpsAccumMs += frameMs;
    } else {
      lowFpsAccumMs = 0;
    }

    if (lowFpsAccumMs >= LOW_FPS_DURATION_MS) {
      show();
    }
  }

  switchButton.addEventListener("click", () => {
    const suggestedMode = getSuggestedMode(getRenderMode?.());
    if (suggestedMode) {
      onSwitch?.(suggestedMode);
    }
    dismiss();
  });

  dismissButton.addEventListener("click", dismiss);

  document.body.appendChild(root);

  return {
    root,
    handleFrame,
    dismiss,
    arm,
    reset() {
      frameTimeEma = 0;
      lowFpsAccumMs = 0;
      hide();

      if (armed) {
        beginWarmup();
      }
    },
    destroy() {
      root.remove();
    },
    getRenderModeForCheck: getRenderMode,
  };
}
