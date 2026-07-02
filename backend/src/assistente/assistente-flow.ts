// WORM-14 — Assistente IA. Tipos + compilador fluxoJson -> prompt-sistema.
//
// O ASSISTENTE NAO E UMA IA NOVA. Ele e uma EMBALAGEM sobre o pipeline que ja
// existe (classificador local qwen2.5:7b via Ollama, mesmo caminho do bot). O
// wizard/fluxo produz um `fluxoJson`; este arquivo COMPILA esse JSON em:
//   1. um prompt-sistema (persona + negocio) usado quando o assistente responde;
//   2. a lista de CONDICOES com few-shots ("frases que significam SIM") — que sao
//      exatamente os exemplos que o classificador usa para casar a resposta do lead.
//
// Puro (sem I/O, sem Nest): testavel isolado e reusavel pelo sandbox.

export const ASSISTENTE_TONS = ['formal', 'normal', 'descontraido'] as const;
export type AssistenteTom = (typeof ASSISTENTE_TONS)[number];

export const ASSISTENTE_PERFIS = ['vendas', 'suporte'] as const;
export type AssistentePerfil = (typeof ASSISTENTE_PERFIS)[number];

// Um PASSO do fluxo: uma mensagem que o assistente manda ("Mensagem para o
// cliente" na tela deles). Variaveis [[empresa]] / [[nome]] sao resolvidas no
// compilador/preview.
export type FluxoPasso = {
  id: string;
  tipo: 'mensagem';
  texto: string;
};

// Uma CONDICAO: o assistente espera a resposta do lead e decide o proximo passo
// pelos EXEMPLOS (few-shots do classificador). `exemplos` = "frases que
// significam ISSO". `proximoPassoId` = para onde vai quando casa.
export type FluxoCondicao = {
  id: string;
  rotulo: string; // ex: "Cliente confirmou" | "Nao entendeu" | "Recusou"
  comportamento: string; // "Comportamento esperado" — descricao livre p/ a IA
  exemplos: string[]; // few-shots: frases que casam esta condicao
  proximoPassoId?: string | null;
};

// O fluxo e uma LISTA vertical (v1, sem canvas): alternancia de passos e
// condicoes. `entradaPassoId` = por onde a conversa comeca.
export type FluxoJson = {
  entradaPassoId?: string | null;
  passos: FluxoPasso[];
  condicoes: FluxoCondicao[];
};

export type AssistenteConfigShape = {
  nome: string;
  tom: AssistenteTom;
  perfil: AssistentePerfil;
  produtos: string;
  empresaNome: string;
  fluxo: FluxoJson;
};

// ── normalizacao ────────────────────────────────────────────────────────────

export function normalizeTom(value: unknown): AssistenteTom {
  const raw = String(value || '').trim().toLowerCase();
  return (ASSISTENTE_TONS as readonly string[]).includes(raw) ? (raw as AssistenteTom) : 'normal';
}

export function normalizePerfil(value: unknown): AssistentePerfil {
  const raw = String(value || '').trim().toLowerCase();
  return (ASSISTENTE_PERFIS as readonly string[]).includes(raw) ? (raw as AssistentePerfil) : 'vendas';
}

function clampStr(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function slug(value: string, fallback: string): string {
  const s = value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return s || fallback;
}

export function sanitizeFluxo(input: unknown): FluxoJson {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as any) : {};

  const passos: FluxoPasso[] = [];
  const seenPassos = new Set<string>();
  const rawPassos = Array.isArray(raw.passos) ? raw.passos : [];
  rawPassos.forEach((p: any, i: number) => {
    const texto = clampStr(p?.texto, 1500);
    if (!texto) return;
    let id = slug(String(p?.id || ''), `passo_${i + 1}`);
    while (seenPassos.has(id)) id = `${id}_${i}`;
    seenPassos.add(id);
    passos.push({ id, tipo: 'mensagem', texto });
  });

  const condicoes: FluxoCondicao[] = [];
  const seenCond = new Set<string>();
  const rawCond = Array.isArray(raw.condicoes) ? raw.condicoes : [];
  rawCond.forEach((c: any, i: number) => {
    const rotulo = clampStr(c?.rotulo, 120);
    if (!rotulo) return;
    let id = slug(String(c?.id || ''), `cond_${i + 1}`);
    while (seenCond.has(id)) id = `${id}_${i}`;
    seenCond.add(id);
    const exemplos = (Array.isArray(c?.exemplos) ? c.exemplos : [])
      .map((e: unknown) => clampStr(e, 200))
      .filter((e: string) => e.length > 0)
      .slice(0, 12);
    const proximoRaw = c?.proximoPassoId == null ? null : slug(String(c.proximoPassoId), '');
    condicoes.push({
      id,
      rotulo,
      comportamento: clampStr(c?.comportamento, 400),
      exemplos,
      proximoPassoId: proximoRaw || null,
    });
  });

  const entradaRaw = raw.entradaPassoId == null ? null : slug(String(raw.entradaPassoId), '');
  const entradaPassoId =
    entradaRaw && passos.some((p) => p.id === entradaRaw)
      ? entradaRaw
      : passos[0]?.id ?? null;

  return { entradaPassoId, passos, condicoes };
}

