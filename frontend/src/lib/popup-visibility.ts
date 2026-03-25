const POPUP_OPEN_ATTR = "data-popup-open";

let popupOpenCount = 0;

function syncPopupState() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (popupOpenCount > 0) {
    root.setAttribute(POPUP_OPEN_ATTR, "true");
    return;
  }
  root.removeAttribute(POPUP_OPEN_ATTR);
}

export function acquirePopupTopbarLock() {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  popupOpenCount += 1;
  syncPopupState();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    popupOpenCount = Math.max(0, popupOpenCount - 1);
    syncPopupState();
  };
}