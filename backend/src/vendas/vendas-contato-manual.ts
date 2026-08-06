/**
 * O ENVIO MANUAL TAMBÉM TEM QUE MOVER O CARD (06/08/2026).
 *
 * Cena medida em produção, empresa 5: Tagliágua, Bella Água e J Água Mineral
 * receberam um WhatsApp de verdade em 30/07 (Message OUTBOUND `vendas_human`,
 * conversa vinculada ao lead) e, uma semana depois, os três cards ainda diziam
 * **"Sem contato"** — `status='novo'`, `attemptCount=0`, `lastContactAt=NULL`.
 *
 * É a metade ESQUECIDA da lei do §2 do worker: todo mundo cuidou de "resposta do
 * cliente move o card" (o caso Atacadão) e ninguém cuidou de **"minha mensagem
 * move o card"**. O estrago é maior do que parece:
 *
 * 1. A vendedora reabre a lista, vê "Sem contato" e **manda de novo pra quem já
 *    recebeu**. Mensagem repetida pro mesmo contato frio é exatamente a máquina
 *    de ban (veredito do dono, 04/08: o chip …884 caiu por disparo repetido).
 * 2. O relatório de "leads trabalhados" lê `attemptCount > 0 || lastContactAt`
 *    (relatorios.service.ts) — um dia inteiro de trabalho aparece como ZERO.
 * 3. `maxAttemptsPerLead` (casa do risco) nunca é cobrado, porque ninguém conta
 *    a tentativa.
 *
 * Aqui mora só a DECISÃO (zero I/O), que é a parte que precisa de teste barato.
 * Quem escreve no banco é o VendasConversationService.
 */

/** Etapas do funil, na ordem em que a tela mostra (page.client.tsx). */
const ETAPA_NOVO = 'novo';
const ETAPA_CONTATO = 'contato';

export interface PlanoContatoManualInput {
  /** `VendasLead.status` de agora. */
  status?: string | null;
  /** `VendasLead.pipelineStage` de agora (schema default: 'prospeccao'). */
  pipelineStage?: string | null;
  /**
   * O lead já respondeu alguma vez? (`engagement.hasInboundReply` do cockpit).
   * Depois que ele responde, mensagem minha é CONVERSA — não é mais tentativa
   * de alcançar ninguém, então não conta como tentativa.
   */
  jaRespondeu?: boolean;
}

export interface PlanoContatoManual {
  /** Move `novo` → `contato` ("Contato feito"). */
  novoStatus: typeof ETAPA_CONTATO | null;
  /**
   * Preenche `pipelineStage` quando está NULO e o status muda. Sem isto o lead
   * legado (stage nulo) sai do alcance do gatilho de qualificação do bot, que
   * casa por `{ pipelineStage: null, status: 'novo' }`
   * (messaging.service.ts) — mover o status sem isto QUEBRARIA aquele caminho.
   */
  novoPipelineStage: 'prospeccao' | null;
  /** Soma 1 em `attemptCount`. */
  contaTentativa: boolean;
  /** Só no 1º contato; nunca sobrescreve um resultado real já registrado. */
  novoLastResult: string | null;
}

/**
 * O que gravar no lead depois que a mensagem manual SAIU de verdade.
 *
 * `lastContactAt` fica de fora de propósito: é sempre "agora", sem decisão
 * nenhuma pra tomar, e quem tem o relógio é quem escreve.
 *
 * Regras (todas conservadoras — este código roda DEPOIS de a mensagem já ter
 * saído, então errar aqui não desfaz nada; o único erro caro seria mentir no
 * funil de novo):
 * - **Nunca regride.** Só `novo` sobe pra `contato`. `retorno`/`qualificado`
 *   ficam onde estão (responder alguém que já respondeu não rebaixa o card).
 * - **`encerrado` não ressuscita.** Mandar mensagem pra um lead fechado é
 *   decisão do vendedor de reabrir na mão, não efeito colateral de um envio.
 */
export function planejarContatoManual(input: PlanoContatoManualInput = {}): PlanoContatoManual {
  const status = normalizar(input.status);
  const pipelineStage = normalizar(input.pipelineStage);
  const jaRespondeu = input.jaRespondeu === true;

  const primeiroContato = status === ETAPA_NOVO || status === '';
  const novoStatus = primeiroContato ? ETAPA_CONTATO : null;

  return {
    novoStatus,
    novoPipelineStage: novoStatus && !pipelineStage ? 'prospeccao' : null,
    contaTentativa: !jaRespondeu,
    novoLastResult: primeiroContato ? '1o contato enviado pelo WhatsApp' : null,
  };
}

function normalizar(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase();
}
