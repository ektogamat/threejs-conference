import * as THREE from "three/webgpu";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWalkControls } from "../controls/createWalkControls.js";
import {
    FREE_CAMERA_START,
    cameraParams,
    getBaseFovForLayout,
} from "../bootstrap/createCamera.js";

const WALK_FOCUS_DISTANCE = 12;

function isCameraModeInputBlocked(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function createCameraDirector({
  camera,
  renderer,
  world,
  getFinishedIntro,
  onWalkModeChange,
}) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...FREE_CAMERA_START.target);
  controls.enablePan = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.1;
  controls.maxDistance = Infinity;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.update();

  const focusPoint = controls.target.clone();
  const walkFocusDirection = new THREE.Vector3();
  const dofRaycaster = new THREE.Raycaster();
  const dofPointerCoords = new THREE.Vector2();
  const orbitLookTarget = new THREE.Vector3();
  const cameraModeState = { orbitEnabled: false };
  let focusTween = null;
  let walkControls = null;
  let footstepAudio = null;

  function focusOnPoint(point) {
    focusTween?.kill();
    focusTween = gsap.to(focusPoint, {
      x: point.x,
      y: point.y,
      z: point.z,
      duration: 0.5,
      ease: "power2.inOut",
    });
  }

  function setWalkFocusPoint() {
    camera.getWorldDirection(walkFocusDirection);
    focusPoint
      .copy(camera.position)
      .addScaledVector(walkFocusDirection, WALK_FOCUS_DISTANCE);
  }

  function syncWalkFocusPoint() {
    focusTween?.kill();
    focusTween = null;
    setWalkFocusPoint();
  }

  function onDofPointerDown(event) {
    if (
      !getFinishedIntro?.() ||
      walkControls?.isActive() ||
      isCameraModeInputBlocked(event.target)
    ) {
      return;
    }

    dofPointerCoords.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );

    dofRaycaster.setFromCamera(dofPointerCoords, camera);
    dofRaycaster.firstHitOnly = true;

    const focusTargets = world.focusTargets ?? [];
    for (const target of focusTargets) {
      const intersects = dofRaycaster.intersectObject(target, true);
      if (intersects.length > 0) {
        focusOnPoint(intersects[0].point);
        break;
      }
    }
  }

  renderer.domElement.addEventListener("pointerdown", onDofPointerDown);

  if (world.ground && (world.city || world.colliders?.length)) {
    walkControls = createWalkControls({
      camera,
      domElement: renderer.domElement,
      model: world.city,
      colliders: world.colliders,
      ground: world.ground?.mesh ?? null,
      baseFov: getBaseFovForLayout(),
      settings: {
        moveSpeed: 3,
        sprintMultiplier: 3,
        eyeHeight: cameraParams.walkEyeHeight,
        acceleration: cameraParams.walkAcceleration,
        deceleration: cameraParams.walkDeceleration,
        walkFovBoost: cameraParams.walkFovBoost,
        sprintFovBoost: cameraParams.sprintFovBoost,
        walkFovBlendSpeed: cameraParams.walkFovBlendSpeed,
        sprintFovBlendSpeed: cameraParams.sprintFovBlendSpeed,
        playerRadius: 0.55,
      },
    });
  }

  function setCameraMode(mode) {
    const walk = mode === "walk";
    cameraModeState.orbitEnabled = !walk;
    walkControls?.setActive(walk);
    controls.enabled = !walk && getFinishedIntro?.();
    onWalkModeChange?.(walk);

    if (walk) {
      walkControls?.setBaseFov(getBaseFovForLayout());
      walkControls?.syncEulerFromCamera();
      // Snap happens inside setActive when entering walk. Do not snap again
      // here — a second raycast at revealAppUi was causing a visible pop.
      syncWalkFocusPoint();
    } else {
      camera.getWorldDirection(orbitLookTarget);
      controls.target
        .copy(camera.position)
        .add(orbitLookTarget.multiplyScalar(WALK_FOCUS_DISTANCE));
      controls.update();
    }
  }

  function resetCameraPose() {
    camera.position.set(...FREE_CAMERA_START.position);
    controls.target.set(...FREE_CAMERA_START.target);
    controls.update();
    setCameraMode("walk");
    walkControls?.snapCameraToGround();
    syncWalkFocusPoint();
  }

  function preparePreRevealPose() {
    camera.position.set(...FREE_CAMERA_START.position);
    controls.target.set(...FREE_CAMERA_START.target);
    controls.enabled = false;
    controls.update();

    // Activate walk now so the intro view already matches the post-ENTER
    // pose. Movement stays gated in update() until getFinishedIntro().
    cameraModeState.orbitEnabled = false;
    walkControls?.setActive(true);
    walkControls?.setBaseFov(getBaseFovForLayout());
    walkControls?.syncEulerFromCamera();
    syncWalkFocusPoint();
  }

  function update(delta) {
    if (walkControls?.isActive()) {
      // Keep the camera frozen during the title/glass sequence — walk is
      // active only so the pose matches revealAppUi without a late snap.
      if (getFinishedIntro?.()) {
        walkControls.update(delta);
        footstepAudio?.update?.(delta, {
          moving: walkControls.isMoving(),
          speed: walkControls.getHorizontalSpeed?.() ?? 0,
        });
      }
      setWalkFocusPoint();
    } else if (controls.enabled) {
      controls.update();
    }
  }

  function destroy() {
    renderer.domElement.removeEventListener("pointerdown", onDofPointerDown);
    focusTween?.kill();
  }

  function setFootstepAudio(audio) {
    footstepAudio = audio;
  }

  return {
    controls,
    walkControls,
    focusPoint,
    cameraModeState,
    setFootstepAudio,
    setCameraMode,
    syncWalkFocusPoint,
    resetCameraPose,
    preparePreRevealPose,
    update,
    destroy,
  };
}
