export function createAppUiState() {
  const listeners = new Set();
  let openedPanel = null;
  let uiVisible = true;

  function notify() {
    for (const listener of listeners) {
      listener({ openedPanel, uiVisible });
    }
  }

  return {
    get openedPanel() {
      return openedPanel;
    },

    get uiVisible() {
      return uiVisible;
    },

    subscribe(listener) {
      listeners.add(listener);
      listener({ openedPanel, uiVisible });
      return () => listeners.delete(listener);
    },

    openPanel(id) {
      openedPanel = id;
      uiVisible = true;
      notify();
    },

    closePanel() {
      if (openedPanel === null) {
        return;
      }

      openedPanel = null;
      notify();
    },

    hideAllUi() {
      if (!uiVisible) {
        return;
      }

      uiVisible = false;
      notify();
    },

    showAllUi() {
      if (uiVisible) {
        return;
      }

      uiVisible = true;
      notify();
    },
  };
}
