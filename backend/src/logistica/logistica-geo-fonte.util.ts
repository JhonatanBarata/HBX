// MULTILOCAL — escolhe a FONTE (LocalEntrega da entrega OU perfil do cliente) de onde
// tirar lat/lng/geoFonte, NUNCA misturando campos de fontes diferentes.
//
// Extraído em util próprio (25/07) porque o jeito ingênuo — cada campo com seu
// próprio `??` (`local?.lat ?? perfil?.lat`, `local?.lng ?? perfil?.lng`) — pode
// devolver a lat de uma fonte e a lng de outra, criando um pino no meio do nada:
// exatamente o "pino que mentia" que o freio do geocode (nucleo-geo.util.ts) matou.
// Pior ainda: `r.local ? r.local.lat : r.customerProfile.lat` (testar só a
// EXISTÊNCIA do objeto `local`, não se ele TEM coordenada) descarta um pino BOM do
// perfil sempre que o LocalEntrega existe sem lat/lng — caso real dos ~824
// registros que o backfill de 25/07 deixou com coordenada null de propósito.
//
// LEI (25/07, incidente empresa 41): pino errado é PIOR que pino vazio — mas um
// pino BOM que existe jamais pode ser descartado. Este helper resolve as duas leis
// juntas: escolhe a fonte inteira primeiro (local só vale com lat E lng válidos),
// depois tira lat/lng/geoFonte SEMPRE da mesma fonte escolhida.
import { pinoValido } from '../nucleo/nucleo-geo.util';

export interface FonteGeoCoord {
  lat: number | null | undefined;
  lng: number | null | undefined;
  geoFonte?: string | null | undefined;
}

export interface CoordenadaResolvida {
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
}

/**
 * A fonte tem PINO? Régua única da casa (`pinoValido`, nucleo-geo.util) — finito,
 * dentro da faixa e nunca 0,0.
 *
 * 🔴 09/08 — aqui a régua era FROUXA (só "número finito"), e este é o pior lugar
 * possível pra isso: é ela que ESCOLHE a fonte. Um 0,0 gravado num LocalEntrega
 * ganhava de um pino BOM do perfil, e a parada saía do mapa com a coordenada certa
 * ali do lado. Ver o comentário de `pinoValido`.
 */
function temCoordenadaValida(
  fonte: FonteGeoCoord | null | undefined,
): fonte is FonteGeoCoord & { lat: number; lng: number } {
  return !!fonte && pinoValido(fonte.lat, fonte.lng);
}

/**
 * QUAL fonte a regra multilocal escolheu — 'local', 'perfil' ou nenhuma. Extraído
 * (26/07) porque a conferência precisa ler o ENDEREÇO (cep/logradouro/cidade/uf) da
 * MESMA fonte de onde veio o pino: ler o CEP do perfil e a rua do local (ou vice-versa)
 * recria, no texto, exatamente o "pino Frankenstein" que este util nasceu pra matar.
 * `resolverCoordenadaMultilocal` usa esta função — as duas NUNCA podem divergir.
 */
export function fonteEscolhidaMultilocal(
  local: FonteGeoCoord | null | undefined,
  perfil: FonteGeoCoord | null | undefined,
): 'local' | 'perfil' | null {
  if (temCoordenadaValida(local)) return 'local';
  if (temCoordenadaValida(perfil)) return 'perfil';
  return null;
}

/**
 * Resolve lat/lng/geoFonte pro MULTILOCAL: prioriza o LOCAL da entrega (cada porta
 * tem sua própria coordenada) — mas SÓ se ele tiver lat E lng válidos; senão a fonte
 * inteira cai pro PERFIL do cliente (legado). Nunca combina um campo de cada.
 *
 *  - local com lat+lng válidos            → usa o LOCAL inteiro.
 *  - local existe mas sem coord (ou parcial: só lat OU só lng) → usa o PERFIL inteiro.
 *  - nenhum dos dois tem coordenada válida → { lat: null, lng: null, geoFonte: null }.
 */
