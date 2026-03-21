export const MASTER_CONTEXT_CHANGED_EVENT = "hbx-master-context-changed";

export function dispatchMasterContextChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MASTER_CONTEXT_CHANGED_EVENT));
}
