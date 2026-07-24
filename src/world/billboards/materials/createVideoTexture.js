import * as THREE from "three/webgpu";

export function createVideoTexture(src, { autoplay = true } = {}) {
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = autoplay;
  video.crossOrigin = "anonymous";

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

  function play() {
    if (video.paused) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    }
  }

  function pause() {
    if (!video.paused) {
      video.pause();
    }
  }

  if (autoplay) {
    play();
  }

  function dispose() {
    pause();
    video.removeAttribute("src");
    video.load();
    texture.dispose();
  }

  return { texture, video, play, pause, dispose };
}
