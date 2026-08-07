import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NucleoCadastroService } from '../nucleo/nucleo-cadastro.service';
import { mesmaPorta, numeroDaPorta, type PortaCadastro } from '../nucleo/endereco-porta.util';

/**
 * 🔴 FAXINA DA BASE DE CLIENTES (06/08, 2 regras do dono):
 *   1. "mesmos endereços prevalece o que foi cadastrado por último, e delete o
 *      anterior (se não tiver nenhum registro de pagamento)";
 *   2. "clientes sem endereços fechados (CEP e Número) serão apagados (se não tiver
 *      nenhum registro de pagamento)".
 *
 * ── POR QUE O CRITÉRIO DE PROTEÇÃO É MAIS LARGO QUE "PAGAMENTO" ──────────────────
 * MEDIDO na base do André (company 41, 239 clientes ativos) antes de escrever uma
 * linha disto: 109 clientes com endereço não fechado, dos quais **106 têm rota semanal
 * ATIVA** — e a empresa inteira tem só 49 cobranças lançadas, porque ele recebe na
 * mão. Ou seja: "não tem registro de pagamento" é verdade para quase toda a base viva,
 * e a regra ao pé da letra apagaria os clientes que ele entrega toda semana.
 * O mesmo na regra 1: dos 13 pares na mesma porta, 12 são DUAS PESSOAS na mesma casa,
 * as duas com entregas (ex.: Luana Ypê e Larissa Ypê, ambas com cobrança lançada) —
 * apagar "o anterior" apagaria cliente vivo. Mesma porta não é a mesma pessoa: é
 * exatamente para isso que existe o complemento.
 *
 * Então o que protege aqui é QUALQUER VIDA no sistema: entrega (de qualquer status),
 * rota semanal ativa, cobrança lançada ou débito em aberto. Sem NADA disso, o cadastro
 * é casca — e casca sai. Com qualquer coisa disso, o cliente fica e vira fila de
 * correção (o painel já mostra o que falta nele).
 *
 * ── SEGURANÇA ────────────────────────────────────────────────────────────────────
 * · Nada é apagado de verdade: a exclusão é a porta canônica `softDeleteConta` —
 *   snapshot completo em DeletionRecord + status='deleted'. Dá pra restaurar.
 * · `softDeleteConta` mantém a própria trava de débito (CLIENTE_COM_DEBITO): mesmo
 *   que esta régua erre, o dinheiro barra a exclusão lá dentro.
 * · `executar:false` (default) é PRÉVIA: devolve nome por nome quem sairia, sem tocar
 *   em nada. Ninguém apaga base de cliente sem ver a lista antes.
 */
@Injectable()
export class LogisticaBaseLimpezaService {
  private readonly logger = new Logger(LogisticaBaseLimpezaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cadastro: NucleoCadastroService,
  ) {}

  async limpar(
    companyId: number,
    input: { executar?: boolean; deletedByUserId?: number | null } = {},
  ): Promise<LimpezaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const executar = input.executar === true;

