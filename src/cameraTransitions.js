import { gsap } from "gsap";
import { getResolvedPresetView } from "./cameraPresetLimitsDraft.js";
import { normalizePresetView } from "./orbitLimits.js";

const PRESET_SOURCE = "camera-preset";
const ORBIT_LEAK_SOURCE = "camera";

export function createAnimateCameraToPreset({
  camera,
  controls,
  renderLoop,
  onTransitionStart,
  onTransitionEnd,
  duration = 1.2,
} = {}) {
  let activeTween = null;
  let animating = false;
  let activeResolve = null;
  let activeReject = null;

  function clearOrbitLeak() {
    renderLoop?.endInteraction(ORBIT_LEAK_SOURCE);
  }

  function releasePresetInteraction({ settle = true } = {}) {
    clearOrbitLeak();
    if (settle) {
      renderLoop?.scheduleInteractionEnd(PRESET_SOURCE);
    } else {
      renderLoop?.endInteraction(PRESET_SOURCE);
    }
  }

  function settleActivePromise() {
    const resolve = activeResolve;
    activeResolve = null;
    activeReject = null;
    resolve?.();
  }

  function rejectActivePromise() {
    const reject = activeReject;
    activeResolve = null;
    activeReject = null;
    reject?.();
  }

  function finishPresetMotion(preset) {
    animating = false;
    activeTween = null;
    controls.enabled = true;
    onTransitionEnd?.(preset);
    releasePresetInteraction({ settle: true });
    settleActivePromise();
  }

  function stopActiveTween({ rejectPromise = true } = {}) {
    if (!activeTween && !animating) {
      if (rejectPromise) {
        rejectActivePromise();
      }
      return;
    }

    if (activeTween) {
      activeTween.kill();
      activeTween = null;
    }

    animating = false;
    controls.enabled = true;
    releasePresetInteraction({ settle: false });

    if (rejectPromise) {
      rejectActivePromise();
    }
  }

  function animateCameraToPreset(preset, options = {}) {
    if (!preset) {
      return Promise.resolve();
    }

    stopActiveTween();

    const resolvedPreset = getResolvedPresetView(preset);
    const animationPreset = normalizePresetView(resolvedPreset);
    const tweenDuration =
      typeof options.duration === "number" ? options.duration : duration;
    const tweenEase = options.ease ?? "power2.inOut";
    const keepControlsDisabled = options.keepControlsDisabled === true;

    return new Promise((resolve, reject) => {
      activeResolve = resolve;
      activeReject = reject;

      animating = true;
      controls.enabled = false;
      onTransitionStart?.();
      renderLoop?.startInteraction(PRESET_SOURCE);

      const fromPosition = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      };
      const fromTarget = {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      };
      const [px, py, pz] = animationPreset.position;
      const [tx, ty, tz] = animationPreset.target;

      activeTween = gsap.timeline({
        defaults: { ease: tweenEase, duration: tweenDuration },
        onUpdate: () => {
          camera.position.set(fromPosition.x, fromPosition.y, fromPosition.z);
          controls.target.set(fromTarget.x, fromTarget.y, fromTarget.z);
          renderLoop?.invalidate(PRESET_SOURCE);
        },
        onComplete: () => {
          camera.position.set(px, py, pz);
          controls.target.set(tx, ty, tz);

          if (keepControlsDisabled) {
            animating = false;
            activeTween = null;
            onTransitionEnd?.(preset);
            releasePresetInteraction({ settle: true });
            settleActivePromise();
            return;
          }
          finishPresetMotion(preset);
        },
      });

      activeTween.to(fromPosition, { x: px, y: py, z: pz }, 0);
      activeTween.to(fromTarget, { x: tx, y: ty, z: tz }, 0);
    });
  }

  return {
    animateCameraToPreset,
    isAnimating: () => animating,
  };
}
