// WORM-14 — SEEDS de fluxo: 2 perfis (vendas/suporte) x 3 templates
// (agil/flexivel/avancado). Sao os "modelos de fluxo" que o wizard oferece no
// passo 3. Agil = 1 mensagem + 1 condicao; Flexivel = +2; Avancado = +3.
// O cliente escolhe um seed e cai no editor de fluxo em LISTA ja preenchido.

import type { AssistentePerfil, FluxoJson } from './assistente-flow';

export const ASSISTENTE_TEMPLATES = ['agil', 'flexivel', 'avancado'] as const;
export type AssistenteTemplate = (typeof ASSISTENTE_TEMPLATES)[number];

export function normalizeTemplate(value: unknown): AssistenteTemplate {
  const raw = String(value || '').trim().toLowerCase();
  return (ASSISTENTE_TEMPLATES as readonly string[]).includes(raw)
    ? (raw as AssistenteTemplate)
    : 'agil';
}

// Blocos reutilizaveis de condicao (few-shots) — as "frases que significam X".
const COND_CONFIRMOU = {
  id: 'confirmou',
  rotulo: 'Cliente confirmou / tem interesse',
  comportamento: 'A pessoa respondeu de forma positiva, quer continuar ou saber mais.',
  exemplos: ['sim', 'quero sim', 'tenho interesse', 'pode falar', 'me explica', 'claro', 'bora'],
};
const COND_DUVIDA = {
  id: 'nao_entendeu',
  rotulo: 'Cliente nao entendeu / perguntou o que e',
  comportamento: 'A pessoa nao entendeu do que se trata e pediu esclarecimento.',
  exemplos: ['o que e isso?', 'quem e?', 'do que se trata?', 'nao entendi', 'como assim?'],
};
const COND_RECUSOU = {
  id: 'recusou',
  rotulo: 'Cliente recusou / sem interesse',
  comportamento: 'A pessoa nao tem interesse ou pediu para parar.',
  exemplos: ['nao', 'nao tenho interesse', 'para de mandar', 'nao quero', 'remove'],
};
const COND_DEPOIS = {
  id: 'depois',
  rotulo: 'Cliente quer falar depois',
  comportamento: 'A pessoa esta ocupada agora e pediu para retornar mais tarde.',
  exemplos: ['agora nao', 'depois', 'estou ocupado', 'me chama mais tarde', 'to sem tempo'],
};
const COND_HUMANO = {
  id: 'humano',
  rotulo: 'Cliente quer falar com uma pessoa',
  comportamento: 'A pessoa pediu para falar com um atendente humano.',
  exemplos: ['quero falar com atendente', 'me passa pra uma pessoa', 'tem alguem ai?'],
};

function buildSeed(
  perfil: AssistentePerfil,
  passosTextos: string[],
  condicoes: Array<{ id: string; rotulo: string; comportamento: string; exemplos: string[]; proximoPassoId?: string | null }>,
): FluxoJson {
  const passos = passosTextos.map((texto, i) => ({
    id: `passo_${i + 1}`,
    tipo: 'mensagem' as const,
    texto,
  }));
  return {
    entradaPassoId: passos[0]?.id ?? null,
    passos,
    condicoes: condicoes.map((c) => ({
      id: c.id,
      rotulo: c.rotulo,
      comportamento: c.comportamento,
      exemplos: c.exemplos,
      proximoPassoId: c.proximoPassoId ?? null,
    })),
  };
}

// ── VENDAS ──────────────────────────────────────────────────────────────────

const VENDAS_ABERTURA =
  'Ola! Aqui e a [[Seu nome]], da [[nome da empresa]]. Vi que podemos te ajudar. Posso te explicar rapidinho?';
const VENDAS_EXPLICA =
  'Otimo! A gente ajuda empresas como a sua a [[nome da empresa]] com nossos servicos. Quer que eu te passe mais detalhes ou prefere agendar uma conversa?';
const VENDAS_FECHA =
  'Perfeito! Vou reservar um horario pra gente conversar melhor. Qual o melhor dia e turno pra voce?';

const SUPORTE_ABERTURA =
  'Ola! Sou a [[Seu nome]], do atendimento da [[nome da empresa]]. Como posso te ajudar hoje?';
const SUPORTE_ENTENDE =
  'Entendi! Me conta um pouco mais sobre o que esta acontecendo pra eu te ajudar da melhor forma.';
const SUPORTE_RESOLVE =
  'Certo, ja anotei aqui. Vou verificar e te retorno. Se preferir, posso chamar um atendente agora mesmo.';

// perfil -> template -> fluxo
const SEEDS: Record<AssistentePerfil, Record<AssistenteTemplate, FluxoJson>> = {
  vendas: {
    // Agil: 1 mensagem + 1 condicao.
    agil: buildSeed('vendas', [VENDAS_ABERTURA], [{ ...COND_CONFIRMOU }]),
    // Flexivel: +2 condicoes.
    flexivel: buildSeed(
      'vendas',
      [VENDAS_ABERTURA, VENDAS_EXPLICA],
      [
        { ...COND_CONFIRMOU, proximoPassoId: 'passo_2' },
        { ...COND_DUVIDA, proximoPassoId: 'passo_2' },
        { ...COND_RECUSOU },
      ],
    ),
    // Avancado: +3 condicoes.
    avancado: buildSeed(
      'vendas',
      [VENDAS_ABERTURA, VENDAS_EXPLICA, VENDAS_FECHA],
      [
        { ...COND_CONFIRMOU, proximoPassoId: 'passo_2' },
        { ...COND_DUVIDA, proximoPassoId: 'passo_2' },
        { ...COND_DEPOIS },
        { ...COND_RECUSOU },
        { ...COND_HUMANO },
      ],
    ),
  },
  suporte: {
    agil: buildSeed('suporte', [SUPORTE_ABERTURA], [{ ...COND_CONFIRMOU }]),
    flexivel: buildSeed(
      'suporte',
      [SUPORTE_ABERTURA, SUPORTE_ENTENDE],
      [
        { ...COND_CONFIRMOU, proximoPassoId: 'passo_2' },
        { ...COND_DUVIDA, proximoPassoId: 'passo_2' },
        { ...COND_HUMANO },
      ],
    ),
    avancado: buildSeed(
      'suporte',
      [SUPORTE_ABERTURA, SUPORTE_ENTENDE, SUPORTE_RESOLVE],
      [
        { ...COND_CONFIRMOU, proximoPassoId: 'passo_2' },
        { ...COND_DUVIDA, proximoPassoId: 'passo_2' },
        { ...COND_DEPOIS },
        { ...COND_HUMANO },
        { ...COND_RECUSOU },
      ],
    ),
  },
};

export function getSeedFluxo(perfil: AssistentePerfil, template: AssistenteTemplate): FluxoJson {
  // Clona fundo (JSON) para o caller poder editar sem mutar o seed.
  return JSON.parse(JSON.stringify(SEEDS[perfil][template]));
}