    const clientes = await this.prisma.customerProfile.findMany({
      where: { companyId, isCliente: true, status: 'active' },
      select: {
        id: true, name: true, createdAt: true,
        endereco: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, cep: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!clientes.length) return { duplicados: [], semEndereco: [], apagados: 0, executado: executar };

    const vivos = await this.quemTemVida(companyId, clientes.map((c) => c.id));

    // ── Regra 1: mesma porta → fica o MAIS RECENTE, sai o anterior sem vida ────────
    const porta = (c: (typeof clientes)[number]): PortaCadastro => ({
      endereco: c.endereco, numero: c.numero, complemento: c.complemento,
      bairro: c.bairro, cidade: c.cidade, uf: c.uf, cep: c.cep,
    });
    const porNumero = new Map<number, typeof clientes>();
    for (const c of clientes) {
      const numero = numeroDaPorta(porta(c));
      if (!numero) continue;
      const lista = porNumero.get(numero);
      if (lista) lista.push(c);
      else porNumero.set(numero, [c]);
    }
    const duplicados: LimpezaCliente[] = [];
    const jaMarcado = new Set<string>();
    for (const candidatos of porNumero.values()) {
      if (candidatos.length < 2) continue;
      for (let i = 0; i < candidatos.length; i += 1) {
        for (let j = i + 1; j < candidatos.length; j += 1) {
          const a = candidatos[i];
          const b = candidatos[j];
          if (!mesmaPorta(porta(a), porta(b))) continue;
          // `clientes` vem ordenado por createdAt: o de índice menor é o ANTERIOR.
          const anterior = a;
          const maisNovo = b;
          if (jaMarcado.has(anterior.id)) continue;
          const vida = vivos.get(anterior.id);
          if (vida && vida.tem) continue; // cliente vivo NUNCA sai por esta regra
          jaMarcado.add(anterior.id);
          duplicados.push({
            id: anterior.id,
            nome: anterior.name,
            endereco: [anterior.endereco, anterior.numero].filter(Boolean).join(', '),
            motivo: `Mesmo endereço de ${maisNovo.name || 'outro cliente'} (cadastrado depois) e sem nenhum movimento`,
          });
        }
      }
    }

    // ── Regra 2: endereço não fechado (CEP + número) e sem vida ───────────────────
    const semEndereco: LimpezaCliente[] = [];
    for (const c of clientes) {
      if (jaMarcado.has(c.id)) continue;
      if (enderecoFechado(porta(c))) continue;
      const vida = vivos.get(c.id);
      if (vida && vida.tem) continue;
      jaMarcado.add(c.id);
      semEndereco.push({
        id: c.id,
        nome: c.name,
        endereco: [c.endereco, c.numero].filter(Boolean).join(', '),
        motivo: 'Sem CEP ou sem número, e sem nenhum movimento',
      });
    }

    if (!executar) {
      this.logger.log(
        `[logistica] limpeza (PRÉVIA) company=${companyId}: ${duplicados.length} duplicado(s) + ${semEndereco.length} sem endereço.`,
      );
      return { duplicados, semEndereco, apagados: 0, executado: false };
    }

    let apagados = 0;
    for (const alvo of [...duplicados, ...semEndereco]) {
      try {
        // Porta canônica: snapshot em DeletionRecord + trava própria de débito.
        const res = await this.cadastro.softDeleteConta(companyId, alvo.id, {
          deletedByUserId: input.deletedByUserId ?? null,
          motivo: `Faxina da base: ${alvo.motivo}`,
        });
        if (res) apagados += 1;
      } catch (e) {
        // Débito achado lá dentro (ou qualquer outra trava) — o cliente FICA, e a
        // falha é logada. Faxina nunca derruba por causa de um caso.
        this.logger.warn(`[logistica] limpeza não apagou ${alvo.id}: ${String((e as any)?.message || e)}`);
      }
    }
    this.logger.log(`[logistica] limpeza EXECUTADA company=${companyId}: ${apagados} cadastro(s) arquivado(s).`);
    return { duplicados, semEndereco, apagados, executado: true };
  }

  /** Qualquer sinal de vida: entrega (qualquer status), rota semanal ativa, cobrança. */
  private async quemTemVida(
    companyId: number,
    ids: string[],
  ): Promise<Map<string, { tem: boolean; entregas: number; planos: number; cobrancas: number }>> {
    const [entregas, planos, cobrancas] = await Promise.all([
      this.prisma.entrega.groupBy({
        by: ['customerProfileId'],
        where: { companyId, customerProfileId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.logisticaPlanoEntrega.groupBy({
        by: ['customerProfileId'],
        where: { companyId, ativo: true, customerProfileId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.financeiroCharge.groupBy({
        by: ['customerProfileId'],
        where: { companyId, customerProfileId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const mapa = new Map<string, { tem: boolean; entregas: number; planos: number; cobrancas: number }>();
    const soma = (id: string | null, campo: 'entregas' | 'planos' | 'cobrancas', valor: number) => {
      if (!id) return;
      const atual = mapa.get(id) ?? { tem: false, entregas: 0, planos: 0, cobrancas: 0 };
      atual[campo] += valor;
      atual.tem = atual.entregas > 0 || atual.planos > 0 || atual.cobrancas > 0;
      mapa.set(id, atual);
    };
    for (const e of entregas) soma(e.customerProfileId, 'entregas', Number((e as any)._count?._all) || 0);
    for (const p of planos) soma(p.customerProfileId, 'planos', Number((p as any)._count?._all) || 0);
    for (const c of cobrancas) soma(c.customerProfileId, 'cobrancas', Number((c as any)._count?._all) || 0);
    return mapa;
  }
}

/** CEP de 8 dígitos E número (coluna, texto composto ou "SN" declarado). */
function enderecoFechado(porta: PortaCadastro): boolean {
  const cep = String(porta.cep ?? '').replace(/\D+/g, '');
  if (cep.length !== 8) return false;
  if (numeroDaPorta(porta)) return true;
  // "sem número" declarado é resposta válida (regra do dono) — só o campo em BRANCO
  // é que não fecha, porque não diz se é sem número ou se ninguém perguntou.
  return /sem\s*n[uú]?mero|\bs\/?n\b/i.test(`${porta.numero ?? ''} ${porta.endereco ?? ''}`);
}

export interface LimpezaCliente {
  id: string;
  nome: string | null;
  endereco: string;
  motivo: string;
}

export interface LimpezaResult {
  /** Regra 1 — mesma porta, cadastro anterior, sem movimento nenhum. */
  duplicados: LimpezaCliente[];
  /** Regra 2 — endereço não fechado, sem movimento nenhum. */
  semEndereco: LimpezaCliente[];
  apagados: number;
  executado: boolean;
}
