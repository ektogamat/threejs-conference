import { DEFAULT_RENDER_MODE, isRenderMode } from "./renderModes.js";
import {
  markRenderModeAsUserChosen,
  setRenderMode as persistRenderMode,
} from "./userPreferences.js";

export function createRenderModeController({ applyRenderMode, getInitialMode } = {}) {
  const listeners = new Set();
  let currentMode = isRenderMode(getInitialMode?.())
    ? getInitialMode()
    : DEFAULT_RENDER_MODE;

  function notify() {
    for (const listener of listeners) {
      listener(currentMode);
    }
  }

  function setMode(mode, { persist = true, userChoice = persist } = {}) {
    if (!isRenderMode(mode) || mode === currentMode) {
      return currentMode;
    }

    applyRenderMode?.(mode, { previousMode: currentMode });
    currentMode = mode;

    if (persist) {
      persistRenderMode(mode);
    }

    if (userChoice) {
      markRenderModeAsUserChosen();
    }

    notify();
    return currentMode;
  }

  function getMode() {
    return currentMode;
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(currentMode);
    return () => listeners.delete(listener);
  }

  applyRenderMode?.(currentMode, { previousMode: null });

  return {
    getMode,
    setMode,
    subscribe,
  };
}
