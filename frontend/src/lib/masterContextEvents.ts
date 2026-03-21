export const MASTER_CONTEXT_CHANGED_EVENT = "hbx-master-context-changed";

export type MasterContextChangedDetail = {
  mode: "assumed" | "exited";
  companyName?: string | null;
};

export function dispatchMasterContextChanged(detail?: MasterContextChangedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MasterContextChangedDetail>(MASTER_CONTEXT_CHANGED_EVENT, { detail }));
}
