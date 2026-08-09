"use client";

// ================================================================
// LOGÍSTICA — helpers de ENDEREÇO do cockpit (desktop).
//
// 🔴 09/08 — O MOTOR DE GEOCODING MORREU AQUI. Este arquivo tinha uma cópia à
// mão da régua do servidor (ViaCEP direto + Nominatim direto, com
// `escolherCandidatoConfiavel`, `viasCompativeis`, `normalizeVia`, `TIPO_VIA`,
// `semAcento` e `ufDoEstado` repetidos de `backend/src/nucleo/nucleo-geo.util.ts`).
// As duas cópias divergiram: o servidor aprendeu numeral por extenso ("Rua 8" =
// "RUA OITO") e token colado ("Av. M55" = "AVENIDA M CINQUENTA E CINCO") e
// resolve pela base de endereços do IBGE (porta a porta, local) ANTES de
// qualquer serviço externo — enquanto o navegador ficou na régua de 25/07 e
// RECUSAVA a base inteira de quem mora em rua numerada. Régua em dois lugares
// não é régua: a tela que existe pra CONSERTAR endereço estava rodando o motor
// mais fraco do sistema.
//
// Quem resolve endereço agora é o SERVIDOR, pelas portas que já existiam (as
// mesmas da Rota rápida e do APK):
//   · GET /logistica/geo/cep?cep=&numero=&uf=  → texto do CEP + ponto (+precisão)
//   · GET /logistica/geo/reverse?lat=&lng=     → ponto do GPS → endereço
//
// Aqui só ficou o que NÃO é régua: formatação de CEP e o link do minimapa.
// ================================================================

export interface Ponto {
  lat: number;
  lng: number;
}

/** Só os dígitos de uma string ("01001-000" → "01001000"). */
export function soDigitos(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

/** "00000000" → "00000-000" (mantém parcial intacto durante a digitação). */
export function formatarCep(s: string): string {
  const d = soDigitos(s).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ── Minimapa: iframe do OpenStreetMap com o pino no ponto ────────────────────
export function mapaEmbedUrl(p: Ponto): string {
  const d = 0.004; // ~450m de janela em volta do pino
  const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat}%2C${p.lng}`;
}
