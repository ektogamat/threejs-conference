import * as THREE from "three/webgpu";
import { getAudioVolume, subscribe } from "./audioState.js";

const ENGINE_URL = "/freesound_community-plasma-engine-fx-33559.mp3";
/** Spatial plasma drone; quieter than the nearby car idle. */
const ENGINE_VOLUME_SCALE = 1.4;

/**
 * Spatial engine loop as PositionalAudio attached to a flying plane.
 * Shares the scene AudioListener and follows the global music toggle.
 */
export async function createPlaneEngineAudio({ listener, plane }) {
  if (!listener || !plane) {
    return {
      sound: null,
      play() {},
      pause() {},
      dispose() {},
    };
  }

  const sound = new THREE.PositionalAudio(listener);
  sound.name = "plane-engine";
  sound.setRefDistance(35);
  sound.setRolloffFactor(1.2);
  sound.setDistanceModel("inverse");
  sound.setLoop(true);
  sound.setVolume(getAudioVolume() * ENGINE_VOLUME_SCALE);

  plane.add(sound);
  plane.updateMatrixWorld(true);

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
    sound,
    play,
    pause,
    dispose() {
      unsubscribe();
      pause();
      if (sound.source) {
        sound.disconnect();
      }
      plane.remove(sound);
    },
  };
}
