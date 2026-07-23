import * as THREE from "three/webgpu";
import { Inspector } from "three/addons/inspector/Inspector.js";
import { performanceProfile } from "../platform/performanceProfile.js";
import { clearInspectorLayout } from "../debug/inspectorControls.js";

async function getWebGPULimits() {
  if (!navigator.gpu) {
    return {};
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
    featureLevel: "compatibility",
  });
  if (!adapter) {
    return {};
  }

  const desired = 64;
  const supported = adapter.limits.maxColorAttachmentBytesPerSample;
  if (supported >= desired) {
    return { maxColorAttachmentBytesPerSample: desired };
  }
  if (supported > 32) {
    return { maxColorAttachmentBytesPerSample: supported };
  }
  return {};
}

export async function createRenderer() {
  const requiredLimits = await getWebGPULimits();

  const renderer = new THREE.WebGPURenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    requiredLimits,
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, performanceProfile.maxPixelRatio),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  clearInspectorLayout();

  const inspector = new Inspector();
  renderer.inspector = inspector;

  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.zIndex = "14";
  renderer.domElement.style.transition = "opacity 220ms ease";
  document.body.appendChild(renderer.domElement);

  await renderer.init();

  if (import.meta.env.DEV) {
    const backend = renderer.backend.isWebGLBackend
      ? "WebGL2 (fallback)"
      : "WebGPU";
    console.info(`[renderer] ${backend}`);
  }

  return { renderer, inspector };
}

export function createShadowUpdater({ renderer, getSunLight }) {
  function requestShadowMapUpdate() {
    const sunLight = getSunLight?.();
    if (!sunLight || !renderer) {
      return;
    }

    sunLight.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }

  return { requestShadowMapUpdate };
}

export function resizeRenderer(renderer, pipeline) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, performanceProfile.maxPixelRatio),
  );
  renderer.setSize(width, height);
  pipeline?.resizePostProcessing?.(width, height);
}
