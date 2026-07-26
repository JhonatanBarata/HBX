// S3 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/03-pre-voo.md):
// funcoes PURAS do "pre-voo" do lead — entendimento, prontidao, recomendacao de
// persona por HEURISTICA (sem IA/LLM neste sprint) e revisao das mensagens reais
// da cadencia com a REGRA DURA do nome (nome so entra com confianca ALTA; senao
// abertura NEUTRA — nunca inventar nome). Mantido separado do vendas.service.ts
// (que so faz a leitura Prisma + gates) pelo mesmo padrao de
// vendas-cnpj-fallback.ts/vendas-lead-enrichment.ts: logica testavel sem mock de banco.

import type { CadenciaCanal, CadenciaPersona } from '../cadencia/cadencia-personas';

// Formato minimo de uma seed de persona que este modulo precisa (subset de
// SeedPersona do cadencia-personas.ts) — evita import de tipo privado.
export type SeedPersonaLike = {
  key: Exclude<CadenciaPersona, 'custom'>;
  nome: string;
  descricao: string;
  passos: ReadonlyArray<{
    dia: number;
    canal: CadenciaCanal;
    titulo?: string;
    corpo?: string;
    atividadeTipo?: string;
  }>;
};

export type PreVooConfidence = 'alta' | 'media' | 'baixa' | 'ausente';

export type PreVooContactInput = {
  qsaPartnerName?: string | null;
  qsaPartnerQualification?: string | null;
  companyOwnerName?: string | null;
  companyOwnerQualification?: string | null;
  // Candidatos vindos do LeadPerson (radarLeadId) — source: 'receita_qsa' | 'manual' | 'crawl' | 'ia'.
  leadPersonCandidates?: Array<{ name: string; role?: string | null; source: string }>;
  // ownerName vindo do enriquecimento web (metadataJson/radar) — NUNCA alta confianca por si so.
  radarOwnerName?: string | null;
};

export type PreVooContact = {
  nome: string | null; // só populado quando confianca === 'alta' (regra dura)
  cargo: string | null;
  confianca: PreVooConfidence;
  fonte: string | null;
  candidatoDuvidoso: { nome: string; fonte: string } | null; // nunca vai pra mensagem
};

function normalize(value: unknown): string {
  return String(value || '').trim();
}

export function resolveContact(input: PreVooContactInput): PreVooContact {
  const qsaName = normalize(input.qsaPartnerName);
  if (qsaName) {
    return {
      nome: qsaName,
      cargo: normalize(input.qsaPartnerQualification) || null,
      confianca: 'alta',
      fonte: 'qsa_rfb',
      candidatoDuvidoso: null,
    };
  }

  const ownerName = normalize(input.companyOwnerName);
  if (ownerName) {
    return {
      nome: ownerName,
      cargo: normalize(input.companyOwnerQualification) || null,
      confianca: 'alta',
      fonte: 'qsa_rfb',
      candidatoDuvidoso: null,
    };
  }

  const candidates = Array.isArray(input.leadPersonCandidates) ? input.leadPersonCandidates : [];
  const confirmedPerson = candidates.find((c) => ['receita_qsa', 'manual'].includes(normalize(c.source).toLowerCase()));
  if (confirmedPerson) {
    return {
      nome: normalize(confirmedPerson.name),
      cargo: normalize(confirmedPerson.role) || null,
      confianca: 'alta',
      fonte: `lead_person:${normalize(confirmedPerson.source).toLowerCase()}`,
      candidatoDuvidoso: null,
    };
  }

  const weakPerson = candidates[0];
  if (weakPerson && normalize(weakPerson.name)) {
    const source = normalize(weakPerson.source).toLowerCase();
    return {
      nome: null,
      cargo: null,
      confianca: source === 'ia' ? 'baixa' : 'media',
      fonte: `lead_person:${source || 'desconhecida'}`,
      candidatoDuvidoso: { nome: normalize(weakPerson.name), fonte: `lead_person:${source || 'desconhecida'}` },
    };
  }

  const radarOwnerName = normalize(input.radarOwnerName);
  if (radarOwnerName) {
    return {
      nome: null,
      cargo: null,
      confianca: 'baixa',
      fonte: 'radar_enrichment',
      candidatoDuvidoso: { nome: radarOwnerName, fonte: 'radar_enrichment' },
    };
  }

  return { nome: null, cargo: null, confianca: 'ausente', fonte: null, candidatoDuvidoso: null };
}

