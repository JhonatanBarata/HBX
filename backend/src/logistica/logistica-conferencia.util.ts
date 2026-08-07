import { haversineKm, type Coord, type RouteEngine } from './logistica-rota.service';
// A régua de "é a mesma porta?" é UMA só no sistema (nasceu em 28/07 pra barrar
// duplicata na Rota rápida do APK): número + via compatível + CEP/cidade, agora com a
// unidade (apto/bloco) como veto. Reimplementar aqui criaria uma segunda verdade —
// e é justamente o desencontro entre "mesmo ponto" e "mesmo endereço" que este
// arquivo passou a distinguir em 06/08.
import { mesmaPorta, numeroDaPorta, type PortaCadastro } from '../nucleo/endereco-porta.util';

/**
 * S3 (25/07, PR25072026-ROTA-CONFERIDA) — SEMÁFORO de confiança do pino, matemática
 * PURA (sem banco, sem rede — Lei nº5 da frente: "gate 100% local, R$0"). Espelha o
 * espírito de `nucleo-geo.util.ts` (freio do geocode) e `logistica-geo-fonte.util.ts`
 * (multilocal): pino errado é PIOR que pino vazio (Lei nº1), então este util nunca
 * "confia por omissão" — todo problema detectado entra em `motivos[]`, sempre. O que
 * mudou em 26/07 é só QUEM PINTA a parada (ver bloco "DUAS CORES" abaixo).
 *
 * ── POR QUE UM SEMÁFORO E NÃO UM BOOLEANO ────────────────────────────────────────
 * A rota planejada (planRouteByRoads) já é matematicamente correta dado o pino que
 * recebeu — o que falta avisar é "esse PINO é confiável?" antes do entregador sair de
 * casa. `conferirParadas` roda em cima do resultado JÁ ORDENADO (mesmo motor da S1/S2),
 * então os `motivos[]` acumulam TODOS os problemas que bateram (Lei nº7: vermelho nunca
 * bloqueia a saída — é aviso, não trava).
 *
 * ── 26/07: DUAS CORES, NÃO TRÊS (ordem do dono) ──────────────────────────────────
 * O amarelo MORREU. Medido em produção no dia 26/07: rota de 97 paradas → 0 verdes / 74
 * vermelhas / 23 amarelas; rota de 10 → 0 verdes / 3 / 7. Motivo: `geocode_nao_provado_
 * em_campo` e `nunca_entregue` são o estado NORMAL de cliente novo (pino veio de endereço
 * digitado, ninguém entregou lá ainda) e QUALQUER motivo pintava — "verde" era
 * matematicamente inalcançável numa base nova. Alarme que toca em 100% das paradas não é
 * alarme, é ruído.
 *
 * Agora: só motivo IMPEDITIVO pinta (vermelho); o resto continua sendo apurado e
 * devolvido em `motivos[]` (auditoria/saúde da base, Lei nº4 "degradação nunca é
 * silenciosa") mas NÃO vira cor nem frase na tela. Sem motivo impeditivo = verde.
 */

// ── LIMIARES (25/07) ──────────────────────────────────────────────────────────────
// Constantes nomeadas de propósito (nunca "número mágico" solto no meio da regra).
// Virarão config por empresa numa sprint futura (nenhuma migration nesta) — até lá são
// globais e iguais para todo tenant.

/** Distância (Haversine, km) da parada até a MEDIANA do dia acima da qual ela é
 *  considerada fora do agrupamento esperado ("fora do casulo"). */
export const TETO_CASULO_KM = 15;

/** A perna (trecho) até a parada vira outlier quando excede este múltiplo da mediana
 *  das pernas do dia — ver PISO_PERNA_OUTLIER_M para o piso absoluto.
 *  27/07 (incidente company 48): 3× pintava MEIA rota real — numa rota de 58 km/54
 *  paradas, pernas legítimas de 2,4–2,8 km (borda de cidade, zona rural) estouravam
 *  o limiar e "Muito longe das outras paradas" virou ruído em massa. 5× a mediana
 *  só acusa perna realmente anômala. */
export const FATOR_PERNA_OUTLIER = 5;