export function sanitizeAssistenteConfig(input: unknown): AssistenteConfigShape {
  const raw = input && typeof input === 'object' ? (input as any) : {};
  return {
    nome: clampStr(raw.nome, 60) || 'Assistente',
    tom: normalizeTom(raw.tom),
    perfil: normalizePerfil(raw.perfil),
    produtos: clampStr(raw.produtos, 600),
    empresaNome: clampStr(raw.empresaNome, 120),
    fluxo: sanitizeFluxo(raw.fluxo),
  };
}

// ── resolucao de variaveis [[...]] ──────────────────────────────────────────

const TOM_INSTRUCAO: Record<AssistenteTom, string> = {
  formal:
    'Fale de forma FORMAL e respeitosa: use "senhor(a)", sem girias, frases completas e educadas.',
  normal:
    'Fale de forma NEUTRA e profissional: cordial, direto, sem exageros nem girias fortes.',
  descontraido:
    'Fale de forma DESCONTRAIDA e proxima: leve, amigavel, pode usar girias brasileiras comuns, sem exagerar.',
};

const PERFIL_INSTRUCAO: Record<AssistentePerfil, string> = {
  vendas:
    'Seu papel e VENDAS: entender a necessidade do cliente, despertar interesse e conduzir para o proximo passo (conversa, orcamento, agendamento). Nunca seja insistente ou agressivo.',
  suporte:
    'Seu papel e SUPORTE/ATENDIMENTO: entender o problema ou duvida do cliente, ajudar com clareza e, quando nao souber, encaminhar para um humano.',
};

export function resolveVariaveis(
  texto: string,
  vars: { empresa?: string; nome?: string; assistente?: string },
): string {
  const map: Record<string, string> = {
    empresa: vars.empresa || '',
    'nome da empresa': vars.empresa || '',
    nome: vars.nome || '',
    'nome do cliente': vars.nome || '',
    'seu nome': vars.assistente || '',
    assistente: vars.assistente || '',
  };
  return String(texto || '').replace(/\[\[\s*([^\]]+?)\s*\]\]/g, (_m, key) => {
    const k = String(key || '').trim().toLowerCase();
    return map[k] ?? `[[${key}]]`;
  });
}

// ── COMPILADOR: fluxoJson -> prompt-sistema ─────────────────────────────────
// O prompt-sistema descreve QUEM e o assistente (persona + negocio) e COMO ele
// deve conversar (fluxo em linguagem natural). E o mesmo tipo de system prompt
// que o pipeline do bot ja usa no Ollama; aqui ele nasce do wizard, nao hardcoded.

export function compileSystemPrompt(config: AssistenteConfigShape): string {
  const empresa = config.empresaNome || 'a empresa';
  const linhas: string[] = [];

  linhas.push(
    `Voce e ${config.nome}, assistente virtual de atendimento por WhatsApp da empresa ${empresa}, no Brasil.`,
  );
  linhas.push(TOM_INSTRUCAO[config.tom]);
  linhas.push(PERFIL_INSTRUCAO[config.perfil]);
  if (config.produtos) {
    linhas.push(`Produtos/servicos da empresa: ${config.produtos}.`);
  }

  linhas.push('');
  linhas.push('REGRAS:');
  linhas.push('- Responda SEMPRE em portugues do Brasil, em 1 a 3 frases curtas.');
  linhas.push('- Nunca invente precos, prazos ou dados que voce nao recebeu.');
  linhas.push('- Se o cliente pedir para falar com uma pessoa, confirme que vai chamar um atendente.');
  linhas.push(`- Voce fala em nome de ${empresa}; nunca diga que e uma IA de outra empresa.`);

  const passos = config.fluxo.passos;
  if (passos.length) {
    linhas.push('');
    linhas.push('ROTEIRO DE CONVERSA (siga como guia, adaptando ao cliente):');
    passos.forEach((p, i) => {
      const texto = resolveVariaveis(p.texto, { empresa, assistente: config.nome });
      linhas.push(`${i + 1}. ${texto}`);
    });
  }

  const condicoes = config.fluxo.condicoes.filter((c) => c.comportamento || c.exemplos.length);
  if (condicoes.length) {
    linhas.push('');
    linhas.push('COMO INTERPRETAR AS RESPOSTAS DO CLIENTE:');
    condicoes.forEach((c) => {
      const partes = [`- ${c.rotulo}`];
      if (c.comportamento) partes.push(`(${c.comportamento})`);
      if (c.exemplos.length) partes.push(`— frases como: ${c.exemplos.map((e) => `"${e}"`).join(', ')}`);
      linhas.push(partes.join(' '));
    });
  }

  return linhas.join('\n');
}

// COMPILADOR (parte 2): as condicoes viram os few-shots do classificador. Cada
// condicao com exemplos e um "rotulo -> frases que casam". Isto e exatamente o
// material que o classificador local usa; devolvemos num formato drop-in.
export type CompiledCondition = {
  id: string;
  rotulo: string;
  comportamento: string;
  exemplos: string[];
  proximoPassoId: string | null;
};

export function compileConditions(config: AssistenteConfigShape): CompiledCondition[] {
  return config.fluxo.condicoes.map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    comportamento: c.comportamento,
    exemplos: c.exemplos,
    proximoPassoId: c.proximoPassoId ?? null,
  }));
}
