import { CAMERA_PRESETS } from "./cameraPresets.js";
import { normalizeLimits } from "./orbitLimits.js";

const drafts = new Map();

function cloneView(view) {
  if (!view) {
    return null;
  }

  return {
    id: view.id,
    position: [...view.position],
    target: [...view.target],
    limits: view.limits ? { ...view.limits } : undefined,
  };
}

function getSourcePreset(presetId) {
  return CAMERA_PRESETS.find((preset) => preset.id === String(presetId));
}

export function getLimitsDraft(presetId) {
  if (!presetId) {
    return null;
  }

  const id = String(presetId);

  if (drafts.has(id)) {
    return cloneView(drafts.get(id));
  }

  return cloneView(getSourcePreset(id));
}

export function setLimitsDraft(presetId, view) {
  if (!presetId || !view) {
    return null;
  }

  const entry = cloneView(view);
  drafts.set(String(presetId), entry);
  return entry;
}

export function setLimitValue(presetId, key, value) {
  const draft = getLimitsDraft(presetId);
  if (!draft) {
    return null;
  }

  if (!draft.limits) {
    draft.limits = {};
  }

  draft.limits[key] = value;
  draft.limits = normalizeLimits(draft.limits);
  drafts.set(String(presetId), draft);
  return draft;
}

export function clearLimitsDraft(presetId) {
  if (!presetId) {
    return null;
  }

  const source = getSourcePreset(presetId);
  if (!source) {
    drafts.delete(String(presetId));
    return null;
  }

  const entry = {
    id: source.id,
    position: [...source.position],
    target: [...source.target],
  };

  drafts.set(String(presetId), entry);
  return entry;
}

export function getResolvedPresetView(preset) {
  if (!preset?.id) {
    return preset;
  }

  return getLimitsDraft(preset.id) ?? cloneView(preset);
}
