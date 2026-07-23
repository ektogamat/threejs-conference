import * as THREE from "three/webgpu";

const NOISE_URL = "/custom_noise.webp";
const PERLIN_URL = "/custom_perlin.webp";

function configureNoiseTexture(texture) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export async function loadCloudNoiseTextures() {
  const loader = new THREE.TextureLoader();

  const [noise, perlin] = await Promise.all([
    loader.loadAsync(NOISE_URL),
    loader.loadAsync(PERLIN_URL),
  ]);

  return {
    noise: configureNoiseTexture(noise),
    perlin: configureNoiseTexture(perlin),
  };
}
