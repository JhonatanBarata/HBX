// 🔴 CADA CHAVE `logi:*` AQUI É UMA CHAVE DE `T` NO MOCK
// (`/demos/hbx-logistica-real.html`). Chave que não existe lá NÃO dá erro: o
// mock ignora o `?tela=`, fica na abertura e 3,4s depois cai na "Rota do dia"
// — a aba "Fechar o dia" mostrava splash e depois a tela ERRADA (visto em
// 17/08). O fechamento mora em `caderneta` ("Caderneta · fechamento");
// "fechamento" nunca existiu no mock.
//
// As chaves `v-*` são o celular do VENDEDOR (`/demos/hbx-vendas-app.html`) —
// mesma casca, mesmos tokens, outra história.
export type LogisticaRealScreen =
  | "prospector"
  | "montagem"
  | "rota"
  | "folha"
  | "caderneta"
  | "torre"
  | "torreFone"
  | "produtos"
  | "v-radar"
  | "v-vendas"
  | "v-agenda"
  | "v-entrega"
  | "v-cobranca"
  | "v-fiscal"
  | "v-estoque";

const GPS_PREVIEW_VERSION = "20260808-loop-3";
const TORRE_PREVIEW_VERSION = "20260818-contraste";
const VENDAS_PREVIEW_VERSION = "20260818-cena-1";

function sourceFor(screen: LogisticaRealScreen, themeMode: "dark" | "light") {
  const luz = themeMode === "dark" ? "escuro" : "claro";
  if (screen === "prospector") {
    return `/demos/hbx-gps-prospector.html?video&luz=${luz}&v=${GPS_PREVIEW_VERSION}`;
  }
  // Torre de controle é a cena do GESTOR (paisagem, mock próprio) — quem
  // troca a proporção do berço é o CSS da vitrine via data-logi="torre".
  if (screen === "torre" || screen === "torreFone") {
    const fone = screen === "torreFone" ? "&fone=1" : "";
    return `/demos/hbx-torre-controle.html?luz=${luz}${fone}&v=${TORRE_PREVIEW_VERSION}`;
  }
  if (screen.startsWith("v-")) {
    return `/demos/hbx-vendas-app.html?tela=${screen.slice(2)}&luz=${luz}&v=${VENDAS_PREVIEW_VERSION}`;
  }
  return `/demos/hbx-logistica-real.html?tela=${screen}&luz=${luz}`;
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
      title={screen.startsWith("v-") ? "Tela real do HBX Vendas" : "Tela real do HBX Logística"}
      loading="eager"
      sandbox="allow-scripts"
    />
  );
}
