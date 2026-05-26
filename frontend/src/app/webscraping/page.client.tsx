"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WebscrapingClientPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/boasvindas?radar=1");
  }, [router]);

  return null;
}