export function resolverCoordenadaMultilocal(
  local: FonteGeoCoord | null | undefined,
  perfil: FonteGeoCoord | null | undefined,
): CoordenadaResolvida {
  const escolhida = fonteEscolhidaMultilocal(local, perfil);
  const fonte = escolhida === 'local' ? local! : escolhida === 'perfil' ? perfil! : null;
  return {
    lat: fonte ? fonte.lat : null,
    lng: fonte ? fonte.lng : null,
    geoFonte: fonte?.geoFonte ?? null,
  };
}

/**
 * O ENDEREÇO da fonte escolhida — a irmã EM TEXTO de `resolverCoordenadaMultilocal`
 * (09/08, ordem do dono: "celular tem que espelhar os mesmos dados que o desktop tem").
 *
 * Nasceu extraída da conferência (`enderecoDaFonteEscolhida`), que já tinha a regra
 * certa, para que as prévias do dia parassem de inventar a sua: a lista de montagem
 * do APK mostrava o APELIDO do local — um campo que 100% dos clientes da empresa 41
 * têm vazio — enquanto o mesmo cliente aparecia com "Rua M-7, 897 - Jardim Cervezão"
 * no computador. Endereço é DADO, e dado não pode mudar de valor conforme a tela.
 *
 * Regra (idêntica à da conferência, e agora com um dono só):
 *  - a fonte é a MESMA que deu o pino (`fonteEscolhidaMultilocal`) — nunca o CEP de
 *    um com a rua do outro, que é o "Frankenstein" que este arquivo existe pra matar;
 *  - exceção única: a fonte escolhida (ou a ausência dela, quando ninguém tem pino)
 *    não tem endereço NENHUM → cai pro perfil, que no legado é onde o endereço mora.
 *    Fonte com endereço PARCIAL não cai: completar com o do perfil recria a mistura.
 */
