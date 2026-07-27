/**
 * Motion-adaptive SSR quality (Threepipe lowQualityFrames equivalent).
 * Drops ray-march budget while the camera moves; restores when still.
 */
export function createSsrMotionBudget({
  performanceProfile,
  applyQuality,
  getCamera,
}) {
  let lowQualityFramesRemaining = 0;
  let lastPosition = null;
  let lastQuaternion = null;
  let lastAppliedQuality = null;

  const motionEpsilon = 1e-4;
  const rotationEpsilon = 1e-5;

  function resetCameraBaseline(camera) {
    if (!camera) {
      lastPosition = null;
      lastQuaternion = null;
      return;
    }

    lastPosition = camera.position.clone();
    lastQuaternion = camera.quaternion.clone();
  }

  function cameraMoved(camera) {
    if (!camera || !lastPosition || !lastQuaternion) {
      resetCameraBaseline(camera);
      return false;
    }

    const positionDelta = camera.position.distanceToSquared(lastPosition);
    const rotationDelta =
      1 - Math.abs(camera.quaternion.dot(lastQuaternion));

    const moved =
      positionDelta > motionEpsilon * motionEpsilon ||
      rotationDelta > rotationEpsilon;

    if (moved) {
      lastPosition.copy(camera.position);
      lastQuaternion.copy(camera.quaternion);
    }

    return moved;
  }

  function update() {
    if (!performanceProfile.ssrMotionAdaptive) {
      return;
    }

    const camera = getCamera?.();
    if (!camera) {
      return;
    }

    if (cameraMoved(camera)) {
      lowQualityFramesRemaining = performanceProfile.ssrLowQualityFrames;
    }

    const targetQuality =
      lowQualityFramesRemaining > 0
        ? performanceProfile.ssrMotionQuality
        : performanceProfile.ssrRestQuality;

    if (targetQuality !== lastAppliedQuality) {
      applyQuality(targetQuality);
      lastAppliedQuality = targetQuality;
    }

    if (lowQualityFramesRemaining > 0) {
      lowQualityFramesRemaining -= 1;
    }
  }

  function forceRestQuality() {
    lowQualityFramesRemaining = 0;
    applyQuality(performanceProfile.ssrRestQuality);
    lastAppliedQuality = performanceProfile.ssrRestQuality;
  }

  function onCameraTeleport(camera) {
    resetCameraBaseline(camera);
    lowQualityFramesRemaining = performanceProfile.ssrLowQualityFrames;
  }

  resetCameraBaseline(getCamera?.());

  return {
    update,
    forceRestQuality,
    onCameraTeleport,
    resetCameraBaseline,
  };
}
