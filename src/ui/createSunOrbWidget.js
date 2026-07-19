import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import {
  getSunArcLocalPosition,
  SUN_ARC_MIN_HOUR,
  SUN_ARC_MAX_HOUR,
} from "../scene.js";

const DEFAULT_MIN_HOUR = SUN_ARC_MIN_HOUR;
const DEFAULT_MAX_HOUR = SUN_ARC_MAX_HOUR;
const MAX_DPR = 2;
const AZIMUTH_DEG_PER_PX = 0.5;
const DIORAMA_PATH = "/models/diorama2.glb";
const COMPASS_RADIUS = 0.75;
const DIORAMA_TARGET_SIZE = 0.55;
// World yaw of the diorama so its walls/windows match the loft vs sun.
// Combined with viewRoot (orbit yaw) so the mini loft faces the same way
// as the main camera. Tweak until morning light hits the same facade.
const DIORAMA_YAW_DEG = -55;
const SUN_RAY_COUNT = 8;
const SUN_RAY_SPIN_RAD_PER_SEC = 0.22;
const SUN_GLOW_PULSE_RAD_PER_SEC = 1.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createCompassTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
  ctx.lineWidth = 4;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const inner = i % 6 === 0 ? size * 0.4 : size * 0.43;
    const outer = size * 0.475;
    const cx = size * 0.5;
    const cy = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  const labels = [
    { text: "N", angle: -Math.PI * 0.5 },
    { text: "E", angle: 0 },
    { text: "S", angle: Math.PI * 0.5 },
    { text: "W", angle: Math.PI },
  ];

  for (const label of labels) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 40px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const radius = size * 0.43;
    const x = size * 0.5 + Math.cos(label.angle) * radius;
    const y = size * 0.5 + Math.sin(label.angle) * radius;
    ctx.fillText(label.text, x, y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  gradient.addColorStop(0, "rgba(255, 245, 220, 1)");
  gradient.addColorStop(0.35, "rgba(255, 210, 120, 0.55)");
  gradient.addColorStop(1, "rgba(255, 180, 80, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Flat sun-ray ring for a subtle drag-affordance billboard. */
function createSunRaysTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;
  const inner = size * 0.32;
  const outer = size * 0.4;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = size * 0.04;
  ctx.lineCap = "round";

  for (let i = 0; i < SUN_RAY_COUNT; i += 1) {
    const angle = (i / SUN_RAY_COUNT) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + cos * inner, cy + sin * inner);
    ctx.lineTo(cx + cos * outer, cy + sin * outer);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function fitObjectToSize(root, targetSize) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
  root.scale.multiplyScalar(targetSize / maxDim);
  root.updateMatrixWorld(true);

  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
}

function prepareDioramaMeshes(root, disposables) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;

    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];

    if (materials.length === 0) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.02,
      });
      disposables.push(child.material);
    } else {
      for (const mat of materials) {
        // glTF defaults metallicFactor to 1 when omitted — looks black without an env map
        if ("metalness" in mat) {
          mat.metalness = 0;
        }
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
        }
        mat.needsUpdate = true;
        disposables.push(mat);
      }
    }

    if (child.geometry) disposables.push(child.geometry);
  });
}

function loadDiorama(disposables) {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/libs/draco/");
  disposables.push(dracoLoader);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  return loader.loadAsync(DIORAMA_PATH).then((gltf) => {
    const root = gltf.scene;
    root.name = "diorama";
    fitObjectToSize(root, DIORAMA_TARGET_SIZE);
    prepareDioramaMeshes(root, disposables);
    return root;
  });
}

