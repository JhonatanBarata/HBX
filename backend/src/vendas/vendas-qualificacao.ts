// QUALIFICAÇÃO — "lead aquecido" deixa de ser palpite e vira campo.
//
// Dia de vendedor, 30/07/2026: mandei 3 aberturas reais, uma distribuidora
// respondeu "como que funciona ?" em 60 segundos — e o funil continuou marcando
// "Te chamou: 0", com o lead parado em Planejar. Os 3 caminhos automáticos que
// moveriam esse lead existem no código e estão inertes. A causa raiz não é o
// gatilho: é que NINGUÉM DEFINIU o que significa aquecido. Sem alvo escrito, a
// máquina não tem para onde conduzir e nunca sabe a hora de entregar.
//
// As VAGAS abaixo são de propósito genéricas (servem a qualquer venda B2B). O
// texto da pergunta é do TENANT — cozinhar aqui "quantas entregas por dia?"
// repetiria o defeito de prospecting-safety.ts:31, onde o negócio do dono virou
// default do produto multi-tenant. Ver [vendas-catalogo.ts].

export const VAGAS_QUALIFICACAO = [
  'volume',    // o tamanho da operação — é o que dimensiona o contrato
  'dor_atual', // como ele resolve isso hoje (caderno, planilha, concorrente)
  'decisor',   // quem assina — sem isso o vendedor liga para quem não decide
  'urgencia',  // para quando; separa curiosidade de necessidade
  'aceite',    // o sim explícito de ver funcionando / receber a ligação
] as const;

export type VagaQualificacao = (typeof VAGAS_QUALIFICACAO)[number];

/** Quantas vagas (fora o aceite) bastam para valer a ligação do vendedor. */
export const VAGAS_MINIMAS_PARA_AQUECER = 3;

export type FichaQualificacao = {
  /** Vaga -> o que o lead disse. Ausente = ainda não sabemos. */
  preenchidas: Partial<Record<VagaQualificacao, string>>;
  /** Aceite explícito ('quero ver', 'pode ligar'). Só o lead concede. */
  aceiteExplicito: boolean;
};

export type VeredictoLead =
  | { estado: 'aquecido'; motivo: string; resumo: string }
  | { estado: 'conduzindo'; proximaVaga: VagaQualificacao; faltam: number }
  | { estado: 'morto'; motivo: string }
  | { estado: 'gelado'; motivo: string };

export function fichaVazia(): FichaQualificacao {
  return { preenchidas: {}, aceiteExplicito: false };
}

function textoLimpo(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Grava o que o lead disse numa vaga. Valor vazio NÃO apaga o que já sabíamos. */
export function preencherVaga(
  ficha: FichaQualificacao,
  vaga: VagaQualificacao,
  valor: unknown,
): FichaQualificacao {
  const texto = textoLimpo(valor);
  if (!texto) return ficha;
  const preenchidas = { ...ficha.preenchidas, [vaga]: texto };
  return {
    preenchidas,
    aceiteExplicito: ficha.aceiteExplicito || vaga === 'aceite',
  };
}

/** Vagas ainda em branco, na ordem em que valem a pena perguntar. */
export function vagasEmAberto(ficha: FichaQualificacao): VagaQualificacao[] {
  return VAGAS_QUALIFICACAO.filter((vaga) => !ficha.preenchidas[vaga]);
}

/**
 * Quantas vagas de CONTEÚDO (fora o aceite) já sabemos. O aceite é gatilho de
 * entrega, não medida de conhecimento — por isso não entra na conta.
 */
export function vagasDeConteudoPreenchidas(ficha: FichaQualificacao): number {
  return VAGAS_QUALIFICACAO.filter((v) => v !== 'aceite' && Boolean(ficha.preenchidas[v])).length;
}

/**
 * O veredito. Três saídas fecham o ciclo sozinhas e uma continua conduzindo —
 * nenhuma deixa o lead parado esperando alguém lembrar dele, que é o estado de
 * hoje.
 *
 * `intencao` vem do classificador que já existe (bot/intent): 'negative' e
 * 'opt_out' matam; o resto conduz.
 */
export function calcularVeredicto(input: {
  ficha: FichaQualificacao;
  intencao?: string | null;
  semRespostaHa?: number | null; // dias desde a última palavra do lead
  limiteSilencioDias?: number;
}): VeredictoLead {
  const { ficha } = input;
  const intencao = String(input.intencao || '').trim();

  if (intencao === 'opt_out') {
    return { estado: 'morto', motivo: 'Pediu para não ser mais chamado.' };
  }
  if (intencao === 'negative') {
    return { estado: 'morto', motivo: 'Disse que não tem interesse.' };
  }

  const conteudo = vagasDeConteudoPreenchidas(ficha);
  if (ficha.aceiteExplicito && conteudo >= VAGAS_MINIMAS_PARA_AQUECER) {
    return {
      estado: 'aquecido',
      motivo: `Aceitou conversar e já sabemos ${conteudo} de ${VAGAS_QUALIFICACAO.length - 1} pontos.`,
      resumo: resumirFicha(ficha),
    };
  }

  const limite = Math.max(1, Number(input.limiteSilencioDias ?? 7));
  const silencio = Number(input.semRespostaHa ?? 0);
  if (silencio >= limite) {
    return { estado: 'gelado', motivo: `Sem resposta há ${silencio} dias.` };
  }

  const abertas = vagasEmAberto(ficha);
  // Só pede o aceite quando já há conteúdo suficiente — pedir ligação antes de
  // entender a operação é o erro que o roteiro fixo de hoje comete em toda
  // variante ("Posso te ligar?" em todas as 4).
  const candidatas = conteudo >= VAGAS_MINIMAS_PARA_AQUECER
    ? abertas
    : abertas.filter((v) => v !== 'aceite');
  const proximaVaga = (candidatas[0] || abertas[0] || 'aceite') as VagaQualificacao;
  return {
    estado: 'conduzindo',
    proximaVaga,
    faltam: Math.max(0, VAGAS_MINIMAS_PARA_AQUECER - conteudo),
  };
}

/** O resumo que chega junto com o lead na fila do vendedor. */
export function resumirFicha(ficha: FichaQualificacao): string {
  const partes: string[] = [];
  for (const vaga of VAGAS_QUALIFICACAO) {
    const valor = ficha.preenchidas[vaga];
    if (valor) partes.push(`${vaga}: ${valor}`);
  }
  return partes.join(' · ');
}

/**
 * Bloco de prompt: o objetivo da PRÓXIMA mensagem. É isto que transforma
 * classificação em condução — sem objetivo, o modelo escreve simpatia ("gostaria
 * de entender melhor como podemos ajudar") e não avança nada.
 */
export function buildObjetivoPromptBlock(veredicto: VeredictoLead): string {
  if (veredicto.estado === 'conduzindo') {
    return [
      `Objetivo desta mensagem: descobrir "${veredicto.proximaVaga}".`,
      'Faça UMA pergunta só, curta, no fim da mensagem. Nunca duas.',
      'Não repita pergunta já respondida nem construção já usada nesta conversa.',
    ].join('\n');
  }
  if (veredicto.estado === 'aquecido') {
    return 'Objetivo: confirmar o melhor horário e avisar que um responsável assume a conversa. NÃO faça novas perguntas de qualificação.';
  }
  return 'Objetivo: encerrar com educação. NÃO insista, NÃO ofereça nada, NÃO faça pergunta.';
}
