const listeners = new Set();

let radialMenuOpen = false;
let radialMenuPosition = { x: 0, y: 0 };
let radialMenuTarget = null;
let radialMenuColors = [];
let radialMenuActiveIndex = 0;

function notify() {
  const snapshot = {
    radialMenuOpen,
    radialMenuPosition,
    radialMenuTarget,
    radialMenuColors,
    radialMenuActiveIndex,
  };

  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function isRadialMenuOpen() {
  return radialMenuOpen;
}

export function subscribeRadialMenu(listener) {
  listeners.add(listener);
  listener({
    radialMenuOpen,
    radialMenuPosition,
    radialMenuTarget,
    radialMenuColors,
    radialMenuActiveIndex,
  });
  return () => listeners.delete(listener);
}

export function openRadialMenu({
  x,
  y,
  target,
  colors,
  activeIndex = 0,
}) {
  radialMenuOpen = true;
  radialMenuPosition = { x, y };
  radialMenuTarget = target;
  radialMenuColors = [...colors];
  radialMenuActiveIndex = activeIndex;
  notify();
}

export function closeRadialMenu() {
  if (!radialMenuOpen) {
    return;
  }

  radialMenuOpen = false;
  notify();
}

export function getRadialMenuState() {
  return {
    radialMenuOpen,
    radialMenuPosition,
    radialMenuTarget,
    radialMenuColors,
    radialMenuActiveIndex,
  };
}
