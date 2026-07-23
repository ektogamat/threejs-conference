const DEVELOPMENT_MODE_KEY = "threejs-punk-development-mode";

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

export function clearAllStoredPreferences() {
  try {
    localStorage.removeItem(DEVELOPMENT_MODE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}
