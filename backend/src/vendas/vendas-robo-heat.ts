// S4 LEAD-CENTRICO (04-robozinho.md): "Te chamou" — classifica se a resposta de um
// lead com robô ligado é QUENTE (pedido de preço/interesse real ou pedido pra falar
// com humano). Reusa o classificador de intenção por PALAVRA-CHAVE já testado do
// motor de prospecção (`prospecting-safety.ts` — mesma técnica usada como fallback
// do bot), com uma lista de palavras PRÓPRIA deste sprint (pedido de preço/fechamento
// / "quero saber mais"). Sem IA nesta etapa (a AiIntentClassifierService do bot fica
// isolada de propósito, atrás de flag própria) — `classify` é injetável: campo pronto
// pra IA plugar depois sem mudar o contrato desta função.
import { classifyProspectingIntent, type ProspectingIntentClassification } from './prospecting-safety';

// Sinais de "quente": pediu preço/valor, demonstrou interesse real ou perguntou como
// comprar/contratar. Propositalmente CONSERVADOR — dúvida neutra ("o que é isso?")
// não entra aqui (isso já é 'what_is_it' no classificador, não deve virar handoff).
export const ROBO_HOT_KEYWORDS = [
  'quanto custa',
  'qual o valor',
  'qual valor',
  'quanto fica',
  'quanto e',
  'quanto sai',
  'qual o preco',
  'qual preco',
  'me interessei',
  'tenho interesse',
  'fiquei interessado',
  'gostei',
  'quero saber mais',
  'manda mais informacao',
  'pode mandar mais informacao',
  'como faco pra contratar',
  'como contrato',
  'como comprar',
  'quero contratar',
  'vamos conversar',
  'podemos conversar',
  'me manda a proposta',
  'topo conversar',
] as const;

// Pedido explícito de humano — já é "quente" (o lead quer sair da Automação e falar com
// gente). Some com os defaults de `classifyProspectingIntent` (DEFAULT_HUMAN_HANDOFF_
// INTENT_KEYWORDS), esta lista é só reforço com termos de venda.
export const ROBO_HUMAN_HANDOFF_KEYWORDS = [
  'falar com vendedor',
  'falar com alguem',
  'quero atendimento',
] as const;

export type RoboReplyClassifier = (text: string) => ProspectingIntentClassification;

export type RoboHeatResult = {
  quente: boolean;
  intent: ProspectingIntentClassification;
  motivo: string;
};

function defaultClassify(text: string): ProspectingIntentClassification {
  return classifyProspectingIntent({
    text,
    positiveKeywords: [...ROBO_HOT_KEYWORDS],
    negativeKeywords: [],
    whatIsItKeywords: [],
    neutralKeywords: [],
    humanHandoffKeywords: [...ROBO_HUMAN_HANDOFF_KEYWORDS],
  });
}

// `classify` é opcional (default = heurística por palavra-chave acima). Um caminho
// futuro pode passar `(text) => aiIntentClassifier.classify(...)`-adaptado aqui sem
// tocar em quem chama `classifyRoboReplyHeat`.
export function classifyRoboReplyHeat(text: string, classify: RoboReplyClassifier = defaultClassify): RoboHeatResult {
  const intent = classify(String(text || ''));
  const quente = intent.kind === 'positive' || intent.kind === 'human_requested';
  const motivo = intent.kind === 'human_requested'
    ? 'Pediu para falar com humano/atendente.'
    : intent.kind === 'positive'
      ? 'Demonstrou interesse ou pediu preço/mais informações.'
      : 'Sem sinal de interesse imediato.';
  return { quente, intent, motivo };
}
