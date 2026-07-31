// ============================================================================
// RECEPCIONISTA IA — slots, schema fechado e o PORTEIRO DO NOME (31/07/2026).
//
// Pedido do dono: "o cliente entra em contato, se apresenta, aí o IA/bot ao
// atender o cliente já começa o cadastro do mesmo… menos 'chat whatsapp' e
// mais chat empresarial."
//
// A LEI DO DESENHO (a mesma do concierge): a IA PROPÕE, o código DISPÕE. Tudo
// que a IA devolve passa por `sanitizeRecepcionistaSlots` — whitelist de chave,
// enum fechado, corte de tamanho. Texto fora do schema NUNCA vira cadastro. O
// `missingFields` da IA é consultivo: quem recalcula é o servidor, aqui embaixo.
//
// Zero rede, zero Prisma — só funções puras, testáveis offline.
//
// ---------------------------------------------------------------------------
// POR QUE O PORTEIRO DO NOME EXISTE (bug real que este arquivo mata):
// o fluxo antigo de coleta (`COLLECTING_NAME` em messaging.service.ts) gravava
// como nome LITERALMENTE o que a pessoa digitasse. Quem respondia
// "quero saber o preço" ficava cadastrado com esse nome, para sempre, e ainda
// ia pro funil assim. `isPlausibleName` é o freio: na dúvida, NÃO cadastra —
// nome errado no cadastro é pior que nome faltando, porque some da vista e
// vira a identidade do cliente (ver a lei da IDENTIDADE HBX no inbox.service).
// ============================================================================

import { wrapUntrustedUserText } from '../ai-gateway/prompt-guards';

/** Assunto da procura — whitelist FECHADA; o código escolhe o encaminhamento por ela. */
export const RECEPCIONISTA_ASSUNTOS = [
  'orcamento', // quer preço / comprar / contratar
  'suporte', // já é cliente e tem problema
  'agendamento', // quer marcar horário/visita/entrega
  'duvida', // pergunta geral antes de decidir
  'reclamacao',
  'outro',
] as const;
export type RecepcionistaAssunto = (typeof RECEPCIONISTA_ASSUNTOS)[number];

export type RecepcionistaSlots = {
  nome: string | null;
  empresa: string | null;
  assunto: RecepcionistaAssunto | null;
};

export type RecepcionistaCampo = 'nome' | 'assunto';

export const RECEPCIONISTA_SLOTS_VAZIOS: RecepcionistaSlots = {
  nome: null,
  empresa: null,
  assunto: null,
};

const NOME_MAX_CHARS = 60;
const EMPRESA_MAX_CHARS = 80;

/**
 * Palavras que denunciam PEDIDO, não apresentação. Se a resposta começa por uma
 * delas (ou é só isso), não é nome de gente — é a pergunta do cliente chegando
 * no campo errado.
 */
const PALAVRAS_DE_PEDIDO = [
  'quero', 'queria', 'preciso', 'precisava', 'gostaria', 'pode', 'poderia', 'consegue',
  'tem', 'teria', 'qual', 'quais', 'quanto', 'quantos', 'quanta', 'como', 'onde', 'quando',
  'porque', 'por que', 'me manda', 'manda', 'envia', 'informa', 'aceita', 'faz', 'fazem',
  'atende', 'atendem', 'trabalha', 'trabalham', 'vende', 'vendem', 'entrega', 'entregam',
  'orcamento', 'orçamento', 'preco', 'preço', 'valor', 'valores', 'tabela', 'catalogo',
  'catálogo', 'informacao', 'informação', 'informacoes', 'informações', 'duvida', 'dúvida',
  'ajuda', 'suporte', 'problema', 'reclamacao', 'reclamação', 'cancelar', 'trocar',
  // Pronome de tratamento aponta pra empresa, não pra quem fala ("vocês entregam?").
  'voce', 'você', 'voces', 'vocês', 'vcs', 'vc',
];

/** Saudação pura não é nome. */
const SAUDACOES = [
  'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí', 'eai', 'opa',
  'alo', 'alô', 'hey', 'hi', 'tudo bem', 'tudo bom', 'blz', 'beleza',
];