export interface FonteEnderecoCadastro {
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

function copiarEndereco(fonte: FonteEnderecoCadastro | null | undefined): Required<FonteEnderecoCadastro> {
  return {
    cep: fonte?.cep ?? null,
    endereco: fonte?.endereco ?? null,
    numero: fonte?.numero ?? null,
    complemento: fonte?.complemento ?? null,
    bairro: fonte?.bairro ?? null,
    cidade: fonte?.cidade ?? null,
    uf: fonte?.uf ?? null,
  };
}

/** Tem QUALQUER coisa comparável contra o CEP? (bairro sozinho não conta — ele não
 *  entra na comparação, ver logistica-cep.util.ts). */
function temEnderecoUtil(e: Required<FonteEnderecoCadastro>): boolean {
  return Boolean(
    String(e.cep ?? '').trim()
    || String(e.endereco ?? '').trim()
    || String(e.cidade ?? '').trim()
    || String(e.uf ?? '').trim(),
  );
}

export function enderecoDaFonteMultilocal(
  local: (FonteGeoCoord & FonteEnderecoCadastro) | null | undefined,
  perfil: (FonteGeoCoord & FonteEnderecoCadastro) | null | undefined,
): Required<FonteEnderecoCadastro> {
  const escolhida = fonteEscolhidaMultilocal(local, perfil);
  const daFonte = copiarEndereco(escolhida === 'local' ? local : perfil);
  if (temEnderecoUtil(daFonte)) return daFonte;
  return copiarEndereco(perfil);
}

/**
 * A linha de endereço que a tela mostra — "Rua M-7, 897". Uma função só porque
 * MONTAGEM e ROTA são a mesma lista de gente: duas montagens viram duas verdades.
 * `numero` já dentro do texto (legado "Rua X, 123 - Centro") não é repetido.
 */
export function linhaEnderecoDaFonte(e: FonteEnderecoCadastro | null | undefined): string {
  const rua = String(e?.endereco ?? '').trim();
  const numero = String(e?.numero ?? '').trim();
  if (!rua) return numero ? `nº ${numero}` : '';
  if (!numero) return rua;
  // "Rua X, 123" já traz o número — repetir viraria "Rua X, 123, 123".
  const temNumeroNoTexto = new RegExp(`(^|[^0-9])${numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`).test(rua);
  return temNumeroNoTexto ? rua : `${rua}, ${numero}`;
}

/* ── A ESCADA DA PROCEDÊNCIA DO PINO (09/08) — escrita em UM lugar só ─────────
 *
 * `geoFonte` não é etiqueta: é a PROCEDÊNCIA do ponto, e procedência tem hierarquia.
 * Do melhor pro pior:
 *  · gps_entrega  — o entregador confirmou NA PORTA. É o melhor dado que a casa tem.
 *  · gps_cadastro — decisão humana explícita com precisão validada (<=60m). Intocável.
 *  · cnefe        — porta do Censo/IBGE casando (CEP, NÚMERO): é o ENDEREÇO virando ponto.
 *  · cnefe_cep    — ponto do TRECHO do CEP (endereço S/N). Acerta a rua, não a casa.
 *  · geocode / gps_impreciso / cidade — nunca foram provados no chão.
 *  · null / ''    — sem procedência. Pino sem dono é mentira: vale ZERO.
 *
 * 🔴 ELA MORAVA EM QUATRO LUGARES, E OS QUATRO JÁ DISCORDAVAM (medido em 09/08):
 *  · `FONTES_SUBSTITUIVEIS_PELA_PORTA` (conferência) não conhecia `cnefe_cep`;
 *  · `GEOFONTES_DA_PORTA` (semáforo) não era nem exportada;
 *  · `FONTES_PROVADAS` (fechamento do dia) dizia no comentário seguir "a MESMA lei do
 *    semáforo" e estava sem o `cnefe` que o semáforo ganhou em 06/08 — 206 locais e 151
 *    perfis curados pelo Censo contavam como "não provados" e o convite de GPS voltava
 *    a aparecer pra quem já tinha a porta resolvida;
 *  · e o sync perfil→local, que é quem MAIS mexe em pino, não tinha nenhuma.
 * Mora aqui, e não no cadastro, porque este arquivo é o dono do assunto `geoFonte` — e
 * os dois lados (núcleo e logística) já o importam.
 */
export type GeoFonteGravada =
  | 'gps_entrega'
  | 'gps_cadastro'
  | 'cnefe'
  | 'cnefe_cep'
  | 'geocode'
  | 'gps_impreciso'
  | 'cidade';

export const FORCA_GEO_FONTE: Readonly<Record<GeoFonteGravada, number>> = Object.freeze({
  gps_entrega: 5,
  gps_cadastro: 4,
  cnefe: 3,
  cnefe_cep: 2,
  geocode: 1,
  gps_impreciso: 1,
  cidade: 1,
});

/**
 * As 3 fontes que resolvem a PORTA: ponto daquela casa, não da rua nem do centroide do
 * CEP. Pino assim NUNCA é rebaixado por cópia automática, NUNCA é sobrescrito pela cura
 * e conta como "provado" na medida do dia. É a MESMA lista nos três lugares — era
 * exatamente isso que não acontecia.
 */
export const GEO_FONTES_DA_PORTA: readonly GeoFonteGravada[] = Object.freeze([
  'gps_entrega',
  'gps_cadastro',
  'cnefe',
] as GeoFonteGravada[]);

/** Fonte conhecida? (`hasOwnProperty` de propósito: `geoFonte` vem do banco como string
 *  crua, e `FORCA['toString']` devolveria uma função em vez de "não conheço"). */
function fonteConhecida(v: string | null | undefined): v is GeoFonteGravada {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FORCA_GEO_FONTE, v);
}

/** Posição na escada acima; desconhecida/vazia/null = 0 (o chão). */
export function forcaGeoFonte(v: string | null | undefined): number {
  return fonteConhecida(v) ? FORCA_GEO_FONTE[v] : 0;
}

/** O pino foi provado na PORTA (gps_entrega | gps_cadastro | cnefe)? */
export function geoFonteDaPorta(v: string | null | undefined): boolean {
  return fonteConhecida(v) && GEO_FONTES_DA_PORTA.includes(v);
}

