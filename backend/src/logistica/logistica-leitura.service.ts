import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearch } from '../nucleo/nucleo-search.util';
import { assertNomeUnico } from './logistica-rota-modelo.service';
import { decidirGeoFonteCadastro } from './logistica-geo-fonte.util';
import type {
  RegistrarLeituraParadaDto,
  UpdateLeituraParadaDto,
  FinalizarLeituraDto,
} from './dto/logistica-leitura.dto';

// S2 (PR21072026-MONTAR-ROTA-PLAY) — teto de pontos de trilha guardados por
// sessão (defesa em profundidade; o aparelho já simplifica antes de enviar).
const MAX_TRILHA_PONTOS = 20_000;

/**
 * PR20072026 W1 — "Leitura de Rota" (docs/PLANEJAMENTOS/PR20072026/
 * SPEC-LEITURA-DE-ROTA.md + 00-ORQUESTRACAO.md, contrato = LEI).
 *
 * Sessão de captura em campo (`modo: 'LEITURA' | 'MANUAL'`), paradas com
 * lat/lng OPCIONAIS (LEITURA manda GPS; MANUAL não manda). Finalizar cria uma
 * `LogisticaRotaModelo` (já existe, ver logistica-rota-modelo.service.ts) —
 * esta sessão NUNCA cria `Entrega`/`EntregaItem` (decisão do dono 20/07: item 8
 * da spec — materializar entregas — CORTADO).
 *
 * Escopo: por (companyId, userId) — `userId` é o dono da sessão (req.user.id).
 * Nunca 2 sessões ABERTAS do mesmo usuário ao mesmo tempo.
 */