export type PreVooCanalStatus = 'confirmado' | 'duvidoso' | 'faltante';
export type PreVooCanal = { status: PreVooCanalStatus; valor: string | null; detalhe: string };

export function resolveCanalWhatsapp(whatsappStatus: unknown, phone: string | null): PreVooCanal {
  const status = normalize(whatsappStatus).toLowerCase();
  if (status === 'confirmed') {
    return { status: 'confirmado', valor: phone || null, detalhe: 'WhatsApp confirmado.' };
  }
  if (status === 'unverified' && phone) {
    return { status: 'duvidoso', valor: phone, detalhe: 'Telefone informado, WhatsApp ainda não confirmado.' };
  }
  return { status: 'faltante', valor: phone || null, detalhe: 'Sem WhatsApp confirmado.' };
}

export function resolveCanalEmail(emailStatus: unknown, email: string | null): PreVooCanal {
  const status = normalize(emailStatus).toLowerCase();
  if (status === 'confirmed') {
    return { status: 'confirmado', valor: email || null, detalhe: 'E-mail confirmado.' };
  }
  if (status === 'probable' || status === 'unverified') {
    return { status: 'duvidoso', valor: email || null, detalhe: 'E-mail provável, ainda não confirmado.' };
  }
  return { status: 'faltante', valor: null, detalhe: 'Sem e-mail localizado.' };
}

export function resolveCanalTelefoneVoz(phone: string | null): { status: 'confirmado' | 'faltante'; valor: string | null } {
  return phone ? { status: 'confirmado', valor: phone } : { status: 'faltante', valor: null };
}

export type PreVooProntidao = {
  confirmados: string[];
  duvidosos: string[];
  faltantes: string[];
  veredito: 'pronto' | 'falta_dados';
  veredictoLabel: string;
};

export function buildProntidao(input: {
  empresaEncontrada: boolean;
  whatsapp: PreVooCanal;
  email: PreVooCanal;
  contato: PreVooContact;
}): PreVooProntidao {
  const confirmados: string[] = [];
  const duvidosos: string[] = [];
  const faltantes: string[] = [];

  if (input.empresaEncontrada) {
    confirmados.push('Empresa localizada na Receita Federal.');
  } else {
    faltantes.push('Empresa não localizada na Receita Federal — dados cadastrais incompletos.');
  }

  if (input.whatsapp.status === 'confirmado') {
    confirmados.push(`WhatsApp confirmado${input.whatsapp.valor ? ` (${input.whatsapp.valor})` : ''}.`);
  } else if (input.whatsapp.status === 'duvidoso') {
    duvidosos.push('Telefone informado, mas WhatsApp ainda não confirmado.');
  } else {
    faltantes.push('Sem WhatsApp confirmado — passo de WhatsApp da cadência poderá falhar.');
  }

  if (input.email.status === 'confirmado') {
    confirmados.push(`E-mail confirmado${input.email.valor ? ` (${input.email.valor})` : ''}.`);
  } else if (input.email.status === 'duvidoso') {
    duvidosos.push('E-mail provável, ainda não confirmado.');
  } else {
    faltantes.push('Sem e-mail — passo de e-mail da cadência será pulado.');
  }

  if (input.contato.confianca === 'alta') {
    confirmados.push(`Responsável identificado: ${input.contato.nome}${input.contato.cargo ? ` (${input.contato.cargo})` : ''}.`);
  } else if (input.contato.confianca === 'media' || input.contato.confianca === 'baixa') {
    duvidosos.push(
      `Nome do responsável encontrado (${input.contato.candidatoDuvidoso?.nome || '—'}), mas sem confirmação oficial — não será usado na mensagem.`,
    );
  } else {
    faltantes.push('Responsável não identificado — abertura será neutra.');
  }

  const veredito: PreVooProntidao['veredito'] =
    input.whatsapp.status === 'confirmado' || input.email.status === 'confirmado' ? 'pronto' : 'falta_dados';
  const veredictoLabel =
    veredito === 'pronto'
      ? 'Pronto para abordagem.'
      : 'Falta pelo menos 1 canal confirmado (WhatsApp ou e-mail) antes de abordar.';

  return { confirmados, duvidosos, faltantes, veredito, veredictoLabel };
}

