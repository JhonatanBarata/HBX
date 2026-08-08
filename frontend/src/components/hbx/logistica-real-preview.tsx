export type LogisticaRealScreen =
  | "prospector"
  | "montagem"
  | "rota"
  | "folha"
  | "caderneta";

function sourceFor(screen: LogisticaRealScreen, themeMode: "dark" | "light") {
  if (screen === "prospector") return "/demos/hbx-gps-prospector.html?video";
  return `/demos/hbx-logistica-real.html?tela=${screen}&luz=${themeMode === "dark" ? "escuro" : "claro"}`;
}

export function LogisticaRealPreview({
  screen,
  themeMode,
  className = "",
}: {
  screen: LogisticaRealScreen;
  themeMode: "dark" | "light";
  className?: string;
}) {
  return (
    <iframe
      className={className}
      src={sourceFor(screen, themeMode)}
      title={screen === "prospector" ? "Prospector HBX em funcionamento" : "Tela real do HBX Logística"}
      loading="eager"
      sandbox="allow-scripts"
    />
  );
}
