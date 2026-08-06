import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import {
  conferirParadas,
  vizinhosDePino,
  type MotivoConferencia,
  type ParadaConferenciaInput,
} from './logistica-conferencia.util';

/**
 * Semáforo PRÓPRIO do painel de saúde da base (26/07). A conferência da ROTA perdeu o
 * amarelo naquela data (só pinta o que é impeditivo pro motorista que vai sair agora —
 * ver logistica-conferencia.util.ts), mas AQUI o amarelo é o produto: este painel é do
 * ADMIN, no PC, na véspera, e existe justamente pra mostrar a fila do "dá pra melhorar"
 * ("154 clientes precisam de pino, 7 se resolvem sozinhos"). Tipo local, contrato do
 * endpoint intacto (`verdes`/`amarelos`/`vermelhos` seguem iguais pro front).
 */
export type SemaforoBaseSaude = 'verde' | 'amarelo' | 'vermelho';

// Mesmo recorte "entrega ABERTA" da S3 (logistica-conferencia.service.ts,
// STATUS_ABERTO) — duplicado aqui de propósito: são 2 strings, e abrir a
// visibilidade de uma constante privada de outro serviço só pra isto não vale o
// acoplamento (mesma decisão já registrada no relatório da S3).
const STATUS_ABERTO_BASE_SAUDE = ['agendada', 'em_rota'] as const;

// Teto de segurança do findMany — nunca N+1 (1 query por tabela, sempre), mas
// também nunca "sem teto": um tenant patológico com dezenas de milhares de
// clientes não pode travar este endpoint. "Milhares" (linguagem do pedido) cabe
// MUITO folgado aqui; se algum dia bater, fica LOGADO (resultado parcial visível
// em log, nunca um corte silencioso).
const TETO_CLIENTES_BASE_SAUDE = 20_000;

/** Quantos NOMES de "mesmo ponto" viajam por cliente (o resto vira "e mais N"). */
const TETO_NOMES_MESMO_PONTO = 5;

// conferirParadas (S3) nasceu pra rodar em CIMA de uma rota do dia — duas das
// suas regras são sobre o TRAJETO, não sobre o pino:
//   - fora_do_casulo: compara contra a mediana geográfica das paradas do MOTOR do
//     dia. Base inteira ≠ rota do dia — um tenant real cobre uma cidade inteira
//     (ou mais), e cliente nenhum "mora fora do casulo" da própria base.
//   - perna_outlier / rota_degradada: não existe perna nem engine fora de uma rota.
// A entrada abaixo já é montada pra nenhuma das 3 achar o que disparar
// (legDistanceM sempre null, engine fixo 'osrm') — mas este Set filtra de novo na
// SAÍDA, como uma segunda trava: se `conferirParadas` mudar amanhã e passar a
// achar motivo mesmo com legDistanceM null (ou algum outro `engine` colar aqui por
// engano), este consumidor não vaza a regra de rota pro dono mesmo assim.
const MOTIVOS_DE_ROTA_FORA_DE_ESCOPO = new Set<MotivoConferencia>([
  'fora_do_casulo',
  'perna_outlier',
  'rota_degradada',
]);

// Espelha MOTIVOS_IMPEDITIVOS de logistica-conferencia.util.ts (privado lá) SEM
// fora_do_casulo/perna_outlier (que nunca chegam aqui — ver Set acima) — mantém
// diverge_gps_ouro na lista por documentação/futuro, mas hoje nunca dispara
// porque `distanciaGpsOuroM` sempre viaja `null` (ver ParadaConferenciaInput
// abaixo: essa regra não está no escopo desta sprint, S7-SAUDE-DA-BASE.md).
const MOTIVOS_VERMELHOS_BASE_SAUDE = new Set<MotivoConferencia>([
  'sem_pino',
  'pino_compartilhado',
  'diverge_gps_ouro',
]);

