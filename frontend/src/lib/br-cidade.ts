// SANEAMENTO DE NOME DE CIDADE (04/08/2026)
//
// A coluna Cidade do funil vinha do que o Radar raspou, e o Radar raspa o que
// estiver escrito: "CAMPINAS", "campinas", "Sao Paulo", "santa barbara d oeste".
// Três grafias da mesma cidade na mesma tela é ruído — e ordenar por Cidade
// separava "CAMPINAS" de "Campinas" como se fossem lugares diferentes.
//
// A régua não é uma regra de maiúscula: é o CATÁLOGO do IBGE que o app já
// carrega (brazil-cities.ts). Bate-se a cidade sem acento e sem caixa contra
// ele e devolve-se a grafia OFICIAL — o que conserta acento também, não só
// caixa. Só quem não está no catálogo cai no Título genérico.
//
// Isto é EXIBIÇÃO. O dado gravado não muda: quem escreve cidade é o Radar/RFB,
// e reescrever base por causa de tela é conserto no lugar errado.

import { BRAZIL_CITIES_BY_UF } from "./brazil-cities";

/** Partículas que ficam minúsculas no meio do nome ("Santa Rita do Sapucaí"). */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);

/** Chave de comparação: sem acento, sem caixa, sem pontuação. */
function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Catálogo montado uma vez, na primeira cidade que a tela pedir. */
let catalogoOficial: Map<string, string> | null = null;
function catalogo(): Map<string, string> {
  if (catalogoOficial) return catalogoOficial;
  const mapa = new Map<string, string>();
  for (const cidades of Object.values(BRAZIL_CITIES_BY_UF)) {
    for (const cidade of cidades) {
      const k = chave(cidade);
      if (k && !mapa.has(k)) mapa.set(k, cidade);
    }
  }
  catalogoOficial = mapa;
  return mapa;
}

function subirPrimeira(palavra: string): string {
  if (!palavra) return palavra;
  return palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1);
}

/** Título em português, para o que o catálogo não conhece. */
function titulo(valor: string): string {
  return valor
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((palavra, i) => {
      if (i > 0 && PARTICULAS.has(palavra)) return palavra;
      // "d'oeste" vira "d'Oeste": a partícula fica em baixo, o nome sobe.
      const apostrofo = palavra.match(/^(d)['’](.+)$/);
      if (apostrofo && i > 0) return `${apostrofo[1]}'${subirPrimeira(apostrofo[2])}`;
      return subirPrimeira(palavra);
    })
    .join(" ");
}

/**
 * Nome de cidade pronto pra ler. `uf` é dica, não filtro: com ela o desempate
 * de cidades homônimas sai certo; sem ela vale a primeira grafia oficial.
 */
/* A lista comercial chama isto uma vez por célula E de novo a cada comparação
   de ordenação — numa carteira grande são milhares de chamadas com pouquíssimos
   valores distintos. Guardar a resposta é mais barato que normalizar de novo. */
const lembrete = new Map<string, string>();

export function formatCityName(raw: string | null | undefined, uf?: string | null): string {
  const bruto = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!bruto) return "";
  const cache = `${uf ?? ""}|${bruto}`;
  const guardado = lembrete.get(cache);
  if (guardado !== undefined) return guardado;
  const resposta = resolverCidade(bruto, uf);
  lembrete.set(cache, resposta);
  return resposta;
}

function resolverCidade(bruto: string, uf?: string | null): string {
  const k = chave(bruto);
  if (!k) return bruto;

  const sigla = String(uf ?? "").trim().toUpperCase();
  const doEstado = BRAZIL_CITIES_BY_UF[sigla];
  if (doEstado) {
    const achou = doEstado.find(cidade => chave(cidade) === k);
    if (achou) return achou;
  }

  return catalogo().get(k) || titulo(bruto);
}

/** "Campinas/SP" — cidade saneada + UF, para legenda de uma linha. */
export function formatCityUf(city: string | null | undefined, uf: string | null | undefined): string {
  const cidade = formatCityName(city, uf);
  const sigla = String(uf ?? "").trim().toUpperCase();
  if (cidade && sigla) return `${cidade}/${sigla}`;
  return cidade || sigla;
}
