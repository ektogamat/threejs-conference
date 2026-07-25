/**
 * Feature flags — flip to false (or delete the folder) when stripping the scene.
 *
 * Strip order (outer layers first):
 * 1. intro          → app/intro + rain-glass
 * 2. chromeUi       → header, about, settings, idle
 * 3. walkUi         → hints, joystick, HUD (walk controls may stay)
 * 4. audio          → ambient button + spatial engines
 * 5. smoke, planes  → world/effects
 * 6. rain           → world/weather + ground ripples
 * 7. sky            → clouds/createCloudSky
 * 8. car            → collider, smoke hub, engine audio
 * 9. advancedPost   → bloom / DoF / CA (future: beauty-only pass)
 * 10. groundReflection → wet mirror RT
 * 11. core          → scene + city + orbit/walk + render loop
 */
export const FEATURES = {
  city: true,
  car: true,
  rain: true,
  smoke: true,
  planes: true,
  sky: true,
  ground: true,
  intro: true,
  chromeUi: true,
  walkUi: true,
  audio: true,
  // Available in production too; setupInspector hides advanced panels outside DEV.
  inspector: true,
};

export const STRIP_ORDER = [
  "intro",
  "chromeUi",
  "walkUi",
  "audio",
  "smoke",
  "planes",
  "rain",
  "sky",
  "car",
];
