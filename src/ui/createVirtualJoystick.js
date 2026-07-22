import "./virtualJoystick.css";
import { isCoarsePointerDevice, isMobileLayout } from "./deviceLayout.js";

const DEADZONE = 0.12;

function resolveJoystickRadius(baseEl, knobEl) {
  const baseRect = baseEl.getBoundingClientRect();
  const knobRect = knobEl.getBoundingClientRect();
  return Math.max(24, (baseRect.width - knobRect.width) / 2);
}

export function createVirtualJoystick({ walkControls, state } = {}) {
  const root = document.createElement("div");
  root.className = "virtual-joystick";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="virtual-joystick__base">
      <div class="virtual-joystick__knob"></div>
    </div>
  `;

  document.body.appendChild(root);

  const base = root.querySelector(".virtual-joystick__base");
  const knob = root.querySelector(".virtual-joystick__knob");

  let enabled = false;
  let walkModeVisible = false;
  let forceHidden = false;
  let panelOpen = Boolean(state?.openedPanel);
  let activePointerId = null;
  let baseCenter = { x: 0, y: 0 };

  function isSupportedLayout() {
    return isMobileLayout() || isCoarsePointerDevice();
  }

  function resetAxes() {
    walkControls?.setMoveAxes?.(0, 0);
    knob.style.transform = "translate(-50%, -50%)";
    activePointerId = null;
  }

  function syncVisibility() {
    const show =
      enabled &&
      walkModeVisible &&
      !forceHidden &&
      !panelOpen &&
      isSupportedLayout();

    root.hidden = !show;
    root.classList.toggle("virtual-joystick--visible", show);

    if (!show) {
      resetAxes();
    }
  }

  function applyStick(clientX, clientY) {
    const radius = resolveJoystickRadius(base, knob);
    const dx = clientX - baseCenter.x;
    const dy = clientY - baseCenter.y;
    const distance = Math.hypot(dx, dy);
    const clampedDistance = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * clampedDistance;
    const clampedY = Math.sin(angle) * clampedDistance;

    knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

    const normalizedX = clampedX / radius;
    const normalizedY = clampedY / radius;
    const magnitude = Math.hypot(normalizedX, normalizedY);

    if (magnitude <= DEADZONE) {
      walkControls?.setMoveAxes?.(0, 0);
      return;
    }

    walkControls?.setMoveAxes?.(
      normalizedX / magnitude,
      normalizedY / magnitude,
    );
  }

  function cacheBaseCenter() {
    const rect = base.getBoundingClientRect();
    baseCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function onPointerDown(event) {
    if (!enabled || forceHidden || panelOpen || !isSupportedLayout()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    activePointerId = event.pointerId;
    cacheBaseCenter();
    root.setPointerCapture?.(event.pointerId);
    applyStick(event.clientX, event.clientY);
  }

  function onPointerMove(event) {
    if (activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyStick(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (root.hasPointerCapture?.(event.pointerId)) {
      root.releasePointerCapture?.(event.pointerId);
    }

    resetAxes();
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);

  const unsubscribeState = state?.subscribe?.(({ openedPanel }) => {
    panelOpen = Boolean(openedPanel);
    syncVisibility();
  });

  return {
    root,
    setEnabled(next) {
      enabled = Boolean(next);
      syncVisibility();
    },
    setVisible(next) {
      walkModeVisible = Boolean(next);
      syncVisibility();
    },
    setForceHidden(hidden) {
      forceHidden = Boolean(hidden);
      syncVisibility();
    },
    destroy() {
      unsubscribeState?.();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      resetAxes();
      root.remove();
    },
  };
}
