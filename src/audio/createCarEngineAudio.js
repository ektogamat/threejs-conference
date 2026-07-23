import * as THREE from "three/webgpu";
import { getAudioVolume, subscribe } from "./audioState.js";

const ENGINE_URL = "/engine.mp3";
/** Louder than ambience tracks; Three.Audio allows gain > 1. */
const ENGINE_VOLUME_SCALE = 2.5;

/**
 * Diesel idle as PositionalAudio attached to the car.
 * Starts/stops with the global music toggle (same user-gesture gate).
 */
export async function createCarEngineAudio({ camera, car }) {
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const sound = new THREE.PositionalAudio(listener);
  sound.name = "quadra-engine";
  sound.setRefDistance(3);
  sound.setRolloffFactor(3.4);
  sound.setDistanceModel("inverse");
  sound.setLoop(true);
  sound.setVolume(getAudioVolume() * ENGINE_VOLUME_SCALE);
  // Rough engine bay height in local car space.
  sound.position.set(0, 0.55, 0.4);

  car.add(sound);
  car.updateMatrixWorld(true);

  const buffer = await new THREE.AudioLoader().loadAsync(ENGINE_URL);
  sound.setBuffer(buffer);

  async function play() {
    if (sound.isPlaying) {
      return;
    }

    const context = listener.context;
    if (context.state !== "running") {
      await context.resume();
    }

    sound.play();
  }

  function pause() {
    if (sound.isPlaying) {
      sound.pause();
    }
  }

  const unsubscribe = subscribe(({ isMusicPlaying, audioVolume }) => {
    sound.setVolume(audioVolume * ENGINE_VOLUME_SCALE);

    if (isMusicPlaying) {
      play().catch(() => {});
    } else {
      pause();
    }
  });

  return {
    listener,
    sound,
    play,
    pause,
    dispose() {
      unsubscribe();
      pause();
      if (sound.source) {
        sound.disconnect();
      }
      car.remove(sound);
      camera.remove(listener);
    },
  };
}
