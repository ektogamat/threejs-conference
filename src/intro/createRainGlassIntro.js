import gsap from "gsap";
import { performanceProfile } from "../platform/performanceProfile.js";

/**
 * Controls the intro rain-on-glass post pass (no separate renderer).
 * Drop animation uses TSL built-in `time` (renderGroup).
 */
export function createRainGlassIntro({
  pipeline,
  intensity = 0.05,
  speed = 6,
  blurRadius = 2.5,
  distortionStrength = 0.28,
  dropSize = 0.45,
} = {}) {
  const glass = pipeline?.introRainGlass;
  if (!glass) {
    throw new Error("createRainGlassIntro requires pipeline.introRainGlass");
  }

  let disposed = false;
  let fadeTween = null;

  glass.intensity.value = intensity;
  glass.speed.value = speed;
  glass.blurRadius.value = blurRadius;
  glass.distortionStrength.value = distortionStrength;
  glass.dropSize.value = dropSize;
  glass.amount.value = 1;

  // Shed expensive steady-state passes while the glass is fullscreen — the
  // effect blurs/distorts everything anyway, so DoF and lensflare are wasted.
  pipeline?.perf?.setDofEnabled?.(false);
  pipeline?.perf?.setLensflareEnabled?.(false);

  function update() {
    // Animation is driven by TSL `time` inside the shader graph.
  }

  function fadeOut({ duration = 1.2 } = {}) {
    return new Promise((resolve) => {
      if (disposed) {
        resolve();
        return;
      }

      fadeTween?.kill();
      const state = { amount: glass.amount.value };
      fadeTween = gsap.to(state, {
        amount: 0,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          glass.amount.value = state.amount;
        },
        onComplete: resolve,
      });
    });
  }

  function destroy() {
    if (disposed) {
      return;
    }

    disposed = true;
    fadeTween?.kill();
    fadeTween = null;
    glass.amount.value = 0;
    pipeline?.perf?.setDofEnabled?.(performanceProfile.dof);
    pipeline?.perf?.setLensflareEnabled?.(performanceProfile.lensflare);
    pipeline?.disposeIntroRainGlass?.();
  }

  return {
    update,
    fadeOut,
    destroy,
  };
}
