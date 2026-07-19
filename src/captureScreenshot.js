function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function captureCanvasScreenshot({
  renderer,
  renderLoop,
  renderFrame,
  hideUi,
  restoreUi,
  wasUiVisible,
} = {}) {
  hideUi?.();

  await new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

  await renderLoop?.renderSettledFrame?.();
  renderFrame?.();
  await new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

  const canvas = renderer?.domElement;
  if (!canvas) {
    throw new Error("Renderer canvas is not available.");
  }

  const dataUrl = canvas.toDataURL("image/png");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadDataUrl(dataUrl, `lumen-studio-${timestamp}.png`);

  if (wasUiVisible) {
    restoreUi?.();
  }
}