/**
 * S7 (25/07, PR25072026-ROTA-CONFERIDA) — "Saúde da base": a MESMA lente da S3
 * (semáforo de confiança do pino) apontada pro TENANT INTEIRO, não só a rota de
 * hoje. Tese do dono: o APK é o ÚLTIMO filtro — endereço se arruma na véspera, no
 * PC; o painel transforma a acusação pontual ("2 pendências na sua rota") em
 * serviço ("154 clientes da base precisam de pino — 7 se resolvem sozinhos na
 * próxima entrega").
 *
 * REUSA `conferirParadas` (mesmo cérebro puro da S3) com as regras que fazem
 * sentido olhando a base inteira de uma vez: `sem_pino`, `pino_compartilhado`
 * (célula ~11m a 4 casas — a MESMA assinatura do incidente 25/07, empresa 41,
 * agora medida contra TODA a base e não só a rota do dia),
 * `geocode_nao_provado_em_campo`/`fonte_nao_confiavel`, `nunca_entregue`. As
 * regras de ROTA (`fora_do_casulo`, `perna_outlier`, `rota_degradada`) NÃO se
 * aplicam — ver comentário de `MOTIVOS_DE_ROTA_FORA_DE_ESCOPO` acima.
 *
 * READ-ONLY ABSOLUTO: nenhuma query aqui é update/create/delete — só
 * findMany/groupBy. Não é a Lei nº3 (essa é sobre prepareRoute/wallet.debit, que
 * este serviço nem conhece), mas o espírito é o mesmo: um painel de diagnóstico
 * nunca muda o dado que está diagnosticando.
 */
