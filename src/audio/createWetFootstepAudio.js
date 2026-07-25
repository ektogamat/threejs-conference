import * as THREE from "three/webgpu";
import { getAudioVolume, getIsMusicPlaying, subscribe } from "./audioState.js";

// Distinct steps cut from wet_footstep.mp3 (~0.6–0.8s each, pre-attack + echo tail).
const FOOTSTEP_URLS = [
  "/wet_footstep-step-01.mp3",
  "/wet_footstep-step-02.mp3",
  "/wet_footstep-step-03.mp3",
  "/wet_footstep-step-04.mp3",
  "/wet_footstep-step-05.mp3",
  "/wet_footstep-step-06.mp3",
];

// Walk (~3 m/s) fires often enough; sprint (~9 m/s) uses a longer stride
// so cadence only picks up a little instead of stacking wet clips.
const WALK_SPEED = 3;
const WALK_STRIDE = 1.7;
const SPRINT_STRIDE = 3.8;
const MIN_STEP_INTERVAL = 0.38;
const FOOTSTEP_VOLUME_SCALE = 0.7;
const POOL_SIZE = 3;

/**
 * Wet ground footsteps — buffers loaded once, played from memory on each stride.
 */
export async function createWetFootstepAudio({ listener }) {
  if (!listener) {
    return {
      update() {},
      dispose() {},
    };
  }

  const loader = new THREE.AudioLoader();
  let buffers;

  try {
    buffers = await Promise.all(
      FOOTSTEP_URLS.map((url) => loader.loadAsync(url)),
    );
  } catch (error) {
    console.warn("[audio] Footsteps disabled:", error);
    return {
      update() {},
      dispose() {},
    };
  }

  const sounds = Array.from({ length: POOL_SIZE }, () => new THREE.Audio(listener));
  let poolIndex = 0;
  let strideDistance = 0;
  let timeSinceStep = MIN_STEP_INTERVAL;
  let stepIndex = 0;
  let enabled = getIsMusicPlaying();
  let volume = getAudioVolume();

  function strideForSpeed(speed) {
    const sprintBlend = Math.min(
      1,
      Math.max(0, (speed - WALK_SPEED) / (WALK_SPEED * 2)),
    );
    return WALK_STRIDE + (SPRINT_STRIDE - WALK_STRIDE) * sprintBlend;
  }

  async function playStep() {
    if (!enabled) {
      return;
    }

    const sound = sounds[poolIndex++ % POOL_SIZE];
    const buffer = buffers[stepIndex++ % buffers.length];

    sound.setBuffer(buffer);
    sound.setPlaybackRate(1);
    sound.setVolume(volume * FOOTSTEP_VOLUME_SCALE);

    if (sound.isPlaying) {
      sound.stop();
    }

    const context = listener.context;
    if (context.state !== "running") {
      await context.resume();
    }

    sound.play();
    timeSinceStep = 0;
  }

  function update(delta, { moving = false, speed = 0 } = {}) {
    if (!enabled || !moving || speed <= 0) {
      strideDistance = 0;
      timeSinceStep = MIN_STEP_INTERVAL;
      return;
    }

    timeSinceStep += delta;
    strideDistance += speed * delta;

    const stride = strideForSpeed(speed);
    if (strideDistance >= stride && timeSinceStep >= MIN_STEP_INTERVAL) {
      strideDistance %= stride;
      playStep().catch(() => {});
    }
  }

  const unsubscribe = subscribe(({ isMusicPlaying, audioVolume }) => {
    enabled = isMusicPlaying;
    volume = audioVolume;

    for (const sound of sounds) {
      if (sound.buffer) {
        sound.setVolume(volume * FOOTSTEP_VOLUME_SCALE);
      }
    }

    if (!enabled) {
      strideDistance = 0;
      timeSinceStep = MIN_STEP_INTERVAL;
      for (const sound of sounds) {
        if (sound.isPlaying) {
          sound.stop();
        }
      }
    }
  });

  return {
    update,
    dispose() {
      unsubscribe();
      for (const sound of sounds) {
        if (sound.isPlaying) {
          sound.stop();
        }
        sound.disconnect();
      }
      strideDistance = 0;
      timeSinceStep = MIN_STEP_INTERVAL;
      poolIndex = 0;
      stepIndex = 0;
    },
  };
}