function normalizarBasico(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

function semAcento(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * O PORTEIRO. Decide se um candidato pode virar nome cadastrado.
 * Regra de ouro: na dúvida, `false` — o bot pergunta de novo, e isso custa
 * uma mensagem; cadastrar errado custa o cadastro do cliente.
 */
export function isPlausibleName(value: unknown): boolean {
  const bruto = normalizarBasico(value);
  if (!bruto) return false;
  if (bruto.length > NOME_MAX_CHARS) return false;

  // Pergunta não é apresentação.
  if (bruto.includes('?')) return false;

  const plano = semAcento(bruto);

  // Saudação sozinha ("oi", "bom dia") não cadastra ninguém.
  if (SAUDACOES.includes(plano)) return false;

  // Telefone/CNPJ/pedido numérico: nome de gente não é dígito.
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length >= 4) return false;

  // Frase longa é recado, não nome.
  const palavras = bruto.split(' ').filter(Boolean);
  if (palavras.length > 5) return false;

  // QUALQUER palavra de pedido derruba o candidato — não só a primeira.
  // ("voces entregam em campinas" começa com pronome e escapava do teste
  // antigo, que olhava só a palavra 1.) O erro aceitável é para este lado:
  // recusar um nome legítimo custa uma pergunta a mais; aceitar um pedido
  // como nome estraga o cadastro do cliente.
  const tokens = palavras.map((palavra) => semAcento(palavra).replace(/[^a-z0-9]/g, ''));
  if (tokens.some((token) => token && PALAVRAS_DE_PEDIDO.includes(token))) return false;

  // Precisa ter letra (evita "---", emoji solto, pontuação).
  if (!/[a-zà-ÿ]/i.test(bruto)) return false;

  return true;
}

/** Normaliza um nome aceito (Primeira Letra Maiúscula, sem lixo nas pontas). */
export function normalizeNome(value: unknown): string | null {
  const bruto = normalizarBasico(value);
  if (!isPlausibleName(bruto)) return null;
  return bruto
    .split(' ')
    .filter(Boolean)
    .map((parte) =>
      parte.length <= 2 && /^(de|da|do|e)$/i.test(parte)
        ? parte.toLowerCase()
        : parte.charAt(0).toUpperCase() + parte.slice(1),
    )
    .join(' ')
    .slice(0, NOME_MAX_CHARS);
}

function normalizeAssunto(value: unknown): RecepcionistaAssunto | null {
  const plano = semAcento(normalizarBasico(value));
  if (!plano) return null;
  const encontrado = RECEPCIONISTA_ASSUNTOS.find((assunto) => semAcento(assunto) === plano);
  return encontrado ?? null;
}

/**
 * FRONTEIRA COM A IA. Recebe o JSON cru do modelo e devolve só o que cabe no
 * schema. Chave desconhecida é descartada; enum fora da lista vira null.
 */
export function sanitizeRecepcionistaSlots(raw: unknown): RecepcionistaSlots {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...RECEPCIONISTA_SLOTS_VAZIOS };
  }
  const objeto = raw as Record<string, unknown>;
  const empresa = normalizarBasico(objeto.empresa);
  return {
    nome: normalizeNome(objeto.nome),
    empresa: empresa ? empresa.slice(0, EMPRESA_MAX_CHARS) : null,
    assunto: normalizeAssunto(objeto.assunto),
  };
}

/**
 * O SERVIDOR decide o que falta — a opinião da IA sobre isso é ignorada de
 * propósito (ela erra pra mais e trava o cliente numa entrevista).
 */
export function computeMissingFields(slots: RecepcionistaSlots): RecepcionistaCampo[] {
  const faltando: RecepcionistaCampo[] = [];
  if (!slots.nome) faltando.push('nome');
  if (!slots.assunto) faltando.push('assunto');
  return faltando;
}

/**
 * Extração determinística (sem IA). É o CHÃO: roda quando a IA está desligada,
 * estourou o tempo ou devolveu lixo — e também é a rede que pega apresentação
 * óbvia sem gastar chamada de modelo.
 */
