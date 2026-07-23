const DEVELOPMENT_MODE_KEY = "threejs-punk-development-mode";
const LOOK_PRESET_KEY = "threejs-punk-look-preset";

let developmentModeEnabled = false;

try {
  // Develop mode used to persist in localStorage; keep it session-only.
  localStorage.removeItem(DEVELOPMENT_MODE_KEY);
} catch {
  // localStorage may be unavailable
}

export function isDevEnvironment() {
  return import.meta.env.DEV;
}

export function isDevelopmentModeEnabled() {
  return developmentModeEnabled;
}

export function setDevelopmentModeEnabled(enabled) {
  developmentModeEnabled = Boolean(enabled);
}

export function getStoredLookPreset() {
  try {
    return localStorage.getItem(LOOK_PRESET_KEY);
  } catch {
    return null;
  }
}

export function setStoredLookPreset(presetId) {
  try {
    if (presetId) {
      localStorage.setItem(LOOK_PRESET_KEY, presetId);
    } else {
      localStorage.removeItem(LOOK_PRESET_KEY);
    }
  } catch {
    // localStorage may be unavailable
  }
}

export function clearAllStoredPreferences() {
  developmentModeEnabled = false;
  try {
    localStorage.removeItem(DEVELOPMENT_MODE_KEY);
    localStorage.removeItem(LOOK_PRESET_KEY);
  } catch {
    // localStorage may be unavailable
  }
}