@Injectable()
export class LogisticaLeituraService {
  private readonly logger = new Logger(LogisticaLeituraService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── iniciar (idempotente) ──────────────────────────────────────────────────
  async iniciar(companyId: number, userId: number, modo?: string): Promise<SessaoDTO> {
    ensureIds(companyId, userId);
    const modoNormalizado = modo === 'MANUAL' ? 'MANUAL' : 'LEITURA';
    const sessao = await this.prisma.$transaction(async (tx: any) => {
      const aberta = await tx.logisticaLeituraSessao.findFirst({
        where: { companyId, userId, status: 'ABERTA' },
      });
      if (aberta) return aberta;
      return tx.logisticaLeituraSessao.create({
        data: { companyId, userId, modo: modoNormalizado, status: 'ABERTA' },
      });
    });
    const paradas = await this.prisma.logisticaLeituraParada.findMany({
      where: { sessaoId: sessao.id },
      orderBy: { ordem: 'asc' },
    });
    return serializeSessao(sessao, paradas);
  }

  // ── GET /atual — retomada após restart do app ───────────────────────────────
  async atual(companyId: number, userId: number): Promise<SessaoDTO | null> {
    ensureIds(companyId, userId);
    const sessao = await this.prisma.logisticaLeituraSessao.findFirst({
      where: { companyId, userId, status: 'ABERTA' },
    });
    if (!sessao) return null;
    const paradas = await this.prisma.logisticaLeituraParada.findMany({
      where: { sessaoId: sessao.id },
      orderBy: { ordem: 'asc' },
    });
    return serializeSessao(sessao, paradas);
  }

  // ── POST /:id/parada — transacional + idempotente por (sessaoId, clientKey) ─
  async registrarParada(
    companyId: number,
    userId: number,
    sessaoId: string,
    input: RegistrarLeituraParadaDto,
  ): Promise<ParadaDTO> {
    ensureIds(companyId, userId);
    const clientKey = String(input?.clientKey ?? '').trim();
    if (!clientKey) throw new BadRequestException('clientKey é obrigatório.');
    if (!Array.isArray(input?.itens) || input.itens.length === 0) {
      throw new BadRequestException('Informe ao menos um item.');
    }

    const parada = await this.prisma.$transaction(async (tx: any) => {
      const sessao = await tx.logisticaLeituraSessao.findFirst({
        where: { id: sessaoId, companyId, userId, status: 'ABERTA' },
      });
      if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');

      // Idempotência: replay do mesmo clientKey nunca duplica cliente/parada.
      const existente = await tx.logisticaLeituraParada.findUnique({
        where: { sessaoId_clientKey: { sessaoId, clientKey } },
      });
      if (existente) return existente;

      let customerProfileId: string | null = null;
      let localEntregaId: string | null = null;

      if (input.customerProfileId) {
        const perfil = await tx.customerProfile.findFirst({
          where: { id: String(input.customerProfileId).trim(), companyId },
          select: { id: true },
        });
        if (!perfil) throw new BadRequestException('Cliente não encontrado nesta empresa.');
        customerProfileId = perfil.id;
        // PR20072026 (feedback dono) — grava a observação do passo "Observações"
        // no cliente existente. Só quando veio texto: passo pulado em branco NÃO
        // apaga a nota que o cliente já tinha.
        const obs = String(input.observacoes ?? '').trim();
        if (obs) {
          await tx.customerProfile.update({
            where: { id: customerProfileId },
            data: { observacoes: obs.slice(0, 500) },
          });
        }
      } else if (input.clienteNovo) {
        const nome = String(input.clienteNovo.nome ?? '').trim();
        if (!nome) throw new BadRequestException('clienteNovo.nome é obrigatório.');
        const phoneRaw = input.clienteNovo.telefone;
        const phoneNormalized = normalizeDigits(phoneRaw) || null;
        const lat = input.clienteNovo.lat ?? input.lat ?? null;
        const lng = input.clienteNovo.lng ?? input.lng ?? null;
        const hasCoord = typeof lat === 'number' && typeof lng === 'number';
        // TETO DE PRECISÃO (25/07) — antes gravava 'gps_cadastro' (fonte intocável) só
        // por ter coordenada, SEM checar precisão nenhuma. Agora quem decide é o
        // backend: `gpsAccuracy` do próprio cliente novo, ou (quando ele não capturou
        // ponto próprio) a accuracy da PARADA — é o MESMO fix físico que virou `lat`/
        // `lng` acima pela mesma regra de fallback. App antigo (v32, sem gpsAccuracy
        // nenhum) cai em 'gps_impreciso': seguro e corrigível, nunca quebra.
        const gpsAccuracy = input.clienteNovo.gpsAccuracy ?? input.accuracy;
        const geoFonte = decidirGeoFonteCadastro(hasCoord, input.clienteNovo.geoFonte, gpsAccuracy);

        const criado = await tx.customerProfile.create({
          data: {
            companyId,
            tipo: 'pf',
            name: nome,
            searchName: normalizeSearch(nome),
            phone: normalizeDigits(phoneRaw) || null,
            phoneNormalized,
            endereco: input.clienteNovo.endereco || null,
            numero: input.clienteNovo.numero || null,
            bairro: input.clienteNovo.bairro || null,
            cidade: input.clienteNovo.cidade || null,
            uf: (input.clienteNovo.uf || '').toUpperCase() || null,
            cep: input.clienteNovo.cep || null,
            lat,
            lng,
            geoFonte,
            // PR20072026 (feedback dono) — observação capturada no passo final.
            observacoes: String(input.observacoes ?? '').trim().slice(0, 500) || null,
            isCliente: true,
            origin: 'manual',
          },
          select: { id: true },
        });
        customerProfileId = criado.id;

        if (hasCoord) {
          const local = await tx.localEntrega.create({
            data: {
              companyId,
              customerProfileId,
              endereco: input.clienteNovo.endereco || null,
              numero: input.clienteNovo.numero || null,
              bairro: input.clienteNovo.bairro || null,
              cidade: input.clienteNovo.cidade || null,
              uf: (input.clienteNovo.uf || '').toUpperCase() || null,
              cep: input.clienteNovo.cep || null,
              lat,
              lng,
              geoFonte,
              isPrincipal: true,
            },
            select: { id: true },
          });
          localEntregaId = local.id;
        }
      } else {
        throw new BadRequestException('Informe customerProfileId ou clienteNovo.');
      }

      if (!localEntregaId && input.localEntregaId) {
        const local = await tx.localEntrega.findFirst({
          where: { id: String(input.localEntregaId).trim(), companyId, customerProfileId },
          select: { id: true },
        });
        if (!local) throw new BadRequestException('Local de entrega não encontrado para este cliente.');
        localEntregaId = local.id;
      }

      const itens = await normalizeItens(tx, companyId, input.itens);

      // PR20072026-ROTA-SALVA F2a — ponte Leitura → cadastro: SEMPRE (não só
      // quando atualizarPrecoAcordado) garante o vínculo ClienteProduto de
      // CADA item digitado, sem dia. Ver ensureVinculoSemDia.
      if (customerProfileId) {
        for (const item of itens) {
          await ensureVinculoSemDia(tx, companyId, customerProfileId, item.productId, item.qtd, item.valorUnit);
        }
      }

      const ultimaOrdem = await tx.logisticaLeituraParada.findFirst({
        where: { sessaoId },
        orderBy: { ordem: 'desc' },
        select: { ordem: true },
      });
      const ordem = (ultimaOrdem?.ordem ?? 0) + 1;

      return tx.logisticaLeituraParada.create({
        data: {
          sessaoId,
          clientKey,
          ordem,
          capturadoEm: new Date(input.capturadoEm),
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          accuracy: input.accuracy ?? null,
          customerProfileId,
          localEntregaId,
          itensJson: itens as any,
          telefoneConfirmado: Boolean(input.telefoneConfirmado),
        },
      });
    });

    return serializeParada(parada);
  }

  // ── GET /:id/resumo — timeline pra tela de finalização ──────────────────────
  async resumo(companyId: number, userId: number, sessaoId: string): Promise<ResumoDTO> {
    ensureIds(companyId, userId);
    const sessao = await this.prisma.logisticaLeituraSessao.findFirst({
      where: { id: sessaoId, companyId, userId },
    });
    if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');

    const paradas = await this.prisma.logisticaLeituraParada.findMany({
      where: { sessaoId },
      orderBy: { ordem: 'asc' },
    });
    const customerIds = Array.from(new Set(paradas.map((p) => p.customerProfileId).filter(Boolean))) as string[];
    const perfis = customerIds.length
      ? await this.prisma.customerProfile.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [];
    const nomeById = new Map(perfis.map((p) => [p.id, p.name || '—']));

    let total = 0;
    const linhas = paradas.map((p) => {
      const itens = Array.isArray(p.itensJson) ? (p.itensJson as unknown as StoredItem[]) : [];
      const subtotal = itens.reduce((soma, it) => soma + Number(it.qtd || 0) * Number(it.valorUnit || 0), 0);
      total += subtotal;
      return {
        id: p.id,
        ordem: p.ordem,
        hora: formatHora(p.capturadoEm),
        clienteNome: p.customerProfileId ? nomeById.get(p.customerProfileId) ?? '—' : '—',
        itens,
        subtotal,
      };
    });

    return { paradas: linhas, total, count: linhas.length };
  }

  // ── PATCH /:id/parada/:paradaId — editar itens/qtd/valor ────────────────────
  async updateParada(
    companyId: number,
    userId: number,
    sessaoId: string,
    paradaId: string,
    input: UpdateLeituraParadaDto,
  ): Promise<ParadaDTO> {
    ensureIds(companyId, userId);
    const parada = await this.prisma.$transaction(async (tx: any) => {
      const sessao = await tx.logisticaLeituraSessao.findFirst({
        where: { id: sessaoId, companyId, userId, status: 'ABERTA' },
      });
      if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');
      const existente = await tx.logisticaLeituraParada.findFirst({
        where: { id: paradaId, sessaoId },
      });
      if (!existente) throw new NotFoundException('Parada não encontrada.');

      const data: Record<string, unknown> = {};
      if (input.itens !== undefined) {
        const itens = await normalizeItens(tx, companyId, input.itens);
        data.itensJson = itens as any;
        // PR20072026-ROTA-SALVA F2a — mesma ponte SEMPRE-ativa do registrarParada.
        if (existente.customerProfileId) {
          for (const item of itens) {
            await ensureVinculoSemDia(tx, companyId, existente.customerProfileId, item.productId, item.qtd, item.valorUnit);
          }
        }
      }
      if (input.telefoneConfirmado !== undefined) data.telefoneConfirmado = Boolean(input.telefoneConfirmado);

      return tx.logisticaLeituraParada.update({ where: { id: paradaId }, data });
    });
    return serializeParada(parada);
  }

  // ── DELETE /:id/parada/:paradaId ─────────────────────────────────────────────
  async removeParada(companyId: number, userId: number, sessaoId: string, paradaId: string): Promise<void> {
    ensureIds(companyId, userId);
    await this.prisma.$transaction(async (tx: any) => {
      const sessao = await tx.logisticaLeituraSessao.findFirst({
        where: { id: sessaoId, companyId, userId, status: 'ABERTA' },
      });
      if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');
      const existente = await tx.logisticaLeituraParada.findFirst({
        where: { id: paradaId, sessaoId },
        select: { id: true },
      });
      if (!existente) throw new NotFoundException('Parada não encontrada.');
      await tx.logisticaLeituraParada.delete({ where: { id: paradaId } });
    });
  }

  // ── POST /:id/finalizar — cria a LogisticaRotaModelo ─────────────────────────
  async finalizar(
    companyId: number,
    userId: number,
    sessaoId: string,
    input: FinalizarLeituraDto,
  ): Promise<{ modeloId: string; nome: string; avisos?: string[] }> {
    ensureIds(companyId, userId);
    // PR20072026-ROTA-SALVA F1 — diaSemana agora é OPCIONAL ("rota salva sem
    // dia"): ausente/null grava diaSemana:null no modelo (schema já é Int?).
    // Quando vier preenchido, mantém a validação 1–7 de sempre (compat com o
    // APK atual, que ainda manda o dia).
    const diaSemanaRaw = input?.diaSemana;
    let diaSemana: number | null = null;
    if (diaSemanaRaw !== undefined && diaSemanaRaw !== null) {
      const parsed = Math.trunc(Number(diaSemanaRaw));
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
        throw new BadRequestException('diaSemana deve ser 1 (segunda) a 7 (domingo), ou omitido.');
      }
      diaSemana = parsed;
    }

    return this.prisma.$transaction(async (tx: any) => {
      const sessao = await tx.logisticaLeituraSessao.findFirst({
        where: { id: sessaoId, companyId, userId, status: 'ABERTA' },
      });
      if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');

      const paradas = await tx.logisticaLeituraParada.findMany({
        where: { sessaoId },
        orderBy: { ordem: 'asc' },
      });
      if (paradas.length === 0) throw new BadRequestException('Nenhuma parada registrada.');

      const ordenadas = reordenar(paradas, input.ordemParadaIds);

      const avisos: string[] = [];
      const paradasJson = ordenadas
        .map((p: any) => {
          if (!p.customerProfileId) {
            avisos.push(`Parada #${p.ordem} sem cliente vinculado foi ignorada.`);
            return null;
          }
          return {
            customerProfileId: p.customerProfileId as string,
            ...(p.localEntregaId ? { localId: p.localEntregaId as string } : {}),
            horaRef: formatHora(p.capturadoEm),
            itens: Array.isArray(p.itensJson) ? p.itensJson : [],
          };
        })
        .filter(Boolean);

      const nomeInput = String(input?.nome ?? '').trim();
      const nome = nomeInput || (diaSemana != null ? diaLabel(diaSemana) : defaultNomeRotaSemDia());
      await assertNomeUnico(tx, companyId, nome);

      const modelo = await tx.logisticaRotaModelo.create({
        data: { companyId, nome, diaSemana, paradasJson: paradasJson as any },
      });

      await tx.logisticaLeituraSessao.update({
        where: { id: sessaoId },
        data: { status: 'FINALIZADA', finishedAt: new Date() },
      });

      this.logger.log(
        `[logistica-leitura] sessao=${sessaoId} finalizada company=${companyId} modeloId=${modelo.id} paradas=${paradasJson.length}`,
      );
      return { modeloId: modelo.id, nome: modelo.nome, ...(avisos.length ? { avisos } : {}) };
    });
  }

