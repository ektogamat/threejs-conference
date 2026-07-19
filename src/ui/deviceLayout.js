export const MOBILE_LAYOUT_QUERY = "(max-width: 768px)";

export function isMobileLayout() {
  if (typeof window.matchMedia !== "function") {
    return window.innerWidth <= 768;
  }

  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

export function syncLayoutClass() {
  document.documentElement.classList.toggle("layout-mobile", isMobileLayout());
}

export function onMobileLayoutChange(callback) {
  if (typeof window.matchMedia !== "function") {
    const onResize = () => callback(isMobileLayout());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }

  const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
  const handler = () => callback(isMobileLayout());

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }

  media.addListener(handler);
  return () => media.removeListener(handler);
}
