import "./fpsWalkHint.css";

export function createFpsWalkHint() {
  const root = document.createElement("div");
  root.className = "fps-walk-hint fps-walk-hint--hidden";
  root.innerHTML = `
    <p class="fps-walk-hint__title">Walk mode</p>
    <p class="fps-walk-hint__copy">Click to look · WASD to move · Shift to sprint · Esc to release mouse · F to return to orbit</p>
  `;
  document.body.appendChild(root);

  function setVisible(visible) {
    root.classList.toggle("fps-walk-hint--hidden", !visible);
  }

  function destroy() {
    root.remove();
  }

  return {
    setVisible,
    destroy,
  };
}
