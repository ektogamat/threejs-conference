import "./inspectorLayout.css";
import { InspectorBase } from "three/webgpu";
import { setItem } from "three/addons/inspector/Inspector.js";
import { isSafari } from "../platform/deviceLayout.js";

export function clearInspectorLayout() {
  try {
    setItem("layout", null);
  } catch (_) {
    // localStorage may be unavailable
  }
}

export function canUseTimestampQueries(renderer) {
  return renderer?.hasFeature?.("timestamp-query") === true && !isSafari();
}

export function disableRendererTimestamps(renderer) {
  if (!renderer?.backend) {
    return;
  }

  renderer.backend.trackTimestamp = false;
}

export function syncRendererTimestamps(renderer, enabled) {
  if (!renderer?.backend) {
    return;
  }

  renderer.backend.trackTimestamp =
    Boolean(enabled) && canUseTimestampQueries(renderer);
}

export function attachRendererInspector(renderer, inspector) {
  if (!renderer || !inspector) {
    return;
  }

  renderer.inspector = inspector;
  inspector.init?.();

  // Inspector.setRenderer enables trackTimestamp asynchronously after init.
  // Safari's WebGPU backend throws when allocating GPUQuerySet for timestamps.
  disableRendererTimestamps(renderer);
  void Promise.resolve(renderer.init?.()).then(() => {
    syncRendererTimestamps(renderer, true);
  });
}

export function detachRendererInspector(renderer) {
  if (!renderer) {
    return;
  }

  // Renderer animation loop always calls _inspector.begin/finish — never null.
  renderer.inspector = new InspectorBase();
  disableRendererTimestamps(renderer);
}

export function hideInspector(inspector) {
  if (!inspector) return;
  inspector.domElement.hidden = true;
}

export function openInspector(inspector) {
  if (!inspector) return;

  inspector.domElement.hidden = false;

  const btn = inspector.parameters.builtinButton;
  if (btn && !btn.classList.contains("active")) {
    btn.click();
  }
}
