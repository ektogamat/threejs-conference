import {
  clearLimitsDraft,
  getLimitsDraft,
  setLimitValue,
} from "./cameraPresetLimitsDraft.js";
import {
  formatPresetSnippet,
  getOrbitSpherical,
  normalizePresetView,
  radToDeg,
} from "./orbitLimits.js";

function roundVec3(vector) {
  return [
    Number(vector.x.toFixed(3)),
    Number(vector.y.toFixed(3)),
    Number(vector.z.toFixed(3)),
  ];
}

const AXIS_LIMIT_KEYS = {
  distance: ["minDistance", "maxDistance"],
  polar: ["minPolarAngle", "maxPolarAngle"],
  polarAngle: ["minPolarAngle", "maxPolarAngle"],
  azimuth: ["minAzimuthAngle", "maxAzimuthAngle"],
  azimuthAngle: ["minAzimuthAngle", "maxAzimuthAngle"],
};

const SPHERICAL_KEYS = {
  distance: "distance",
  polar: "polarAngle",
  polarAngle: "polarAngle",
  azimuth: "azimuthAngle",
  azimuthAngle: "azimuthAngle",
};

function resolvePresetId(slot, getActivePresetId) {
  if (slot !== undefined && slot !== null) {
    return String(slot);
  }

  return getActivePresetId?.() ?? null;
}