/** Piso absoluto (metros) do limiar de perna_outlier: numa rota CURTA (mediana de
 *  pernas pequena, ex. bairro compacto), o múltiplo da mediana pode virar poucas
 *  centenas de metros — sem este piso, qualquer perna levemente maior soaria alarme
 *  falso numa rota que é só... curta. O limiar real é sempre max(fator×mediana, piso).
 *  27/07: 2000→2500 pela mesma calibração do fator acima. */
export const PISO_PERNA_OUTLIER_M = 2500;

/* 06/08 — a "célula de pino" MORREU (era CELULA_PINO_DECIMAIS, ~11m). Ela agrupava
   clientes por PROXIMIDADE pra acusar endereço repetido, o que inverte a hierarquia do
   endereçamento: a coordenada é RESULTADO da chave (CEP → número → complemento), nunca
   a chave. Quem decide duplicata agora é `gemeosDePorta`, e o pino colapsado no
   centroide do CEP aparece pela FONTE (`geocode_nao_provado_em_campo`) — que é o que
   ele sempre foi. */

/** Divergência (metros) entre o pino resolvido e a coordenada da ÚLTIMA entrega
 *  CONCLUÍDA (GPS de ouro histórico) do mesmo cliente/local acima da qual o cadastro
 *  provavelmente está errado (mesmo que protegido por `gps_cadastro` — decisão humana
 *  intocável que este alerta NÃO sobrescreve, só denuncia). */
export const DIVERGE_GPS_OURO_METROS = 300;

/** Fontes PROVADAS no campo (GPS real, seja da entrega ou do cadastro humano com
 *  precisão validada — ver GPS_ACCURACY_LIMITE_METROS em logistica-geo-fonte.util.ts).
 *  Fora daqui o motivo é apurado e registrado, mas é INFORMATIVO (não pinta). */
const GEOFONTES_PROVADAS = new Set(['gps_entrega', 'gps_cadastro']);

/** 26/07: o amarelo morreu (ver cabeçalho). Só existe "tem problema impeditivo" ou não. */
export type SemaforoCor = 'verde' | 'vermelho';

export type MotivoConferencia =
  | 'sem_pino'
  | 'endereco_repetido'
  | 'cep_endereco_divergente'
  | 'endereco_sem_numero'
  | 'fora_do_casulo'
  | 'perna_outlier'
  | 'diverge_gps_ouro'
  | 'geocode_nao_provado_em_campo'
  | 'fonte_nao_confiavel'
  | 'nunca_entregue'
  | 'rota_degradada';

/**
 * IMPEDITIVOS (26/07, ordem do dono) — os ÚNICOS que pintam a parada e que o motorista
 * chega a ler. Todos têm a mesma cara: são coisa que ele PRECISA resolver antes de sair,
 * porque o app não sabe onde ir ou sabe que vai pro lugar errado.
 */
const MOTIVOS_IMPEDITIVOS = new Set<MotivoConferencia>([
  'sem_pino',
  'endereco_repetido',
  'cep_endereco_divergente',
  'endereco_sem_numero',
  'fora_do_casulo',
  'perna_outlier',
  'diverge_gps_ouro',
]);

/**
 * INFORMATIVOS — continuam sendo apurados e devolvidos em `motivos[]` (auditoria, saúde da
 * base, sprints de qualidade), mas NUNCA pintam a parada nem viram frase na tela.
 *
 * Por que mudou (26/07): `geocode_nao_provado_em_campo` e `nunca_entregue` são o estado
 * NORMAL de todo cliente novo — o pino veio de endereço digitado e ninguém entregou lá
 * ainda. Com eles pintando, "verde" era matematicamente inalcançável numa base nova: as
 * duas rotas medidas em produção deram 0 verdes de 97 e 0 de 10. `rota_degradada` é do
 * MOTOR do dia inteiro, não desta parada, e já tem faixa própria na tela (routeEngineBanner)
 * — pintar as 97 paradas com ele era dizer a mesma coisa 97 vezes.
 */
