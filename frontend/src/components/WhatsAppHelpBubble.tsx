"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const SUPPORT_PHONE = "+5519997024884";
const SUPPORT_MESSAGE = "Olá, preciso de ajuda para finalizar minha contratação no HBX.";

function shouldShowHelp(pathname: string | null) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/login" || path === "/register" || path === "/confirm-email" || path === "/reset-password") {
    return true;
  }
  return path === "/pagamento" || path === "/planos" || path === "/checkout";
}

export default function WhatsAppHelpBubble() {
  const pathname = usePathname();
  const [hiddenByFooter, setHiddenByFooter] = useState(false);
  const visible = shouldShowHelp(pathname);
  const supportUrl = useMemo(
    () => `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`,
    [],
  );

  useEffect(() => {
    if (!visible) return undefined;

    const sync = () => {
      const footer = document.querySelector("footer");
      const footerReached = footer
        ? footer.getBoundingClientRect().top < window.innerHeight - 120
        : false;
      const pageBottom = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const hasScrollablePage = pageBottom > window.innerHeight + 80;
      const scrollBottom = window.scrollY + window.innerHeight;
      const reachedPageBottom = hasScrollablePage && window.scrollY > 80 && scrollBottom >= pageBottom - 24;
      setHiddenByFooter(footerReached || reachedPageBottom);
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [visible, pathname]);

  if (!visible) return null;

  return (
    <a
      className={`whatsapp-help${hiddenByFooter ? " is-hidden-by-footer" : ""}`}
      href={supportUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Abrir suporte HBX no WhatsApp"
    >
      <span className="whatsapp-help__text">
        <strong>Precisa de ajuda?</strong>
        <small>Fale com o suporte HBX para concluir pagamento, Pix, boleto ou liberação de acesso.</small>
      </span>
      <span className="whatsapp-help__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97ZM12.07 20.2h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.53 3.69-8.22 8.24-8.22 2.2 0 4.27.85 5.82 2.4a8.17 8.17 0 0 1 2.4 5.82c0 4.54-3.69 8.23-8.2 8.23Zm4.5-6.15c-.25-.13-1.47-.72-1.7-.8-.23-.08-.4-.12-.57.12-.17.25-.65.8-.8.97-.15.17-.3.19-.56.06-.25-.13-1.06-.39-2.01-1.26-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.44l-.49-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.45 1.02 2.62c.13.17 1.77 2.7 4.3 3.79.6.26 1.08.42 1.44.54.61.19 1.16.16 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.3Z" />
        </svg>
      </span>
    </a>
  );
}
