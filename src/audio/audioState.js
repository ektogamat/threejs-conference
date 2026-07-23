const listeners = new Set();

let audioVolume = 0.5;
let isMusicPlaying = false;

function notify() {
  for (const listener of listeners) {
    listener({ audioVolume, isMusicPlaying });
  }
}

export function getAudioVolume() {
  return audioVolume;
}

export function getIsMusicPlaying() {
  return isMusicPlaying;
}

export function setMusicPlaying(value) {
  if (isMusicPlaying === value) {
    return;
  }

  isMusicPlaying = value;
  notify();
}

export function toggleMusic(value) {
  if (value !== undefined) {
    setMusicPlaying(value);
  } else {
    setMusicPlaying(!isMusicPlaying);
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  listener({ audioVolume, isMusicPlaying });
  return () => listeners.delete(listener);
}
