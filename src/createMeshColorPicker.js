import * as THREE from "three/webgpu";
import { isRadialMenuOpen } from "./ui/radialMenuState.js";

const TAP_MOVE_THRESHOLD = 10;
const HOVER_RAYCAST_MOVE_THRESHOLD = 2;

function clientToNdc(clientX, clientY, domElement) {
  const rect = domElement.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export function createMeshColorPicker({
  camera,
  renderer,
  model,
  paintController,
  isCameraDragging = () => false,
  isEnabled = () => true,
  onOpenRadialMenu,
  onHover,
} = {}) {
  const domElement = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activeTargetKey = null;
  let hoverFrameId = null;
  let pendingPointer = null;
  let activeTap = null;
  let lastHoverClientX = null;
  let lastHoverClientY = null;

  function pickTarget(clientX, clientY) {
    const ndc = clientToNdc(clientX, clientY, domElement);
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObject(model, true);
    if (hits.length === 0) {
      return null;
    }

    const hit = hits[0];
    const targetKey = paintController.resolveHit(hit.object);
    if (!targetKey) {
      return null;
    }

    return { targetKey, hit };
  }

  function openRadialMenuAt(clientX, clientY, targetKey) {
    const data = paintController.getRadialMenuData(targetKey);
    if (!data) {
      return;
    }

    onOpenRadialMenu?.({
      x: clientX,
      y: clientY,
      target: data.targetKey,
      colors: data.colors,
      activeIndex: data.activeIndex,
    });
  }

  function emitHover(targetKey, clientX, clientY) {
    if (!targetKey) {
      if (activeTargetKey === null) {
        return;
      }

      activeTargetKey = null;
      lastHoverClientX = null;
      lastHoverClientY = null;
      onHover?.(null);
      return;
    }

    const targetChanged = targetKey !== activeTargetKey;
    activeTargetKey = targetKey;
    onHover?.({
      targetKey,
      clientX,
      clientY,
      targetChanged,
    });
  }

  function updateHover(clientX, clientY) {
    if (!isEnabled() || isCameraDragging() || isRadialMenuOpen()) {
      lastHoverClientX = null;
      lastHoverClientY = null;
      emitHover(null);
      return;
    }

    if (
      activeTargetKey !== null &&
      lastHoverClientX !== null &&
      lastHoverClientY !== null &&
      Math.hypot(clientX - lastHoverClientX, clientY - lastHoverClientY) <
        HOVER_RAYCAST_MOVE_THRESHOLD
    ) {
      return;
    }

    lastHoverClientX = clientX;
    lastHoverClientY = clientY;

    const pick = pickTarget(clientX, clientY);
    emitHover(pick?.targetKey ?? null, clientX, clientY);
  }

  function scheduleHover(clientX, clientY) {
    pendingPointer = { clientX, clientY };

    if (hoverFrameId !== null) {
      return;
    }

    hoverFrameId = requestAnimationFrame(() => {
      hoverFrameId = null;
      const nextPointer = pendingPointer;
      pendingPointer = null;

      if (!nextPointer) {
        return;
      }

      updateHover(nextPointer.clientX, nextPointer.clientY);
    });
  }

  function clearTapTracking() {
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    window.removeEventListener("pointermove", handlePointerMoveWhileTap);
    activeTap = null;
  }

  function updateTapDrag(event) {
    if (!activeTap || event.pointerId !== activeTap.pointerId) {
      return;
    }

    const dx = event.clientX - activeTap.startX;
    const dy = event.clientY - activeTap.startY;

    if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
      activeTap.dragged = true;
    }
  }

  function finishTap(event) {
    if (!activeTap || event.pointerId !== activeTap.pointerId) {
      return;
    }

    const { dragged } = activeTap;
    clearTapTracking();

    if (dragged) {
      return;
    }

    const pick = pickTarget(event.clientX, event.clientY);
    if (!pick) {
      return;
    }

    openRadialMenuAt(event.clientX, event.clientY, pick.targetKey);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || !isEnabled() || isRadialMenuOpen()) {
      return;
    }

    activeTap = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("pointermove", handlePointerMoveWhileTap);
  }

  function handlePointerUp(event) {
    finishTap(event);
  }

  function handlePointerCancel(event) {
    finishTap(event);
  }

  function handlePointerMoveWhileTap(event) {
    updateTapDrag(event);
  }

  function handlePointerMove(event) {
    updateTapDrag(event);

    if (isCameraDragging()) {
      emitHover(null);
      return;
    }

    scheduleHover(event.clientX, event.clientY);
  }

  function handlePointerLeave() {
    emitHover(null);
  }

  domElement.addEventListener("pointerdown", handlePointerDown);
  domElement.addEventListener("pointermove", handlePointerMove);
  domElement.addEventListener("pointerleave", handlePointerLeave);

  return {
    destroy() {
      if (hoverFrameId !== null) {
        cancelAnimationFrame(hoverFrameId);
      }

      clearTapTracking();
      domElement.removeEventListener("pointerdown", handlePointerDown);
      domElement.removeEventListener("pointermove", handlePointerMove);
      domElement.removeEventListener("pointerleave", handlePointerLeave);
    },
  };
}
