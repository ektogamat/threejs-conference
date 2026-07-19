export function applySSGIQualityMode(node, mode) {
  if (mode === "Performance") {
    node.sliceCount.value = 1;
    node.stepCount.value = 12;
    return;
  }

  if (mode === "Low") {
    node.sliceCount.value = 1;
    node.stepCount.value = 12;
    return;
  }

  if (mode === "Medium") {
    node.sliceCount.value = 2;
    node.stepCount.value = 8;
    return;
  }

  if (mode === "High") {
    node.sliceCount.value = 2;
    node.stepCount.value = 12;
    return;
  }

  node.sliceCount.value = 3;
  node.stepCount.value = 16;
}
