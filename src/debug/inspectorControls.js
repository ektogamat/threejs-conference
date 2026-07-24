import "./inspectorLayout.css";
import { setItem } from "three/addons/inspector/Inspector.js";

export function clearInspectorLayout() {
  try {
    setItem("layout", null);
  } catch (_) {
    // localStorage may be unavailable
  }
}

export function attachRendererInspector(renderer, inspector) {
  if (!renderer || !inspector) {
    return;
  }

  renderer.inspector = inspector;
  inspector.init?.();
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
