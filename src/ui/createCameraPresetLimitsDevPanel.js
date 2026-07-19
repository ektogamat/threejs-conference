import "./cameraPresetLimitsDevPanel.css";
import {
  clearLimitsDraft,
  getLimitsDraft,
  setLimitValue,
} from "../cameraPresetLimitsDraft.js";
import {
  formatPresetSnippet,
  getOrbitSpherical,
  normalizePresetView,
  radToDeg,
} from "../orbitLimits.js";

const TUNING_STORAGE_KEY = "loft-camera-limits-tuning";

const AXIS_CONFIG = [
  {
    id: "distance",
    label: "Distance",
    minKey: "minDistance",
    maxKey: "maxDistance",
    format: (value) => value.toFixed(2),
  },
  {
    id: "polarAngle",
    label: "Polar angle",
    minKey: "minPolarAngle",
    maxKey: "maxPolarAngle",
    format: (value) => `${radToDeg(value)}°`,
  },
  {
    id: "azimuthAngle",
    label: "Azimuth",
    minKey: "minAzimuthAngle",
    maxKey: "maxAzimuthAngle",
    format: (value) => `${radToDeg(value)}°`,
  },
];

function formatStoredLimit(axis, value) {
  if (typeof value !== "number") {
    return "—";
  }

  return axis.format(value);
}

