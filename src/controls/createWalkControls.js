import * as THREE from "three/webgpu";
import { isCoarsePointerDevice } from "../platform/deviceLayout.js";

const DEFAULTS = {
  moveSpeed: 3,
  sprintMultiplier: 1.8,
  mouseSensitivity: 0.002,
  eyeHeight: 1.55,
  acceleration: 10,
  deceleration: 14,
  /** How quickly walk speed ramps into sprint. */
  sprintRampUp: 1.6,
  /** How quickly sprint speed eases back to walk. */
  sprintRampDown: 2.2,
  walkFovBoost: 3,
  sprintFovBoost: 8,
  walkFovBlendSpeed: 2,
  sprintFovBlendSpeed: 2.5,
  /** Horizontal clearance around the camera (cylinder radius). */
  playerRadius: 0.55,
  /** Max climb per step (curbs / stairs). Higher surfaces are ignored. */
  maxStepUp: 0.4,
  /** Max fall per frame while walking (slopes / small drops). */
  maxStepDown: 1.75,
  groundProbeHeight: 200,
  groundProbeDistance: 400,
  /** Extra padding beyond playerRadius for wall raycasts. */
  wallProbeDistance: 0.08,
};

const MOVE_EPSILON = 0.01;
const SPRINT_SPEED_THRESHOLD = 0.5;
const MOVE_AXIS_DEADZONE = 0.12;

const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