  // ── POST /:id/cancelar ────────────────────────────────────────────────────
  async cancelar(companyId: number, userId: number, sessaoId: string): Promise<void> {
    ensureIds(companyId, userId);
    const result = await this.prisma.logisticaLeituraSessao.updateMany({
      where: { id: sessaoId, companyId, userId, status: 'ABERTA' },
      data: { status: 'CANCELADA', finishedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Sessão de leitura não encontrada.');
  }

  // ── POST /:id/trilha — S2 (PR21072026-MONTAR-ROTA-PLAY) ─────────────────────
  // Trilha (breadcrumb GPS) que o RotaService nativo grava durante a Leitura,
  // já simplificada (Douglas-Peucker ~10m) no aparelho antes de enviar. ADITIVO
  // por design: concatena com o que a sessão já tinha (o app só manda o lote
  // NOVO desde o último envio confirmado — contrato em S2-CONTRATO-PONTE.md).
  //
  // Sem gate de status ABERTA de propósito: a fila offline do aparelho pode
  // entregar a cauda de pontos DEPOIS que o motorista já tocou "finalizar"
  // (sessão já FINALIZADA/CANCELADA) — nunca 404 por status, só por sessão
  // inexistente/de outra empresa-usuário.
  async registrarTrilha(
    companyId: number,
    userId: number,
    sessaoId: string,
    pontos: Array<{ lat: number; lng: number; ts: string }>,
  ): Promise<{ success: true; totalPontos: number }> {
    ensureIds(companyId, userId);
    if (!Array.isArray(pontos) || pontos.length === 0) {
      throw new BadRequestException('Informe ao menos um ponto.');
    }
    return this.prisma.$transaction(async (tx: any) => {
      const sessao = await tx.logisticaLeituraSessao.findFirst({
        where: { id: sessaoId, companyId, userId },
        select: { id: true, trilhaJson: true },
      });
      if (!sessao) throw new NotFoundException('Sessão de leitura não encontrada.');

      const existentes = Array.isArray(sessao.trilhaJson) ? (sessao.trilhaJson as unknown as StoredTrilhaPonto[]) : [];
      const novos: StoredTrilhaPonto[] = pontos.map((p) => ({ lat: p.lat, lng: p.lng, ts: p.ts }));
      // Teto de segurança: mesmo com simplificação no aparelho, uma sessão
      // aberta por muitas horas não pode crescer sem limite no banco.
      const combinados = [...existentes, ...novos].slice(-MAX_TRILHA_PONTOS);

      await tx.logisticaLeituraSessao.update({
        where: { id: sessaoId },
        data: { trilhaJson: combinados as any },
      });

      return { success: true as const, totalPontos: combinados.length };
    });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureIds(companyId: number, userId: number): void {
  if (!companyId) throw new BadRequestException('Empresa não identificada.');
  if (!userId) throw new BadRequestException('Usuário não identificado.');
}

/** S2 (PR21072026-MONTAR-ROTA-PLAY) — um ponto da trilha (breadcrumb GPS). */
interface StoredTrilhaPonto {
  lat: number;
  lng: number;
  ts: string;
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** HH:MM no fuso America/Sao_Paulo (mesmo padrão de logistica-admin-route.service.ts). */
function formatHora(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

const DIA_LABELS: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo',
};

function diaLabel(diaSemana: number): string {
  return DIA_LABELS[diaSemana] || `Dia ${diaSemana}`;
}

/** PR20072026-ROTA-SALVA F1 — nome default quando finaliza SEM dia da semana:
 *  "Rota dd/mm" na data local (America/Sao_Paulo, mesmo fuso do resto do módulo). */
function defaultNomeRotaSemDia(): string {
  const hoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date());
  return `Rota ${hoje}`;
}

interface StoredItem {
  productId: number;
  qtd: number;
  valorUnit: number;
}

async function normalizeItens(
  tx: any,
  companyId: number,
  itens: Array<{ productId: number; qtd: number; valorUnit: number }>,
): Promise<StoredItem[]> {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new BadRequestException('Informe ao menos um item.');
  }
  const out: StoredItem[] = [];
  for (const item of itens) {
    const productId = Math.trunc(Number(item?.productId));
    const qtd = Math.trunc(Number(item?.qtd));
    const valorUnit = Number(item?.valorUnit);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('itens[].productId inválido.');
    }
    if (!Number.isInteger(qtd) || qtd < 1) {
      throw new BadRequestException('itens[].qtd deve ser ao menos 1.');
    }
    if (!Number.isFinite(valorUnit) || valorUnit < 0) {
      throw new BadRequestException('itens[].valorUnit deve ser ≥ 0.');
    }
    const produto = await tx.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
    if (!produto) throw new BadRequestException(`Produto ${productId} não encontrado nesta empresa.`);
    out.push({ productId, qtd, valorUnit });
  }
  return out;
}

/** PR20072026-ROTA-SALVA F2a — ponte Leitura → cadastro: SEMPRE garante o vínculo
 *  ClienteProduto (produto + qtdPadrao + precoAcordado) de cada item digitado na
 *  Leitura de Rota, SEM DIA (produto digitado com preço normal não morre mais
 *  junto com a sessão — antes só virava vínculo quando `atualizarPrecoAcordado`).
 *
 *  SEGURO por quê: `buscarVencidosPorCliente` (logistica-recorrencia.service.ts)
 *  só considera vencido quem tem `diasSemana != null` OU `proximaData` vencida —
 *  um vínculo criado aqui nasce com diasSemana/frequenciaDias/proximaData=null,
 *  logo é INVISÍVEL pro gerar-dia/"Por dia" (não polui a recorrência automática).
 *  Modelo mental do dono: vínculo SEM dia = "o de sempre" (rota salva usa);
 *  vínculo COM dia = recorrência.
 *
 *  Idempotência (schema NÃO tem @@unique customerProfileId+productId — dono
 *  permite o mesmo produto vinculado 2x pra recorrência; aqui pegamos o
 *  primeiro vínculo do par como "o de sempre" e SÓ atualizamos preço/qtd — NUNCA
 *  mexe em diasSemana/frequenciaDias/proximaData de um vínculo já existente, pra
 *  não apagar o dia de uma recorrência já configurada no cadastro). */
async function ensureVinculoSemDia(
  tx: any,
  companyId: number,
  customerProfileId: string,
  productId: number,
  qtd: number,
  valorUnit: number,
): Promise<void> {
  const existente = await tx.clienteProduto.findFirst({
    where: { companyId, customerProfileId, productId },
    select: { id: true },
  });
  if (existente) {
    await tx.clienteProduto.update({
      where: { id: existente.id },
      data: { qtdPadrao: qtd || 1, precoAcordado: valorUnit },
    });
  } else {
    await tx.clienteProduto.create({
      data: {
        companyId,
        customerProfileId,
        productId,
        precoAcordado: valorUnit,
        qtdPadrao: qtd || 1,
        diasSemana: null,
        frequenciaDias: null,
        proximaData: null,
      },
    });
  }
}

/** ordemParadaIds (modo manual) reordena: ids listados definem a ordem; ids da
 *  sessão ausentes da lista vão pro fim mantendo ordem relativa; id estranho → 400. */
function reordenar(paradas: any[], ordemParadaIds?: string[]): any[] {
  if (!Array.isArray(ordemParadaIds) || ordemParadaIds.length === 0) return paradas;
  const byId = new Map(paradas.map((p) => [p.id, p]));
  const consumidos = new Set<string>();
  const ordenadas: any[] = [];
  for (const id of ordemParadaIds) {
    const p = byId.get(id);
    if (!p) throw new BadRequestException(`ordemParadaIds contém id inválido: ${id}`);
    if (consumidos.has(id)) continue;
    ordenadas.push(p);
    consumidos.add(id);
  }
  for (const p of paradas) {
    if (!consumidos.has(p.id)) ordenadas.push(p);
  }
  return ordenadas;
}

function serializeParada(row: any): ParadaDTO {
  return {
    id: row.id,
    sessaoId: row.sessaoId,
    ordem: row.ordem,
    capturadoEm: row.capturadoEm,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    accuracy: row.accuracy ?? null,
    customerProfileId: row.customerProfileId ?? null,
    localEntregaId: row.localEntregaId ?? null,
    itens: Array.isArray(row.itensJson) ? row.itensJson : [],
    telefoneConfirmado: Boolean(row.telefoneConfirmado),
  };
}

function serializeSessao(sessao: any, paradas: any[]): SessaoDTO {
  return {
    id: sessao.id,
    modo: sessao.modo,
    status: sessao.status,
    startedAt: sessao.startedAt,
    paradas: paradas.map(serializeParada),
  };
}

export interface ParadaDTO {
  id: string;
  sessaoId: string;
  ordem: number;
  capturadoEm: Date;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  customerProfileId: string | null;
  localEntregaId: string | null;
  itens: StoredItem[];
  telefoneConfirmado: boolean;
}

export interface SessaoDTO {
  id: string;
  modo: string;
  status: string;
  startedAt: Date;
  paradas: ParadaDTO[];
}

export interface ResumoLinha {
  id: string;
  ordem: number;
  hora: string;
  clienteNome: string;
  itens: StoredItem[];
  subtotal: number;
}

export interface ResumoDTO {
  paradas: ResumoLinha[];
  total: number;
  count: number;
}
