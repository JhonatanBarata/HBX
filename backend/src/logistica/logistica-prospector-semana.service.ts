import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ehEsquemaAusente } from './logistica-esquema-ausente.util';
import { semanaIsoVigente } from './logistica-prospector-semana.util';
import {
  PROSPECTOR_TIPOS,
  ProspectorTipo,
  ehTipoValido,
  tipoPorSlug,
  tiposParaEscolha,
} from './logistica-prospector-tipos';

/**
 * PROSPECTOR v2 (12/08) — A 5ª CHAVE: a escolha da SEMANA, e ela é DA PESSOA.
 *
 * 🔴 A DECISÃO DO DONO. O prospector nasce DESLIGADO pra todo mundo. Ele só acorda
 * quando a PESSOA aciona e diz que TIPO de empresa interessa a ela NESTA SEMANA. Sem
 * escolha, o payload da rota sai SEM a chave `prospector` — byte a byte a mesma
 * semântica das 4 chaves anteriores fechadas. A cadeia inteira ficou:
 *
 *      env global → empresa (prospectorAtivo) → ATOR (papel) → SEMANA DA PESSOA → pino
 *
 * 🔴 EXPIRA SOZINHA, SEM FAXINA. A chave é a semana ISO de São Paulo. Segunda-feira
 * nova = semana nova = nenhuma linha = quieto de novo. Não existe job de expiração,
 * não existe varredura, não existe "limpar escolhas antigas" — a linha velha fica lá,
 * inofensiva, e ninguém a lê nunca mais (é a LEI DO DESAPARECER numa preferência).
 *
 * 🔴 FAIL-CLOSED EM TUDO. Banco no chão, migration pendente, ator sem id, slug que a
 * curadoria não conhece mais: todos viram "sem escolha", que é o prospector QUIETO. O
 * caminho de falha deste serviço nunca pode ser "acende de qualquer jeito" — prédio
 * aceso é o app pedindo pro motorista parar o carro.
 *
 * 🔴 MULTI-TENANT + POR PESSOA. Toda consulta é escopada em `companyId` E `userId`.
 * Dois motoristas da mesma distribuidora escolhem coisas diferentes na mesma semana, e
 * a escolha de um NUNCA acende a tela do outro.
 */
