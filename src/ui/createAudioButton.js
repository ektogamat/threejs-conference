import "./audioButton.css";
import {
  getAudioVolume,
  getIsMusicPlaying,
  setMusicPlaying,
  subscribe,
} from "./audioState.js";

const WAVE_SVG = `
  <svg
    id="wave"
    class="audio-btn-wave"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 30 30"
    aria-hidden="true"
  >
    <path
      id="Line_1"
      fill="white"
      d="M0.91,15L0.78,15A1,1,0,0,0,0,16v6a1,1,0,1,0,2,0s0,0,0,0V16a1,1,0,0,0-1-1H0.91Z"
    />
    <path
      id="Line_2"
      fill="white"
      d="M6.91,9L6.78,9A1,1,0,0,0,6,10V28a1,1,0,1,0,2,0s0,0,0,0V10A1,1,0,0,0,7,9H6.91Z"
    />
    <path
      id="Line_3"
      fill="white"
      d="M12.91,0L12.78,0A1,1,0,0,0,12,1V37a1,1,0,1,0,2,0s0,0,0,0V1a1,1,0,0,0-1-1H12.91Z"
    />
    <path
      id="Line_4"
      fill="white"
      d="M18.91,10l-0.12,0A1,1,0,0,0,18,11V27a1,1,0,1,0,2,0s0,0,0,0V11a1,1,0,0,0-1-1H18.91Z"
    />
    <path
      id="Line_5"
      fill="white"
      d="M24.91,15l-0.12,0A1,1,0,0,0,24,16v6a1,1,0,1,0,2,0s0,0,0,0V16a1,1,0,0,0-1-1H24.91Z"
    />
  </svg>
`;

export function createAudioButton({ url = "/music.mp3" } = {}) {
  const root = document.createElement("div");
  root.className = "audio-btn-root audio-btn-root--hidden";
  root.innerHTML = `
    <button type="button" id="buttonAudio" class="audio-btn" aria-label="Toggle music">
      ${WAVE_SVG}
    </button>
    <audio src="${url}"></audio>
  `;

  const button = root.querySelector("#buttonAudio");
  const wave = root.querySelector(".audio-btn-wave");
  const audioEl = root.querySelector("audio");

  let wasMusicPlaying = false;

  audioEl.loop = true;
  audioEl.volume = getAudioVolume();

  function syncWaveAnimation(playing) {
    wave.classList.toggle("animated", playing);
  }

  function onPlay() {
    setMusicPlaying(true);
    syncWaveAnimation(true);
  }

  function onPause() {
    setMusicPlaying(false);
    syncWaveAnimation(false);
  }

  function onEnded() {
    setMusicPlaying(false);
    syncWaveAnimation(false);
  }

  audioEl.addEventListener("play", onPlay);
  audioEl.addEventListener("pause", onPause);
  audioEl.addEventListener("ended", onEnded);

  function play() {
    audioEl.volume = getAudioVolume();
    audioEl.loop = true;
    return audioEl.play();
  }

  function pause() {
    audioEl.pause();
  }

  function handleFocus() {
    if (wasMusicPlaying) {
      audioEl.play();
    }
  }

  function handleBlur() {
    const isPlaying = !audioEl.paused;
    wasMusicPlaying = isPlaying;

    if (isPlaying) {
      audioEl.pause();
    }
  }

  button.addEventListener("click", () => {
    if (audioEl.paused) {
      play();
    } else {
      pause();
    }
  });

  const unsubscribe = subscribe(({ isMusicPlaying }) => {
    syncWaveAnimation(isMusicPlaying);

    if (isMusicPlaying && audioEl.paused) {
      audioEl.play();
    } else if (!isMusicPlaying && !audioEl.paused) {
      audioEl.pause();
    }
  });

  syncWaveAnimation(getIsMusicPlaying());

  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);

  document.body.appendChild(root);

  function setVisible(visible) {
    root.classList.toggle("audio-btn-root--hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setForceHidden(hidden) {
    root.classList.toggle("audio-btn-root--force-hidden", hidden);
  }

  function destroy() {
    unsubscribe();
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("blur", handleBlur);
    audioEl.removeEventListener("play", onPlay);
    audioEl.removeEventListener("pause", onPause);
    audioEl.removeEventListener("ended", onEnded);
    root.remove();
  }

  return {
    root,
    button,
    audioEl,
    play,
    pause,
    setVisible,
    setForceHidden,
    destroy,
  };
}
