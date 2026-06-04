import { useEffect } from "react";

type MasterFocusLockOptions = {
  drawerOpen: boolean;
  createCompanyOpen: boolean;
  masterIntegrationsOpen: boolean;
  userModalOpen: boolean;
  manualPaymentModalOpen: boolean;
  confirmActionOpen: boolean;
};

function restoreTopbar() {
  const activeTopbar = document.querySelector<HTMLElement>(".app-topbar");
  if (activeTopbar?.dataset.masterFocusHidden === "true") {
    activeTopbar.style.opacity = "";
    activeTopbar.style.pointerEvents = "";
    activeTopbar.style.transform = "";
    activeTopbar.style.visibility = "";
    delete activeTopbar.dataset.masterFocusHidden;
  }
}

export function useMasterFocusLock({
  drawerOpen,
  createCompanyOpen,
  masterIntegrationsOpen,
  userModalOpen,
  manualPaymentModalOpen,
  confirmActionOpen,
}: MasterFocusLockOptions) {
  useEffect(() => {
    const anyModalOpen =
      createCompanyOpen ||
      masterIntegrationsOpen ||
      userModalOpen ||
      manualPaymentModalOpen ||
      confirmActionOpen;
    const focusOpen = drawerOpen || anyModalOpen;
    if (typeof document === "undefined") return;
    document.body.classList.toggle("master-company-focus-open", focusOpen);
    document.body.style.overflow = focusOpen ? "hidden" : "";
    const topbar = document.querySelector<HTMLElement>(".app-topbar");
    if (topbar) {
      if (focusOpen) {
        topbar.dataset.masterFocusHidden = "true";
        topbar.style.opacity = "0";
        topbar.style.pointerEvents = "none";
        topbar.style.transform = "translateY(-16px)";
        topbar.style.visibility = "hidden";
      } else if (topbar.dataset.masterFocusHidden === "true") {
        restoreTopbar();
      }
    }
    return () => {
      document.body.classList.remove("master-company-focus-open");
      document.body.style.overflow = "";
      restoreTopbar();
    };
  }, [
    drawerOpen,
    createCompanyOpen,
    masterIntegrationsOpen,
    userModalOpen,
    manualPaymentModalOpen,
    confirmActionOpen,
  ]);
}