export function createSunOrbWidget({
  container,
  minHour = DEFAULT_MIN_HOUR,
  maxHour = DEFAULT_MAX_HOUR,
  initialHour = 17.5,
  initialAzimuth = 35,
  getOrbitYaw,
  getSunGlowColor,
  onHourChange,
  onAzimuthChange,
  onDragStart,
  onDragEnd,
} = {}) {
  if (!container) {
    throw new Error("createSunOrbWidget requires a container element.");
  }

  let hour = clamp(initialHour, minHour, maxHour);
  let azimuth = clamp(initialAzimuth, -180, 180);
  let viewYaw = 0;
  let active = false;
  let draggingSun = false;
  let draggingAzimuth = false;
  let lastPointerX = 0;
  let animRafId = null;
  let animStartMs = 0;
  let disposed = false;

  const canvas = document.createElement("canvas");
  canvas.className = "sun-orb-widget-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 1.15, 2.95);
  camera.lookAt(0, 0.15, 0);

  // --- Lighting (tweak intensity here) ---
  const hemiLight = new THREE.HemisphereLight(0xf2f6ff, 0x8a6a4a, 1.35);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff0cc, 8.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(512, 512);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 8;
  sunLight.shadow.camera.left = -2;
  sunLight.shadow.camera.right = 2;
  sunLight.shadow.camera.top = 2;
  sunLight.shadow.camera.bottom = -2;
  sunLight.shadow.bias = -0.002;
  sunLight.shadow.radius = 2;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const fillLight = new THREE.DirectionalLight(0xd8e4ff, 1.85);
  fillLight.position.set(-1.6, 1.1, 1.4);
  scene.add(fillLight);

  // viewRoot follows the main scene orbit yaw so the mini loft faces the
  // same way as the camera. Inside it: diorama stays world-aligned (plus
  // DIORAMA_YAW), compass + sun arc rotate with sun azimuth.
  const viewRoot = new THREE.Group();
  viewRoot.name = "viewRoot";
  scene.add(viewRoot);

  const dioramaRoot = new THREE.Group();
  dioramaRoot.name = "dioramaRoot";
  viewRoot.add(dioramaRoot);

  const modelSlot = new THREE.Group();
  modelSlot.name = "dioramaSlot";
  modelSlot.position.y = 0.0;
  modelSlot.rotation.y = THREE.MathUtils.degToRad(DIORAMA_YAW_DEG);
  dioramaRoot.add(modelSlot);

  const orientationRoot = new THREE.Group();
  orientationRoot.name = "orientationRoot";
  viewRoot.add(orientationRoot);

  const compassTexture = createCompassTexture();
  const compassShadowMat = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.42,
  });
  const compassDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(
      COMPASS_RADIUS,
      COMPASS_RADIUS + 0.02,
      0.024,
      64,
    ),
    compassShadowMat,
  );
  compassDisc.position.y = 0;
  compassDisc.receiveShadow = true;
  compassDisc.castShadow = false;
  orientationRoot.add(compassDisc);

  const compassLabels = new THREE.Mesh(
    new THREE.CircleGeometry(COMPASS_RADIUS * 0.98, 64),
    new THREE.MeshBasicMaterial({
      map: compassTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  compassLabels.rotation.x = -Math.PI * 0.5;
  compassLabels.position.y = 0.014;
  compassLabels.receiveShadow = false;
  compassLabels.castShadow = false;
  orientationRoot.add(compassLabels);

  const sunRoot = new THREE.Group();
  sunRoot.name = "sunRoot";
  orientationRoot.add(sunRoot);

  const arcRadius = COMPASS_RADIUS * 0.92;
  const arcLift = 0.02;
  const arcDotGeo = new THREE.SphereGeometry(0.014, 8, 8);
  const arcDotMat = new THREE.MeshBasicMaterial({
    color: 0xffe08a,
    transparent: true,
    opacity: 0.55,
  });

  function getSunPositionFromHour(nextHour) {
    const local = getSunArcLocalPosition(nextHour, arcRadius);
    return new THREE.Vector3(local.x, local.y + arcLift, local.z);
  }

  for (let i = 0; i <= 17; i += 1) {
    const t = i / 17;
    const arcHour = minHour + t * (maxHour - minHour);
    const dot = new THREE.Mesh(arcDotGeo, arcDotMat);
    dot.position.copy(getSunPositionFromHour(arcHour));
    sunRoot.add(dot);
  }

  const glowTexture = createGlowTexture();
  const sunRaysTexture = createSunRaysTexture();
  const sunColor = new THREE.Color(0xffe08a);
  const sunMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a,
    emissive: 0xffc96a,
    emissiveIntensity: 1.35,
    roughness: 0.35,
    metalness: 0,
  });
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 18, 18),
    sunMat,
  );
  sunRoot.add(sunMesh);

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sunGlow.scale.set(0.34, 0.34, 1);
  sunRoot.add(sunGlow);

  const sunRays = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunRaysTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
    }),
  );
  sunRays.scale.set(0.26, 0.26, 1);
  sunRoot.add(sunRays);

  const sunHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  sunHit.name = "sunHit";
  sunRoot.add(sunHit);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const arcPlane = new THREE.Plane();
  const arcPlaneHit = new THREE.Vector3();
  const arcPlaneNormal = new THREE.Vector3();
  const worldSunPos = new THREE.Vector3();
  const localArcPoint = new THREE.Vector3();
  const arcPlanePoint = new THREE.Vector3();

  const disposables = [
    compassTexture,
    glowTexture,
    sunRaysTexture,
    arcDotGeo,
    arcDotMat,
    sunMat,
    sunMesh.geometry,
    sunHit.geometry,
    sunHit.material,
    sunGlow.material,
    sunRays.material,
    compassDisc.geometry,
    compassShadowMat,
    compassLabels.geometry,
    compassLabels.material,
  ];

  loadDiorama(disposables)
    .then((diorama) => {
      if (disposed) return;
      modelSlot.clear();
      modelSlot.add(diorama);
      if (active) {
        resize();
        renderFrame();
      }
    })
    .catch((error) => {
      console.error("[sunOrbWidget] Failed to load diorama:", error);
    });

  function updateSunVisuals() {
    const position = getSunPositionFromHour(hour);
    sunMesh.position.copy(position);
    sunGlow.position.copy(position);
    sunRays.position.copy(position);
    sunHit.position.copy(position);

    const glowHex = getSunGlowColor?.(hour) ?? "#ffc07a";
    sunColor.set(glowHex);
    sunMat.color.copy(sunColor);
    sunMat.emissive.copy(sunColor);
    sunGlow.material.color.copy(sunColor);

    orientationRoot.updateMatrixWorld(true);
    sunMesh.getWorldPosition(worldSunPos);
    sunLight.position.copy(worldSunPos).multiplyScalar(2.6);
    sunLight.target.position.set(0, 0.2, 0);
    sunLight.target.updateMatrixWorld();
  }

  function updateSunHintAnimation(timeSec) {
    sunRays.material.rotation = timeSec * SUN_RAY_SPIN_RAD_PER_SEC;

    const pulse = 0.5 + 0.5 * Math.sin(timeSec * SUN_GLOW_PULSE_RAD_PER_SEC);
    const glowScale = 0.32 + pulse * 0.07;
    sunGlow.scale.set(glowScale, glowScale, 1);
    sunGlow.material.opacity = 0.72 + pulse * 0.24;
    sunMat.emissiveIntensity = 1.15 + pulse * 0.4;

    const rayPulse = 0.38 + pulse * 0.1;
    sunRays.material.opacity = draggingSun ? 0.2 : rayPulse;
    const rayScale = draggingSun ? 0.24 : 0.26 + pulse * 0.012;
    sunRays.scale.set(rayScale, rayScale, 1);
  }

  function updateAzimuthVisuals() {
    // Negate so widget XZ matches main scene: (cos(az), sin(az))
    orientationRoot.rotation.y = -THREE.MathUtils.degToRad(azimuth);
  }

  function updateViewYawVisuals() {
    // Widget camera looks from +Z (theta ≈ 0). Rotate content by -yaw so the
    // loft faces the same way as in the main OrbitControls view.
    viewRoot.rotation.y = -viewYaw;
  }

  function pullOrbitYaw() {
    if (typeof getOrbitYaw !== "function") return false;
    const yaw = getOrbitYaw();
    if (typeof yaw !== "number" || !Number.isFinite(yaw)) return false;
    if (Math.abs(yaw - viewYaw) < 1e-4) return false;
    viewYaw = yaw;
    updateViewYawVisuals();
    return true;
  }

  function stopAnimLoop() {
    if (animRafId !== null) {
      cancelAnimationFrame(animRafId);
      animRafId = null;
    }
  }

  function startAnimLoop() {
    stopAnimLoop();
    animStartMs = performance.now();

    const tick = () => {
      if (!active || disposed) {
        animRafId = null;
        return;
      }

      if (pullOrbitYaw()) {
        updateSunVisuals();
      }

      const timeSec = (performance.now() - animStartMs) * 0.001;
      updateSunHintAnimation(timeSec);
      renderFrame();
      animRafId = requestAnimationFrame(tick);
    };
    animRafId = requestAnimationFrame(tick);
  }

  function setHourFromPointer(clientX, clientY) {
    setPointerNdc(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);

    // Arc lives in orientationRoot local XY (z = 0); pick against that plane
    arcPlaneNormal.set(0, 0, 1).transformDirection(orientationRoot.matrixWorld);
    arcPlanePoint.set(0, arcLift, 0).applyMatrix4(orientationRoot.matrixWorld);
    arcPlane.setFromNormalAndCoplanarPoint(arcPlaneNormal, arcPlanePoint);

    if (!raycaster.ray.intersectPlane(arcPlane, arcPlaneHit)) return;

    localArcPoint.copy(arcPlaneHit);
    orientationRoot.worldToLocal(localArcPoint);

    const dx = localArcPoint.x;
    const dy = localArcPoint.y - arcLift;

    let theta;
    if (dy <= 0) {
      theta = dx > 0 ? Math.PI : 0;
    } else {
      // Inverse of x = -cos(theta)*r
      theta = clamp(Math.atan2(dy, -dx), 0, Math.PI);
    }

    const normalized = 1 - theta / Math.PI;
    hour = minHour + normalized * (maxHour - minHour);
    updateSunVisuals();
    onHourChange?.(hour);
  }

  function setPointerNdc(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  }

  function isPointerOverSun(clientX, clientY) {
    setPointerNdc(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(sunHit, false);
    return hits.length > 0;
  }

  function renderFrame() {
    if (!active || disposed) return;
    renderer.render(scene, camera);
  }

  function resize() {
    if (disposed) return;
    const width = Math.max(
      1,
      container.clientWidth || container.offsetWidth || 248,
    );
    const height = Math.max(
      1,
      container.clientHeight || container.offsetHeight || 240,
    );
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (active) {
      renderFrame();
    }
  }

  function setState(nextState = {}, { render = true } = {}) {
    if (disposed) return;

    if (typeof nextState.hour === "number") {
      hour = clamp(nextState.hour, minHour, maxHour);
    }
    if (typeof nextState.azimuth === "number") {
      azimuth = clamp(nextState.azimuth, -180, 180);
    }

    pullOrbitYaw();
    updateAzimuthVisuals();
    updateSunVisuals();
    if (render && active) {
      renderFrame();
    }
  }

  function setActive(nextActive) {
    active = Boolean(nextActive);
    if (!active) {
      stopAnimLoop();
      draggingSun = false;
      draggingAzimuth = false;
      canvas.style.cursor = "";
      return;
    }
    // Wait a frame so layout is ready after leaving compact (display:none)
    requestAnimationFrame(() => {
      if (!active || disposed) return;
      resize();
      pullOrbitYaw();
      updateAzimuthVisuals();
      updateSunVisuals();
      updateSunHintAnimation(0);
      renderFrame();
      startAnimLoop();
    });
  }

  function onPointerDown(event) {
    if (!active || disposed) return;
    event.preventDefault();
    event.stopPropagation();

    lastPointerX = event.clientX;
    if (isPointerOverSun(event.clientX, event.clientY)) {
      draggingSun = true;
      canvas.style.cursor = "grabbing";
    } else {
      draggingAzimuth = true;
      canvas.style.cursor = "ew-resize";
    }

    onDragStart?.();
    if (draggingSun) {
      setHourFromPointer(event.clientX, event.clientY);
    }
  }

  function onPointerMove(event) {
    if (!active || disposed) return;

    if (draggingSun) {
      setHourFromPointer(event.clientX, event.clientY);
      return;
    }

    if (draggingAzimuth) {
      const deltaX = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      azimuth = clamp(azimuth + deltaX * AZIMUTH_DEG_PER_PX, -180, 180);
      updateAzimuthVisuals();
      updateSunVisuals();
      onAzimuthChange?.(azimuth);
      return;
    }

    canvas.style.cursor = isPointerOverSun(event.clientX, event.clientY)
      ? "grab"
      : "ew-resize";
  }

  function onPointerUp() {
    if (!draggingSun && !draggingAzimuth) return;
    draggingSun = false;
    draggingAzimuth = false;
    canvas.style.cursor = "";
    onDragEnd?.();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  const resizeObserver = new ResizeObserver(() => {
    if (active) resize();
  });
  resizeObserver.observe(container);

  pullOrbitYaw();
  updateViewYawVisuals();
  updateAzimuthVisuals();
  updateSunVisuals();

  return {
    canvas,
    setState,
    setActive,
    syncOrbitView() {
      if (disposed) return;
      if (!pullOrbitYaw()) return;
      updateSunVisuals();
      if (active) renderFrame();
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      setActive(false);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      for (const item of disposables) {
        item?.dispose?.();
      }
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    },
  };
}
