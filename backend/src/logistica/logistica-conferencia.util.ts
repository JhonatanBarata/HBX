import { haversineKm, type Coord, type RouteEngine } from './logistica-rota.service';

/**
 * S3 (25/07, PR25072026-ROTA-CONFERIDA) — SEMÁFORO de confiança do pino, matemática
 * PURA (sem banco, sem rede — Lei nº5 da frente: "gate 100% local, R$0"). Espelha o
 * espírito de `nucleo-geo.util.ts` (freio do geocode) e `logistica-geo-fonte.util.ts`
 * (multilocal): pino errado é PIOR que pino vazio (Lei nº1), então este util nunca
 * "confia por omissão" — verde é um ALLOWLIST fechado (fonte PROVADA no campo), tudo o
 * que não prova vira amarelo/vermelho.
 *
 * ── POR QUE UM SEMÁFORO E NÃO UM BOOLEANO ────────────────────────────────────────
 * A rota planejada (planRouteByRoads) já é matematicamente correta dado o pino que
 * recebeu — o que falta avisar é "esse PINO é confiável?" antes do entregador sair de
 * casa. `conferirParadas` roda em cima do resultado JÁ ORDENADO (mesmo motor da S1/S2),
 * então os `motivos[]` acumulam TODOS os problemas que bateram (Lei nº7: vermelho nunca
 * bloqueia a saída — é aviso, não trava).
 *
 * ── COMO O VERDE É DECIDIDO ───────────────────────────────────────────────────────
 * Não existe "default verde": uma parada só fica verde se NENHUM motivo (amarelo ou
 * vermelho) bateu. Vermelho sempre vence amarelo na cor final, mas o motivo amarelo que
 * bateu junto continua no array (auditoria completa, Lei nº4 "degradação nunca é
 * silenciosa").
 */

// ── LIMIARES (25/07) ──────────────────────────────────────────────────────────────
// Constantes nomeadas de propósito (nunca "número mágico" solto no meio da regra).
// Virarão config por empresa numa sprint futura (nenhuma migration nesta) — até lá são
// globais e iguais para todo tenant.

/** Distância (Haversine, km) da parada até a MEDIANA do dia acima da qual ela é
 *  considerada fora do agrupamento esperado ("fora do casulo"). */
export const TETO_CASULO_KM = 15;

/** A perna (trecho) até a parada vira outlier quando excede este múltiplo da mediana
 *  das pernas do dia — ver PISO_PERNA_OUTLIER_M para o piso absoluto. */
export const FATOR_PERNA_OUTLIER = 3;

/** Piso absoluto (metros) do limiar de perna_outlier: numa rota CURTA (mediana de
 *  pernas pequena, ex. bairro compacto), 3× a mediana pode virar poucas centenas de
 *  metros — sem este piso, qualquer perna levemente maior soaria alarme falso numa
 *  rota que é só... curta. O limiar real é sempre max(3×mediana, este piso). */
export const PISO_PERNA_OUTLIER_M = 2000;

/** Casas decimais da "célula" de pino compartilhado (~11m de lado no equador, a 4
 *  casas). Assinatura do incidente 25/07 (empresa 41): endereços colapsados no MESMO
 *  centroide de via viravam pino idêntico para clientes diferentes (154/248 casos). */
export const CELULA_PINO_DECIMAIS = 4;

/** Divergência (metros) entre o pino resolvido e a coordenada da ÚLTIMA entrega
 *  CONCLUÍDA (GPS de ouro histórico) do mesmo cliente/local acima da qual o cadastro
 *  provavelmente está errado (mesmo que protegido por `gps_cadastro` — decisão humana
 *  intocável que este alerta NÃO sobrescreve, só denuncia). */
export const DIVERGE_GPS_OURO_METROS = 300;

/** Fontes PROVADAS no campo (GPS real, seja da entrega ou do cadastro humano com
 *  precisão validada — ver GPS_ACCURACY_LIMITE_METROS em logistica-geo-fonte.util.ts).
 *  É o ÚNICO caminho pra verde; qualquer coisa fora daqui vira amarelo. */
const GEOFONTES_PROVADAS = new Set(['gps_entrega', 'gps_cadastro']);

export type SemaforoCor = 'verde' | 'amarelo' | 'vermelho';

