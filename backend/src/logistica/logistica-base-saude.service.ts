import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';
import {
  gemeosDePorta,
  conferirParadas,
  type MotivoConferencia,
  type ParadaConferenciaInput,
} from './logistica-conferencia.util';
import type { PortaCadastro } from '../nucleo/endereco-porta.util';

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

/** Campos de endereço de qualquer das duas fontes do multilocal (perfil ou local). */
type FonteEndereco = {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
} | null;

/** O endereço vem inteiro da fonte que tem endereço — nunca meio de cada. */
function portaDaFonteEscolhida(local: FonteEndereco, perfil: FonteEndereco): PortaCadastro {
  const doLocal = local
    ? {
        endereco: local.endereco ?? null,
        numero: local.numero ?? null,
        complemento: local.complemento ?? null,
        bairro: local.bairro ?? null,
        cidade: local.cidade ?? null,
        uf: local.uf ?? null,
        cep: local.cep ?? null,
      }
    : null;
  const temEndereco = doLocal
    && Boolean(String(doLocal.endereco ?? '').trim() || String(doLocal.cep ?? '').trim() || String(doLocal.cidade ?? '').trim());
  if (temEndereco && doLocal) return doLocal;
  return {
    endereco: perfil?.endereco ?? null,
    numero: perfil?.numero ?? null,
    complemento: perfil?.complemento ?? null,
    bairro: perfil?.bairro ?? null,
    cidade: perfil?.cidade ?? null,
    uf: perfil?.uf ?? null,
    cep: perfil?.cep ?? null,
  };
}

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

/**
 * 🔴 MOTIVO QUE NÃO É PENDÊNCIA (06/08) — apurado e devolvido em `motivos[]`, mas não
 * pinta o painel de amarelo.
 *
 * `nunca_entregue` é o estado NORMAL de todo cliente que ainda não recebeu — não há
 * nada que o dono possa fazer a respeito, a não ser entregar. Medido na company 41:
 * ele sozinho jogava 212 dos 239 clientes em "revisar", e uma fila de 212 onde não há
 * o que revisar é a mesma doença que matou o amarelo da conferência em 26/07 (alarme
 * que toca em tudo não é alarme, é ruído). A informação continua na ficha do cliente,
 * escrita como aviso — só deixou de ser cor de fila.
 */
const MOTIVOS_QUE_NAO_SAO_PENDENCIA = new Set<MotivoConferencia>(['nunca_entregue']);

