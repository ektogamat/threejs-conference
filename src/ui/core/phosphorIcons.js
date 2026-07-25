/** Phosphor Icons via @phosphor-icons/web — https://phosphoricons.com/ */

export function phIcon(name) {
  return `<i class="ph ph-${name} ph-icon" aria-hidden="true"></i>`;
}

export const phosphorFloppyDisk = phIcon("floppy-disk");

export const saveDefaultIcon = `<svg class="app-header-save-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path></svg>`;

export const phosphorCircleNotch = phIcon("circle-notch");
export const phosphorCheck = phIcon("check");
export const phosphorShareNetwork = phIcon("share-network");
export const phosphorSparkle = phIcon("sparkle");
export const phosphorMicrophone = phIcon("microphone");
export const phosphorGearSix = phIcon("gear-six");
export const phosphorInfo = phIcon("info");
export const phosphorArrowCounterClockwise = phIcon("arrow-counter-clockwise");
export const phosphorX = phIcon("x");
export const phosphorCopy = phIcon("copy");
export const phosphorLink = phIcon("link");
export const phosphorList = phIcon("list");
export const phosphorCaretDown = phIcon("caret-down");
export const phosphorEye = phIcon("eye");
export const phosphorCamera = phIcon("camera");
export const phosphorCircleHalf = phIcon("circle-half");
export const phosphorMoonStars = phIcon("moon-stars");
export const phosphorCloudRain = phIcon("cloud-rain");
export const phosphorSunHorizon = phIcon("sun-horizon");
export const phosphorCloudFog = phIcon("cloud-fog");
export const phosphorFilmStrip = phIcon("film-strip");

export const editPencilIcon = `<svg class="edit-materials-pencil-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H216a8,8,0,0,0,0-16H115.32l112-112A16,16,0,0,0,227.32,73.37ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.69,147.32,64l24-24L216,84.69Z"></path></svg>`;

const PAINT_BRUSH_PATH =
  "M232,32a8,8,0,0,0-8-8c-44.08,0-89.31,49.71-114.43,82.63A60,60,0,0,0,32,164c0,30.88-19.54,44.73-20.47,45.37A8,8,0,0,0,16,224H92a60,60,0,0,0,57.37-77.57C182.3,121.31,232,76.08,232,32ZM92,208H34.63C41.38,198.41,48,183.92,48,164a44,44,0,1,1,44,44Zm32.42-94.45q5.14-6.66,10.09-12.55A76.23,76.23,0,0,1,155,121.49q-5.9,4.94-12.55,10.09A60.54,60.54,0,0,0,124.42,113.55Zm42.7-2.68a92.57,92.57,0,0,0-22-22c31.78-34.53,55.75-45,69.9-47.91C212.17,55.12,201.65,79.09,167.12,110.87Z";

export const PAINT_BRUSH_CURSOR_HOTSPOT = { x: 3, y: 28 };

export function buildPaintBrushCursorCSSValue() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' fill='#ffffff' viewBox='0 0 256 256'><path d='${PAINT_BRUSH_PATH}'/></svg>`;
  const { x, y } = PAINT_BRUSH_CURSOR_HOTSPOT;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, pointer`;
}

export const paintBrushIcon = `<svg class="paint-brush-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${PAINT_BRUSH_PATH}"></path></svg>`;
