import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOrNull, resolveValorUnit } from './logistica-recorrencia.service';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { canonicalRouteDate } from './logistica-route-billing.util';

/**
 * PR18072026 W1 — CRUD de "rota-modelo" (roteiro salvo): nome + dia da semana
 * opcional + paradas em ordem (cliente + local opcional). Company-scoped,
 * fail-closed (id de outra empresa → null, o controller vira 404).
 *
 * 🔴 F3 (09/08) — O MODELO É SÓ ORDEM, E A ORDEM MORA NUMA TABELA SÓ.
 * Até aqui a mesma lista vivia em DOIS lugares: `paradasJson` (array) e
 * `LogisticaRotaModeloParada` (linhas). Em produção elas já tinham divergido —
 * modelo `cms0xmqd0…` da empresa 41 com 9 paradas no JSON e 7 na tabela. Agora
 * a TABELA é a única fonte: o JSON não é lido em lugar nenhum e sai no DROP da
 * migration única. Junto morreram o item da parada
 * (`LogisticaRotaModeloParadaItem`, cópia byte a byte do `PlanoEntregaItem`) e
 * os snapshots de janela/acesso/adicional: **o item e a janela da visita moram
 * no PLANO** (`LogisticaPlanoEntrega`), decisão G5 do plano dos 6 verbos.
 *
 * Aplicar o modelo é 100% CLIENT-SIDE: o app lê `paradas` e monta o
 * `ordemManual` que manda pro planejar/iniciar — não existe endpoint
 * "aplicar" aqui (contrato do 00-ORQUESTRACAO.md).
 *
 * PR20072026 W1 — nome ÚNICO por empresa (case-insensitive/trim, SEM constraint
 * no banco — dados legados podem ter duplicata). `assertNomeUnico` é exportado e
 * aceita `tx` do Prisma para quem criar modelo DENTRO de uma transação reusar a
 * MESMA regra (o último chamador externo, o finalizar da Leitura de Rota, foi
 * enterrado em 09/08 — a regra continua valendo pro CRUD daqui).
 *
 * 🔴 08/08 — O ESPAÇO DE NOME PASSOU A SER O DIA (dono: os 2 espaços da tela de
 * montar são "2 rotas diferentes DO DIA", e o nome é livre: *"se ele por manhã,
 * vai ser o manhã sempre do sábado"*). Com a unicidade valendo pra empresa
 * INTEIRA, "Manhã" no sábado impedia "Manhã" na segunda — o motorista batia num
 * 409 por causa de uma rota de outro dia, que ele nem estava vendo. Agora
 * disputam nome só as rotas do MESMO `diaSemana` (e as sem dia fixo entre si).
 * Nenhuma coluna nova: `diaSemana` já existia e é justamente "o dia".
 */
export const ROTA_NOME_DUPLICADO_CODE = 'ROTA_NOME_DUPLICADO';
export const ROTA_NOME_DUPLICADO_MESSAGE = 'Já existe uma rota com esse nome neste dia.';

/**
 * 🔴 A LISTA DE PARADAS MORA NUMA TABELA SÓ (09/08, F3 do PR09082026-ROTA-SEIS-VERBOS).
 *
 * Até aqui a mesma lista vivia em DOIS lugares — `paradasJson` (array na linha do
 * modelo) e `LogisticaRotaModeloParada` (linhas de verdade) — e eles JÁ tinham
 * divergido em produção: o modelo `cms0xmqd0…` da empresa 41 dizia 9 paradas no
 * JSON e 7 na tabela. Duas cópias da mesma verdade não empatam pra sempre.
 *
 * Agora a TABELA é a única fonte, e a coluna foi dropada na mesma migration.
 * O backfill que trouxe os modelos LIVRE (que só existiam no JSON) está em
 * `backend/scripts/backfill-rota-modelo-paradas.js` — ele roda ANTES da migration,
 * porque LÊ a coluna que ela apaga.
 */

type RotaModeloClient = Pick<PrismaService, 'logisticaRotaModelo'> | { logisticaRotaModelo: any };

/**
 * `diaSemana` é POSICIONAL e vem antes de `excludeId` de propósito: quem
 * esquecer de passar não compila. Chamador que continuasse com a assinatura
 * velha voltaria calado à regra global — e o preço disso é 409 na cara do
 * motorista no meio da rua.
 */
export async function assertNomeUnico(
  client: RotaModeloClient,
  companyId: number,
  nome: string,
  diaSemana: number | null,
  excludeId?: string,
): Promise<void> {
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return;
  const existing = await (client as any).logisticaRotaModelo.findFirst({
    where: {
      companyId,
      tipo: 'LIVRE',
      diaSemana: diaSemana ?? null,
      nome: { equals: nome.trim(), mode: 'insensitive' },
    },
    select: { id: true, nome: true },
  });
  if (existing && existing.id !== excludeId && String(existing.nome ?? '').trim().toLowerCase() === alvo) {
    throw new ConflictException({
      statusCode: 409,
      code: ROTA_NOME_DUPLICADO_CODE,
      message: ROTA_NOME_DUPLICADO_MESSAGE,
    });
  }
}