export function createCameraPresetLimitsDevPanel({
  camera,
  controls,
  getActivePresetId = () => null,
  getPresets = () => [],
  onLimitsDraftChange,
  onTuningChange,
} = {}) {
  const root = document.createElement("div");
  root.className = "camera-limits-dev camera-limits-dev--tuning-off";
  root.hidden = true;

  const header = document.createElement("div");
  header.className = "camera-limits-dev__header";

  const title = document.createElement("h3");
  title.className = "camera-limits-dev__title";
  title.textContent = "Orbit limits";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "camera-limits-dev__toggle";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";

  const toggleText = document.createElement("span");
  toggleText.textContent = "Tuning on";

  toggleLabel.append(toggleInput, toggleText);
  header.append(title, toggleLabel);

  const hint = document.createElement("p");
  hint.className = "camera-limits-dev__hint";
  hint.textContent =
    "Enable Development mode in Settings. Turn on tuning, orbit the camera, then register each min/max.";

  const presetLine = document.createElement("p");
  presetLine.className = "camera-limits-dev__preset";
  presetLine.innerHTML = "Preset: <strong>—</strong>";

  const statusLine = document.createElement("p");
  statusLine.className = "camera-limits-dev__status";
  statusLine.textContent = "Select a camera view to start tuning.";

  const axisContainer = document.createElement("div");
  axisContainer.className = "camera-limits-dev__axes";

  const axisUi = AXIS_CONFIG.map((axis) => {
    const section = document.createElement("section");
    section.className = "camera-limits-dev__axis";

    const axisTitle = document.createElement("h4");
    axisTitle.className = "camera-limits-dev__axis-title";
    axisTitle.textContent = axis.label;

    const nowRow = document.createElement("div");
    nowRow.className = "camera-limits-dev__row camera-limits-dev__row--now";

    const nowLabel = document.createElement("span");
    nowLabel.className = "camera-limits-dev__row-label";
    nowLabel.textContent = "Now";

    const nowValue = document.createElement("span");
    nowValue.className = "camera-limits-dev__row-value";
    nowValue.textContent = "—";

    nowRow.append(nowLabel, nowValue);

    const minRow = document.createElement("div");
    minRow.className = "camera-limits-dev__row";

    const minLabel = document.createElement("span");
    minLabel.className = "camera-limits-dev__row-label";
    minLabel.textContent = "Min";

    const minValue = document.createElement("span");
    minValue.className = "camera-limits-dev__row-value";
    minValue.textContent = "—";

    const minButton = document.createElement("button");
    minButton.type = "button";
    minButton.className =
      "camera-limits-dev__btn camera-limits-dev__btn--register";
    minButton.textContent = "Register min";

    minRow.append(minLabel, minValue, minButton);

    const maxRow = document.createElement("div");
    maxRow.className = "camera-limits-dev__row";

    const maxLabel = document.createElement("span");
    maxLabel.className = "camera-limits-dev__row-label";
    maxLabel.textContent = "Max";

    const maxValue = document.createElement("span");
    maxValue.className = "camera-limits-dev__row-value";
    maxValue.textContent = "—";

    const maxButton = document.createElement("button");
    maxButton.type = "button";
    maxButton.className =
      "camera-limits-dev__btn camera-limits-dev__btn--register";
    maxButton.textContent = "Register max";

    maxRow.append(maxLabel, maxValue, maxButton);

    section.append(axisTitle, nowRow, minRow, maxRow);
    axisContainer.append(section);

    return {
      axis,
      nowValue,
      minValue,
      maxValue,
      minButton,
      maxButton,
      section,
    };
  });

  const footer = document.createElement("div");
  footer.className = "camera-limits-dev__footer";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "camera-limits-dev__btn";
  clearButton.textContent = "Clear limits";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className =
    "camera-limits-dev__btn camera-limits-dev__btn--primary";
  copyButton.textContent = "Copy preset";

  const exportAllButton = document.createElement("button");
  exportAllButton.type = "button";
  exportAllButton.className =
    "camera-limits-dev__btn camera-limits-dev__btn--primary";
  exportAllButton.textContent = "Export all";

  footer.append(clearButton, copyButton, exportAllButton);
  root.append(header, hint, presetLine, statusLine, axisContainer, footer);
  document.body.appendChild(root);

  let tuningEnabled = false;

  function loadTuningPreference() {
    try {
      const stored = localStorage.getItem(TUNING_STORAGE_KEY);
      if (stored === null) {
        return true;
      }
      return stored === "1";
    } catch {
      return true;
    }
  }

  function saveTuningPreference(enabled) {
    try {
      localStorage.setItem(TUNING_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore storage failures
    }
  }

  function setTuningEnabled(enabled, { persist = true } = {}) {
    tuningEnabled = enabled;
    toggleInput.checked = enabled;
    root.classList.toggle("camera-limits-dev--tuning-on", enabled);
    root.classList.toggle("camera-limits-dev--tuning-off", !enabled);
    toggleText.textContent = enabled ? "Tuning on" : "Tuning off";
    hint.textContent = enabled
      ? "Orbit freely, move to each extreme, then register min and max for every axis."
      : "Turn on tuning to register orbit limits for the active camera preset.";

    if (persist) {
      saveTuningPreference(enabled);
    }
  }

  function getSpherical() {
    if (!camera || !controls) {
      return null;
    }

    return getOrbitSpherical(camera, controls.target);
  }

  function flashButton(button) {
    button.classList.add("camera-limits-dev__btn--flash");
    window.setTimeout(() => {
      button.classList.remove("camera-limits-dev__btn--flash");
    }, 420);
  }

  function registerAxisLimit(axis, bound, button) {
    const presetId = getActivePresetId();
    const spherical = getSpherical();

    if (!presetId) {
      statusLine.textContent = "Select a camera view before registering limits.";
      return;
    }

    if (!spherical) {
      return;
    }

    const key = bound === "min" ? axis.minKey : axis.maxKey;
    const value =
      axis.id === "distance" ? spherical.distance : spherical[axis.id];

    setLimitValue(presetId, key, value);
    onLimitsDraftChange?.(presetId);
    flashButton(button);
    updateReadout();
  }

  axisUi.forEach(({ axis, minButton, maxButton }) => {
    minButton.addEventListener("click", () => {
      registerAxisLimit(axis, "min", minButton);
    });
    maxButton.addEventListener("click", () => {
      registerAxisLimit(axis, "max", maxButton);
    });
  });

  function countRegisteredBounds(limits = {}) {
    let count = 0;

    for (const axis of AXIS_CONFIG) {
      if (typeof limits[axis.minKey] === "number") {
        count += 1;
      }
      if (typeof limits[axis.maxKey] === "number") {
        count += 1;
      }
    }

    return count;
  }

  function updateReadout() {
    const presetId = getActivePresetId();
    const presetStrong = presetLine.querySelector("strong");
    presetStrong.textContent = presetId ? `#${presetId}` : "—";

    const spherical = getSpherical();
    const draft = presetId ? getLimitsDraft(presetId) : null;
    const limits = draft?.limits ?? {};
    const registeredCount = countRegisteredBounds(limits);
    const hasActivePreset = Boolean(presetId);

    root.classList.toggle("camera-limits-dev--ready", hasActivePreset);

    if (!hasActivePreset) {
      statusLine.textContent = "Select a camera view to start tuning.";
    } else if (registeredCount === 0) {
      statusLine.textContent =
        "Orbit to the closest allowed position, register min, then orbit to the farthest and register max.";
    } else if (registeredCount < AXIS_CONFIG.length * 2) {
      statusLine.textContent = `${registeredCount}/6 bounds registered — keep orbiting and register the rest.`;
    } else {
      statusLine.textContent =
        "All bounds registered. Copy snippet and paste into src/cameraPresets.js.";
    }

    axisUi.forEach(
      ({ axis, nowValue, minValue, maxValue, minButton, maxButton }) => {
        const current =
          spherical && axis.id === "distance"
            ? spherical.distance
            : spherical?.[axis.id];

        nowValue.textContent =
          typeof current === "number" ? axis.format(current) : "—";

        const minStored = limits[axis.minKey];
        const maxStored = limits[axis.maxKey];

        minValue.textContent = formatStoredLimit(axis, minStored);
        maxValue.textContent = formatStoredLimit(axis, maxStored);

        minButton.disabled = !hasActivePreset || !tuningEnabled;
        maxButton.disabled = !hasActivePreset || !tuningEnabled;

        minButton.classList.toggle(
          "camera-limits-dev__btn--set",
          typeof minStored === "number",
        );
        maxButton.classList.toggle(
          "camera-limits-dev__btn--set",
          typeof maxStored === "number",
        );
      },
    );
  }

  function handleTuningChange(enabled) {
    setTuningEnabled(enabled);
    onLimitsDraftChange?.(getActivePresetId());
    onTuningChange?.(enabled);
    updateReadout();
  }

  toggleInput.addEventListener("change", () => {
    handleTuningChange(toggleInput.checked);
  });

  clearButton.addEventListener("click", () => {
    const presetId = getActivePresetId();
    if (!presetId) {
      return;
    }

    clearLimitsDraft(presetId);
    onLimitsDraftChange?.(presetId);
    updateReadout();
  });

  copyButton.addEventListener("click", () => {
    const presetId = getActivePresetId();
    if (!presetId) {
      return;
    }

    const view = normalizePresetView(getLimitsDraft(presetId));
    if (!view) {
      return;
    }

    const snippet = formatPresetSnippet({
      id: view.id ?? presetId,
      position: view.position,
      target: view.target,
      limits: view.limits,
    });

    console.log(`// Preset ${presetId} — paste into src/cameraPresets.js\n`);
    console.log(snippet);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snippet).catch(() => {});
    }

    flashButton(copyButton);
  });

  exportAllButton.addEventListener("click", () => {
    const presets = getPresets();
    if (!presets.length) {
      return;
    }

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

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(output).catch(() => {});
    }

    statusLine.textContent =
      "Exported all presets to clipboard and console. Paste into src/cameraPresets.js.";
    flashButton(exportAllButton);
  });

  controls?.addEventListener("change", updateReadout);

  const initialTuning = loadTuningPreference();
  setTuningEnabled(initialTuning, { persist: false });
  if (initialTuning) {
    onTuningChange?.(true);
  }
  updateReadout();

  return {
    root,
    isTuningEnabled: () => tuningEnabled,
    setTuningEnabled: handleTuningChange,
    setVisible(visible) {
      root.hidden = !visible;
    },
    updateReadout,
    syncActivePreset: updateReadout,
  };
}
