import * as THREE from "three/webgpu";
import { isMobileLayout } from "../platform/deviceLayout.js";

export const DESKTOP_FOV = 65;
export const MOBILE_FOV = 100;

export const cameraParams = {
  fovDesktop: DESKTOP_FOV,
  fovMobile: MOBILE_FOV,
  walkEyeHeight: 1.55,
  walkAcceleration: 6,
  walkDeceleration: 10,
  walkFovBoost: 5,
  sprintFovBoost: 15,
  walkFovBlendSpeed: 2,
  sprintFovBlendSpeed: 0.5,
};

// Y is eye height above the flat ground (createGround default y = -5.5).
export const FREE_CAMERA_START = {
  position: [-138.564, -3.95, 34.181],
  target: [-120, -3, 30],
};

export function getBaseFovForLayout() {
  return isMobileLayout() ? cameraParams.fovMobile : cameraParams.fovDesktop;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    DESKTOP_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );
  camera.position.set(...FREE_CAMERA_START.position);
  camera.fov = getBaseFovForLayout();
  camera.updateProjectionMatrix();

  return camera;
}

export function createCameraLayoutSync({ camera, getWalkControls }) {
  function applyCameraFovForLayout() {
    if (!camera) {
      return;
    }

    const baseFov = getBaseFovForLayout();
    const walkControls = getWalkControls?.();

    if (walkControls?.isActive()) {
      walkControls.setBaseFov(baseFov);
    } else {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    }
  }

  function syncWalkEyeHeight() {
    const walkControls = getWalkControls?.();
    if (!walkControls) {
      return;
    }

    walkControls.setEyeHeight(cameraParams.walkEyeHeight);
  }

  function onWindowResizeAspect() {
    camera.aspect = window.innerWidth / window.innerHeight;
    applyCameraFovForLayout();
  }

  return {
    applyCameraFovForLayout,
    syncWalkEyeHeight,
    onWindowResizeAspect,
  };
}
