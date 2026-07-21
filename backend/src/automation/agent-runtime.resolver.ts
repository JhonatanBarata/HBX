import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAssistenteConfig, type AssistenteConfigShape } from '../assistente/assistente-flow';
import { normalizeAtendimentoBotConfig, type AtendimentoBotConfig } from '../inbox/atendimento-config';
import type { AgentBrain } from './dto/agent.dto';

// ============================================================================
// S10 (MOTOR-ÚNICO) — AgentRuntimeResolver.
//
// Decide, para uma empresa, QUAL a origem efetiva da config conversacional:
// o schema novo `AutomationAgent` (S09) ou o par legado `AssistenteConfig` +
// `BotConfig(domain='atendimento_bot')`. É a ÚNICA porta que o runtime
// (ConversationAssistantRuntimeService, messaging.service.ts) e o AgentService
// (S05) consultam para essa decisão — CONTRATO.md §"S10 é o coração da
// fusão: 1 config, 2 cérebros, mesma precedência".
//
// FONTE ÚNICA da flag `HBX_AUTOMATION_AGENT` — nenhum outro arquivo deve ler
// `process.env.HBX_AUTOMATION_AGENT` diretamente (S10.md "Regra da flag").
//
// S20 (MOTOR-ÚNICO, docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/
// S20-backend-orfaos-flags-ddl.md item 2): a flag nasceu OFF na S10 — esta
// sprint vira o default pra ON EM CÓDIGO (constante, não env do VPS — "a
// fusão vira o caminho principal"). Kill-switch explícito:
// `HBX_AUTOMATION_AGENT=0` (ou `false`/`no`/`off`) desliga e volta pro
// legado byte a byte. Ausente/vazio = ON. Só um valor EXPLICITAMENTE falso
// desativa — o oposto do padrão S10 original (que exigia opt-in explícito).
// `effectiveFor` cai em `{source:'legacy'}` sempre que a empresa não tem
// linha em `AutomationAgent` (não migrada) OU a leitura falhar — "empresa não
// migrada não quebra" continua valendo (S10.md item 4).
//
// Desenho anti-ciclo (mesmo truque do InboundRouterService, S06, e do
// EventRuleService, S08): esta classe só depende de PrismaService (que é
// @Global() via PrismaModule — nenhum módulo precisa importar AutomationModule
// pra usá-la). Registrada como provider em `automation.module.ts` para DI
// dentro desta frente/testes Nest, mas os consumidores reais
// (ConversationAssistantRuntimeService em AssistenteModule, MessagingService
// em MessagingModule) instanciam direto (`new AgentRuntimeResolver(prisma)`)
// — evita que AssistenteModule/MessagingModule precisem importar
// AutomationModule de volta (AutomationModule já importa AssistenteModule,
// ver CONTRATO.md §1.1 — importar de volta fecharia um ciclo real).
// ============================================================================

const FLAG = 'HBX_AUTOMATION_AGENT';

// S20: default ON — kill-switch é um valor EXPLICITAMENTE falso (0/false/no/
// off). Ausente, vazio, ou qualquer outro valor -> ON.
export function isAutomationAgentRuntimeEnabled(): boolean {
  const raw = process.env[FLAG];
  if (raw === undefined || raw === null || String(raw).trim() === '') return true;
  return !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

export type AgentRuntimeEffective =
  | { source: 'legacy' }
  | {
      source: 'agent';
      brain: AgentBrain;
      published: boolean;
      // Preenchido quando `brain === 'ia'` — config pronta pro
      // ConversationAssistantRuntimeService usar no lugar de ler
      // AssistenteConfig direto (nome/tom/perfil/produtos/empresaNome/fluxo,
      // já sanitizada pelo MESMO sanitizador que o adapter usa).
      ia: AssistenteConfigShape | null;
      // Preenchido quando `brain === 'roteiro'` E o agente TEM roteiro real
      // configurado (roteiroJson diferente do default de schema `"{}"`).
      // `null` quando o agente ainda não tem roteiro (empresa migrada só
      // pelo lado 'ia', ou linha nova nunca editada) — quem chama cai no
      // fallback legado (S10.md item 2, "fallback legado se agent sem
      // roteiro"), já normalizado pelo MESMO normalizador do resto do produto.
      roteiro: AtendimentoBotConfig | null;
    };

@Injectable()
export class AgentRuntimeResolver {
  constructor(private readonly prisma: PrismaService) {}

  async effectiveFor(companyId: number): Promise<AgentRuntimeEffective> {
    if (!isAutomationAgentRuntimeEnabled()) return { source: 'legacy' };
    const id = Number(companyId || 0);
    if (!id) return { source: 'legacy' };

    // S20: encadeamento opcional + catch — flag agora é ON por default, então
    // este caminho passa a rodar em MUITO mais lugares (inclusive testes
    // antigos cujo mock de PrismaService nunca precisou ter `automationAgent`,
    // porque a flag OFF garantia que nunca chegava aqui). Fail-soft pra
    // `legacy` cobre tanto prisma real com erro transitório quanto mock
    // incompleto — nunca derruba o runtime (mesma postura de todo o resto da
    // sprint: "empresa/ambiente não migrado não quebra").
    const agent = await this.prisma?.automationAgent
      ?.findUnique({ where: { companyId: id } })
      .catch(() => null);
    if (!agent) return { source: 'legacy' };

    const brain: AgentBrain = agent.brain === 'ia' ? 'ia' : 'roteiro';
    const published = Boolean(agent.published);

    let ia: AssistenteConfigShape | null = null;
    if (brain === 'ia') {
      let fluxo: unknown = {};
      try {
        fluxo = JSON.parse(agent.fluxoJson || '{}');
      } catch {
        fluxo = {};
      }
      ia = sanitizeAssistenteConfig({
        nome: agent.nome,
        tom: agent.tom,
        perfil: agent.perfil,
        produtos: agent.produtos || '',
        empresaNome: agent.empresaNome || '',
        fluxo,
      });
    }

    let roteiro: AtendimentoBotConfig | null = null;
    if (brain === 'roteiro') {
      const raw = String(agent.roteiroJson || '').trim();
      if (raw && raw !== '{}') {
        try {
          roteiro = normalizeAtendimentoBotConfig(JSON.parse(raw));
        } catch {
          // JSON quebrado na linha nova nunca derruba o runtime — cai no
          // fallback legado (roteiro:null), mesma postura fail-soft do resto
          // da sprint (ex.: AgentBackfillService.resolvePublished).
          roteiro = null;
        }
      }
    }

    return { source: 'agent', brain, published, ia, roteiro };
  }
}
