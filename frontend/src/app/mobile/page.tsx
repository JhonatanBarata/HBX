"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getToken } from "@/app/_lib/api";
import { fetchMobileOperationalDestination } from "@/app/_lib/mobileOperationalDestination";

export default function MobileIndexPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Abrindo HBX Mobile...");

  useEffect(() => {
    let cancelled = false;

    async function resolveMobileEntry() {
      if (!getToken()) {
        router.replace("/mobile/login");
        return;
      }

      setMessage("Carregando seu modo mobile...");
      const destination = await fetchMobileOperationalDestination().catch(() => "/mobile/boas-vindas");
      if (!cancelled) router.replace(destination);
    }

    void resolveMobileEntry();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="hbx-mobile-page" aria-live="polite">
      <section className="hbx-mobile-card">
        <strong>{message}</strong>
      </section>
    </main>
  );
}