@Injectable()
export class LogisticaBaseSaudeService {
  private readonly logger = new Logger(LogisticaBaseSaudeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBaseSaude(companyId: number): Promise<BaseSaudeResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    // 1ª query agregada: todo cliente ATIVO do tenant (papel `isCliente`) — mesmo
    // filtro usado em logistica-agenda.service.ts (isCliente:true, status:'active').
    const clientes = await this.prisma.customerProfile.findMany({
      where: { companyId, isCliente: true, status: 'active' },
      select: { id: true, name: true, lat: true, lng: true, geoFonte: true },
      orderBy: { name: 'asc' },
      take: TETO_CLIENTES_BASE_SAUDE,
    });
    if (clientes.length === 0) {
      return { totalClientes: 0, verdes: 0, amarelos: 0, vermelhos: 0, resolvemSozinhos: 0, percentVerde: 0, clientes: [] };
    }
    if (clientes.length >= TETO_CLIENTES_BASE_SAUDE) {
      this.logger.warn(
        `[logistica] base-saude company=${companyId}: atingiu o teto de ${TETO_CLIENTES_BASE_SAUDE} clientes — resultado parcial, nunca corte silencioso.`,
      );
    }
    const clienteIds = clientes.map((c) => c.id);

    // 2ª query agregada: LocalEntrega ATIVO de TODOS os clientes de uma vez
    // (nunca 1 findFirst por cliente — mesmo padrão de fetchParadasEstendidas
    // da S3). Escolhe o principal em memória (ou o primeiro ativo, na falta de
    // um marcado — mesmo critério informal do cadastro).
    const locais = await this.prisma.localEntrega.findMany({
      where: { companyId, customerProfileId: { in: clienteIds }, ativo: true },
      select: { id: true, apelido: true, lat: true, lng: true, geoFonte: true, customerProfileId: true, isPrincipal: true },
    });
    const localPorCliente = new Map<string, (typeof locais)[number]>();
    for (const local of locais) {
      const atual = localPorCliente.get(local.customerProfileId);
      if (!atual || (local.isPrincipal && !atual.isPrincipal)) {
        localPorCliente.set(local.customerProfileId, local);
      }
    }

    // 3ª query agregada: `nunca_entregue` barato — 1 groupBy conta quantas
    // entregas 'entregue' cada cliente já teve (nunca 1 findFirst por cliente).
    const entreguesGrupos = await this.prisma.entrega.groupBy({
      by: ['customerProfileId'],
      where: { companyId, status: 'entregue', customerProfileId: { in: clienteIds } },
      _count: { _all: true },
    });
    const temEntregaConcluida = new Set(
      entreguesGrupos.filter((g: any) => g._count._all > 0).map((g: any) => g.customerProfileId as string),
    );

    // 4ª query agregada: recorrência ATIVA (LogisticaPlanoEntrega) por cliente —
    // 1 dos 2 caminhos que fazem "resolvemSozinhos" (a 1ª entrega grava a porta
    // via realimentarCoordenadaPorta, logistica.service.ts).
    const planosAtivosGrupos = await this.prisma.logisticaPlanoEntrega.groupBy({
      by: ['customerProfileId'],
      where: { companyId, ativo: true, customerProfileId: { in: clienteIds } },
      _count: { _all: true },
    });
    const temRecorrenciaAtiva = new Set(planosAtivosGrupos.map((g: any) => g.customerProfileId as string));

    // 5ª query agregada: entrega ABERTA já existente (agendada/em_rota) — o outro
    // caminho de "resolvemSozinhos" (sem recorrência formal, mas já tem entrega
    // marcada no pipeline). Mesmo STATUS_ABERTO da S3, sem janela de data (é
    // sobre TER uma entrega pendente, não sobre qual dia).
    const entregasAbertasGrupos = await this.prisma.entrega.groupBy({
      by: ['customerProfileId'],
      where: { companyId, status: { in: [...STATUS_ABERTO_BASE_SAUDE] }, customerProfileId: { in: clienteIds } },
      _count: { _all: true },
    });
    const temEntregaAberta = new Set(entregasAbertasGrupos.map((g: any) => g.customerProfileId as string));

    const clientePorId = new Map(clientes.map((c) => [c.id, c] as const));

    const inputs: ParadaConferenciaInput[] = clientes.map((cliente) => {
      const local = localPorCliente.get(cliente.id) ?? null;
      const coord = resolverCoordenadaMultilocal(local, cliente);
      return {
        id: cliente.id,
        lat: coord.lat,
        lng: coord.lng,
        geoFonte: coord.geoFonte,
        // Regra de ROTA fora de escopo (ver cabeçalho): legDistanceM sempre null
        // garante que perna_outlier nunca acha uma perna pra medir.
        legDistanceM: null,
        temEntregaConcluida: temEntregaConcluida.has(cliente.id),
        // diverge_gps_ouro fica FORA do escopo desta sprint (S7-SAUDE-DA-BASE.md
        // só lista sem_pino/pino_compartilhado/geocode_nao_provado_em_campo|
        // fonte_nao_confiavel/nunca_entregue como "regras que fazem sentido
        // base-a-base") — null nunca dispara essa comparação.
        distanciaGpsOuroM: null,
        // CEP × endereço (26/07) é da CONFERÊNCIA DA ROTA: lá vale gastar o orçamento de
        // ViaCEP pelas ~dezenas de paradas do dia. Aqui a base tem MILHARES de clientes —
        // rodar a checagem inteira travaria o painel. Sempre false = o motivo nunca
        // dispara; trazer isso pra cá é sprint própria (lote/assíncrono).
        cepDivergente: false,
        // Idem `endereco_sem_numero`: a regra é baratíssima (nenhuma rede), mas entrar
        // aqui muda a contagem do painel (verdes/amarelos) e o contrato que o front já
        // consome. Fica pra sprint própria deste painel, não de carona nesta.
        enderecoSemNumero: false,
      };
    });

    // engine fixo 'osrm': a ÚNICA forma de rota_degradada disparar em
    // conferirParadas é engine==='haversine' — base-a-base não passa por motor
    // nenhum, isto é só a entrada "neutra" que a S7 pede.
    const conferidas = conferirParadas(inputs, { engine: 'osrm' });

    // COM QUEM o ponto é dividido (06/08, dono): "localização igual à de outro
    // cliente" sem dizer QUAL outro não dá pra corrigir — ele teria que caçar o
    // gêmeo na mão numa base de milhares. Mesma função que decide o motivo
    // (`vizinhosDePino`), então a lista nunca discorda do semáforo.
    const vizinhos = vizinhosDePino(inputs);

    let verdes = 0;
    let amarelos = 0;
    let vermelhos = 0;
    let resolvemSozinhos = 0;

    const clientesResultado: BaseSaudeCliente[] = conferidas.map((c) => {
      const cliente = clientePorId.get(c.id)!; // 1:1 com `clientes` (mesmo array mapeado acima).
      const local = localPorCliente.get(c.id) ?? null;

      // Segunda trava (ver `MOTIVOS_DE_ROTA_FORA_DE_ESCOPO`): filtra motivo de
      // rota se algum dia vazar, e recalcula o semáforo em cima do resultado
      // filtrado — nunca confia no semáforo original quando um motivo saiu.
      const motivos = c.motivos.filter((m) => !MOTIVOS_DE_ROTA_FORA_DE_ESCOPO.has(m));
      const temVermelho = motivos.some((m) => MOTIVOS_VERMELHOS_BASE_SAUDE.has(m));
      const semaforo: SemaforoBaseSaude = temVermelho ? 'vermelho' : motivos.length > 0 ? 'amarelo' : 'verde';

      if (semaforo === 'verde') verdes++;
      else if (semaforo === 'amarelo') amarelos++;
      else vermelhos++;

      // "Resolve sozinho": sem_pino hoje, MAS já tem recorrência ativa ou
      // entrega aberta no pipeline — a 1ª entrega grava a porta real (GPS de
      // ouro, `realimentarCoordenadaPorta`) sem precisar de intervenção manual.
      const resolveSozinho =
        motivos.includes('sem_pino') && (temRecorrenciaAtiva.has(c.id) || temEntregaAberta.has(c.id));
      if (resolveSozinho) resolvemSozinhos++;

      // Só quem REALMENTE ficou com o motivo leva a lista (o filtro de motivo de
      // rota acima pode ter mudado o veredito) — nome na tela nunca sem acusação.
      const gemeos = motivos.includes('pino_compartilhado') ? (vizinhos.get(c.id) ?? []) : [];

      return {
        id: c.id,
        nome: cliente.name,
        semaforo,
        motivos,
        localId: local?.id ?? null,
        localApelido: local?.apelido ?? null,
        resolveSozinho,
        // Teto de nomes: o incidente 25/07 (empresa 41) colapsou 154 clientes no
        // MESMO centroide de via — mandar 154 nomes por linha é um payload inútil.
        compartilhaCom: gemeos.slice(0, TETO_NOMES_MESMO_PONTO).map((id) => clientePorId.get(id)?.name || 'Cliente'),
        compartilhaComTotal: gemeos.length,
      };
    });

    const totalClientes = clientesResultado.length;
    this.logger.log(
      `[logistica] base-saude company=${companyId}: ${totalClientes} cliente(s) — ` +
        `${verdes} verde(s)/${amarelos} amarelo(s)/${vermelhos} vermelho(s), ${resolvemSozinhos} resolvem sozinho(s).`,
    );

    return {
      totalClientes,
      verdes,
      amarelos,
      vermelhos,
      resolvemSozinhos,
      // 1 casa decimal (mesmo arredondamento do exemplo do contrato: 94/248 → 37.9).
      percentVerde: totalClientes > 0 ? Math.round((verdes / totalClientes) * 1000) / 10 : 0,
      clientes: clientesResultado,
    };
  }
}

// ── tipos de I/O ────────────────────────────────────────────────────────────────
export interface BaseSaudeCliente {
  id: string;
  nome: string | null;
  semaforo: SemaforoBaseSaude;
  motivos: MotivoConferencia[];
  localId: string | null;
  localApelido: string | null;
  /** Aditivo ao contrato do S7-SAUDE-DA-BASE.md (que só lista o total agregado):
   *  marca por linha os mesmos clientes já contados em `resolvemSozinhos`, pra
   *  o front destacar a linha sem precisar recalcular a regra sozinho. */
  resolveSozinho: boolean;
  /** Nomes dos OUTROS clientes no MESMO ponto (até 5) — vazio quando o cliente não
   *  tem `pino_compartilhado`. É o "qual é o repetido" que a tela precisa dizer. */
  compartilhaCom: string[];
  /** Quantos são no total (pode ser maior que `compartilhaCom.length`). */
  compartilhaComTotal: number;
}

export interface BaseSaudeResult {
  totalClientes: number;
  verdes: number;
  amarelos: number;
  vermelhos: number;
  resolvemSozinhos: number;
  percentVerde: number;
  clientes: BaseSaudeCliente[];
}
