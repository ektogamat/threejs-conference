export const BILLBOARD_VIDEO_PATHS = [
  "/video/imagine-art-feed-item.mp4",
  "/video/imagine-art-feed-item-2.mp4",
  "/video/imagine-art-feed-item-3.mp4",
  "/video/imagine-art-feed-item-4.mp4",
  "/video/imagine-art-feed-item-5.mp4",
  "/video/imagine-art-feed-item-6.mp4",
];

export function createShuffledVideoPool() {
  const pool = [...BILLBOARD_VIDEO_PATHS];

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
}
