import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HBX Music",
    short_name: "HBX Music",
    description: "Modulo premium mobile-first do HBX com trial, biblioteca e recomendacoes diarias.",
    start_url: "/hbx-music",
    scope: "/hbx-music",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050816",
    theme_color: "#050816",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
