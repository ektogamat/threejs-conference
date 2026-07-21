import "./audioButton.css";
import {
  getAudioVolume,
  getIsMusicPlaying,
  setMusicPlaying,
  subscribe,
} from "./audioState.js";

const DEFAULT_URLS = [
  "/light-rain-109591.mp3",
  "/night-ambience-17064.mp3",
  "/thunderstorm-14708.mp3",
];

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

export function createAudioButton({ urls = DEFAULT_URLS, url } = {}) {
  const sources = url ? [url] : urls;
  const root = document.createElement("div");
  root.className = "audio-btn-root audio-btn-root--hidden";
  root.innerHTML = `
    <button type="button" id="buttonAudio" class="audio-btn" aria-label="Toggle sound">
      ${WAVE_SVG}
    </button>
    ${sources.map((src) => `<audio src="${src}"></audio>`).join("")}
  `;

  const button = root.querySelector("#buttonAudio");
  const wave = root.querySelector(".audio-btn-wave");
  const audioEls = [...root.querySelectorAll("audio")];
  const primaryAudio = audioEls[0];

  let wasMusicPlaying = false;
  const interactionEvents = ["pointerdown", "keydown", "touchstart"];

  for (const audioEl of audioEls) {
    audioEl.loop = true;
    audioEl.volume = getAudioVolume();
  }

  function syncWaveAnimation(playing) {
    wave.classList.toggle("animated", playing);
  }

  function isAnyPlaying() {
    return audioEls.some((audioEl) => !audioEl.paused);
  }

  function onPlay() {
    setMusicPlaying(true);
    syncWaveAnimation(true);
  }

  function onPause() {
    if (isAnyPlaying()) {
      return;
    }
    setMusicPlaying(false);
    syncWaveAnimation(false);
  }

  function onEnded() {
    if (isAnyPlaying()) {
      return;
    }
    setMusicPlaying(false);
    syncWaveAnimation(false);
  }

  for (const audioEl of audioEls) {
    audioEl.addEventListener("play", onPlay);
    audioEl.addEventListener("pause", onPause);
    audioEl.addEventListener("ended", onEnded);
  }

  function removeInteractionListeners() {
    for (const eventName of interactionEvents) {
      window.removeEventListener(eventName, startOnFirstInteraction);
    }
  }

  function play() {
    const volume = getAudioVolume();
    return Promise.all(
      audioEls.map((audioEl) => {
        audioEl.volume = volume;
        audioEl.loop = true;
        return audioEl.play();
      }),
    ).then((result) => {
      removeInteractionListeners();
      return result;
    });
  }

  function pause() {
    for (const audioEl of audioEls) {
      audioEl.pause();
    }
  }

  function startOnFirstInteraction(event) {
    if (event.target?.closest?.("#buttonAudio")) {
      return;
    }

    play().catch(() => {});
  }

  function handleFocus() {
    if (wasMusicPlaying) {
      play().catch(() => {});
    }
  }

  function handleBlur() {
    const isPlaying = isAnyPlaying();
    wasMusicPlaying = isPlaying;

    if (isPlaying) {
      pause();
    }
  }

  button.addEventListener("click", () => {
    if (isAnyPlaying()) {
      removeInteractionListeners();
      pause();
    } else {
      play().catch(() => {});
    }
  });

  const unsubscribe = subscribe(({ isMusicPlaying }) => {
    syncWaveAnimation(isMusicPlaying);

    if (isMusicPlaying && !isAnyPlaying()) {
      play().catch(() => {});
    } else if (!isMusicPlaying && isAnyPlaying()) {
      pause();
    }
  });

  syncWaveAnimation(getIsMusicPlaying());

  for (const eventName of interactionEvents) {
    window.addEventListener(eventName, startOnFirstInteraction, {
      passive: true,
    });
  }
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
    removeInteractionListeners();
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("blur", handleBlur);
    for (const audioEl of audioEls) {
      audioEl.removeEventListener("play", onPlay);
      audioEl.removeEventListener("pause", onPause);
      audioEl.removeEventListener("ended", onEnded);
    }
    root.remove();
  }

  return {
    root,
    button,
    audioEl: primaryAudio,
    audioEls,
    play,
    pause,
    setVisible,
    setForceHidden,
    destroy,
  };
}
