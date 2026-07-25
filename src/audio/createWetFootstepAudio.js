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

function waitForAudio(audio) {
  return new Promise((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }

    audio.addEventListener("canplaythrough", () => resolve(), { once: true });
    audio.addEventListener(
      "error",
      () => reject(new Error("Failed to load footstep audio")),
      { once: true },
    );
    audio.load();
  });
}

/**
 * Wet ground footsteps — distinct clips cycled on each stride.
 */
export async function createWetFootstepAudio() {
  const templates = FOOTSTEP_URLS.map((url) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    return audio;
  });

  try {
    await Promise.all(templates.map((audio) => waitForAudio(audio)));
  } catch (error) {
    console.warn("[audio] Footsteps disabled:", error);
    return {
      update() {},
      dispose() {},
    };
  }

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

  function playStep() {
    if (!enabled) {
      return;
    }

    const template = templates[stepIndex++ % templates.length];
    const step = template.cloneNode();
    step.volume = volume * FOOTSTEP_VOLUME_SCALE;
    step.play().catch(() => {});
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
      playStep();
    }
  }

  const unsubscribe = subscribe(({ isMusicPlaying, audioVolume }) => {
    enabled = isMusicPlaying;
    volume = audioVolume;

    if (!enabled) {
      strideDistance = 0;
      timeSinceStep = MIN_STEP_INTERVAL;
    }
  });

  return {
    update,
    dispose() {
      unsubscribe();
      for (const template of templates) {
        template.src = "";
      }
      strideDistance = 0;
      timeSinceStep = MIN_STEP_INTERVAL;
      stepIndex = 0;
    },
  };
}
