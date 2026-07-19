function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatPresetEntry({ id, label, hour, azimuth }) {
  return `  {
    id: "${id}",
    label: "${label}",
    hour: ${Number(hour.toFixed(2))},
    azimuth: ${Math.round(azimuth)},
  },`;
}

export function createSunPresetsDev({
  getState,
  presets,
  animateToPreset,
  refreshPresets,
} = {}) {
  function readCurrentSun() {
    const { hour, azimuth } = getState?.() ?? {};
    return {
      hour: Number(hour),
      azimuth: Number(azimuth),
    };
  }

  function findPreset(slot) {
    const id = String(slot);
    return presets.find((preset) => preset.id === id);
  }

  function current() {
    const sun = readCurrentSun();
    console.log(`hour: ${sun.hour.toFixed(2)}  (${formatHour(sun.hour)})`);
    console.log(`azimuth: ${Math.round(sun.azimuth)}`);
    return sun;
  }

  function capture(slot, { label } = {}) {
    const sun = readCurrentSun();

    if (slot === undefined) {
      const nextId = String(
        presets.reduce((max, preset) => Math.max(max, Number(preset.id)), 0) +
          1,
      );
      const entry = {
        id: nextId,
        label: label ?? `Preset ${nextId}`,
        hour: sun.hour,
        azimuth: sun.azimuth,
      };
      console.log("// New preset — paste into src/sunPresets.js\n");
      console.log(formatPresetEntry(entry));
      return entry;
    }

    const id = String(slot);
    const preset = findPreset(slot);
    const entry = {
      id,
      label: label ?? preset?.label ?? `Preset ${id}`,
      hour: sun.hour,
      azimuth: sun.azimuth,
    };
    console.log(`// Preset ${slot} — paste into src/sunPresets.js\n`);
    console.log(formatPresetEntry(entry));
    return entry;
  }

  function update(slot, { label } = {}) {
    const preset = findPreset(slot);
    if (!preset) {
      console.warn(
        `Preset ${slot} not found. Run __app.sun.capture(${slot}) and add it to sunPresets.js`,
      );
      return null;
    }

    const sun = readCurrentSun();
    preset.hour = sun.hour;
    preset.azimuth = sun.azimuth;
    if (label) {
      preset.label = label;
    }

    refreshPresets?.();

    console.log(`Preset ${slot} updated in memory (test in UI dropdown). To persist:`);
    console.log(formatPresetEntry(preset));
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
      console.warn(
        "Instant apply is not exposed. Use animateToPreset via the UI or go(slot) with animate: true.",
      );
      animateToPreset?.(preset);
    }

    console.log(`Applied preset ${slot} (${preset.label}).`);
    return preset;
  }

  function exportAll() {
    const body = presets.map((preset) => formatPresetEntry(preset)).join("\n");
    const output = `export const SUN_PRESETS = [\n${body}\n];`;
    console.log("// Full list — replace src/sunPresets.js\n");
    console.log(output);
    return output;
  }

  function help() {
    console.log(`Sun preset dev tools (use the Time of Day panel sliders first):

  __app.sun.current()              → log current hour + azimuth
  __app.sun.capture()              → log snippet for a NEW preset
  __app.sun.capture(3)             → log snippet for preset slot 3
  __app.sun.update(3)              → save current sun into preset 3 (runtime + log)
  __app.sun.update(3, { label: "Porcelain Light" }) → also rename preset 3
  __app.sun.go(3)                  → animate to preset 3
  __app.sun.export()               → log entire SUN_PRESETS array

Workflow:
  1. Open the Time of Day panel and set hour + azimuth
  2. Check values in the UI ("Sun rotation · 155°") or __app.sun.current()
  3. __app.sun.update(3) — test immediately in the presets dropdown
  4. Copy the logged snippet into src/sunPresets.js to persist`);
  }

  return {
    help,
    current,
    capture,
    update,
    go,
    export: exportAll,
  };
}