/**
 * A cura pela PORTA do Censo pode trocar este pino? Sim para tudo que está ABAIXO da
 * porta na escada — e isso agora inclui `cnefe_cep`, que a lista velha não conhecia:
 * o trecho do CEP acerta a rua, a porta acerta a casa, e trocar rua por casa é subir.
 * `''` cobre o legado sem o campo; `null` é tratado pelo chamador (no Prisma, `geoFonte:
 * null` não casa com `in`, então o WHERE precisa do OR).
 */
export const FONTES_SUBSTITUIVEIS_PELA_PORTA: readonly string[] = Object.freeze(
  ([...(Object.keys(FORCA_GEO_FONTE) as GeoFonteGravada[])]
    .filter((f) => !geoFonteDaPorta(f)) as string[])
    .concat(['']),
);

// ── TETO DE PRECISÃO DO GPS DE CADASTRO (25/07) ──────────────────────────────
//
// `geoFonte='gps_cadastro'` é a fonte INTOCÁVEL (logistica.service.ts:
// realimentarCoordenadaCliente/Local NUNCA reescrevem — "decisão humana
// explícita"). Até aqui ela era gravada SEM checar a precisão real do fix: um
// GPS de 300m capturado dentro de um galpão virava permanente, igual a um GPS
// de 5m na porta certa. `gpsDeOuro` (abaixo) já exige accuracy<=60m pra
// REALIMENTAR via entrega confirmada — mas o CADASTRO original nunca passava
// pelo mesmo crivo.
//
// Mesma constante para os DOIS lados (gpsDeOuro E a decisão de cadastro) —
// nada de "60" mágico repetido.
export const GPS_ACCURACY_LIMITE_METROS = 60;

/** accuracy numérica, finita, e dentro do teto — mesmo crivo do "GPS de ouro". */
export function gpsAccuracyDentroDoLimite(gpsAccuracy: unknown): boolean {
  return typeof gpsAccuracy === 'number' && Number.isFinite(gpsAccuracy) && gpsAccuracy <= GPS_ACCURACY_LIMITE_METROS;
}

export type GeoFonteCadastro = 'geocode' | 'gps_cadastro' | 'gps_impreciso';

/**
 * Decide a fonte a GRAVAR para uma coordenada de CADASTRO (perfil/local) que
 * chegou do cliente (app/site). Fail-closed (25/07, pedido do dono): quem
 * decide SE o fix é preciso o bastante pra virar `gps_cadastro` — a fonte
 * intocável — é SEMPRE o backend, nunca a alegação do cliente. Um chamador
 * batendo direto na API não pode se autodeclarar preciso.
 *
 * Regra:
 *  - `hasCoord=false`                → null (nenhuma coordenada, nada a decidir).
 *  - `geoFonteClient === 'geocode'`  → 'geocode' passa direto. Não é alegação
 *    de GPS preciso (vem do CEP/Nominatim, sempre foi aproximado por
 *    natureza) — nada a verificar aqui, `gpsAccuracy` não se aplica.
 *  - qualquer outro caso (cliente alegou 'gps_cadastro', mandou lixo, ou nem
 *    mandou `geoFonte` — o caso do app antigo que ainda não fala o contrato
 *    novo) → `gpsAccuracy` decide: numérico e <=60m vira 'gps_cadastro'
 *    (decisão humana intocável, como sempre foi); ausente/NaN/>60m vira
 *    'gps_impreciso' — guarda a coordenada (ordena rota), mas a realimentação
 *    por entrega confirmada PODE sobrescrever (não é intocável).
 */
export function decidirGeoFonteCadastro(
  hasCoord: boolean,
  geoFonteClient: string | null | undefined,
  gpsAccuracy: unknown,
): GeoFonteCadastro | null {
  if (!hasCoord) return null;
  if (geoFonteClient === 'geocode') return 'geocode';
  return gpsAccuracyDentroDoLimite(gpsAccuracy) ? 'gps_cadastro' : 'gps_impreciso';
}