export type MotivoConferencia =
  | 'sem_pino'
  | 'pino_compartilhado'
  | 'fora_do_casulo'
  | 'perna_outlier'
  | 'diverge_gps_ouro'
  | 'geocode_nao_provado_em_campo'
  | 'fonte_nao_confiavel'
  | 'nunca_entregue'
  | 'rota_degradada';

/** Motivos que, sozinhos, já colocam a parada em vermelho (vence qualquer amarelo). */
const MOTIVOS_VERMELHOS = new Set<MotivoConferencia>([
  'sem_pino',
  'pino_compartilhado',
  'fora_do_casulo',
  'perna_outlier',
  'diverge_gps_ouro',
]);

/**
 * Entrada por parada — já resolvida (lat/lng/geoFonte pela regra multilocal,
 * legDistanceM pelo planRouteByRoads). `temEntregaConcluida` e `distanciaGpsOuroM` são
 * calculados pelo SERVIÇO (1 query agregada cada, nunca N+1 — ver
 * logistica-conferencia.service.ts) porque exigem banco; este util fica 100% puro.
 */
export interface ParadaConferenciaInput {
  id: string;
  lat: number | null;
  lng: number | null;
  /** geoFonte da fonte ESCOLHIDA por `resolverCoordenadaMultilocal` (local ou perfil,
   *  nunca misturado) — null quando não há coordenada ou fonte legada sem o campo. */
  geoFonte: string | null;
  /** Trecho (metros) da parada anterior (ou origem) até esta — null quando não há
   *  ponto de partida conhecido ou a própria parada está sem coordenada. */
  legDistanceM: number | null;
  /** Já existiu ALGUMA entrega CONCLUÍDA para este cliente/local? false = nunca
   *  entregue OU o serviço não conseguiu apurar (mesmo tratamento cauteloso). */
  temEntregaConcluida: boolean;
  /** Distância (metros) até a coordenada da última entrega CONCLUÍDA do mesmo
   *  cliente/local; null = sem histórico de comparação (nunca entregue, ou parada sem
   *  coordenada — não dá pra medir divergência de um pino que não existe). */
  distanciaGpsOuroM: number | null;
}

export interface ConferenciaContexto {
  /** Motor que produziu a rota (S1) — 'haversine' pinta TODAS de amarelo NO MÍNIMO
   *  (rota_degradada), nunca em silêncio (Lei nº4). */
  engine: RouteEngine;
}

export interface ParadaConferida {
  id: string;
  semaforo: SemaforoCor;
  motivos: MotivoConferencia[];
}

/** true nos dois eixos, finito, dentro da faixa e nunca 0,0 (mesmo crivo de `hasCoord`
 *  em logistica-rota.service.ts, reescrito aqui p/ assinatura (lat,lng) em vez de
 *  Stop — evita montar um Stop de mentira só pra checar coordenada). */
function temCoordenadaValida(lat: number | null, lng: number | null): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Mediana simples (ordena e pega o meio; par = média dos dois centrais). Vazio → 0
 *  (chamador sempre confere `length` antes de decidir algo crítico com o resultado). */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];
}

/** Ponto de referência do "casulo": mediana de lat e mediana de lng, cada eixo
 *  independente — barato (sem convex hull/centroide geométrico) e a mediana por eixo
 *  não se deixa puxar por 1 outlier isolado como a média se deixaria. null com 0
 *  paradas com coordenada (nada pra comparar). */
function pontoMedianoCasulo(pontos: Coord[]): Coord | null {
  if (pontos.length === 0) return null;
  return { lat: mediana(pontos.map((p) => p.lat)), lng: mediana(pontos.map((p) => p.lng)) };
}

/** Assinatura de célula (~11m de lado no equador a 4 casas) — mesma ideia do
 *  "centroide de via" do incidente 25/07: duas paradas na MESMA célula compartilham
 *  pino mesmo sem serem bit-a-bit iguais (arredondamento de ponto flutuante). */
function celulaPino(lat: number, lng: number): string {
  return `${lat.toFixed(CELULA_PINO_DECIMAIS)}:${lng.toFixed(CELULA_PINO_DECIMAIS)}`;
}

/** geoFonte fora do allowlist provado: 'geocode' tem motivo NOMEADO (é o caso mais
 *  comum e mais documentado — o freio do geocode nasceu dele); qualquer outra coisa
 *  (gps_impreciso, legado sem o campo) recebe o motivo genérico — mesma cautela,
 *  string diferente pra não confundir "veio de geocode" com "GPS baixa precisão". */