function isEditableTarget(target) {
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

function expLerpFactor(delta, speed) {
  return 1 - Math.exp(-delta * speed);
}

export function createWalkControls({
  camera,
  domElement,
  model,
  colliders = null,
  ground,
  baseFov = 85,
  settings: settingsOverrides = {},
  onLookChange,
} = {}) {
  const settings = { ...DEFAULTS, ...settingsOverrides };

  const collisionRoots =
    colliders?.length > 0 ? colliders : model ? [model] : [];

  // Ground probes collect every hit (roofs vs floors). Keep dense props
  // like the car out of this list — use a box collider for walls only.
  const walkTargets = [];
  if (model) {
    walkTargets.push(model);
  }
  if (ground) {
    walkTargets.push(ground);
  }

  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const moveInput = new THREE.Vector2();
  const moveDirection = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  const currentVelocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const probeOrigin = new THREE.Vector3();
  const probeDirection = new THREE.Vector3();
  const probeSide = new THREE.Vector3();
  const nextPosition = new THREE.Vector3();
  const axisProbe = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  // Lateral offsets as fractions of playerRadius (center + left + right).
  const WALL_LATERAL_OFFSETS = [0, -0.85, 0.85];

  let active = false;
  let pointerLocked = false;
  let moving = false;
  let hasTouchLooked = false;
  let currentBaseFov = baseFov;
  let currentSpeed = settings.moveSpeed;

  const externalMoveAxes = new THREE.Vector2();
  const touchLookPointers = new Map();

  const listeners = new Set();

  function isControlEngaged() {
    if (!active) {
      return false;
    }

    if (isCoarsePointerDevice()) {
      return true;
    }

    return pointerLocked;
  }

  function notifyChange() {
    for (const listener of listeners) {
      listener({
        active,
        pointerLocked,
        moving,
        hasTouchLooked,
      });
    }
  }

  function syncEulerFromCamera() {
    euler.setFromQuaternion(camera.quaternion, "YXZ");
  }

  function applyEulerToCamera() {
    camera.quaternion.setFromEuler(euler);
  }

  function restoreBaseFov() {
    camera.fov = currentBaseFov;
    camera.updateProjectionMatrix();
  }

  function setBaseFov(value) {
    currentBaseFov = value;
    if (!active) {
      restoreBaseFov();
    }
  }

  function updateDynamicFov(delta) {
    if (!isControlEngaged()) {
      return;
    }

    const speed = currentVelocity.length();
    const isMoving = speed > SPRINT_SPEED_THRESHOLD;
    const walkSpeed = settings.moveSpeed;
    const sprintSpeed = settings.moveSpeed * settings.sprintMultiplier;
    const sprintSpan = Math.max(sprintSpeed - walkSpeed, 1e-6);
    const sprintT = THREE.MathUtils.clamp(
      (currentSpeed - walkSpeed) / sprintSpan,
      0,
      1,
    );

    let targetFov = currentBaseFov;
    let blendSpeed = settings.walkFovBlendSpeed;

    if (isMoving) {
      targetFov =
        currentBaseFov +
        THREE.MathUtils.lerp(
          settings.walkFovBoost,
          settings.sprintFovBoost,
          sprintT,
        );
      blendSpeed = THREE.MathUtils.lerp(
        settings.walkFovBlendSpeed,
        settings.sprintFovBlendSpeed,
        sprintT,
      );
    }

    const blend = expLerpFactor(delta, blendSpeed);
    const nextFov = camera.fov + (targetFov - camera.fov) * blend;

    if (Math.abs(nextFov - camera.fov) > 0.001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  function collectGroundHits(x, z, referenceY) {
    if (walkTargets.length === 0) {
      return [];
    }

    probeOrigin.set(x, referenceY + settings.groundProbeHeight, z);
    probeDirection.set(0, -1, 0);
    raycaster.set(probeOrigin, probeDirection);
    raycaster.far = settings.groundProbeDistance;
    // Need every hit (roofs vs walkable floors); BVH still makes this cheap.
    raycaster.firstHitOnly = false;

    return raycaster.intersectObjects(walkTargets, true);
  }

  function pickWalkableGroundY(hits, feetY, { allowLongDrop = false } = {}) {
    if (hits.length === 0) {
      return feetY;
    }

    const maxStepUp = settings.maxStepUp;
    const maxStepDown = allowLongDrop
      ? settings.groundProbeDistance
      : settings.maxStepDown;

    let bestY = null;
    let bestDistance = Infinity;

    for (const hit of hits) {
      const y = hit.point.y;
      if (y > feetY + maxStepUp) {
        continue;
      }
      if (y < feetY - maxStepDown) {
        continue;
      }

      const distance = Math.abs(y - feetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestY = y;
      }
    }

    if (bestY !== null) {
      return bestY;
    }

    if (allowLongDrop) {
      let lowestValidY = null;

      for (const hit of hits) {
        const y = hit.point.y;
        if (y > feetY + maxStepUp) {
          continue;
        }

        if (lowestValidY === null || y > lowestValidY) {
          lowestValidY = y;
        }
      }

      if (lowestValidY !== null) {
        return lowestValidY;
      }
    }

    return feetY;
  }

  function sampleGroundY(x, z, referenceY, { allowLongDrop = false } = {}) {
    const feetY = referenceY - settings.eyeHeight;
    const hits = collectGroundHits(x, z, referenceY);
    return pickWalkableGroundY(hits, feetY, { allowLongDrop });
  }

  function snapCameraToGround({ allowLongDrop = false } = {}) {
    const groundY = sampleGroundY(
      camera.position.x,
      camera.position.z,
      camera.position.y,
      { allowLongDrop },
    );
    camera.position.y = groundY + settings.eyeHeight;
  }

  /**
   * Cheap capsule-ish wall test: 3 BVH first-hit rays (center + lateral)
   * at chest height, blocked within moveDistance + playerRadius.
   * Chest (not eyes) so low props like the car still register.
   */
  function hitsWall(from, moveDir, moveDistance) {
    const radius = settings.playerRadius;
    const blockDistance = moveDistance + radius;
    const far = blockDistance + settings.wallProbeDistance;
    const chestY = from.y - settings.eyeHeight * 0.35;

    probeSide.set(-moveDir.z, 0, moveDir.x);
    if (probeSide.lengthSq() < 1e-8) {
      probeSide.set(1, 0, 0);
    } else {
      probeSide.normalize();
    }

    raycaster.firstHitOnly = true;

    for (let i = 0; i < WALL_LATERAL_OFFSETS.length; i++) {
      probeOrigin.copy(from);
      probeOrigin.y = chestY;
      probeOrigin.addScaledVector(probeSide, WALL_LATERAL_OFFSETS[i] * radius);

      raycaster.set(probeOrigin, moveDir);
      raycaster.far = far;

      const hits = raycaster.intersectObjects(collisionRoots, true);
      if (hits.length > 0 && hits[0].distance < blockDistance) {
        return true;
      }
    }

    return false;
  }

  function canMoveTo(from, to) {
    if (collisionRoots.length === 0) {
      return true;
    }

    probeDirection.subVectors(to, from);
    const distance = probeDirection.length();
    if (distance < 1e-5) {
      return true;
    }

    probeDirection.multiplyScalar(1 / distance);

    if (hitsWall(from, probeDirection, distance)) {
      return false;
    }

    const currentFeetY = from.y - settings.eyeHeight;
    const nextGroundY = sampleGroundY(to.x, to.z, from.y);
    if (nextGroundY > currentFeetY + settings.maxStepUp) {
      return false;
    }

    return true;
  }

  function applyVelocityMovement(delta) {
    if (currentVelocity.lengthSq() <= MOVE_EPSILON * MOVE_EPSILON) {
      return;
    }

    nextPosition.copy(camera.position);
    nextPosition.addScaledVector(currentVelocity, delta);

    if (canMoveTo(camera.position, nextPosition)) {
      camera.position.x = nextPosition.x;
      camera.position.z = nextPosition.z;
      return;
    }

    axisProbe.copy(camera.position);

    if (Math.abs(currentVelocity.x) > MOVE_EPSILON) {
      nextPosition.copy(camera.position);
      nextPosition.x += currentVelocity.x * delta;

      if (canMoveTo(camera.position, nextPosition)) {
        camera.position.x = nextPosition.x;
        axisProbe.x = camera.position.x;
      } else {
        currentVelocity.x = 0;
      }
    }

    if (Math.abs(currentVelocity.z) > MOVE_EPSILON) {
      nextPosition.copy(axisProbe);
      nextPosition.z += currentVelocity.z * delta;

      if (canMoveTo(axisProbe, nextPosition)) {
        camera.position.z = nextPosition.z;
      } else {
        currentVelocity.z = 0;
      }
    }
  }

  function isSprintKey(event) {
    return (
      event.key === "Shift" ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight"
    );
  }

  function syncSprintFromEvent(event) {
    if (typeof event.shiftKey === "boolean") {
      keys.sprint = event.shiftKey;
    }
  }

  function onKeyDown(event) {
    if (!active || isEditableTarget(event.target)) {
      return;
    }

    syncSprintFromEvent(event);

    if (isSprintKey(event)) {
      keys.sprint = true;
      return;
    }

    const action = KEY_MAP[event.code];
    if (action) {
      keys[action] = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    syncSprintFromEvent(event);

    if (isSprintKey(event)) {
      keys.sprint = false;
      return;
    }

    const action = KEY_MAP[event.code];
    if (action) {
      keys[action] = false;
    }
  }

  function applyLookDelta(deltaX, deltaY) {
    if (!active) {
      return;
    }

    euler.y -= deltaX * settings.mouseSensitivity;
    euler.x -= deltaY * settings.mouseSensitivity;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    applyEulerToCamera();
    onLookChange?.();
  }

  function onMouseMove(event) {
    if (!active || !pointerLocked || isCoarsePointerDevice()) {
      return;
    }

    // Keep sprint in sync while pointer-locked (modifier keyup can be missed).
    syncSprintFromEvent(event);

    applyLookDelta(event.movementX, event.movementY);
  }

  function shouldIgnoreTouchLookTarget(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("[data-ui-block-look]"));
  }

  function onCanvasPointerDown(event) {
    if (!active || !isCoarsePointerDevice() || event.pointerType === "mouse") {
      return;
    }

    if (event.target !== domElement || shouldIgnoreTouchLookTarget(event)) {
      return;
    }

    touchLookPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    domElement.setPointerCapture?.(event.pointerId);
  }

  function onCanvasPointerMove(event) {
    if (!active || !isCoarsePointerDevice()) {
      return;
    }

    const previous = touchLookPointers.get(event.pointerId);
    if (!previous) {
      return;
    }

    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    previous.x = event.clientX;
    previous.y = event.clientY;

    if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) {
      return;
    }

    applyLookDelta(deltaX, deltaY);

    if (!hasTouchLooked) {
      hasTouchLooked = true;
      notifyChange();
    }
  }

  function onCanvasPointerUp(event) {
    touchLookPointers.delete(event.pointerId);

    if (domElement.hasPointerCapture?.(event.pointerId)) {
      domElement.releasePointerCapture?.(event.pointerId);
    }
  }

  function setMoveAxes(x, y) {
    externalMoveAxes.set(x, y);
  }

  function buildMoveInput() {
    moveInput.set(0, 0);

    if (
      externalMoveAxes.lengthSq() >
      MOVE_AXIS_DEADZONE * MOVE_AXIS_DEADZONE
    ) {
      moveInput.copy(externalMoveAxes);
      if (moveInput.lengthSq() > 1) {
        moveInput.normalize();
      }
      return;
    }

    if (keys.forward) {
      moveInput.y -= 1;
    }
    if (keys.backward) {
      moveInput.y += 1;
    }
    if (keys.left) {
      moveInput.x -= 1;
    }
    if (keys.right) {
      moveInput.x += 1;
    }

    if (moveInput.lengthSq() > 0) {
      moveInput.normalize();
    }
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === domElement;
    notifyChange();
  }

  function onCanvasClick(event) {
    if (!active || pointerLocked || event.button !== 0 || isCoarsePointerDevice()) {
      return;
    }

    if (event.target !== domElement) {
      return;
    }

    domElement.requestPointerLock?.();
  }

  function bind() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    domElement.addEventListener("click", onCanvasClick);
    domElement.addEventListener("pointerdown", onCanvasPointerDown);
    domElement.addEventListener("pointermove", onCanvasPointerMove);
    domElement.addEventListener("pointerup", onCanvasPointerUp);
    domElement.addEventListener("pointercancel", onCanvasPointerUp);
  }

  function unbind() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    domElement.removeEventListener("click", onCanvasClick);
    domElement.removeEventListener("pointerdown", onCanvasPointerDown);
    domElement.removeEventListener("pointermove", onCanvasPointerMove);
    domElement.removeEventListener("pointerup", onCanvasPointerUp);
    domElement.removeEventListener("pointercancel", onCanvasPointerUp);
  }

  bind();

  function setActive(nextActive) {
    if (active === nextActive) {
      return;
    }

    active = nextActive;

    if (!active) {
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock?.();
      }
      for (const key of Object.keys(keys)) {
        keys[key] = false;
      }
      externalMoveAxes.set(0, 0);
      touchLookPointers.clear();
      hasTouchLooked = false;
      currentVelocity.set(0, 0, 0);
      currentSpeed = settings.moveSpeed;
      moving = false;
      restoreBaseFov();
    } else {
      syncEulerFromCamera();
      currentVelocity.set(0, 0, 0);
      currentSpeed = settings.moveSpeed;
      camera.fov = currentBaseFov;
      camera.updateProjectionMatrix();
      snapCameraToGround({ allowLongDrop: true });
    }

    notifyChange();
  }

  function update(delta) {
    if (!active || delta <= 0) {
      moving = false;
      return false;
    }

    if (!isControlEngaged()) {
      // No continuous ground probes until the player engages controls —
      // city meshes make even BVH snaps wasteful while idle on the hint.
      externalMoveAxes.set(0, 0);
      currentVelocity.set(0, 0, 0);
      currentSpeed = settings.moveSpeed;
      restoreBaseFov();
      if (moving) {
        moving = false;
        notifyChange();
      }
      return false;
    }

    buildMoveInput();

    const wantsMove = moveInput.lengthSq() > 0;

    if (wantsMove) {
      moveInput.normalize();

      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) {
        forward.set(0, 0, -1);
      } else {
        forward.normalize();
      }

      side.crossVectors(forward, camera.up).normalize();

      moveDirection.set(0, 0, 0);
      moveDirection.addScaledVector(forward, -moveInput.y);
      moveDirection.addScaledVector(side, moveInput.x);

      if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
      }
    }

    const targetSpeed =
      wantsMove && keys.sprint
        ? settings.moveSpeed * settings.sprintMultiplier
        : settings.moveSpeed;
    const sprintRamp =
      targetSpeed > currentSpeed
        ? settings.sprintRampUp
        : settings.sprintRampDown;
    currentSpeed +=
      (targetSpeed - currentSpeed) * expLerpFactor(delta, sprintRamp);

    if (wantsMove) {
      desiredVelocity.copy(moveDirection).multiplyScalar(currentSpeed);
    } else {
      desiredVelocity.set(0, 0, 0);
    }

    const responsiveness =
      desiredVelocity.lengthSq() > 0
        ? settings.acceleration
        : settings.deceleration;
    const blend = expLerpFactor(delta, responsiveness);
    currentVelocity.lerp(desiredVelocity, blend);

    applyVelocityMovement(delta);
    snapCameraToGround();
    updateDynamicFov(delta);

    const isMoving = currentVelocity.lengthSq() > MOVE_EPSILON * MOVE_EPSILON;
    if (isMoving !== moving) {
      moving = isMoving;
      notifyChange();
    }

    return isMoving;
  }

  function dispose() {
    setActive(false);
    unbind();
    listeners.clear();
  }

  function setEyeHeight(value) {
    settings.eyeHeight = value;
    if (active) {
      snapCameraToGround({ allowLongDrop: true });
    }
  }

  return {
    settings,
    setEyeHeight,
    setBaseFov,
    setActive,
    isActive: () => active,
    isPointerLocked: () => pointerLocked,
    hasTouchLooked: () => hasTouchLooked,
    isMoving: () => moving,
    setMoveAxes,
    applyLookDelta,
    update,
    syncEulerFromCamera,
    snapCameraToGround: () => snapCameraToGround({ allowLongDrop: true }),
    subscribe: (listener) => {
      listeners.add(listener);
      listener({ active, pointerLocked, moving, hasTouchLooked });
      return () => listeners.delete(listener);
    },
    dispose,
  };
}
