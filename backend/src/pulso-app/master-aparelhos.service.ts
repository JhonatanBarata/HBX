import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';
import { PULSO_ABERTO_MS } from './pulso-app.service';

/**
 * PAINEL DO CLIENTE — os APARELHOS de UMA empresa (PR05082026-VER-TELA, 05/08).
 *
 * A janela "Pulso" (frota inteira numa tabela) morreu aqui: a pergunta que o
 * dono faz de verdade não é "quem está no app agora?", é "o André está no app
 * agora?" — e ela nasce DENTRO da ficha da empresa, junto do "Entrar como".
 * Por isso a leitura é escopada por empresa e LAZY: só roda quando a ficha abre.
 *
 * ── AS TRÊS LEIS DESTE ARQUIVO ─────────────────────────────────────────────
 *  1. **Aparelho tem NOME.** Uma pessoa pode ter 4 linhas ("André", "André",
 *     "André", "André") — sem "moto e13" × "moto g15" + a data do pareamento o
 *     dono não sabe qual é o celular real do cliente e qual é o de teste. Isso
 *     custou uma madrugada em 04/08.
 *  2. **Remover NÃO apaga.** `ocultoEm` esconde a vaga; trilha, erros e
 *     hardwareId ficam. O mesmo celular re-pareando volta pra ESTA vaga (lei
 *     "1 celular = 1 vaga"), e o re-pareamento limpa a coluna sozinho.
 *  3. **Derrubar é AÇÃO NA VIDA REAL de outra pessoa.** Derrubar o celular do
 *     entregador às 10h da manhã é tirar o cara da rua. Quem confirma é a tela
 *     (2 cliques com o NOME do aparelho); aqui a única defesa possível é não
 *     ter caminho de derrubar "todos", só um por vez e por id.
 */

/** Teto de aparelhos por empresa no painel — é ficha de cliente, não relatório. */
const PAINEL_TAKE = 60;

/**
 * 🔴 "NUNCA PULSOU" NÃO É "FORA DO APP" (08/08). Mesma lei do `fonteCaiu` do
 * aparelho: *vazio porque o servidor disse vazio* e *vazio porque ninguém
 * mandou* são coisas OPOSTAS, e escrever as duas do mesmo jeito faz o painel
 * mentir. O pulso morreu na fusão de 07/08 (o `POST /logistica/recados/pendentes`,
 * que carrega o `tela`, ficou sem chamador quando o `app.js` saiu do APK), então
 * TODO aparelho com o APK publicado reporta `ultimaTelaAt` NULL — e a coluna
 * dizia "fora do app" segurando um `lastUsedAt` de 2 minutos atrás na MESMA
 * linha. Medido: moto e22, company 49, pulso NULL desde o pareamento e heartbeat
 * de 05:25:06.
 *
 * `lastUsedAt` NÃO substitui o pulso: ele é tocado por qualquer chamada
 * autenticada do aparelho (inclusive o sync nativo com o app FECHADO), então
 * prova que o CELULAR fala com o servidor, nunca que a tela está aberta. Serve
 * pra uma coisa só: separar "não sei" de "fora do app".
 */
export type SituacaoAparelho = 'no_app' | 'fora_do_app' | 'sem_pulso';

export interface PainelAparelho {
  deviceId: string;
  deviceName: string | null;
  pareadoEm: string | null;
  userId: number;
  userName: string;
  appVersion: string | null;
  ultimaTela: string | null;
  ultimaTelaAt: string | null;
  /** Servidor decide: painel nunca calcula presença com relógio de terceiro. */
  abertoAgora: boolean;
  /** Última vez que o APARELHO falou com o servidor (heartbeat/credencial). */
  falouEm: string | null;
  /** `sem_pulso` = o app deste celular não reporta tela; presença é DESCONHECIDA. */
  situacao: SituacaoAparelho;
}

/**
 * Janela do "ainda está falando comigo". O heartbeat bate a cada 30s em primeiro
 * plano e o jwt.strategy regrava no máximo 1×/min — 3 minutos dá folga pra rede
 * ruim sem transformar um celular desligado há meia hora em "não sei".
 */
const FALOU_RECENTE_MS = 3 * 60_000;