// Espelha MOTIVOS_IMPEDITIVOS de logistica-conferencia.util.ts (privado lá) SEM
// fora_do_casulo/perna_outlier (que nunca chegam aqui — ver Set acima) — mantém
// diverge_gps_ouro na lista por documentação/futuro, mas hoje nunca dispara
// porque `distanciaGpsOuroM` sempre viaja `null` (ver ParadaConferenciaInput
// abaixo: essa regra não está no escopo desta sprint, S7-SAUDE-DA-BASE.md).
const MOTIVOS_VERMELHOS_BASE_SAUDE = new Set<MotivoConferencia>([
  'sem_pino',
  // 06/08: duas contas na MESMA porta — ou falta o apartamento, ou um dos dois
  // cadastros está sobrando. Estraga entrega e se resolve numa edição de cadastro.
  'endereco_repetido',
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
 * sentido olhando a base inteira de uma vez: `sem_pino`, `endereco_repetido`
 * (duas contas na MESMA porta — CEP+número+complemento, ver `gemeosDePorta`),
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
      // O ENDEREÇO entra no select desde 06/08: a identidade da porta é CEP → número
      // → complemento, e é ela que decide endereço repetido (ver `gemeosDePorta`).
      select: {
        id: true, name: true, lat: true, lng: true, geoFonte: true,
        endereco: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, cep: true,
      },
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
      select: {
        id: true, apelido: true, lat: true, lng: true, geoFonte: true, customerProfileId: true, isPrincipal: true,
        endereco: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, cep: true,
      },
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
        // O endereço vem da MESMA fonte da coordenada (multilocal) — misturar o CEP
        // de um com a rua do outro é o "Frankenstein" que logistica-geo-fonte.util
        // existe pra impedir. Local sem endereço próprio cai pro perfil.
        porta: portaDaFonteEscolhida(local, cliente),
      };
    });

    // engine fixo 'osrm': a ÚNICA forma de rota_degradada disparar em
    // conferirParadas é engine==='haversine' — base-a-base não passa por motor
    // nenhum, isto é só a entrada "neutra" que a S7 pede.
    const conferidas = conferirParadas(inputs, { engine: 'osrm' });

    // COM QUEM (06/08, dono): "igual à de outro cliente" sem dizer QUAL não dá pra
    // corrigir — ele teria que caçar o gêmeo na mão numa base de milhares. Mesma
    // função que decide o motivo, então a lista nunca discorda do semáforo.
    const gemeos = gemeosDePorta(inputs);

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

      // "Resolve sozinho": sem_pino hoje, MAS já tem recorrência ativa ou
      // entrega aberta no pipeline — a 1ª entrega grava a porta real (GPS de
      // ouro, `realimentarCoordenadaPorta`) sem precisar de intervenção manual.
      const resolveSozinho =
        motivos.includes('sem_pino') && (temRecorrenciaAtiva.has(c.id) || temEntregaAberta.has(c.id));
      if (resolveSozinho) resolvemSozinhos++;

      // 🔴 O VERMELHO PRECISA SIGNIFICAR "PRECISO DE VOCÊ" (06/08, ordem do dono).
      // Medido na company 41: 97 clientes sem pino e 94 deles com entrega recorrente
      // ativa — ou seja, 94 dos 115 "corrigir" iam se resolver sozinhos na próxima
      // entrega e mesmo assim gritavam vermelho. É a mesma doença que matou o amarelo
      // em 26/07 (alarme que toca em tudo não é alarme, é ruído). Quem tem cura
      // automática a caminho é AMARELO: continua na fila do "dá pra melhorar", some da
      // fila do "pare o que está fazendo". O motivo continua inteiro em `motivos[]`.
      const temVermelho = !resolveSozinho && motivos.some((m) => MOTIVOS_VERMELHOS_BASE_SAUDE.has(m));
      const pendencias = motivos.filter((m) => !MOTIVOS_QUE_NAO_SAO_PENDENCIA.has(m));
      const semaforo: SemaforoBaseSaude = temVermelho ? 'vermelho' : pendencias.length > 0 ? 'amarelo' : 'verde';

      if (semaforo === 'verde') verdes++;
      else if (semaforo === 'amarelo') amarelos++;
      else vermelhos++;

      // Só quem REALMENTE ficou com o motivo leva a lista (o filtro de motivo de
      // rota acima pode ter mudado o veredito) — nome na tela nunca sem acusação.
      const naMesmaPorta = motivos.includes('endereco_repetido') ? (gemeos.get(c.id) ?? []) : [];

      return {
        id: c.id,
        nome: cliente.name,
        semaforo,
        motivos,
        localId: local?.id ?? null,
        localApelido: local?.apelido ?? null,
        resolveSozinho,
        // Teto: uma porta pode ter várias contas penduradas; mandar todas é payload
        // inútil — a tela escreve "e mais N". O ID vai junto desde 06/08 porque a
        // ficha oferece JUNTAR OS CADASTROS ali mesmo (merge preserva as entregas das
        // duas contas), e sem o id do gêmeo o dono teria que caçá-lo na mão.
        mesmaPortaCom: naMesmaPorta
          .slice(0, TETO_NOMES_MESMO_PONTO)
          .map((id) => ({ id, nome: clientePorId.get(id)?.name || 'Cliente' })),
        mesmaPortaComTotal: naMesmaPorta.length,
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
  /** As outras contas (até 5) na MESMA PORTA — mesmo número, sem apartamento que as
   *  separe. Vazio quando o cliente não tem `endereco_repetido`. Com ID, porque a
   *  tela resolve ali: informa o apartamento OU junta os cadastros. */
  mesmaPortaCom: Array<{ id: string; nome: string }>;
  mesmaPortaComTotal: number;
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
