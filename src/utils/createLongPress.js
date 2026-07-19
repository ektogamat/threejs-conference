export function createLongPressHandler(onLongPress, { delay = 600 } = {}) {
  let timeoutId = null;
  let longPressTriggered = false;
  let isDragging = false;
  let startPos = { x: 0, y: 0 };

  function clear() {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }

    const wasLongPress = longPressTriggered;
    longPressTriggered = false;
    return wasLongPress;
  }

  return {
    onTouchStart(event) {
      if (!event.touches?.length) {
        return;
      }

      isDragging = false;
      longPressTriggered = false;
      startPos = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };

      timeoutId = window.setTimeout(() => {
        if (!isDragging) {
          longPressTriggered = true;
          onLongPress?.(event);
        }
      }, delay);
    },

    onTouchMove(event) {
      if (!event.touches?.length) {
        return;
      }

      const deltaX = Math.abs(event.touches[0].clientX - startPos.x);
      const deltaY = Math.abs(event.touches[0].clientY - startPos.y);

      if (deltaX > 10 || deltaY > 10) {
        isDragging = true;
        clear();
      }
    },

    onTouchEnd() {
      return clear();
    },

    onTouchCancel() {
      clear();
    },
  };
}