export function createCameraPresetsDev({
  camera,
  controls,
  presets,
  animateToPreset,
  getActivePresetId = () => null,
  onLimitsDraftChange,
} = {}) {
  function readCurrentView() {
    return {
      position: roundVec3(camera.position),
      target: roundVec3(controls.target),
    };
  }

  function findPreset(slot) {
    const id = String(slot);
    return presets.find((preset) => preset.id === id);
  }

  function current() {
    const view = readCurrentView();
    console.log("position:", view.position);
    console.log("target:", view.target);
    return view;
  }

  function capture(slot) {
    const view = readCurrentView();

    if (slot === undefined) {
      const nextId = String(
        presets.reduce((max, preset) => Math.max(max, Number(preset.id)), 0) +
          1,
      );
      const entry = { id: nextId, ...view };
      console.log("// New preset — paste into src/cameraPresets.js\n");
      console.log(
        formatPresetSnippet({
          id: entry.id,
          position: entry.position,
          target: entry.target,
        }),
      );
      return entry;
    }

    const id = String(slot);
    const draft = getLimitsDraft(id);
    const entry = normalizePresetView({
      id,
      ...view,
      limits: draft?.limits ? { ...draft.limits } : undefined,
    });
    console.log(`// Preset ${slot} — paste into src/cameraPresets.js\n`);
    console.log(
      formatPresetSnippet({
        id: entry.id,
        position: entry.position,
        target: entry.target,
        limits: entry.limits,
      }),
    );
    return entry;
  }

  function update(slot) {
    const preset = findPreset(slot);
    if (!preset) {
      console.warn(
        `Preset ${slot} not found. Run __app.camera.capture(${slot}) and add it to cameraPresets.js`,
      );
      return null;
    }

    const view = readCurrentView();
    preset.position.splice(0, 3, ...view.position);
    preset.target.splice(0, 3, ...view.target);

    const draft = getLimitsDraft(preset.id);
    console.log(`Preset ${slot} updated in memory (test in UI). To persist:`);
    console.log(
      formatPresetSnippet(
        normalizePresetView({
          id: preset.id,
          position: preset.position,
          target: preset.target,
          limits: draft?.limits,
        }),
      ),
    );
    return preset;
  }

  function go(slot, { animate = true } = {}) {
    const preset = findPreset(slot);
    if (!preset) {
      console.warn(`Preset ${slot} not found.`);
      return null;
    }

    if (animate && animateToPreset) {
      animateToPreset(preset);
    } else {
      camera.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
    }

    console.log(`Applied preset ${slot}.`);
    return preset;
  }

  function exportAll() {
    const body = presets
      .map((preset) => {
        const draft = getLimitsDraft(preset.id);
        return formatPresetSnippet(
          normalizePresetView({
            id: preset.id,
            position: draft?.position ?? preset.position,
            target: draft?.target ?? preset.target,
            limits: draft?.limits ?? preset.limits,
          }),
        );
      })
      .join("\n");
    const output = `export const CAMERA_PRESETS = [\n${body}\n];`;
    console.log("// Full list — replace src/cameraPresets.js\n");
    console.log(output);
    return output;
  }

  function limitsCurrent() {
    const spherical = getOrbitSpherical(camera, controls.target);
    console.log("distance:", spherical.distance);
    console.log(
      "polarAngle (rad):",
      spherical.polarAngle,
      `(${radToDeg(spherical.polarAngle)}°)`,
    );
    console.log(
      "azimuthAngle (rad):",
      spherical.azimuthAngle,
      `(${radToDeg(spherical.azimuthAngle)}°)`,
    );
    return spherical;
  }

  function setLimitBound(axis, bound, slot) {
    const presetId = resolvePresetId(slot, getActivePresetId);
    const keys = AXIS_LIMIT_KEYS[axis];
    const sphericalKey = SPHERICAL_KEYS[axis];

    if (!presetId) {
      console.warn("No active preset. Pass a preset id or select one in the UI.");
      return null;
    }

    if (!keys || !sphericalKey) {
      console.warn('Unknown axis. Use "distance", "polar", or "azimuth".');
      return null;
    }

    const spherical = getOrbitSpherical(camera, controls.target);
    const limitKey = bound === "min" ? keys[0] : keys[1];
    const value = spherical[sphericalKey];
    const draft = setLimitValue(presetId, limitKey, value);

    onLimitsDraftChange?.(presetId);
    console.log(`preset ${presetId}.${limitKey} = ${value}`);
    return draft;
  }

  function limitsSetMin(axis, slot) {
    return setLimitBound(axis, "min", slot);
  }

  function limitsSetMax(axis, slot) {
    return setLimitBound(axis, "max", slot);
  }

  function limitsCopy(slot) {
    const presetId = resolvePresetId(slot, getActivePresetId);
    const view = getLimitsDraft(presetId);

    if (!view) {
      console.warn(`Preset ${presetId ?? slot} not found.`);
      return null;
    }

    const snippet = formatPresetSnippet(
      normalizePresetView({
        id: view.id ?? presetId,
        position: view.position,
        target: view.target,
        limits: view.limits,
      }),
    );
    console.log(`// Preset ${presetId} — paste into src/cameraPresets.js\n`);
    console.log(snippet);
    return snippet;
  }

  function limitsClear(slot) {
    const presetId = resolvePresetId(slot, getActivePresetId);
    if (!presetId) {
      console.warn("No active preset. Pass a preset id or select one in the UI.");
      return null;
    }

    const draft = clearLimitsDraft(presetId);
    onLimitsDraftChange?.(presetId);
    console.log(`Cleared draft limits for preset ${presetId}.`);
    return draft;
  }

  function limitsExport() {
    return exportAll();
  }

  function limitsHelp() {
    console.log(`
__app.camera.limits.current()
__app.camera.limits.setMin("distance", 3)
__app.camera.limits.setMax("polar", 3)
__app.camera.limits.copy(3)
__app.camera.limits.clear(3)
__app.camera.limits.export()
__app.camera.limits.help()

Omit the preset id to use the active camera view from the UI.
`);
  }

  function help() {
    console.log(`Camera preset dev tools (position with OrbitControls first):

  __app.camera.current()        → log current position + target
  __app.camera.capture()        → log snippet for a NEW preset
  __app.camera.capture(3)       → log snippet for preset #3
  __app.camera.update(3)        → save current view into preset #3 (runtime + log)
  __app.camera.go(3)            → animate to preset #3
  __app.camera.go(3, { animate: false }) → jump instantly
  __app.camera.export()         → log entire CAMERA_PRESETS array
  __app.camera.limits.help()    → orbit limit commands

Workflow:
  1. __app.camera.go(3)
  2. Orbit to each extreme and register limits with setMin / setMax
  3. __app.camera.limits.copy(3)
  4. Paste into src/cameraPresets.js`);
  }

  return {
    help,
    current,
    capture,
    update,
    go,
    export: exportAll,
    limits: {
      current: limitsCurrent,
      setMin: limitsSetMin,
      setMax: limitsSetMax,
      copy: limitsCopy,
      clear: limitsClear,
      export: limitsExport,
      help: limitsHelp,
    },
  };
}
