const DESKTOP_IDLE_MS = 5000;
const TOUCH_IDLE_MS = 12000;

function isCoarsePointerDevice() {
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return true;
    }
  }

  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

function resolveIdleMs(idleMs) {
  if (typeof idleMs === "number") {
    return idleMs;
  }

  return isCoarsePointerDevice() ? TOUCH_IDLE_MS : DESKTOP_IDLE_MS;
}

export function createUiIdleManager({
  state,
  idleMs,
  activityTarget = document,
  onWake,
  onIdle,
} = {}) {
  let idleTimerId = null;
  const resolvedIdleMs = resolveIdleMs(idleMs);

  function clearIdleTimer() {
    if (!idleTimerId) {
      return;
    }

    window.clearTimeout(idleTimerId);
    idleTimerId = null;
  }

  function scheduleIdleTimer() {
    clearIdleTimer();
    idleTimerId = window.setTimeout(() => {
      idleTimerId = null;

      if (state.openedPanel) {
        scheduleIdleTimer();
        return;
      }

      state.hideAllUi();
      onIdle?.();
    }, resolvedIdleMs);
  }

  function handleActivity() {
    if (!state.uiVisible) {
      state.showAllUi();
      onWake?.();
    }

    scheduleIdleTimer();
  }

  const passive = { passive: true };

  function start() {
    activityTarget.addEventListener("mousemove", handleActivity);
    activityTarget.addEventListener("pointerdown", handleActivity);
    activityTarget.addEventListener("pointermove", handleActivity);
    activityTarget.addEventListener("touchstart", handleActivity, passive);
    activityTarget.addEventListener("touchmove", handleActivity, passive);
    activityTarget.addEventListener("click", handleActivity);
    activityTarget.addEventListener("keydown", handleActivity);
    scheduleIdleTimer();
  }

  function destroy() {
    clearIdleTimer();
    activityTarget.removeEventListener("mousemove", handleActivity);
    activityTarget.removeEventListener("pointerdown", handleActivity);
    activityTarget.removeEventListener("pointermove", handleActivity);
    activityTarget.removeEventListener("touchstart", handleActivity);
    activityTarget.removeEventListener("touchmove", handleActivity);
    activityTarget.removeEventListener("click", handleActivity);
    activityTarget.removeEventListener("keydown", handleActivity);
  }

  return {
    start,
    destroy,
    resetTimer: handleActivity,
  };
}

export function createUiVisibilityCoordinator({
  state,
  header,
  screenshotButton,
  audioButton,
  isAppReady = () => true,
} = {}) {
  function applyVisibility({ openedPanel, uiVisible }) {
    if (!isAppReady()) {
      header?.setForceHidden?.(true);
      screenshotButton?.setForceHidden?.(true);
      audioButton?.setForceHidden?.(true);
      screenshotButton?.setVisible?.(false);
      audioButton?.setVisible?.(false);
      return;
    }

    const overlayOpen =
      openedPanel === "settings" || openedPanel === "about";

    if (!uiVisible) {
      header?.setForceHidden?.(true);
      screenshotButton?.setForceHidden?.(true);
      audioButton?.setForceHidden?.(true);
      return;
    }

    header?.setForceHidden?.(false);
    screenshotButton?.setForceHidden?.(overlayOpen);
    screenshotButton?.setVisible?.(!overlayOpen);
    audioButton?.setForceHidden?.(overlayOpen);
    audioButton?.setVisible?.(!overlayOpen);
  }

  const unsubscribe = state.subscribe(applyVisibility);

  return {
    refresh() {
      applyVisibility({
        openedPanel: state.openedPanel,
        uiVisible: state.uiVisible,
      });
    },
    destroy() {
      unsubscribe();
    },
  };
}
