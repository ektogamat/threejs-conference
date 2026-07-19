import { DEFAULT_RENDER_MODE, isRenderMode, RENDER_MODES } from "./renderModes.js";

const DEVELOPMENT_MODE_KEY = "lumen-development-mode";
const RENDER_MODE_KEY = "lumen-render-mode";
const RENDER_MODE_USER_SET_KEY = "lumen-render-mode-user-set";

export function isDevEnvironment() {
  return import.meta.env.DEV;
}

export function isDevelopmentModeEnabled() {
  try {
    return localStorage.getItem(DEVELOPMENT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevelopmentModeEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(DEVELOPMENT_MODE_KEY, "1");
    } else {
      localStorage.removeItem(DEVELOPMENT_MODE_KEY);
    }
  } catch {
    // localStorage may be unavailable
  }
}

export function getRenderMode() {
  try {
    const value = localStorage.getItem(RENDER_MODE_KEY);
    return isRenderMode(value) ? value : DEFAULT_RENDER_MODE;
  } catch {
    return DEFAULT_RENDER_MODE;
  }
}

export function getInitialRenderMode() {
  const mode = getRenderMode();

  if (mode === RENDER_MODES.highEnd && !hasUserChosenRenderMode()) {
    return DEFAULT_RENDER_MODE;
  }

  return mode;
}

export function setRenderMode(mode) {
  if (!isRenderMode(mode)) {
    return;
  }

  try {
    localStorage.setItem(RENDER_MODE_KEY, mode);
  } catch {
    // localStorage may be unavailable
  }
}

export function hasUserChosenRenderMode() {
  try {
    return localStorage.getItem(RENDER_MODE_USER_SET_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRenderModeAsUserChosen() {
  try {
    localStorage.setItem(RENDER_MODE_USER_SET_KEY, "1");
  } catch {
    // localStorage may be unavailable
  }
}

export function clearRenderModeUserChoice() {
  try {
    localStorage.removeItem(RENDER_MODE_USER_SET_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

export function clearAllStoredPreferences() {
  try {
    localStorage.removeItem(DEVELOPMENT_MODE_KEY);
    localStorage.removeItem(RENDER_MODE_KEY);
    localStorage.removeItem(RENDER_MODE_USER_SET_KEY);
  } catch {
    // localStorage may be unavailable
  }
}
