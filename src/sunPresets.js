// Edit hour and azimuth after framing the light in the UI.
// Dev workflow: adjust sun + rotation sliders, then in the browser console run:
//   __app.sun.current()   — log current hour + azimuth
//   __app.sun.capture(1)  — log snippet for preset slot 1
//   __app.sun.update(1)   — save current values into preset 1 (runtime + log)
//   __app.sun.help()      — full command list

export const SUN_PRESETS = [
  { id: "1", label: "First Ember", hour: 8.3, azimuth: 155 },
  { id: "2", label: "Warm Vellum", hour: 9.63, azimuth: 110 },
  { id: "3", label: "Blush Horizon", hour: 6.45, azimuth: 172 },
  { id: "4", label: "Ink Hush", hour: 5.79, azimuth: -146 },
  { id: "5", label: "Coral Rise", hour: 6.86, azimuth: -146 },
  { id: "6", label: "Pale Atelier", hour: 9.86, azimuth: -170 },
  { id: "7", label: "Copper Haze", hour: 16.14, azimuth: 131 },
  { id: "8", label: "Amber Loom", hour: 15.68, azimuth: 51 },
];
