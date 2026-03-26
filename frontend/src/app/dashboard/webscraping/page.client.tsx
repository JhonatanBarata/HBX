"use client";

import { useEffect } from "react";
import { useRequireAuth } from "../_lib/useRequireAuth";

const WEBSCRAPING_URL = "https://hbx-webscraping.onrender.com/?user_name=julia&company_name=HBX";

export default function WebscrapingClientPage() {
  const hasToken = useRequireAuth();

  useEffect(() => {
    if (hasToken === true) {
      window.location.replace(WEBSCRAPING_URL);
    }
  }, [hasToken]);

  return null;
}
