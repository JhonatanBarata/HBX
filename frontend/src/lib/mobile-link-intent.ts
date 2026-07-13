const MOBILE_LINK_INTENT_KEY = "hbx:mobile-link-after-login";
const MOBILE_LINK_DESTINATION = "/configuracoes/aplicativo";

export function requestMobileLinkAfterLogin() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MOBILE_LINK_INTENT_KEY, "1");
  } catch {
    // Sem sessionStorage: o login continua normalmente.
  }
}

export function consumeMobileLinkDestination(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const pending = window.sessionStorage.getItem(MOBILE_LINK_INTENT_KEY) === "1";
    if (!pending) return null;
    window.sessionStorage.removeItem(MOBILE_LINK_INTENT_KEY);
    return MOBILE_LINK_DESTINATION;
  } catch {
    return null;
  }
}
