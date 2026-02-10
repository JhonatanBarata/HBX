"use client";

import { useEffect } from "react";

export default function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored) {
        document.documentElement.setAttribute("data-theme", stored);
      } else {
        document.documentElement.setAttribute("data-theme", "primary");
      }
    } catch (e) {
      // ignore
    }
  }, []);

  return null;
}
