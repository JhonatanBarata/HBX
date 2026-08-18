// 🔴 CADA CHAVE AQUI É UMA CHAVE DE `T` NO MOCK (`/demos/hbx-logistica-real.html`).
// Chave que não existe lá NÃO dá erro: o mock ignora o `?tela=`, fica na abertura
// e 3,4s depois cai na "Rota do dia" — a aba "Fechar o dia" mostrava splash e
// depois a tela ERRADA (visto em 17/08). O fechamento mora em `caderneta`
// ("Caderneta · fechamento"); "fechamento" nunca existiu no mock.
export type LogisticaRealScreen =
  | "prospector"
  | "montagem"
  | "rota"
  | "folha"
  | "caderneta"
  | "torre";

const GPS_PREVIEW_VERSION = "20260808-loop-3";
const TORRE_PREVIEW_VERSION = "20260817-cena-1";

function sourceFor(screen: LogisticaRealScreen, themeMode: "dark" | "light") {
  if (screen === "prospector") {
    return `/demos/hbx-gps-prospector.html?video&luz=${themeMode === "dark" ? "escuro" : "claro"}&v=${GPS_PREVIEW_VERSION}`;
  }
  // Torre de controle é a cena do GESTOR (paisagem, mock próprio) — quem
  // troca a proporção do berço é o CSS do /rota via data-demo="torre".
  if (screen === "torre") {
    return `/demos/hbx-torre-controle.html?luz=${themeMode === "dark" ? "escuro" : "claro"}&v=${TORRE_PREVIEW_VERSION}`;
  }
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
