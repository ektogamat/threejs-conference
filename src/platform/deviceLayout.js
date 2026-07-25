export const MOBILE_LAYOUT_QUERY = "(max-width: 768px)";

export function isCoarsePointerDevice() {
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(pointer: coarse)").matches) {
      return true;
    }
  }

  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}

export function isDesktopPointerLayout() {
  return !isMobileLayout() && !isCoarsePointerDevice();
}

export function isMobileLayout() {
  if (typeof window.matchMedia !== "function") {
    return window.innerWidth <= 768;
  }

  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

/**
 * iPhone / iPad (including iPadOS that reports as MacIntel + touch).
 */
export function isAppleMobile() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true;
  }

  // iPadOS 13+ desktop UA with touch
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }

  if (isAppleMobile()) {
    return true;
  }

  const ua = navigator.userAgent || "";
  return (
    /Safari/.test(ua) &&
    !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR|Android/.test(ua)
  );
}

export function isMobileDevice() {
  return isMobileLayout() || isCoarsePointerDevice() || isAppleMobile();
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
