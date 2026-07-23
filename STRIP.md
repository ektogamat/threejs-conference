# Scene strip guide

Progressively simplify the scene by toggling flags in [`src/world/features.js`](src/world/features.js).

## Order

1. `intro: false` — skip rain-glass + title overlay
2. `chromeUi: false` — header, about, settings, idle manager
3. `walkUi: false` — hints, joystick, HUD (walk controls remain)
4. `audio: false` — ambient button + spatial engines
5. `smoke: false` — car exhaust particles
6. `planes: false` — flying planes + plane engine
7. `rain: false` — weather streaks + ground ripples
8. `sky: false` — procedural cloud sky (`src/clouds/`)
9. `car: false` — Quadra model, collider, smoke hub, car engine
10. `ground: false` — wet reflective ground (requires post/ground follow-up)
11. `city: false` — main environment model

## Minimum core

With only `city`, `ground`, and walk/orbit enabled, the app reduces to:

```
bootstrap + scene + city + ground + post + walk/orbit + render loop
```

## Folder map

| Remove flag | Delete or ignore folder |
|-------------|-------------------------|
| `intro` | `src/app/createIntroFlow.js`, `src/ui/intro/` |
| `chromeUi` | `src/ui/chrome/` (except shared state if needed) |
| `walkUi` | `src/ui/walk/` |
| `audio` | `src/audio/` |
| `smoke`, `planes` | `src/world/effects/` |
| `rain` | `src/world/weather/` |
| `sky` | `src/clouds/` |
| `car` | `src/world/car/` |
| `city` | `src/world/city/` |
| post effects | `src/post/` (keep beauty pass stub) |

Each world feature returns `null` when disabled — the render loop and post pipeline already handle optional slots.
