// WORM-13 — as 3 PERSONAS de cadencia (a "embalagem"). O cliente nao monta fluxo:
// escolhe uma PERSONALIDADE. Regra dura de chip: "Agressiva" = mais TOQUES
// (email/atividade), NUNCA mais WhatsApp. O teto de WhatsApp/dia e tecnico e fixo
// (aplicado no runner + no proprio queueOutboundForCompany), nao configuravel aqui.
//
// Cada passo: { dia (0=hoje), canal, titulo?, corpo?, atividadeTipo? }.
//   - canal 'whats'     -> mensagem WhatsApp (via caminho do bot de prospeccao, com freios)
//   - canal 'email'     -> e-mail (no-op se sem provedor; segue a cadencia)
//   - canal 'atividade' -> cria atividade na agenda do vendedor (hook WORM-12)

export type CadenciaCanal = 'whats' | 'email' | 'atividade';

export type CadenciaPasso = {
  dia: number;
  canal: CadenciaCanal;
  titulo?: string;
  corpo?: string;
  atividadeTipo?: string; // ligacao | reuniao | visita | mensagem (canal 'atividade')
};

export const CADENCIA_CANAIS: readonly CadenciaCanal[] = ['whats', 'email', 'atividade'] as const;
export const CADENCIA_PERSONAS = ['conservador', 'moderado', 'agressivo', 'custom'] as const;
export type CadenciaPersona = (typeof CADENCIA_PERSONAS)[number];

// Teto tecnico de passos de WhatsApp por cadencia (defesa em profundidade — o teto
// real de chip vive no queueOutboundForCompany/warmup; aqui evitamos desenhar uma
// persona que empurre o chip). Passos 'whats' alem disso viram no-op no runner.
export const MAX_WHATS_STEPS_PER_CADENCE = 2;

type SeedPersona = {
  key: Exclude<CadenciaPersona, 'custom'>;
  nome: string;
  descricao: string;
  passos: CadenciaPasso[];
};

// Nomes NOSSOS (nao copiar os deles). Persona = tom + densidade de TOQUES.
export const CADENCIA_SEEDS: readonly SeedPersona[] = [
  {
    key: 'conservador',
    nome: 'Confiável (Conservador)',
    descricao: 'Toque leve e espaçado. 1 WhatsApp de abertura, 1 e-mail de reforço e 1 ligação de fechamento.',
    passos: [
      { dia: 0, canal: 'whats', titulo: 'Abertura', corpo: 'Olá! Vi que sua empresa pode se encaixar no que a gente faz. Posso te mostrar em 2 minutos?' },
      { dia: 3, canal: 'email', titulo: 'Reforço por e-mail', corpo: 'Passando pra deixar um material rápido sobre como podemos ajudar.' },
      { dia: 7, canal: 'atividade', titulo: 'Ligar para o lead', atividadeTipo: 'ligacao' },
    ],
  },
  {
    key: 'moderado',
    nome: 'Estratégico (Moderado)',
    descricao: 'Ritmo equilibrado por cerca de 9 dias, sem sobrecarregar o WhatsApp.',
    passos: [
      { dia: 0, canal: 'whats', titulo: 'Abertura', corpo: 'Olá! Tenho uma ideia que pode encaixar bem no seu negócio. Posso te contar rapidinho?' },
      { dia: 2, canal: 'email', titulo: 'E-mail de valor', corpo: 'Segue um resumo do que fazemos e de como isso te ajuda.' },
      { dia: 5, canal: 'atividade', titulo: 'Ligar para o lead', atividadeTipo: 'ligacao' },
      { dia: 9, canal: 'email', titulo: 'E-mail de fechamento', corpo: 'Ainda faz sentido conversarmos? Fico à disposição.' },
    ],
  },
  {
    key: 'agressivo',
    nome: 'Determinado (Agressivo)',
    descricao: 'Mais contatos por e-mail e atividades, com WhatsApp espaçado dentro do limite do chip.',
    passos: [
      { dia: 0, canal: 'whats', titulo: 'Abertura', corpo: 'Olá! Consigo te mostrar em minutos como a gente ajuda empresas como a sua. Te chamo?' },
      { dia: 1, canal: 'email', titulo: 'E-mail 1', corpo: 'Deixei aqui um material rápido — vale a pena dar uma olhada.' },
      { dia: 3, canal: 'email', titulo: 'E-mail 2', corpo: 'Reforçando: posso reservar 10 minutos essa semana?' },
      { dia: 5, canal: 'whats', titulo: 'Follow-up WhatsApp', corpo: 'Passando pra saber se faz sentido conversarmos. Fico à disposição!' },
      { dia: 8, canal: 'atividade', titulo: 'Ligar para o lead', atividadeTipo: 'ligacao' },
    ],
  },
] as const;

export function normalizePersona(value: unknown): CadenciaPersona {
  const raw = String(value || '').trim().toLowerCase();
  return (CADENCIA_PERSONAS as readonly string[]).includes(raw) ? (raw as CadenciaPersona) : 'custom';
}

export function normalizeCanal(value: unknown): CadenciaCanal | null {
  const raw = String(value || '').trim().toLowerCase();
  return (CADENCIA_CANAIS as readonly string[]).includes(raw) ? (raw as CadenciaCanal) : null;
}

// Sanitiza a lista de passos que veio da UI (persona 'custom') ou de um seed.
// Garante ordem por dia e clampa o numero de passos de WhatsApp ao teto tecnico
// (passos 'whats' extras sao DESCARTADOS — a densidade de chip nao e negociavel).
export function sanitizePassos(input: unknown): CadenciaPasso[] {
  if (!Array.isArray(input)) return [];
  const out: CadenciaPasso[] = [];
  let whatsCount = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const canal = normalizeCanal((raw as any).canal);
    if (!canal) continue;
    const dia = Math.max(0, Math.trunc(Number((raw as any).dia) || 0));
    if (canal === 'whats') {
      if (whatsCount >= MAX_WHATS_STEPS_PER_CADENCE) continue; // teto de chip
      whatsCount += 1;
    }
    const passo: CadenciaPasso = { dia, canal };
    const titulo = String((raw as any).titulo || '').trim();
    if (titulo) passo.titulo = titulo.slice(0, 160);
    const corpo = String((raw as any).corpo || '').trim();
    if (corpo) passo.corpo = corpo.slice(0, 1000);
    const atividadeTipo = String((raw as any).atividadeTipo || '').trim().toLowerCase();
    if (canal === 'atividade' && atividadeTipo) passo.atividadeTipo = atividadeTipo.slice(0, 40);
    out.push(passo);
  }
  return out.sort((a, b) => a.dia - b.dia);
}
