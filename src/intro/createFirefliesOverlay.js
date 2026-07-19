import * as THREE from "three/webgpu";
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  screenUV,
  abs,
  clamp,
  length,
  max,
  mix,
  mod,
  mul,
  add,
  sub,
  sin,
  cos,
  fract,
  floor,
  distance,
  pow,
  uniform,
} from "three/tsl";
import gsap from "gsap";

function createFirefliesMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  const uTime = uniform(0.0);
  const uAspect = uniform(1.0);
  const uMouse = uniform(new THREE.Vector3(0.5, 0.5, 1.0));
  const uOpacity = uniform(0.75);

  material.colorNode = Fn(() => {
    const randFn = (n) => fract(mul(sin(n), 43758.5453123));

    const suv = screenUV;
    const uv0 = suv.mul(2.0).sub(1.0);

    const bgA = vec4(0.09, 0.06, 0.01, 1.0);
    const bgB = vec4(0.1, 0.01, 0.15, 1.0);
    const t = clamp(length(uv0).mul(0.3), 0.0, 1.0);
    const base = mix(bgA, bgB, t);

    const uvAbs = abs(uv0);
    const uv2 = mul(sub(clamp(uvAbs, 0.8, 1.0), 0.8), 5.0);
    const rBase = mul(0.0003, sub(1.0, max(uv2.x, uv2.y)));

    const ratio = uAspect;
    const uv = vec2(uv0.x, uv0.y.mul(ratio));
    const mouse = uMouse.xy;
    const l = float(0.0).toVar();

    for (let i = 0; i < 20; i++) {
      const fi = float(i);
      const r1 = randFn(fi);
      const r2 = randFn(fi.mul(1.3));
      const denom = floor(add(5.0, fi.div(10.0))).mul(2.0);

      const px = mod(
        sub(
          add(mul(13.0, r1), mul(0.1, cos(r1.mul(uTime).add(r1)))),
          mouse.x.div(denom).mul(4.0),
        ),
        2.0,
      ).sub(1.0);

      const py = mod(
        sub(
          add(mul(13.0, r2), mul(0.1, sin(r2.mul(uTime).add(r2)))),
          mouse.y.div(denom).mul(4.0),
        ),
        2.0,
      ).sub(1.0);

      const p = vec2(px, py);
      const d = distance(uv, p);
      const term = pow(mul(rBase.div(d), add(sin(uTime.add(fi)), 1.0)), 1.5);
      l.assign(l.add(term));
    }

    const glow = vec3(1.0, 0.6, 0.0).mul(l);
    const col = base.xyz.add(glow);
    return vec4(col, uOpacity);
  })();

  material.userData.uTime = uTime;
  material.userData.uAspect = uAspect;
  material.userData.uMouse = uMouse;
  material.userData.uOpacity = uOpacity;

  return material;
}

/**
 * Fireflies on a dedicated transparent canvas above the room (like example2),
 * so the main post/GI pipeline stays untouched.
 */
export async function createFirefliesOverlay({ opacity = 0.75 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "intro-fireflies-canvas";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "15",
  });
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGPURenderer({
    canvas,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  await renderer.init();

  const material = createFirefliesMaterial();
  material.userData.uOpacity.value = opacity;

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  overlayScene.add(mesh);

  const pointer = { x: 0.5, y: 0.5 };
  const smoothed = { x: 0.5, y: 0.5 };
  let disposed = false;
  let fadeTween = null;
  let standaloneLoopId = 0;
  let standaloneLoopActive = false;
  const startTime = performance.now();

  function onPointerMove(event) {
    pointer.x = event.clientX / Math.max(1, window.innerWidth);
    pointer.y = 1 - event.clientY / Math.max(1, window.innerHeight);
  }

  function onResize() {
    if (disposed) {
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onResize);

  function update() {
    if (disposed || !mesh.visible) {
      return;
    }

    const elapsed = (performance.now() - startTime) * 0.001;
    material.userData.uTime.value = elapsed;
    material.userData.uAspect.value =
      window.innerHeight / Math.max(1e-6, window.innerWidth);

    smoothed.x += (pointer.x - smoothed.x) * 0.08;
    smoothed.y += (pointer.y - smoothed.y) * 0.08;
    material.userData.uMouse.value.set(smoothed.x, smoothed.y, 1.0);

    renderer.render(overlayScene, overlayCamera);
  }

  function isStandaloneActive() {
    return standaloneLoopActive;
  }

  function pauseStandaloneLoop() {
    standaloneLoopActive = false;

    if (standaloneLoopId) {
      cancelAnimationFrame(standaloneLoopId);
      standaloneLoopId = 0;
    }
  }

  function resumeStandaloneLoop() {
    if (disposed || standaloneLoopActive) {
      return;
    }

    startStandaloneLoop({ maxDpr: 0.85 });
  }

  function waitForFirstFrame() {
    if (disposed) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        update();
        resolve();
      });
    });
  }

  function startStandaloneLoop({ maxDpr = 0.85 } = {}) {
    if (disposed || standaloneLoopActive) {
      return;
    }

    standaloneLoopActive = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));

    const tick = () => {
      if (!standaloneLoopActive || disposed) {
        return;
      }

      standaloneLoopId = requestAnimationFrame(tick);
      update();
    };

    standaloneLoopId = requestAnimationFrame(tick);
  }

  function stopStandaloneLoop() {
    pauseStandaloneLoop();
  }

  function fadeOut({ duration = 2.0 } = {}) {
    return new Promise((resolve) => {
      if (disposed) {
        resolve();
        return;
      }

      fadeTween?.kill();
      const state = { opacity: 1 };
      fadeTween = gsap.to(state, {
        opacity: 0,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          canvas.style.opacity = String(state.opacity);
        },
        onComplete: () => {
          mesh.visible = false;
          canvas.style.opacity = "0";
          resolve();
        },
      });
    });
  }

  function setZIndex(zIndex) {
    if (disposed) {
      return;
    }

    canvas.style.zIndex = String(zIndex);
  }

  function destroy() {
    if (disposed) {
      return;
    }

    disposed = true;
    stopStandaloneLoop();
    fadeTween?.kill();
    fadeTween = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("resize", onResize);
    overlayScene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    mesh,
    update,
    isStandaloneActive,
    startStandaloneLoop,
    pauseStandaloneLoop,
    resumeStandaloneLoop,
    stopStandaloneLoop,
    waitForFirstFrame,
    setZIndex,
    fadeOut,
    destroy,
  };
}
