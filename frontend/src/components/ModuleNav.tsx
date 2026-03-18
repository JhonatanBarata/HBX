"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch, getToken } from "../app/dashboard/_lib/api";
import styles from "./ModuleNav.module.css";

type UserModule = { key: string; accessible: boolean };

type NavItem = {
  href: string;
  label: string;
  matcher: (pathname: string) => boolean;
  adminOnly?: boolean;
  moduleKey?: string;
};

export default function ModuleNav({ inHeader = false }: { inHeader?: boolean }) {
  const pathname = usePathname();
  const authenticated = Boolean(getToken());
  const [modules, setModules] = useState<UserModule[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isSystemMaster, setIsSystemMaster] = useState(false);
  const navScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Keep CSS var for topbar total height in sync with the actual header height.
  useEffect(() => {
    const root = document.documentElement;
    const topbar = document.querySelector('.app-topbar');
    if (!topbar || !root) return;

    const setVar = () => {
      const rect = topbar.getBoundingClientRect();
      // use the header's full rendered height (px)
      root.style.setProperty('--topbar-total-height', `${Math.ceil(rect.height)}px`);
    };

    setVar();

    // observe size changes to the header (e.g., when "Intensidade" control grows it)
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(setVar);
      ro.observe(topbar as Element);
    } catch (e) {
      // ResizeObserver may not exist in some older environments; fallback to window resize
      window.addEventListener('resize', setVar);
    }

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', setVar);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!authenticated) return;
    (async () => {
      try {
        const [myModules, profile] = await Promise.all([
          apiFetch<UserModule[]>('/modules/me'),
          apiFetch<any>('/profile/current-user').catch(() => null),
        ]);
        if (!mounted) return;
        setModules(myModules || []);
        setUserRole(String(profile?.role || null));
        setIsSystemMaster(Boolean(profile?.isSystemMaster));
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [authenticated]);

  function updateScrollButtons() {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const stableEl = el;
    updateScrollButtons();
    const onScroll = () => updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    stableEl.addEventListener('scroll', onScroll);
    // add pointer drag-to-scroll when rendered in header for touch/drag UX
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    function onPointerDown(e: PointerEvent) {
      isDown = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      startX = e.clientX;
      scrollStart = stableEl.scrollLeft;
      stableEl.classList.add('dragging');
    }
    function onPointerMove(e: PointerEvent) {
      if (!isDown) return;
      const dx = startX - e.clientX;
      stableEl.scrollLeft = scrollStart + dx;
      updateScrollButtons();
    }
    function onPointerUp(e: PointerEvent) {
      isDown = false;
      stableEl.classList.remove('dragging');
      try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch (err) {}
    }
    if (inHeader) {
      stableEl.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    return () => {
      window.removeEventListener('resize', updateScrollButtons);
      stableEl.removeEventListener('scroll', onScroll);
      if (inHeader) {
        stableEl.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
    };
  }, [navScrollRef.current, /* eslint-disable-line */]);

  const accessibleModules = useMemo(() => new Set((modules || []).filter((m) => m.accessible).map((m) => m.key)), [modules]);

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { href: "/dashboard", label: "Menu", matcher: (r)=> r === "/dashboard" },
      { href: "/dashboard/inbox", label: "Atendimento", matcher: (r)=> r.startsWith('/dashboard/inbox') || r.startsWith('/dashboard/auto-replies') || r.startsWith('/dashboard/messages'), moduleKey: 'atendimento' },
      { href: "/dashboard/gerencial", label: "Gerencial", matcher: (r)=> r.startsWith('/dashboard/gerencial'), adminOnly: true, moduleKey: 'gerencial' },
      { href: "/hbx-recovery", label: "HBX Recovery", matcher: (r)=> r.startsWith('/hbx-recovery'), moduleKey: 'hbx_recovery' },
      { href: "/dashboard/webscraping", label: "Webscraping", matcher: (r)=> r.startsWith('/dashboard/webscraping'), moduleKey: 'webscraping' },
      { href: "/dashboard/website", label: "Website", matcher: (r)=> r.startsWith('/dashboard/website'), moduleKey: 'website' },
      { href: "/dashboard/importacoes/followup-global", label: "Follow Up", matcher: (r)=> r.startsWith('/dashboard/importacoes/followup-global') || r.startsWith('/dashboard/importacoes/historico') || r.startsWith('/dashboard/importacoes/novo'), moduleKey: 'follow_up_internacional' },
      { href: "/dashboard/importacoes/cadastros", label: "Cadastros", matcher: (r)=> r.startsWith('/dashboard/importacoes/cadastros'), moduleKey: 'cadastros' },
      { href: "/dashboard/master", label: "Master", matcher: (r)=> r.startsWith('/dashboard/master'), adminOnly: true, moduleKey: 'master' },
    ];

    // If modules haven't loaded yet (modules length === 0), show the full nav
    const showAllUntilLoaded = Array.isArray(modules) && modules.length === 0;
    return items.filter((item) => {
      if (!showAllUntilLoaded) {
        if (item.moduleKey && !accessibleModules.has(item.moduleKey!)) return false;
        if (!item.adminOnly) return true;
        if (item.href === "/dashboard/master") return isSystemMaster;
        return String(userRole || "").toUpperCase() === "ADMIN";
      }
      // modules not loaded yet: show everything (helps initial render)
      return true;
    });
  }, [accessibleModules, userRole, isSystemMaster]);

  // Always render the module navigation so it appears on all pages.

  return (
    <div className={[styles.moduleNavWrap, inHeader ? styles.moduleNavHeader : ''].filter(Boolean).join(' ')}>
      <div className={styles.moduleNavContainer}>
        <button
          type="button"
          className={styles.navScrollBtn}
          aria-hidden={!canScrollLeft}
          style={{ display: canScrollLeft ? 'flex' : 'none' }}
          onClick={() => {
            const el = navScrollRef.current;
            if (el) el.scrollBy({ left: -220, behavior: 'smooth' });
          }}
        >
          ‹
        </button>

        <div
          className={styles.heroTabGroup}
          role="tablist"
          aria-label="Navegacao de modulos"
          ref={navScrollRef}
        >
          {navItems.map((item) => {
            const active = item.matcher(pathname || '');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.heroTabActive : styles.heroTab}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.navScrollBtn}
          aria-hidden={!canScrollRight}
          style={{ display: canScrollRight ? 'flex' : 'none' }}
          onClick={() => {
            const el = navScrollRef.current;
            if (el) el.scrollBy({ left: 220, behavior: 'smooth' });
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
