import * as THREE from "three/webgpu";

export function createVideoTexture(src) {
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.crossOrigin = "anonymous";

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

  const playPromise = video.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {});
  }

  function dispose() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    texture.dispose();
  }

  return { texture, video, dispose };
}