export type PreVooPersonaKey = Exclude<CadenciaPersona, 'custom'>;

export type PreVooRecommendation = {
  personaKey: PreVooPersonaKey;
  motivo: string;
  source: 'heuristica';
};

// Heuristica simples (sem IA/LLM neste sprint — campo source:'heuristica' pra IA
// plugar depois). Ex. do dono: "lead com zap confirmado e dono conhecido →
// Estratégico" = whatsapp + nome confirmados = score 2 = moderado.
export function recommendPersona(input: {
  whatsappConfirmado: boolean;
  emailConfirmado: boolean;
  nomeAlta: boolean;
}): PreVooRecommendation {
  const score = [input.whatsappConfirmado, input.emailConfirmado, input.nomeAlta].filter(Boolean).length;
  if (score >= 3) {
    return {
      personaKey: 'agressivo',
      motivo: 'WhatsApp, e-mail e responsável confirmados — dá pra manter presença mais firme, com mais toques por e-mail/atividade.',
      source: 'heuristica',
    };
  }
  if (score === 2) {
    return {
      personaKey: 'moderado',
      motivo: 'WhatsApp confirmado e responsável identificado — ritmo equilibrado, sem sobrecarregar o WhatsApp.',
      source: 'heuristica',
    };
  }
  return {
    personaKey: 'conservador',
    motivo: 'Poucos dados confirmados ainda — toque leve e espaçado para não queimar o único contato bom.',
    source: 'heuristica',
  };
}

// REGRA DO NOME (dura): nome só entra na mensagem com confianca ALTA. Senão,
// abertura NEUTRA — nunca "Boa tarde Empresa X" nem nome inventado.
export function buildAbertura(input: { nome: string | null; confianca: PreVooConfidence; empresaNome: string | null }): string {
  const empresa = normalize(input.empresaNome) || 'a empresa';
  if (input.confianca === 'alta' && normalize(input.nome)) {
    return `Olá, ${normalize(input.nome)}! Tudo bem? Queria falar rapidinho sobre a ${empresa}.`;
  }
  return `Olá, tudo bem? Estou tentando falar com o responsável pela ${empresa}...`;
}

export function resolveObjetivo(status: unknown): string {
  const key = normalize(status).toLowerCase();
  if (key === 'contato') return 'Reengajar';
  if (key === 'retorno') return 'Retomar contato agendado';
  if (key === 'qualificado') return 'Avançar negociação';
  return 'Primeiro contato';
}

export type PreVooPassoPreview = {
  dia: number;
  canal: CadenciaCanal;
  titulo: string | null;
  corpo: string | null;
  atividadeTipo: string | null;
};

export type PreVooPersonaPreview = {
  key: PreVooPersonaKey;
  nome: string;
  descricao: string;
  recomendado: boolean;
  passos: PreVooPassoPreview[];
};

// Passos das 3 seeds (CADENCIA_SEEDS) verbatim — SÓ o passo "Abertura" (dia 0,
// canal whats) tem o corpo trocado pela abertura resolvida pela regra do nome.
// As seeds continuam intocadas (WORM-13 em produção — não mexer no corpo real).
export function buildPersonaPreviews(
  seeds: readonly SeedPersonaLike[],
  abertura: string,
  recommendedKey: PreVooPersonaKey,
): PreVooPersonaPreview[] {
  return seeds.map((seed) => ({
    key: seed.key,
    nome: seed.nome,
    descricao: seed.descricao,
    recomendado: seed.key === recommendedKey,
    passos: seed.passos.map((passo) => ({
      dia: passo.dia,
      canal: passo.canal,
      titulo: passo.titulo || null,
      corpo:
        passo.canal === 'whats' && passo.dia === 0 && normalize(passo.titulo) === 'Abertura'
          ? abertura
          : passo.corpo || null,
      atividadeTipo: passo.atividadeTipo || null,
    })),
  }));
}

export function isPreVooEnrichEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.HBX_PREVOO_ENRICH_ENABLED || '').trim().toLowerCase());
}