@Injectable()
export class LogisticaProspectorSemanaService {
  private readonly logger = new Logger(LogisticaProspectorSemanaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A ESCOLHA VIGENTE — é isto que o gate do prospector pergunta, e só isto.
   *
   * Devolve o TIPO CURADO (não o slug cru): quem chama precisa dos prefixos de CNAE
   * pra decidir quem é verde, e resolver o slug aqui é o que garante que slug órfão
   * (curadoria mudou embaixo de quem já tinha escolhido) seja lido como AUSENTE.
   *
   * NUNCA LANÇA. Este método roda dentro do `iniciar-rota` e do hot-path do `listRota`
   * — ENFEITE NÃO DERRUBA ROTA vale aqui em dobro. Mas nenhuma falha é muda.
   */
  async escolhaVigente(companyId: unknown, userId: unknown): Promise<ProspectorTipo | null> {
    const company = this.inteiroPositivo(companyId);
    const user = this.inteiroPositivo(userId);
    // Sem ator identificado não há de quem ler a escolha: FAIL-CLOSED, sem ida ao
    // banco. Mesma régua fail-closed de sempre (chamada sem ator = ninguém).
    if (!company || !user) return null;

    const semana = semanaIsoVigente();
    if (!semana) return null;

    try {
      const linha = await this.prisma.logisticaProspectorSemana.findUnique({
        where: { companyId_userId_semana: { companyId: company, userId: user, semana } },
        select: { tipo: true },
      });
      if (!linha) return null;
      const tipo = tipoPorSlug(linha.tipo);
      if (!tipo) {
        // A pessoa escolheu 'padaria' e a curadoria tirou 'padaria' da lista. Não é
        // erro: é a preferência dela virando ausente. Mas fica NO LOG, porque uma
        // curadoria que apaga escolha de gente em produção é decisão, não acidente.
        this.logger.warn(
          `[prospector] escolha da semana com tipo desconhecido (curadoria mudou?) company=${company} user=${user} semana=${semana} tipo=${linha.tipo}`,
        );
      }
      return tipo;
    } catch (error) {
      this.registrarFalha('leitura da escolha', company, user, semana, error);
      return null;
    }
  }

  /**
   * O que a FOLHA de escolha do app precisa desenhar: a semana, o que está escolhido
   * hoje e a lista de tipos. `tipo: null` = ninguém escolheu nada (prospector quieto).
   *
   * Aqui a falha de banco NÃO é engolida em silêncio nem vira 500: a folha abre com a
   * lista de tipos (que é constante do código, não do banco) e sem escolha marcada —
   * a pessoa consegue escolher de novo, que é a saída útil.
   */
  async lerEscolha(companyId: number, userId: number): Promise<EscolhaDaSemanaResult> {
    const company = this.inteiroPositivo(companyId);
    const user = this.inteiroPositivo(userId);
    const semana = semanaIsoVigente();
    const tipos = tiposParaEscolha();
    if (!company || !user || !semana) return { semana, tipo: null, rotulo: null, tipos };

    const tipo = await this.escolhaVigente(company, user);
    return {
      semana,
      tipo: tipo ? tipo.slug : null,
      rotulo: tipo ? tipo.rotulo : null,
      tipos,
    };
  }

  /**
   * GRAVA ou DESLIGA a escolha da semana.
   *
   * `tipo` nulo/vazio = DESLIGAR, e desligar é DELETE mesmo: ausência de linha é a
   * única forma de "não quero" que o gate entende. Guardar uma linha com tipo vazio
   * criaria um segundo jeito de dizer a mesma coisa — e é assim que dois caminhos
   * passam a discordar.
   *
   * Trocar de tipo no meio da semana é UPSERT na chave `(company, user, semana)`: a
   * pessoa muda de ideia na quarta e a rua muda de cor no próximo poll, sem linha
   * nova e sem histórico que ninguém pediu.
   *
   * Este é o único caminho do prospector que LANÇA: é ação explícita de gente apertando
   * botão, e botão que não faz nada e não avisa é pior que botão que dá erro.
   */
  async gravarEscolha(companyId: number, userId: number, tipoBruto: unknown): Promise<EscolhaDaSemanaResult> {
    const company = this.inteiroPositivo(companyId);
    const user = this.inteiroPositivo(userId);
    if (!company || !user) throw new BadRequestException('Usuário não identificado');

    const semana = semanaIsoVigente();
    if (!semana) throw new ServiceUnavailableException('Não foi possível resolver a semana da operação.');

    const slug = String(tipoBruto ?? '').trim().toLowerCase();
    const desligar = slug === '' || slug === 'null' || slug === 'nenhum';
    if (!desligar && !ehTipoValido(slug)) {
      throw new BadRequestException('Tipo de empresa desconhecido.');
    }

    try {
      if (desligar) {
        // deleteMany (não delete): apagar o que já não existe é sucesso, não 404.
        // Tocar em "Desligar" duas vezes é a mesma coisa que tocar uma vez.
        await this.prisma.logisticaProspectorSemana.deleteMany({
          where: { companyId: company, userId: user, semana },
        });
      } else {
        await this.prisma.logisticaProspectorSemana.upsert({
          where: { companyId_userId_semana: { companyId: company, userId: user, semana } },
          create: { companyId: company, userId: user, semana, tipo: slug },
          update: { tipo: slug },
        });
      }
    } catch (error) {
      this.registrarFalha('gravação da escolha', company, user, semana, error);
      if (ehEsquemaAusente(error)) {
        throw new ServiceUnavailableException('Recurso ainda não disponível neste servidor.');
      }
      throw new ServiceUnavailableException('Não foi possível salvar sua escolha agora.');
    }

    const tipo = desligar ? null : tipoPorSlug(slug);
    return { semana, tipo: tipo ? tipo.slug : null, rotulo: tipo ? tipo.rotulo : null, tipos: tiposParaEscolha() };
  }

  /** Todos os tipos curados (só o servidor precisa dos prefixos). */
  get tipos(): readonly ProspectorTipo[] {
    return PROSPECTOR_TIPOS;
  }

  // ---------------------------------------------------------------------------

  private inteiroPositivo(valor: unknown): number {
    const n = Math.trunc(Number(valor || 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Transição esperada é `warn`; defeito de verdade é `error`. Nenhum dos dois é mudo. */
  private registrarFalha(o_que: string, company: number, user: number, semana: string, error: unknown): void {
    const msg = String((error as any)?.message || error);
    const onde = `company=${company} user=${user} semana=${semana}`;
    if (ehEsquemaAusente(error)) {
      this.logger.warn(`[prospector] ${o_que}: tabela ainda não existe neste banco (migration pendente) ${onde}: ${msg}`);
    } else {
      this.logger.error(`[prospector] ${o_que} FALHOU ${onde}: ${msg}`);
    }
  }
}

export type EscolhaDaSemanaResult = {
  /** Semana ISO vigente em São Paulo, ex.: '2026-W33'. */
  semana: string;
  /** Slug escolhido, ou `null` = prospector quieto pra esta pessoa nesta semana. */
  tipo: string | null;
  /** Rótulo do escolhido (o app mostra na linha dos Ajustes). */
  rotulo: string | null;
  /** A lista que a folha desenha. Vem do código, nunca do banco. */
  tipos: Array<{ slug: string; rotulo: string }>;
};
