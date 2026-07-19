import * as THREE from "three/webgpu";

const WIDTH = 512;
const HEIGHT = 256;

function colorToHex(color) {
  return `#${color.getHexString()}`;
}

export function createSkyGradientBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  let lastTop = "";
  let lastBottom = "";

  function update({ top, bottom }) {
    const topHex = colorToHex(top);
    const bottomHex = colorToHex(bottom);

    if (topHex === lastTop && bottomHex === lastBottom) {
      return;
    }

    lastTop = topHex;
    lastBottom = bottomHex;

    const gradient = ctx.createLinearGradient(0, HEIGHT, 0, 0);
    gradient.addColorStop(0, bottomHex);
    gradient.addColorStop(1, topHex);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    texture.needsUpdate = true;
  }

  return { texture, update };
}