function motivoDeGeoFonte(geoFonte: string | null): 'geocode_nao_provado_em_campo' | 'fonte_nao_confiavel' | null {
  if (GEOFONTES_PROVADAS.has(String(geoFonte))) return null;
  return geoFonte === 'geocode' ? 'geocode_nao_provado_em_campo' : 'fonte_nao_confiavel';
}

/**
 * Classifica TODAS as paradas do dia de uma vez (precisa do conjunto inteiro pra
 * calcular a mediana/casulo/células compartilhadas — não dá pra decidir 1 parada
 * isolada dessas 3 regras). Pura: mesma entrada sempre produz a mesma saída.
 */
export function conferirParadas(paradas: ParadaConferenciaInput[], contexto: ConferenciaContexto): ParadaConferida[] {
  const comCoord = paradas.filter((p) => temCoordenadaValida(p.lat, p.lng));

  const centroCasulo = pontoMedianoCasulo(comCoord.map((p) => ({ lat: p.lat as number, lng: p.lng as number })));

  // pino_compartilhado: agrupa por célula: qualquer célula com ≥2 paradas marca TODAS
  // as paradas daquela célula (não só a "segunda" — nenhuma delas provou ser a dona
  // exclusiva do pino).
  const porCelula = new Map<string, string[]>();
  for (const p of comCoord) {
    const chave = celulaPino(p.lat as number, p.lng as number);
    const lista = porCelula.get(chave);
    if (lista) lista.push(p.id);
    else porCelula.set(chave, [p.id]);
  }
  const idsCompartilhados = new Set<string>();
  for (const ids of porCelula.values()) {
    if (ids.length >= 2) ids.forEach((id) => idsCompartilhados.add(id));
  }

  // perna_outlier: mediana só das pernas MEDÍVEIS (null fica de fora — 1ª parada sem
  // origem, ou parada sem coordenada já é sem_pino por outro motivo).
  const pernasMediveis = paradas.map((p) => p.legDistanceM).filter((v): v is number => typeof v === 'number');
  const medianaPernaM = mediana(pernasMediveis);
  const limiarPernaM = Math.max(FATOR_PERNA_OUTLIER * medianaPernaM, PISO_PERNA_OUTLIER_M);

  return paradas.map((p) => {
    const motivos: MotivoConferencia[] = [];
    const temCoord = temCoordenadaValida(p.lat, p.lng);

    if (!temCoord) {
      // Sem pino: nenhuma das outras regras geográficas faz sentido (não dá pra medir
      // casulo/célula/perna de um ponto que não existe) — mas rota_degradada abaixo
      // ainda se aplica (é sobre o MOTOR, não sobre esta parada).
      motivos.push('sem_pino');
    } else {
      if (idsCompartilhados.has(p.id)) motivos.push('pino_compartilhado');
      if (centroCasulo && haversineKm({ lat: p.lat as number, lng: p.lng as number }, centroCasulo) > TETO_CASULO_KM) {
        motivos.push('fora_do_casulo');
      }
      if (typeof p.legDistanceM === 'number' && p.legDistanceM > limiarPernaM) {
        motivos.push('perna_outlier');
      }
      if (typeof p.distanciaGpsOuroM === 'number' && p.distanciaGpsOuroM > DIVERGE_GPS_OURO_METROS) {
        motivos.push('diverge_gps_ouro');
      }

      const motivoFonte = motivoDeGeoFonte(p.geoFonte);
      if (motivoFonte) motivos.push(motivoFonte);
      if (!p.temEntregaConcluida) motivos.push('nunca_entregue');
    }

    // rota_degradada é sobre o MOTOR do dia inteiro, não sobre o pino desta parada —
    // acumula mesmo quando já há motivo vermelho (Lei nº4: nunca fica escondido atrás
    // de um vermelho mais chamativo).
    if (contexto.engine === 'haversine') motivos.push('rota_degradada');

    const temMotivoVermelho = motivos.some((m) => MOTIVOS_VERMELHOS.has(m));
    const semaforo: SemaforoCor = temMotivoVermelho ? 'vermelho' : motivos.length > 0 ? 'amarelo' : 'verde';

    return { id: p.id, semaforo, motivos };
  });
}
