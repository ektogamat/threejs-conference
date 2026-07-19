export const STORAGE_KEY = "lumen-studio-project";
export const VERSION = 1;

const MIN_SUN_HOUR = 5;
const MAX_SUN_HOUR = 21;
const MIN_SUN_AZIMUTH = -180;
const MAX_SUN_AZIMUTH = 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSun(sun) {
  if (!sun || typeof sun !== "object") {
    return null;
  }

  const hour = Number(sun.hour);
  const azimuth = Number(sun.azimuth);

  if (!Number.isFinite(hour) || !Number.isFinite(azimuth)) {
    return null;
  }

  return {
    hour: clamp(hour, MIN_SUN_HOUR, MAX_SUN_HOUR),
    azimuth: clamp(azimuth, MIN_SUN_AZIMUTH, MAX_SUN_AZIMUTH),
  };
}

function normalizeMeshColors(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const meshColors = {};
  for (const [targetKey, index] of Object.entries(raw)) {
    const value = Number(index);
    if (!Number.isFinite(value)) {
      continue;
    }
    meshColors[targetKey] = value;
  }

  return Object.keys(meshColors).length > 0 ? meshColors : null;
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== VERSION) {
    return null;
  }

  const sun = normalizeSun(raw.sun);
  const meshColors = normalizeMeshColors(raw.meshColors);

  if (!sun && !meshColors) {
    return null;
  }

  return {
    version: VERSION,
    sun: sun ?? undefined,
    meshColors: meshColors ?? undefined,
  };
}

export function buildSnapshot({ sunState, meshColors } = {}) {
  const snapshot = { version: VERSION };

  if (sunState) {
    const sun = normalizeSun(sunState);
    if (sun) {
      snapshot.sun = sun;
    }
  }

  const normalizedMeshColors = normalizeMeshColors(meshColors);
  if (normalizedMeshColors) {
    snapshot.meshColors = normalizedMeshColors;
  }

  return snapshot;
}

export function loadProjectState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProjectState(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearProjectState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

export function applyProjectState(snapshot, deps) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) {
    return false;
  }

  const { sunState, syncLighting } = deps;

  if (normalized.sun && sunState) {
    sunState.hour = normalized.sun.hour;
    sunState.azimuth = normalized.sun.azimuth;
    syncLighting?.({
      hour: normalized.sun.hour,
      azimuth: normalized.sun.azimuth,
    });
  }

  return {
    meshColors: normalized.meshColors ?? null,
  };
}