@Injectable()
export class LogisticaRotaModeloService {
  private readonly logger = new Logger(LogisticaRotaModeloService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: number): Promise<RotaModeloDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const rows = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId, tipo: 'LIVRE' },
      orderBy: [{ nome: 'asc' }],
      include: { paradas: PARADAS_EM_ORDEM },
    });
    return rows.map(toDTO);
  }

  async create(companyId: number, input: RotaModeloInput): Promise<RotaModeloDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const nome = normalizeNome(input.nome);
    const diaSemana = normalizeDiaSemana(input.diaSemana);
    const paradas = await this.resolverParadas(companyId, normalizeParadas(input.paradas));
    await assertNomeUnico(this.prisma, companyId, nome, diaSemana);
    const row = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.logisticaRotaModelo.create({
        data: { companyId, nome, diaSemana },
      });
      await gravarParadas(tx, companyId, criado.id, paradas);
      return criado;
    });
    this.logger.log(`[logistica] rota-modelo criado company=${companyId} id=${row.id} paradas=${paradas.length}`);
    return toDTO({ ...row, paradas });
  }

  async update(companyId: number, id: string, input: Partial<RotaModeloInput>): Promise<RotaModeloDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId, tipo: 'LIVRE' },
      select: { id: true, diaSemana: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    // O dia que VAI VALER decide contra quem o nome disputa: renomear e mudar
    // de dia no mesmo PATCH tem que ser conferido no dia de DESTINO, não no de
    // origem — senão o nome passa aqui e colide lá.
    const diaFinal = input.diaSemana !== undefined
      ? normalizeDiaSemana(input.diaSemana)
      : (existing.diaSemana ?? null);
    if (input.nome !== undefined) {
      const nome = normalizeNome(input.nome);
      await assertNomeUnico(this.prisma, companyId, nome, diaFinal, existing.id);
      data.nome = nome;
    }
    if (input.diaSemana !== undefined) data.diaSemana = diaFinal;
    // A lista NOVA é conferida ANTES de apagar a antiga: cliente fantasma tem
    // que virar 400 com a rota velha intacta, nunca modelo esvaziado no meio.
    const paradas = input.paradas !== undefined
      ? await this.resolverParadas(companyId, normalizeParadas(input.paradas))
      : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.logisticaRotaModelo.update({ where: { id: existing.id }, data });
      if (paradas) {
        // Trocar a ordem é REESCREVER a lista: apaga e regrava 1..N. A unique
        // (rotaModeloId, ordem) não deixa duas linhas na mesma posição, então
        // update posição-a-posição precisaria de dois passes — apagar antes é
        // mais barato e não deixa sobra de parada que saiu do molde.
        await tx.logisticaRotaModeloParada.deleteMany({ where: { companyId, rotaModeloId: existing.id } });
        await gravarParadas(tx, companyId, existing.id, paradas);
      }
      return atualizado;
    });
    if (paradas) return toDTO({ ...row, paradas });
    const atual = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: existing.id, companyId },
      include: { paradas: PARADAS_EM_ORDEM },
    });
    return atual ? toDTO(atual) : null;
  }

  /**
   * A LISTA VIRA LINHA (F3, 09/08) — e linha tem FK de verdade.
   * `LogisticaRotaModeloParada` aponta pra `CustomerProfile` e `LocalEntrega`
   * com `Restrict`: id que não existe nesta empresa derrubava o INSERT com erro
   * cru de banco (500 na cara do motorista, no meio da rua). Então a lista é
   * CONFERIDA antes de escrever:
   *
   * - cliente inexistente / de outra empresa → 400 explicando o quê (fail-closed,
   *   multi-tenant: nada atravessa empresa);
   * - local que não é mais daquele cliente → vira `null` COM ALARME no log. É a
   *   mesma leniência que o `gerar` sempre teve com o localId velho do JSON, só
   *   que aplicada na HORA DE GRAVAR, onde o dado ainda dá pra consertar.
   */
  private async resolverParadas(companyId: number, entrada: RotaModeloParada[]): Promise<ParadaOrdenada[]> {
    if (!entrada.length) return [];
    const clienteIds = [...new Set(entrada.map((parada) => parada.customerProfileId))];
    const clientes = await this.prisma.customerProfile.findMany({
      where: { companyId, id: { in: clienteIds } },
      select: { id: true },
    });
    const daEmpresa = new Set(clientes.map((cliente) => cliente.id));
    const fantasmas = clienteIds.filter((id) => !daEmpresa.has(id));
    if (fantasmas.length) {
      this.logger.warn(
        `[logistica] rota-modelo company=${companyId}: ${fantasmas.length} parada(s) apontam pra cliente fora da empresa (${fantasmas.slice(0, 5).join(', ')})`,
      );
      throw new BadRequestException('Uma parada aponta para um cliente que não existe nesta empresa.');
    }

    const locaisPedidos = [...new Set(entrada.map((parada) => parada.localId).filter(Boolean) as string[])];
    const locais = locaisPedidos.length
      ? await this.prisma.localEntrega.findMany({
        where: { companyId, id: { in: locaisPedidos } },
        select: { id: true, customerProfileId: true },
      })
      : [];
    const donoDoLocal = new Map(locais.map((local) => [local.id, local.customerProfileId]));

    return entrada.map((parada, index) => {
      let localId = parada.localId ?? null;
      if (localId && donoDoLocal.get(localId) !== parada.customerProfileId) {
        this.logger.warn(
          `[logistica] rota-modelo company=${companyId}: local ${localId} não é mais do cliente ${parada.customerProfileId} — parada salva sem porta.`,
        );
        localId = null;
      }
      return { customerProfileId: parada.customerProfileId, localId, ordem: index + 1 };
    });
  }

  async remove(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId, tipo: 'LIVRE' },
      select: { id: true },
    });
    if (!existing) return false;
    // A Entrega guarda de qual rota-modelo veio, e a FK é `Restrict`: com uma
    // única entrega carimbada, o delete estoura erro de banco e o "segurar
    // pressionado para excluir" morre na mão do dono. O carimbo é rastro de
    // ORIGEM, não histórico financeiro — solta e apaga. (Vale pras SEMANAIS
    // desde sempre, via generateDay; virou caminho quente em 27/07, quando o
    // `gerar` passou a carimbar também.)
    await this.prisma.$transaction([
      this.prisma.entrega.updateMany({
        where: { companyId, rotaModeloId: existing.id },
        data: { rotaModeloId: null, rotaModeloVersao: null },
      }),
      this.prisma.logisticaRotaModelo.delete({ where: { id: existing.id } }),
    ]);
    return true;
  }

  /**
   * PR20072026-ROTA-SALVA F2 — `POST /rota-modelos/:id/gerar`: materializa a
   * LISTA EXATA do modelo (na ORDEM salva), espelhando o shape de `gerarDia`
   * (logistica-recorrencia.service.ts): contatoId resolvido, escalares
   * quantidade/valor coerentes com a soma dos itens, `status:'agendada'`,
   * `origem:'avulsa'` (NÃO reusa 'recorrente' — consumidores de `origem` não
   * são tocados por este PR), `cobrancaStatus:'pendente'`.
   *
   * 🔴 F3 (09/08) — o QUE o cliente recebe NÃO mora mais aqui. O modelo é só
   * ORDEM (cliente + porta + posição); os itens vêm do PLANO da Agenda, que é
   * onde o dono combina o que a visita leva. O snapshot de itens da parada era
   * cópia byte a byte do `LogisticaPlanoEntregaItem` (716 = 716 em produção) e
   * só servia pra divergir do plano com o tempo.
   *
   * Idempotência IDÊNTICA ao gerarDia — [companyId, customerProfileId, localId,
   * dia]: já existe Entrega → REUSA o id (não duplica com a recorrência nem
   * entre 2 chamadas no mesmo dia; claim de cobrança é por delivery). NÃO
   * debita crédito aqui e NÃO avança `proximaData` de nenhum vínculo (só a
   * recorrência automática mexe nisso).
   *
   * Company-scoped/fail-closed: id de modelo de outra empresa → 404 (padrão do
   * service). Parada sem cliente / cliente de outra empresa / excluído → pula
   * e entra em `avisos[]`, sem travar o restante da lista.
   */
  async gerar(companyId: number, id: string, dateInput: string | undefined, userId: number): Promise<GerarRotaModeloResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Usuário não identificado');
    const modelo = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id ?? '').trim(), companyId, tipo: 'LIVRE' },
      select: { id: true, paradas: PARADAS_EM_ORDEM },
    });
    if (!modelo) throw new NotFoundException('Modelo de rota não encontrado');

    const paradas = modelo.paradas;

    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);
    // Chave da rota comercial do dia (VarChar 'YYYY-MM-DD') — usada só pra
    // CONTAR a história na mensagem de conflito (quem está com a parada e desde
    // quando). Nunca decide nada aqui: data podre continua caindo no "hoje" do
    // `parseDateOrNull` acima em vez de virar 400 num caminho que sempre foi
    // tolerante.
    const routeDate = safeRouteDate(dateInput);

    const avisos: string[] = [];
    const deliveryIds: string[] = [];
    const atribuidoAt = new Date();
    // Caches da volta: "esse motorista está na rua?" e "como ele se chama?".
    // Uma rota tem dezenas de paradas do mesmo dono — sem isto seria uma query
    // por parada.
    const naRua = new Map<number, boolean>();
    const nomes = new Map<number, string>();

    for (const parada of paradas) {
      const customerProfileId = String(parada.customerProfileId ?? '').trim();
      if (!customerProfileId) {
        avisos.push('Parada sem cliente vinculado foi ignorada.');
        continue;
      }

      const cliente = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: { id: true, name: true, status: true, isCliente: true },
      });
      if (!cliente) {
        avisos.push(`Cliente (${customerProfileId}) não encontrado nesta empresa — parada ignorada.`);
        continue;
      }
      // 27/07 — cliente que saiu do cadastro não volta pela porta da rota salva
      // (mesma régua CLIENTE_VIVO da Agenda). O aviso diz o NOME: foi assim que
      // o dono descobriu a "Elaine" que a rota mostrava e o cadastro não tinha.
      if (cliente.status !== 'active' || !cliente.isCliente) {
        avisos.push(`${cliente.name || 'Um cliente'} não está mais no cadastro — parada ignorada.`);
        continue;
      }

      // localId da parada salva SÓ vale se ainda pertencer ao MESMO cliente+
      // empresa (leniência igual à do resolveLocalDoCliente em recorrencia) —
      // senão cai no grupo sem-local (null), mesma chave de idempotência do gerarDia.
      const localIdParada = String(parada.localId ?? '').trim();
      let localId: string | null = null;
      if (localIdParada) {
        const local = await this.prisma.localEntrega.findFirst({
          where: { id: localIdParada, companyId, customerProfileId },
          select: { id: true },
        });
        localId = local?.id ?? null;
      }

      // Idempotência IGUAL ao gerarDia: já existe Entrega (cliente, local, dia)?
      //
      // FIX 27/07 — o `findFirst` não tinha ORDEM e o dia acumula entrega
      // cancelada de cada montagem abandonada (medido: 560 canceladas para 156
      // clientes num dia só). Ele podia devolver uma CANCELADA com a aberta do
      // mesmo cliente do lado — e a parada morria em "foi retirado de hoje".
      // A ABERTA ganha sempre; sem aberta, a fechada mais recente decide o aviso
      // (entregue x retirado). Ordenar por `status` não resolveria: em ordem
      // alfabética 'cancelada' vem ANTES de 'em_rota'.
      const escopoDia = { companyId, customerProfileId, localId, scheduledAt: { gte: dia, lte: dayEnd } };
      const existente = await this.prisma.entrega.findFirst({
        where: { ...escopoDia, status: { in: ['agendada', 'em_rota'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, entregadorId: true, status: true },
      }) ?? await this.prisma.entrega.findFirst({
        where: escopoDia,
        orderBy: { createdAt: 'desc' },
        select: { id: true, entregadorId: true, status: true },
      });
      // FIX 21/07 — 'entregue' e 'cancelada' NÃO entram na rota (ver
      // logistica-rota.service.ts). Reaproveitar o id delas devolvia deliveryIds
      // que o planejar descartava: a rota salva "montava" e vinha vazia, sem erro.
      // Depois de limpar o dia uma vez, NENHUMA rota salva voltava a montar.
      if (existente && existente.status === 'entregue') {
        avisos.push(`${cliente.name || 'Um cliente'} já foi entregue hoje — parada ignorada.`);
        continue;
      }
      // FIX 27/07 — cancelada volta a REABRIR (era o contrato do fix de 21/07,
      // perdido no checkpoint de 25/07). Depois de "Limpar dia" ou de uma
      // montagem descartada, o dia fica cheio de cancelada do mesmo cliente: com
      // "parada ignorada" a rota salva montava VAZIA e o dono só via um aviso com
      // nome de cliente. Quem escolhe a rota salva está pedindo a rota — reabrir a
      // MESMA linha não duplica entrega nem cobra 2×. A aberta ainda ganha dela
      // (a busca acima procura aberta primeiro).
      const reabrirId = existente && existente.status === 'cancelada' ? existente.id : null;
      // 🔴 31/07 — ENTREGA CANCELADA NÃO TEM DONO VIVO (o 409 do print do dono:
      // "A entrega de Márcia já está atribuída a outro motorista" num dia em que
      // NINGUÉM estava entregando nada).
      //
      // O motorista cancela a rota no aparelho → `descartarMontagem` mata a
      // parada ('cancelada') e o `entregadorId` fica colado nela de propósito:
      // é o rastro de QUEM devolveu. Só que este 409 lia rastro como POSSE — a
      // parada morta ficava trancada no nome dele até a meia-noite, sem ninguém
      // pra entregar e sem ninguém que pudesse pegar (o escopo do dia só olha
      // hoje, então a trava nascia e morria no mesmo dia, justo quando dói).
      //
      // Reabrir já reatribui pro `userId` no update lá embaixo, então assumir
      // aqui é o contrato certo: quem escolhe a rota salva está PEDINDO a rota.
      // O 409 sobra só pra entrega ABERTA — que é onde existe trabalho de gente
      // de verdade pra proteger.
      if (existente && !reabrirId) {
        if (existente.entregadorId != null && existente.entregadorId !== userId) {
          // 🔴 31/07 — SÓ QUEM ESTÁ NA RUA SEGURA A PARADA (ordem do dono).
          //
          // Antes, QUALQUER entrega aberta no nome de outra pessoa era 409 —
          // inclusive a de um motorista que encerrou a rota às 14h e foi pra
          // casa deixando 12 clientes sem atender. O dia ficava refém de uma
          // rota morta e o admin não tinha saída nenhuma pela tela.
          //
          // Agora o freio é o que ele protege de verdade: rota VIVA (iniciada
          // e não encerrada) é trabalho em andamento e continua intocável —
          // roubar parada de quem está dirigindo quebra o cara na rua. Rota
          // morta (encerrada, terminal ou que nem existe) devolve a parada pro
          // pote, e quem está montando assume. O `where` do update carrega o
          // dono ANTIGO: se ele voltar pra rua no meio do caminho, o update não
          // pega ninguém e o 409 volta — a corrida perde, não vence.
          if (await this.estaNaRua(companyId, existente.entregadorId, routeDate, naRua)) {
            throw new ConflictException(await this.explicarDono(companyId, cliente.name, existente.entregadorId, routeDate));
          }
          const donoAntigo = existente.entregadorId;
          const assumida = await this.prisma.entrega.updateMany({
            where: { id: existente.id, companyId, entregadorId: donoAntigo },
            data: { entregadorId: userId, atribuidoPorUserId: userId, atribuidoAt },
          });
          if (assumida.count !== 1) {
            throw new ConflictException(await this.explicarDono(companyId, cliente.name, donoAntigo, routeDate));
          }
          avisos.push(
            `${cliente.name || 'Um cliente'} estava com ${await this.nomeDoUsuario(companyId, donoAntigo, nomes)} (rota parada) e passou pra você.`,
          );
          deliveryIds.push(existente.id);
          continue;
        }
        if (existente.entregadorId == null) {
          const assigned = await this.prisma.entrega.updateMany({
            where: { id: existente.id, companyId, entregadorId: null },
            data: { entregadorId: userId, atribuidoPorUserId: userId, atribuidoAt },
          });
          if (assigned.count !== 1) {
            const current = await this.prisma.entrega.findFirst({
              where: { id: existente.id, companyId },
              select: { entregadorId: true },
            });
            if (current?.entregadorId !== userId) {
              throw new ConflictException(
                current?.entregadorId != null
                  ? await this.explicarDono(companyId, cliente.name, current.entregadorId, routeDate)
                  : `A entrega de ${cliente.name || 'um cliente'} foi atribuída a outro motorista.`,
              );
            }
          }
        }
        // A entrega aberta já é uma fotografia operacional: reaplicar a rota
        // apenas a atribui, sem trocar seus itens, preço ou quantidade.
        deliveryIds.push(existente.id);
        continue;
      }

      // 🔴 FIX 27/07 — A ROTA SALVA QUE NÃO GERAVA NADA (dono: "não consigo
      // acionar a rota salva, dá erro"; rota "Quarta", empresa 48).
      //
      // O "Salvar rota" novo (o que nasce na montagem, depois de mexer na
      // sequência com ▲▼) grava a parada no contrato mínimo do rota-modelo:
      // { customerProfileId, localId } — SEM `itens`, porque quem manda no que o
      // cliente recebe é a Agenda, não uma fotografia da rota. Só que aqui os
      // `itens` da parada eram a ÚNICA fonte pra materializar: sem eles, toda
      // parada caía em "rota antiga sem itens" e a rota inteira voltava vazia.
      // Como o app mostra o 1º aviso como erro, o dono via o nome de um cliente
      // que nem existe mais no cadastro e nenhuma rota.
      //
      // 🔴 F3 (09/08) — A CASCATA PERDEU O 1º DEGRAU e ficou mais honesta.
      // O snapshot de itens da parada MORREU (era cópia do plano que envelhecia
      // sozinha). Restam as duas fontes que são donas do assunto de verdade:
      //  1) plano ATIVO da Agenda V2 (a fonte da visita hoje, mesma do gerar-dia);
      //  2) vínculo ClienteProduto ativo (empresa ainda em modo LEGADO).
      // Só depois das duas é que a parada vira aviso.
      const plano = await this.prisma.logisticaPlanoEntrega.findFirst({
        where: {
          companyId,
          customerProfileId,
          ativo: true,
          ...(localId ? { localId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: { itens: { select: { productId: true, qtd: true, valorUnit: true } } },
      });
      let itens: EntregaItemCreate[] = (plano?.itens ?? []).map((item) => ({
        productId: item.productId,
        qtdPrevista: Math.max(1, Math.trunc(Number(item.qtd) || 1)),
        valorUnit: Number(item.valorUnit || 0),
      }));
      if (!itens.length) itens = await this.resolveLegacyItens(companyId, customerProfileId);
      if (!itens.length) {
        avisos.push(`${cliente.name || 'Um cliente'} está sem itens na Agenda — revise o cadastro.`);
        continue;
      }
      const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
      const valor = itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0);

      // Mesmo BUGFIX (09/07) do gerarDia: resolve o contato principal ANTES de
      // criar a Entrega, best-effort (falha aqui não pode travar o gerar).
      let contatoId: string | null = null;
      try {
        contatoId = await resolvePrincipalContatoId(this.prisma as any, companyId, customerProfileId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica] rota-modelo gerar resolvePrincipalContato cliente=${customerProfileId} falhou: ${String(e?.message || e)}`,
        );
      }

      // Reabrir = a MESMA linha volta pra 'agendada' com os itens de agora e sem
      // rastro da rota antiga (mesmo contrato do gerarDia ao reabrir cancelada).
      if (reabrirId) {
        await this.prisma.entrega.update({
          where: { id: reabrirId },
          data: {
            status: 'agendada',
            rotaOrdem: null,
            etaAt: null,
            startedAt: null,
            entregadorId: userId,
            atribuidoPorUserId: userId,
            atribuidoAt,
            productId: itens[0]?.productId ?? null,
            quantidade,
            valor,
            // Carimbo de origem: foi ESTA rota salva que trouxe a parada pro dia.
            // É o que deixa o "Cancelar rota" desfazer o que a montagem criou
            // (ver descartarMontagem) em vez de largar pendência no dia.
            rotaModeloId: modelo.id,
            itens: { deleteMany: {}, create: itens },
          },
        });
        deliveryIds.push(reabrirId);
        continue;
      }

      const criada = await this.prisma.entrega.create({
        data: {
          companyId,
          customerProfileId,
          contatoId,
          localId,
          entregadorId: userId,
          atribuidoPorUserId: userId,
          atribuidoAt,
          productId: itens[0]?.productId ?? null,
          quantidade,
          valor,
          status: 'agendada',
          origem: 'avulsa',
          scheduledAt: dia,
          cobrancaStatus: 'pendente',
          // Mesmo carimbo da reabertura acima: a parada veio DESTA rota salva.
          rotaModeloId: modelo.id,
          ...(itens.length ? { itens: { create: itens } } : {}),
        },
        select: { id: true },
      });
      deliveryIds.push(criada.id);
    }

    this.logger.log(
      `[logistica] rota-modelo gerar company=${companyId} modeloId=${modelo.id}: ${deliveryIds.length} entrega(s), ${avisos.length} aviso(s).`,
    );
    return { deliveryIds, avisos };
  }

  /**
   * "Esse motorista está NA RUA agora?" — régua única do que segura uma parada.
   * Rota viva = existe LogisticaRoute do dia em ACTIVE/INITIALIZING, ainda não
   * encerrada operacionalmente. Cacheado por chamada (uma rota tem dezenas de
   * paradas do mesmo dono).
   */
  private async estaNaRua(
    companyId: number,
    entregadorId: number,
    routeDate: string,
    cache: Map<number, boolean>,
  ): Promise<boolean> {
    const memo = cache.get(entregadorId);
    if (memo !== undefined) return memo;
    let viva = false;
    try {
      const rota = await this.prisma.logisticaRoute.findFirst({
        where: {
          companyId,
          entregadorId,
          routeDate,
          status: { in: ['ACTIVE', 'INITIALIZING'] },
          operationalEndedAt: null,
        },
        select: { id: true },
      });
      viva = !!rota;
    } catch (e: any) {
      // Fail-CLOSED: se não dá pra saber se o cara está na rua, ele CONTINUA
      // com a parada. Assumir no escuro é o único erro irreversível aqui.
      this.logger.warn(`[logistica] estaNaRua falhou entregador=${entregadorId}: ${String(e?.message || e)}`);
      viva = true;
    }
    cache.set(entregadorId, viva);
    return viva;
  }

  private async nomeDoUsuario(companyId: number, userId: number, cache: Map<number, string>): Promise<string> {
    const memo = cache.get(userId);
    if (memo) return memo;
    let nome = 'outro motorista';
    try {
      const pessoa = await this.prisma.user.findFirst({
        where: { id: userId, companyId },
        select: { name: true, username: true },
      });
      nome = pessoa?.name || pessoa?.username || nome;
    } catch { /* nome é enfeite do aviso: nunca derruba o gerar */ }
    cache.set(userId, nome);
    return nome;
  }

  /**
   * 31/07 — O 409 ERA UMA PAREDE SEM NOME. "A entrega de Márcia já está
   * atribuída a outro motorista" não dizia QUEM, nem se a rota estava na rua,
   * parada ou já encerrada — o dono levava o erro na cara e não tinha o que
   * fazer com ele. Agora a mensagem conta o fato: dono e hora.
   *
   * Best-effort por contrato: isto roda no caminho de ERRO, então falha de
   * leitura aqui não pode virar 500 em cima de um 409 — sem nome, volta a
   * frase antiga.
   */
  private async explicarDono(
    companyId: number,
    clienteNome: string | null | undefined,
    entregadorId: number,
    routeDate: string,
  ): Promise<string> {
    const cliente = clienteNome || 'um cliente';
    try {
      const [pessoa, rota] = await Promise.all([
        this.prisma.user.findFirst({
          where: { id: entregadorId, companyId },
          select: { name: true, username: true },
        }),
        this.prisma.logisticaRoute.findFirst({
          where: { companyId, entregadorId, routeDate },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { startedAt: true, operationalEndedAt: true, status: true },
        }),
      ]);
      const nome = pessoa?.name || pessoa?.username || 'outro motorista';
      // Rota VIVA (mesma régua do logistica-rota-viva.util: encerrada
      // operacionalmente ou terminal já não está de pé).
      const viva = !!rota && !rota.operationalEndedAt && !['COMPLETED', 'FAILED', 'REFUNDING'].includes(String(rota.status));
      if (viva && rota!.startedAt) {
        return `A entrega de ${cliente} está com ${nome} — na rua desde ${horaSP(rota!.startedAt)}.`;
      }
      if (rota?.operationalEndedAt) {
        return `A entrega de ${cliente} continua com ${nome} — a rota foi encerrada às ${horaSP(rota.operationalEndedAt)}.`;
      }
      return `A entrega de ${cliente} está com ${nome} — rota montada, ainda não iniciada.`;
    } catch (e: any) {
      this.logger.warn(`[logistica] explicarDono falhou entregador=${entregadorId}: ${String(e?.message || e)}`);
      return `A entrega de ${cliente} já está atribuída a outro motorista.`;
    }
  }

  /**
   * 31/07 — ESTADO DAS ROTAS SALVAS (o painel do dono: "Rotas Salvas" mostrava
   * só nome + nº de paradas, e a única forma de descobrir que a rota estava com
   * alguém era clicar e tomar 409 na cara).
   *
   * Devolve, por rota salva do dia: quem está com as paradas, se ele está na
   * rua, quantas já foram entregues e — o recado que faltava — se alguém
   * ACEITOU e DEVOLVEU hoje.
   *
   * 🔒 `podeMontar` é calculado com a MESMA regra do `gerar` (entrega ABERTA com
   * `entregadorId` de outra pessoa = conflito; cancelada não tranca nada).
   * Vitrine e caixa têm que ter o mesmo porteiro: um botão que a tela libera e o
   * servidor recusa é pior que um botão desligado.
   */
  async estadoDoDia(companyId: number, dateInput: string | undefined, userId: number): Promise<RotaModeloEstadoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const modelos = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId, tipo: 'LIVRE' },
      select: { id: true, paradas: PARADAS_EM_ORDEM },
    });
    if (!modelos.length) return [];

    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);
    const routeDate = safeRouteDate(dateInput);

    const clientesPorModelo = new Map<string, string[]>();
    const todosClientes = new Set<string>();
    for (const modelo of modelos) {
      const ids = modelo.paradas
        .map((parada) => String(parada.customerProfileId ?? '').trim())
        .filter(Boolean);
      clientesPorModelo.set(modelo.id, ids);
      for (const id of ids) todosClientes.add(id);
    }

    const [entregas, rotasVivas] = await Promise.all([
      todosClientes.size
        ? this.prisma.entrega.findMany({
            where: {
              companyId,
              customerProfileId: { in: [...todosClientes] },
              scheduledAt: { gte: dia, lte: dayEnd },
            },
            orderBy: { createdAt: 'desc' },
            select: { customerProfileId: true, status: true, entregadorId: true },
          })
        : Promise.resolve([] as { customerProfileId: string; status: string; entregadorId: number | null }[]),
      this.prisma.logisticaRoute.findMany({
        where: {
          companyId,
          routeDate,
          status: { in: ['ACTIVE', 'INITIALIZING'] },
          operationalEndedAt: null,
        },
        select: { entregadorId: true, startedAt: true },
      }),
    ]);

    // 31/07 — recado de rota que morreu no meio é o que alimenta a linha
    // `devolvida`: a rota que o motorista montou, começou e largou. Best-effort
    // (ambiente sem migration não pode derrubar o painel).
    //
    // 09/08 (F4) — antes existia uma SEGUNDA fonte de `devolvida`, a
    // `LogisticaRotaIndicada` ("aceitou e desistiu"). A Rota Indicada foi
    // enterrada (4 usos na vida); o recado de saída, que nunca dependeu dela,
    // continua sendo a história de quem largou a rota.
    const recados = await this.prisma.logisticaRotaAviso.findMany({
      where: { companyId, routeDate, rotaModeloId: { in: modelos.map((m) => m.id) } },
      orderBy: { createdAt: 'desc' },
      select: { rotaModeloId: true, motoristaNome: true, entregues: true, createdAt: true },
    }).catch(() => [] as { rotaModeloId: string | null; motoristaNome: string; entregues: number; createdAt: Date }[]);

    // Por cliente, a ABERTA manda (mesma precedência do `gerar`): é ela que
    // decide dono e conflito. Sem aberta, uma 'entregue' conta como atendida.
    const porCliente = new Map<string, { status: string; entregadorId: number | null }>();
    for (const entrega of entregas) {
      const atual = porCliente.get(entrega.customerProfileId);
      const aberta = entrega.status === 'agendada' || entrega.status === 'em_rota';
      if (!atual) { porCliente.set(entrega.customerProfileId, entrega); continue; }
      const atualAberta = atual.status === 'agendada' || atual.status === 'em_rota';
      if (aberta && !atualAberta) porCliente.set(entrega.customerProfileId, entrega);
      else if (!atualAberta && atual.status !== 'entregue' && entrega.status === 'entregue') {
        porCliente.set(entrega.customerProfileId, entrega);
      }
    }

    const naRua = new Map<number, Date | null>(rotasVivas.map((rota) => [rota.entregadorId, rota.startedAt]));
    const pessoasCitadas = new Set<number>();
    for (const entrega of porCliente.values()) if (entrega.entregadorId) pessoasCitadas.add(entrega.entregadorId);
    const nomes = new Map<number, string>();
    if (pessoasCitadas.size) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...pessoasCitadas] }, companyId },
        select: { id: true, name: true, username: true },
      });
      for (const user of users) nomes.set(user.id, user.name || user.username || `Usuário ${user.id}`);
    }

    return modelos.map((modelo) => {
      const clientes = clientesPorModelo.get(modelo.id) ?? [];
      const donos = new Map<number, number>();
      let entregues = 0;
      for (const clienteId of clientes) {
        const entrega = porCliente.get(clienteId);
        if (!entrega) continue;
        if (entrega.status === 'entregue') { entregues++; continue; }
        if (entrega.status !== 'agendada' && entrega.status !== 'em_rota') continue;
        if (entrega.entregadorId) donos.set(entrega.entregadorId, (donos.get(entrega.entregadorId) ?? 0) + 1);
      }
      let dono: number | null = null;
      let comEle = 0;
      for (const [id, quantas] of donos) if (quantas > comEle) { dono = id; comEle = quantas; }
      const outroDono = [...donos.keys()].find((id) => id !== userId) ?? null;

      const largada = recados.find((linha) => linha.rotaModeloId === modelo.id);

      let estado: RotaModeloEstado = 'livre';
      if (dono && naRua.has(dono)) estado = 'na_rua';
      else if (dono) estado = 'montada';
      else if (largada) estado = 'devolvida';

      const pessoaNome = estado === 'na_rua' || estado === 'montada'
        ? (dono ? (nomes.get(dono) ?? `Usuário ${dono}`) : null)
        : estado === 'devolvida'
          ? largada!.motoristaNome
          : null;
      const pessoaId = estado === 'na_rua' || estado === 'montada' ? dono : null;

      return {
        id: modelo.id,
        estado,
        pessoaNome,
        pessoaEhVoce: pessoaId != null && pessoaId === userId,
        comEle,
        total: clientes.length,
        entregues,
        desde: dono && naRua.get(dono) ? (naRua.get(dono) as Date).toISOString() : null,
        em: estado === 'devolvida' ? (largada?.createdAt.toISOString() ?? null) : null,
        // 🔒 MESMA RÉGUA DO `gerar` (vitrine e caixa, um porteiro só): agora só
        // trava quem está NA RUA. Parada de rota morta é assumível — o painel
        // libera o clique porque o servidor também libera.
        podeMontar: outroDono == null || !naRua.has(outroDono),
      };
    });
  }

  /**
   * 3º degrau da cascata de itens: os vínculos ativos do cliente (o que ele
   * recebe "de sempre"). Vale pra empresa ainda em modo LEGADO, onde não existe
   * plano da Agenda. Voltou em 27/07 — tinha sido removida quando o snapshot da
   * parada virou exigência, e foi justamente essa exigência que deixou a rota
   * salva pela montagem (sem snapshot) sem NADA pra materializar.
   */
  private async resolveLegacyItens(companyId: number, customerProfileId: string): Promise<EntregaItemCreate[]> {
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId, ativo: true },
      select: {
        productId: true,
        qtdPadrao: true,
        precoAcordado: true,
        product: { select: { price: true, priceCents: true } },
      },
    });
    return vinculos.map((v: any) => ({
      productId: v.productId,
      qtdPrevista: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
      valorUnit: resolveValorUnit(v),
    }));
  }
}

/**
 * A ORDEM É A LISTA. Toda leitura de parada do modelo passa por AQUI — um
 * `select` só, com `orderBy: ordem`. É o que garante que "aplicar o modelo"
 * devolva sempre a MESMA sequência, sem cada tela inventar a própria ordenação.
 */
const PARADAS_EM_ORDEM = {
  orderBy: { ordem: 'asc' },
  select: { customerProfileId: true, localId: true },
} as const;

/**
 * Grava a lista 1..N. `createMany` (e não create aninhado) de propósito:
 * `companyId` participa das relações compostas da parada, então num create
 * ANINHADO o Prisma o herda do pai e passá-lo derruba com "Unknown argument
 * `companyId`" só em RUNTIME (mesma lei do createPlan/createRouteStop). No
 * `createMany`, que é chamada de topo, ele é escalar comum e VAI explícito.
 */
async function gravarParadas(
  tx: any,
  companyId: number,
  rotaModeloId: string,
  paradas: ParadaOrdenada[],
): Promise<void> {
  if (!paradas.length) return;
  await tx.logisticaRotaModeloParada.createMany({
    data: paradas.map((parada) => ({
      companyId,
      rotaModeloId,
      customerProfileId: parada.customerProfileId,
      localId: parada.localId,
      ordem: parada.ordem,
      ordemTravada: true,
    })),
  });
}

/**
 * `canonicalRouteDate` estoura 400 em data podre; o `gerar`/`estado` sempre
 * foram tolerantes (data inválida = hoje). Mantém a tolerância sem perder a
 * chave certa da rota comercial.
 */
function safeRouteDate(dateInput?: string): string {
  try {
    return canonicalRouteDate(dateInput);
  } catch {
    return canonicalRouteDate();
  }
}

/**
 * Hora pro texto que o dono lê — SEMPRE no fuso da operação. O container roda
 * em UTC: sem `timeZone` explícito, "encerrou às 17:31" apareceria como 20:31.
 */
function horaSP(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function normalizeNome(value: unknown): string {
  const nome = String(value ?? '').trim();
  if (!nome) throw new BadRequestException('Nome é obrigatório.');
  if (nome.length > 80) throw new BadRequestException('Nome deve ter até 80 caracteres.');
  return nome;
}

export function normalizeDiaSemana(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new BadRequestException('diaSemana deve ser 1 (segunda) a 7 (domingo), ou omitido.');
  }
  return n;
}

/**
 * 🔴 F3 (09/08) — A PARADA VIROU DUAS CHAVES: cliente e porta. Saíram daqui:
 * - `itens`: o que a visita leva mora no PLANO (`LogisticaPlanoEntrega`), que é
 *   onde o dono combina — snapshot na parada só servia pra envelhecer sozinho;
 * - `horaRef`: quem gravava era o finalizar da Leitura de Rota, enterrada em
 *   09/08 (F4). Sem escritor e sem coluna pra morar, o campo virava enfeite que
 *   a próxima gravação apagaria de qualquer jeito.
 * Chave a mais no corpo NÃO passa calada: o `ValidationPipe` roda com
 * `forbidNonWhitelisted`, então o DTO recusa `itens` na porta, antes daqui.
 */
export function normalizeParadas(value: unknown): RotaModeloParada[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('paradas deve ser uma lista.');
  if (value.length > 500) throw new BadRequestException('No máximo 500 paradas por modelo.');
  return value.map((item, index) => {
    const customerProfileId = String((item as any)?.customerProfileId ?? '').trim();
    if (!customerProfileId) {
      throw new BadRequestException(`paradas[${index}].customerProfileId é obrigatório.`);
    }
    const localIdRaw = (item as any)?.localId;
    const localId = localIdRaw != null ? String(localIdRaw).trim() : null;
    return {
      customerProfileId,
      ...(localId ? { localId } : {}),
    };
  });
}

function toDTO(row: {
  id: string;
  nome: string;
  diaSemana: number | null;
  createdAt?: Date | null;
  paradas?: Array<{ customerProfileId: string | null; localId: string | null }> | null;
}): RotaModeloDTO {
  return {
    id: row.id,
    nome: row.nome,
    diaSemana: row.diaSemana ?? null,
    // 08/08 — a ORDEM DE NASCIMENTO é o que dá endereço fixo aos 2 espaços da
    // tela de montar: o 1º salvo do dia é sempre o Espaço 1. Sem isto o app
    // teria de ordenar por nome, e renomear "Manhã" pra "Tarde" faria o espaço
    // trocar de lugar embaixo do dedo do motorista. Campo que já existia na
    // linha — só não saía pela porta.
    criadoEm: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    // O contrato da porta NÃO mudou com a F3: continua `[{customerProfileId,
    // localId?}]`, na ordem. O app (`ordenarPeloEspaco`) e o desktop leem isto
    // igualzinho — o que mudou foi de ONDE o servidor tira a lista.
    paradas: (row.paradas ?? [])
      .filter((parada) => !!parada.customerProfileId)
      .map((parada) => ({
        customerProfileId: String(parada.customerProfileId),
        ...(parada.localId ? { localId: parada.localId } : {}),
      })),
  };
}

export interface RotaModeloParada {
  customerProfileId: string;
  localId?: string;
}

/** A parada já conferida contra o banco, com a posição que vai pro `ordem`. */
interface ParadaOrdenada {
  customerProfileId: string;
  localId: string | null;
  ordem: number;
}

interface EntregaItemCreate {
  productId: number;
  qtdPrevista: number;
  valorUnit: number;
}

export interface RotaModeloInput {
  nome: string;
  diaSemana?: number | null;
  paradas?: RotaModeloParada[];
}

export interface RotaModeloDTO {
  id: string;
  nome: string;
  diaSemana: number | null;
  /** ISO de criação — ordem estável dos 2 espaços do dia. */
  criadoEm: string | null;
  paradas: RotaModeloParada[];
}

export interface GerarRotaModeloResult {
  deliveryIds: string[];
  avisos: string[];
}

/**
 * 31/07 — estado de uma rota salva HOJE (linha do painel "Rotas Salvas").
 * `livre` = ninguém pegou · `montada` = as paradas estão no nome de alguém,
 * parado · `na_rua` = esse alguém tem rota viva iniciada · `devolvida` = saiu
 * pra rua e largou no meio hoje (recado de `LogisticaRotaAviso`).
 *
 * 09/08 (F4) — `indicada` MORREU junto com a Rota Indicada. `devolvida` NÃO
 * morreu: ela também nasce de rota largada, que nunca dependeu da indicação.
 */
export type RotaModeloEstado = 'livre' | 'montada' | 'na_rua' | 'devolvida';

export interface RotaModeloEstadoDTO {
  id: string;
  estado: RotaModeloEstado;
  pessoaNome: string | null;
  pessoaEhVoce: boolean;
  /** Quantas paradas DESTA rota estão no nome da pessoa. */
  comEle: number;
  total: number;
  entregues: number;
  /** Início da rota viva (ISO) — só no estado `na_rua`. */
  desde: string | null;
  /** Hora em que a rota foi largada (ISO) — só no estado `devolvida`. */
  em: string | null;
  podeMontar: boolean;
}