const MOTIVOS_INFORMATIVOS = new Set<MotivoConferencia>([
  'geocode_nao_provado_em_campo',
  'fonte_nao_confiavel',
  'nunca_entregue',
  'rota_degradada',
]);

/** Só o que é impeditivo aparece pro motorista — o resto é dado interno. */
export function motivoEhImpeditivo(motivo: MotivoConferencia): boolean {
  return MOTIVOS_IMPEDITIVOS.has(motivo);
}

/** Espelho de `motivoEhImpeditivo`, pra quem precisa filtrar o lado silencioso. */
export function motivoEhInformativo(motivo: MotivoConferencia): boolean {
  return MOTIVOS_INFORMATIVOS.has(motivo);
}

/**
 * ORDEM DE GRAVIDADE do que o motorista lê. Primeiro o que ele CONSEGUE resolver agora e
 * que invalida o endereço inteiro (CEP × endereço), depois o pino ausente/duplicado,
 * depois as suspeitas geométricas. O front mostra `motivosVisiveis` NESTA ordem — a ordem
 * em que os motivos foram empilhados durante a apuração é interna, nunca de exibição.
 */
export const ORDEM_GRAVIDADE_IMPEDITIVOS: readonly MotivoConferencia[] = [
  'cep_endereco_divergente',
  // Logo depois do CEP: é o erro mais BARATO de corrigir (uma edição de cadastro) e o que
  // mais estraga entrega — endereço sem número manda o entregador pro meio da rua.
  'endereco_sem_numero',
  'sem_pino',
  // Antes do pino: "duas contas na mesma porta" é problema de CADASTRO e tem resposta
  // curta do dono (é o apartamento tal, ou é cadastro repetido). O pino grosseiro é
  // trabalho de mapa, vem depois.
  'endereco_repetido',
  'diverge_gps_ouro',
  'fora_do_casulo',
  'perna_outlier',
];

/**
 * Filtra `motivos[]` pro que o motorista vê, já ordenado por gravidade. Único lugar que
 * decide "o que aparece na tela" — nem o serviço nem o front repetem essa regra.
 */
export function motivosVisiveisOrdenados(motivos: MotivoConferencia[]): MotivoConferencia[] {
  const presentes = new Set(motivos.filter(motivoEhImpeditivo));
  return ORDEM_GRAVIDADE_IMPEDITIVOS.filter((m) => presentes.has(m));
}

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
  /** O CEP cadastrado descreve OUTRO lugar (UF/cidade/rua) que não o endereço cadastrado?
   *  Quem consulta o ViaCEP é o SERVIÇO (logistica-cep.util.ts, fail-OPEN: só `true` com
   *  PROVA) — este util continua 100% puro e só recebe o veredito pronto. `false` cobre
   *  os dois silêncios: bate, ou não deu pra saber. */
  cepDivergente: boolean;
  /** O endereço da fonte escolhida não tem número (nem na coluna `numero`, nem dentro do
   *  texto composto `endereco` do legado) — ver `enderecoSemNumero` em
   *  logistica-cep.util.ts. NÃO depende de rede: vale com o ViaCEP fora do ar. */
  enderecoSemNumero: boolean;
  /** O ENDEREÇO da fonte escolhida (mesma fonte da coordenada), pra decidir se duas
   *  paradas no mesmo ponto são a mesma PORTA ou casas diferentes. Ausente = o
   *  chamador não sabe o endereço: aí duas paradas no mesmo ponto nunca provam
   *  duplicata e a acusação fica na mais branda (`pino_compartilhado`). */
  porta?: PortaCadastro | null;
}

