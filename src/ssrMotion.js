/**
 * Smooth SSR-only degradation during camera motion (orbit drag + presets).
 * Resolution / denoise may drop while moving; intensity stays at the idle value.
 */

const CAMERA_SOURCES = new Set(["camera", "camera-preset"]);

function lerp(current, target, alpha) {
  return current + (target - current) * alpha;
}

function readSsrSnapshot(ssrParams) {
  return {
    resolutionScale: ssrParams.ssr.resolutionScale,
    quality: ssrParams.ssr.quality,
    denoiseStrength: ssrParams.denoise.strength,
  };
}

export function createSsrMotionProfile({
  renderer,
  ssrNode,
  ssrParams,
  applySsrParams,
}) {
  const idle = {
    resolutionScale: 0.9,
    quality: 0.8,
    denoiseStrength: 0.725,
  };

  const drag = {
    resolutionScale: 0.85,
    quality: 0.7,
    denoiseStrength: 0.6,
  };

  const params = {
    enabled: true,
    blendMs: 280,
    cameraOnly: true,
  };

  let current = { ...idle };
  let target = { ...idle };
  let lastResolutionScale = current.resolutionScale;
  let usingDragTarget = false;

  function applyToSsrPass() {
    ssrParams.ssr.resolutionScale = current.resolutionScale;
    ssrParams.ssr.quality = current.quality;
    ssrParams.denoise.strength = current.denoiseStrength;
    applySsrParams(ssrParams);

    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    if (
      width > 0 &&
      height > 0 &&
      Math.abs(current.resolutionScale - lastResolutionScale) > 0.0001
    ) {
      ssrNode.setSize(width, height);
      lastResolutionScale = current.resolutionScale;
    }
  }

  function snapResolutionToTarget() {
    if (current.resolutionScale === target.resolutionScale) {
      return;
    }

    current.resolutionScale = target.resolutionScale;
    applyToSsrPass();
  }

  function setTargetSnapshot(snapshot) {
    target = { ...snapshot };
    snapResolutionToTarget();
  }

  function hasCameraMotion(activeSources) {
    for (const source of CAMERA_SOURCES) {
      if (activeSources.has(source)) {
        return true;
      }
    }
    return false;
  }

  function syncTargetFromSources(activeSources) {
    const useDrag =
      params.enabled && (!params.cameraOnly || hasCameraMotion(activeSources));

    usingDragTarget = useDrag;
    setTargetSnapshot(useDrag ? drag : idle);
  }

  function setDragProfile(snapshot) {
    Object.assign(drag, {
      resolutionScale: snapshot.resolutionScale ?? drag.resolutionScale,
      quality: snapshot.quality ?? drag.quality,
      denoiseStrength: snapshot.denoiseStrength ?? drag.denoiseStrength,
    });
    if (usingDragTarget) {
      setTargetSnapshot(drag);
    }
  }

  function onLoopStateChange(loopState, info) {
    syncTargetFromSources(info.activeSources);

    if (loopState === "settling") {
      current = { ...target };
      applyToSsrPass();
    }

    if (loopState === "sleeping" && params.enabled) {
      current = { ...idle };
      target = { ...idle };
      applyToSsrPass();
    }
  }

  function tick(frameMs, loopState = "interacting") {
    if (!params.enabled || frameMs <= 0) {
      return;
    }

    if (loopState === "settling" || loopState === "sleeping") {
      if (
        current.quality !== target.quality ||
        current.denoiseStrength !== target.denoiseStrength ||
        current.resolutionScale !== target.resolutionScale
      ) {
        current = { ...target };
        applyToSsrPass();
      }
      return;
    }

    const blendMs = Math.max(16, params.blendMs);
    const alpha = 1 - Math.exp(-frameMs / blendMs);

    current = {
      resolutionScale: target.resolutionScale,
      quality: lerp(current.quality, target.quality, alpha),
      denoiseStrength: lerp(
        current.denoiseStrength,
        target.denoiseStrength,
        alpha,
      ),
    };

    applyToSsrPass();
  }

  function handleResize() {
    lastResolutionScale = -1;
    applyToSsrPass();
  }

  function captureIdleFromPass() {
    Object.assign(idle, readSsrSnapshot(ssrParams));
    if (!params.enabled) {
      current = { ...idle };
      target = { ...idle };
    }
  }

  captureIdleFromPass();
  applyToSsrPass();

  return {
    params,
    idle,
    drag,
    onLoopStateChange,
    tick,
    handleResize,
    setDragProfile,
    getCurrent: () => ({ ...current }),
    getTarget: () => ({ ...target }),
    captureIdleFromPass,
  };
}