@Injectable()
export class MasterAparelhosService {
  private readonly logger = new Logger(MasterAparelhosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Um aparelho por linha, da empresa pedida. Não usa `withoutTenantScope`: a
   * query JÁ leva `companyId` no where, que é exatamente o que o tenant-guard
   * exige — master lendo empresa X é uma query escopada como qualquer outra.
   */
  async listar(companyIdInput: unknown, agoraInput?: Date): Promise<PainelAparelho[]> {
    const companyId = numeroPositivo(companyIdInput);
    if (!companyId) throw new BadRequestException('Empresa inválida.');
    const agora = agoraInput ?? new Date();

    const linhas = await this.prisma.mobileDevice.findMany({
      where: { companyId, revokedAt: null, ocultoEm: null },
      orderBy: { ultimaTelaAt: { sort: 'desc', nulls: 'last' } },
      take: PAINEL_TAKE,
      select: {
        id: true,
        name: true,
        createdAt: true,
        userId: true,
        appVersion: true,
        ultimaTela: true,
        ultimaTelaAt: true,
        lastUsedAt: true,
        user: { select: { name: true, username: true, email: true } },
      },
    });

    return linhas.map((linha) => {
      const at = linha.ultimaTelaAt ? new Date(linha.ultimaTelaAt) : null;
      const falou = linha.lastUsedAt ? new Date(linha.lastUsedAt) : null;
      const abertoAgora = Boolean(at && agora.getTime() - at.getTime() < PULSO_ABERTO_MS);
      // A ordem é a régua: pulso fresco manda; sem pulso NENHUM, quem fala é o
      // heartbeat, e ele só tem direito de dizer "não sei" — nunca "está no app".
      const falouAgora = Boolean(falou && agora.getTime() - falou.getTime() < FALOU_RECENTE_MS);
      const situacao: SituacaoAparelho = abertoAgora
        ? 'no_app'
        : !at && falouAgora
          ? 'sem_pulso'
          : 'fora_do_app';
      return {
        deviceId: linha.id,
        deviceName: linha.name ?? null,
        pareadoEm: linha.createdAt ? new Date(linha.createdAt).toISOString() : null,
        userId: Number(linha.userId),
        userName: linha.user?.name || linha.user?.username || linha.user?.email || 'Sem nome',
        appVersion: linha.appVersion ?? null,
        ultimaTela: linha.ultimaTela ?? null,
        ultimaTelaAt: at ? at.toISOString() : null,
        abertoAgora,
        falouEm: falou ? falou.toISOString() : null,
        situacao,
      };
    });
  }

  /**
   * Derruba a sessão do aparelho: `revokedAt` + `tokenVersion++` (o jwt.strategy
   * confere a versão a cada request, então o celular cai no próximo toque e
   * volta pela tela de pareamento). NÃO apaga nada.
   */
  async derrubar(deviceIdInput: unknown): Promise<{ ok: true; deviceName: string | null }> {
    const alvo = await this.carregarAlvo(deviceIdInput);
    // O `where` leva companyId (vindo do próprio aparelho) além do id: o
    // tenant-guard fica satisfeito sem bypass e o escopo é o mais estreito que
    // existe — 1 linha, por PK.
    await this.prisma.mobileDevice.updateMany({
      where: { id: alvo.id, companyId: alvo.companyId },
      data: {
        revokedAt: new Date(),
        tokenVersion: { increment: 1 },
        webTicketHash: null,
        webTicketExpiresAt: null,
      },
    });
    this.logger.log(`[aparelhos] derrubado device=${alvo.id} company=${alvo.companyId}`);
    return { ok: true, deviceName: alvo.name };
  }

  /**
   * Remove da lista: derruba E esconde (`ocultoEm`). A linha FICA — é ela que
   * guarda o hardwareId que devolve o mesmo celular pra mesma vaga.
   */
  async remover(deviceIdInput: unknown): Promise<{ ok: true; deviceName: string | null }> {
    const alvo = await this.carregarAlvo(deviceIdInput);
    const agora = new Date();
    await this.prisma.mobileDevice.updateMany({
      where: { id: alvo.id, companyId: alvo.companyId },
      data: {
        revokedAt: agora,
        ocultoEm: agora,
        tokenVersion: { increment: 1 },
        webTicketHash: null,
        webTicketExpiresAt: null,
      },
    });
    this.logger.log(`[aparelhos] removido do painel device=${alvo.id} company=${alvo.companyId}`);
    return { ok: true, deviceName: alvo.name };
  }

  /**
   * O aparelho existe? A busca é por PK (findUnique não é operação de massa, o
   * tenant-guard não a cobre) e devolve o companyId que escopa a escrita — é
   * assim que o master age cross-tenant sem abrir um bypass de tenant.
   */
  private async carregarAlvo(deviceIdInput: unknown) {
    const id = String(deviceIdInput || '').trim();
    if (!id) throw new BadRequestException('Aparelho inválido.');
    const alvo = await withoutTenantScope('painel master: resolver o aparelho pelo id', () =>
      this.prisma.mobileDevice.findUnique({
        where: { id },
        select: { id: true, companyId: true, name: true },
      }),
    );
    if (!alvo) throw new NotFoundException('Aparelho não encontrado.');
    return alvo;
  }
}

function numeroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