export function extractSlotsDeterministic(text: unknown): RecepcionistaSlots {
  const bruto = normalizarBasico(text);
  if (!bruto) return { ...RECEPCIONISTA_SLOTS_VAZIOS };
  const plano = semAcento(bruto);

  let nome: string | null = null;
  // "meu nome é X" / "aqui é o X" / "sou a X" / "me chamo X" / "aqui quem fala é X"
  const padroes = [
    /(?:meu nome (?:e|eh|é)|me chamo|aqui (?:quem fala )?(?:e|eh|é)|aqui (?:e|eh|é) (?:o|a)|sou (?:o|a)|sou)\s+([a-zà-ÿ][a-zà-ÿ\s.'-]{1,58})/i,
  ];
  for (const padrao of padroes) {
    const achado = bruto.match(padrao);
    if (achado?.[1]) {
      // Corta no primeiro conector que já é outra informação ("da padaria", "e queria").
      const candidato = achado[1].split(/\s+(?:da|do|de|e|,|-)\s+/i)[0];
      // Tira o artigo que sobra de "aqui é O Jhonatan" / "sou A Maria" — o
      // artigo entra na captura porque a alternativa mais curta casa primeiro.
      const semArtigo = candidato.replace(/^\s*(?:o|a|os|as)\s+/i, '');
      nome = normalizeNome(semArtigo);
      if (nome) break;
    }
  }

  // Empresa: "da Padaria Central", "sou da Ótica X"
  let empresa: string | null = null;
  const empresaAchada = bruto.match(/\b(?:d[ao]|na|no)\s+((?:padaria|otica|ótica|loja|mercado|empresa|oficina|clinica|clínica|escritorio|escritório|distribuidora|restaurante|bar|salao|salão|pet ?shop|farmacia|farmácia)\s+[a-zà-ÿ0-9\s.'-]{2,40})/i);
  if (empresaAchada?.[1]) {
    empresa = normalizarBasico(empresaAchada[1]).slice(0, EMPRESA_MAX_CHARS);
  }

  // Assunto por palavra-chave — grosseiro de propósito; a IA refina.
  let assunto: RecepcionistaAssunto | null = null;
  if (/\b(orcamento|orçamento|preco|preço|valor|valores|quanto custa|comprar|contratar|tabela)\b/.test(plano)) {
    assunto = 'orcamento';
  } else if (/\b(nao funciona|não funciona|com problema|deu erro|parou|quebrou|suporte|defeito)\b/.test(plano)) {
    assunto = 'suporte';
  } else if (/\b(agendar|marcar|horario|horário|visita|agenda|entrega)\b/.test(plano)) {
    assunto = 'agendamento';
  } else if (/\b(reclamacao|reclamação|reclamar|pessimo|péssimo|insatisfeito)\b/.test(plano)) {
    assunto = 'reclamacao';
  } else if (/\b(duvida|dúvida|saber|informacao|informação|como funciona)\b/.test(plano)) {
    assunto = 'duvida';
  }

  return { nome, empresa, assunto };
}

/** Junta o que já se sabe com o que acabou de chegar — nunca apaga slot cheio. */
export function mergeSlots(atual: RecepcionistaSlots, novo: RecepcionistaSlots): RecepcionistaSlots {
  return {
    nome: atual.nome || novo.nome,
    empresa: atual.empresa || novo.empresa,
    assunto: atual.assunto || novo.assunto,
  };
}

const SYSTEM_PROMPT = [
  'Voce e um EXTRATOR de dados de recepcao de empresa brasileira.',
  'Leia a mensagem do cliente e devolva SOMENTE um JSON com estas chaves:',
  '  "nome": primeiro nome (ou nome completo) da PESSOA, ou null',
  '  "empresa": nome da empresa dela, ou null',
  `  "assunto": um destes exatos: ${RECEPCIONISTA_ASSUNTOS.join(', ')}, ou null`,
  '',
  'REGRAS DURAS:',
  '- Se a pessoa NAO disse o nome dela, "nome" e null. NUNCA invente.',
  '- Pedido nao e nome: em "quero saber o preco", "nome" e null.',
  '- Saudacao nao e nome: em "bom dia", "nome" e null.',
  '- Nao escreva texto fora do JSON. Nao explique.',
].join('\n');

/** Monta a conversa do extrator com a fala do cliente ISOLADA (anti-injeção). */
export function buildRecepcionistaMessages(text: unknown): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: wrapUntrustedUserText(String(text ?? ''), { tag: 'mensagem_cliente', maxChars: 1200 }),
    },
  ];
}

/**
 * As perguntas da recepcionista. NO MÁXIMO DUAS no total — passar disso vira
 * interrogatório e o cliente desiste (decisão do dono: "se apresenta, aí o bot
 * já começa o cadastro", não "o bot entrevista").
 */
export function nextQuestion(
  slots: RecepcionistaSlots,
  companyName: string,
  personaNome?: string | null,
): { campo: RecepcionistaCampo; texto: string } | null {
  const faltando = computeMissingFields(slots);
  if (!faltando.length) return null;
  if (faltando.includes('nome')) {
    // IDENTIDADE ÚNICA (31/07/2026): com persona configurada, a recepcionista
    // tem nome — o mesmo que assina prospecção e cobrança. Sem persona, a
    // apresentação neutra antiga continua valendo.
    const nome = String(personaNome || '').trim();
    return {
      campo: 'nome',
      texto: nome
        ? `Oi! Eu sou ${nome}, do atendimento da ${companyName}. Com quem eu falo?`
        : `Oi! Aqui é o atendimento da ${companyName}. Com quem eu falo?`,
    };
  }
  const comNome = slots.nome ? `${slots.nome}, ` : '';
  return {
    campo: 'assunto',
    texto: `${comNome}como posso ajudar hoje?`,
  };
}