export interface ConferenciaContexto {
  /** Motor que produziu a rota (S1) — 'haversine' acumula `rota_degradada` em TODAS as
   *  paradas (auditoria, Lei nº4), mas é INFORMATIVO desde 26/07: quem avisa o motorista
   *  disso é a faixa única do topo da tela, não 97 paradas repetindo a mesma frase. */
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

/** geoFonte fora do allowlist provado: 'geocode' tem motivo NOMEADO (é o caso mais
 *  comum e mais documentado — o freio do geocode nasceu dele); qualquer outra coisa
 *  (gps_impreciso, legado sem o campo) recebe o motivo genérico — mesma cautela,
 *  string diferente pra não confundir "veio de geocode" com "GPS baixa precisão". */
function motivoDeGeoFonte(geoFonte: string | null): 'geocode_nao_provado_em_campo' | 'fonte_nao_confiavel' | null {
  if (GEOFONTES_PROVADAS.has(String(geoFonte))) return null;
  return geoFonte === 'geocode' ? 'geocode_nao_provado_em_campo' : 'fonte_nao_confiavel';
}

/**
 * 🔴 A IDENTIDADE DO ENDEREÇO É A CHAVE, NUNCA A COORDENADA (06/08, ordem do dono).
 *
 * A régua velha perguntava "quem mais está perto deste ponto?" (célula de ~11m) e
 * chamava a resposta de endereço repetido. Isso INVERTE a hierarquia do endereçamento:
 * o ponto é RESULTADO da chave, não a chave. Medido na base real (company 41): dos 47
 * acusados, 31 tinham números de casa DIFERENTES na mesma avenida — cinco casas da
 * Avenida 74 (188, 197, 228, 232, 282) que o geocode empilhou no centroide do CEP. A
 * Adriana, com número único (= identidade única), era acusada de repetida.
 *
 * Como o mercado identifica um ponto de entrega:
 *  · Correios/DNE — logradouro + NÚMERO + COMPLEMENTO é o ponto de entrega;
 *  · USPS/DPV — valida o número na rua e, havendo unidade, se AQUELA unidade existe
 *    naquele prédio; deduplicação roda sobre os componentes padronizados;
 *  · last-mile — a chave canônica sai dos componentes; a coordenada entra depois, só
 *    pra ser CONFERIDA contra o CEP/rua (centroide é rejeitado, não vira entrega).
 *
 * Então esta função compara CHAVE com CHAVE (`mesmaPorta`), e coordenada não entra:
 * duas contas na mesma porta são duplicata mesmo sem pino NENHUM — caso que a régua
 * velha nem enxergava, porque exigia os dois pinos pra comparar. O que sobrava dela
 * ("mesmo ponto, endereços diferentes") não é problema de cadastro de ninguém: é
 * geocode que não chegou na porta, e isso se afere pela FONTE do pino
 * (`geocode_nao_provado_em_campo`), nunca pelos vizinhos.
 *
 * CUSTO: agrupa por número da casa (O(n)) e só compara par a par dentro do mesmo
 * número — nunca todos contra todos.
 */
export function gemeosDePorta(paradas: ParadaConferenciaInput[]): Map<string, string[]> {
  const porNumero = new Map<number, ParadaConferenciaInput[]>();
  for (const p of paradas) {
    const numero = p.porta ? numeroDaPorta(p.porta) : null;
    // Sem número não se decide nada (mesma lei de `mesmaPorta`): endereço sem porta
    // não identifica ninguém, e chutar duplicata aqui reaproveitaria a conta errada.
    if (!numero) continue;
    const lista = porNumero.get(numero);
    if (lista) lista.push(p);
    else porNumero.set(numero, [p]);
  }

  const saida = new Map<string, string[]>();
  const empurrar = (id: string, outro: string) => {
    const atual = saida.get(id);
    if (atual) atual.push(outro);
    else saida.set(id, [outro]);
  };

  for (const candidatos of porNumero.values()) {
    if (candidatos.length < 2) continue;
    for (let i = 0; i < candidatos.length; i += 1) {
      for (let j = i + 1; j < candidatos.length; j += 1) {
        const a = candidatos[i];
        const b = candidatos[j];
        // Condomínio: mesma porta com unidades declaradas e diferentes NÃO casa aqui
        // (a unidade veta dentro de `mesmaPorta`) — apartamento vizinho não é defeito.
        if (!mesmaPorta(a.porta as PortaCadastro, b.porta as PortaCadastro)) continue;
        empurrar(a.id, b.id);
        empurrar(b.id, a.id);
      }
    }
  }
  return saida;
}

/**
 * Classifica TODAS as paradas do dia de uma vez (precisa do conjunto inteiro pra
 * calcular a mediana/casulo/células compartilhadas — não dá pra decidir 1 parada
 * isolada dessas 3 regras). Pura: mesma entrada sempre produz a mesma saída.
 */
export function conferirParadas(paradas: ParadaConferenciaInput[], contexto: ConferenciaContexto): ParadaConferida[] {
  const comCoord = paradas.filter((p) => temCoordenadaValida(p.lat, p.lng));

  const centroCasulo = pontoMedianoCasulo(comCoord.map((p) => ({ lat: p.lat as number, lng: p.lng as number })));

  // Endereço repetido é decidido pela CHAVE (ver `gemeosDePorta`) e vale mesmo sem
  // pino: `paradas`, não `comCoord`. O painel de saúde lê a MESMA função.
  const gemeos = gemeosDePorta(paradas);

  // perna_outlier: mediana só das pernas MEDÍVEIS (null fica de fora — 1ª parada sem
  // origem, ou parada sem coordenada já é sem_pino por outro motivo).
  const pernasMediveis = paradas.map((p) => p.legDistanceM).filter((v): v is number => typeof v === 'number');
  const medianaPernaM = mediana(pernasMediveis);
  const limiarPernaM = Math.max(FATOR_PERNA_OUTLIER * medianaPernaM, PISO_PERNA_OUTLIER_M);
  // 27/07 (incidente company 48, caso "Vânia") — a PRIMEIRA parada nunca é
  // perna_outlier: a perna dela é o deslocamento da ORIGEM (casa do motorista)
  // até o começo da rota — 5,5 km de casa não é anomalia de pino de ninguém.
  const primeiraComPerna = paradas.find((p) => typeof p.legDistanceM === 'number');

  return paradas.map((p) => {
    const motivos: MotivoConferencia[] = [];
    const temCoord = temCoordenadaValida(p.lat, p.lng);

    // CEP × endereço é sobre o CADASTRO, não sobre o pino: vale com ou sem coordenada
    // (uma parada sem pino cujo CEP também está errado tem DOIS problemas pra corrigir,
    // não um). Vem pronto do serviço — fail-OPEN, só `true` com prova (logistica-cep.util.ts).
    if (p.cepDivergente) motivos.push('cep_endereco_divergente');
    // Mesma natureza: é sobre o CADASTRO, não sobre o pino. Custo ZERO (nenhuma rede),
    // então vale sempre — inclusive quando a checagem de CEP saiu em silêncio.
    if (p.enderecoSemNumero) motivos.push('endereco_sem_numero');
    // Endereço repetido é da CHAVE, não do pino: vale com ou sem coordenada (duas
    // contas na mesma porta são duplicata mesmo que nenhuma das duas tenha ponto).
    if (gemeos.has(p.id)) motivos.push('endereco_repetido');

    if (!temCoord) {
      // Sem pino: nenhuma das outras regras geográficas faz sentido (não dá pra medir
      // casulo/célula/perna de um ponto que não existe) — mas rota_degradada abaixo
      // ainda se aplica (é sobre o MOTOR, não sobre esta parada).
      motivos.push('sem_pino');
    } else {
      if (centroCasulo && haversineKm({ lat: p.lat as number, lng: p.lng as number }, centroCasulo) > TETO_CASULO_KM) {
        motivos.push('fora_do_casulo');
      }
      if (typeof p.legDistanceM === 'number' && p.legDistanceM > limiarPernaM && p !== primeiraComPerna) {
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
    // acumula sempre (Lei nº4: nunca fica escondido), mas é INFORMATIVO: a tela avisa
    // isso UMA vez, na faixa do topo, não 97 vezes parada a parada.
    if (contexto.engine === 'haversine') motivos.push('rota_degradada');

    // Duas cores só (26/07): impeditivo → vermelho; qualquer outra coisa → verde. Nada
    // de "verde só se motivos[] estiver vazio" — motivo informativo é dado interno.
    const semaforo: SemaforoCor = motivos.some(motivoEhImpeditivo) ? 'vermelho' : 'verde';

    return { id: p.id, semaforo, motivos };
  });
}
