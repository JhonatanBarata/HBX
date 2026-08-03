// PERSONA IA + ENTREVISTA FORÇADA (31/07/2026) — identidade ÚNICA da IA por
// empresa, consumida por Atendimento, Recovery e Prospecção. O chip é um, o
// número é um: duas personalidades no mesmo WhatsApp é teatro que o lead
// percebe. Decisão do dono: o NOME é escolha da EMPRESA; a IA pode ter nome
// próprio OU se passar por um vendedor real (IA abre, humano fecha).
//
// A ENTREVISTA é a tranca que substitui os bloqueios velhos (armar bot /
// chave geral): 3 perguntas que o CLIENTE responde antes de qualquer bot
// ligar — o que a empresa faz (1 frase) · o que vende (catálogo ≥ 1 item) ·
// como a IA se apresenta. Sem resposta = bot não liga (fail-closed, mesma lei
// do catalogoJson). IA que não sabe o que a empresa faz é IA proibida de
// falar em nome dela.
//
// Plain class instanciada manualmente (mesmo padrão de AgendaDisparoService /
// CommercialContactControlService) — sem grafo de DI, qualquer módulo faz
// `new PersonaIaService(this.prisma)`.

import { PrismaService } from '../prisma/prisma.service';
import { catalogoEstaPronto, normalizeCatalogo } from './vendas-catalogo';

export type PersonaModo = 'nome_proprio' | 'se_passa_por';

export interface PersonaIa {
  /** Como a IA assina nas conversas (aiNome, ou o nome do vendedor representado). */
  nome: string | null;
  modo: PersonaModo;
  /** Quando modo = se_passa_por: o usuário real representado. */
  fonteUserId: number | null;
  /** Identidade resolvida (tem um nome utilizável)? */
  completa: boolean;
}

export interface PerfilEmpresaIa {
  persona: PersonaIa;
  /** "O que a empresa faz", em 1 frase, dita pelo CLIENTE. */
  empresaFaz: string | null;
  catalogoPronto: boolean;
  /** As 3 perguntas respondidas — é ISTO que libera os bots. */
  entrevistaCompleta: boolean;
  /** Frases prontas pra tela (cadeado com motivo escrito, nunca mudo). */
  pendencias: string[];
}

export const PENDENCIA_EMPRESA_FAZ = 'Diga em uma frase o que a sua empresa faz.';
export const PENDENCIA_CATALOGO = 'Cadastre o que a empresa vende (pelo menos 1 item no catálogo).';
export const PENDENCIA_IDENTIDADE = 'Escolha o nome da IA — ou quem ela representa.';

const AI_NOME_MAX = 40;

function normalizeModo(value: unknown): PersonaModo {
  return String(value || '').trim() === 'se_passa_por' ? 'se_passa_por' : 'nome_proprio';
}

export class PersonaIaService {
  constructor(private readonly prisma: PrismaService | Record<string, any>) {}

  async getPerfil(companyId: number): Promise<PerfilEmpresaIa> {
    const row = await (this.prisma as any).vendasComercialConfig
      ?.findUnique?.({
        where: { companyId: Number(companyId) },
        select: { aiNome: true, aiIdentidade: true, aiUserId: true, empresaFazTexto: true, catalogoJson: true },
      })
      .catch(() => null);

    const modo = normalizeModo(row?.aiIdentidade);
    let nome: string | null = null;
    let fonteUserId: number | null = null;
    if (modo === 'se_passa_por' && Number(row?.aiUserId || 0)) {
      // O nome vem SEMPRE do usuário vivo (nunca de uma cópia): renomeou o
      // vendedor, a IA acompanha. Usuário de outra empresa não conta — o where
      // com companyId é a lei multi-tenant.
      const user = await (this.prisma as any).user
        ?.findFirst?.({
          where: { id: Number(row.aiUserId), companyId: Number(companyId) },
          select: { id: true, name: true, username: true },
        })
        .catch(() => null);
      if (user?.id) {
        fonteUserId = Number(user.id);
        nome = String(user.name || user.username || '').trim() || null;
      }
    } else {
      nome = String(row?.aiNome || '').trim().slice(0, AI_NOME_MAX) || null;
    }

    const empresaFaz = String(row?.empresaFazTexto || '').trim() || null;

    let catalogoPronto = false;
    const catalogoTexto = String(row?.catalogoJson || '').trim();
    if (catalogoTexto) {
      try {
        catalogoPronto = catalogoEstaPronto(normalizeCatalogo(JSON.parse(catalogoTexto)));
      } catch {
        catalogoPronto = false; // JSON podre = mesmo efeito de não ter catálogo
      }
    }

    const persona: PersonaIa = { nome, modo, fonteUserId, completa: Boolean(nome) };
    const pendencias: string[] = [];
    if (!empresaFaz) pendencias.push(PENDENCIA_EMPRESA_FAZ);
    if (!catalogoPronto) pendencias.push(PENDENCIA_CATALOGO);
    if (!persona.completa) pendencias.push(PENDENCIA_IDENTIDADE);

    return {
      persona,
      empresaFaz,
      catalogoPronto,
      entrevistaCompleta: pendencias.length === 0,
      pendencias,
    };
  }

  /**
   * Grava identidade + "o que a empresa faz". Catálogo tem porta própria
   * (AgendaDisparoService.saveCatalogo) — salvar perfil NUNCA toca o catálogo.
   */
  async savePerfil(
    companyId: number,
    dto: { aiNome?: string | null; aiIdentidade?: string; aiUserId?: number | null; empresaFazTexto?: string | null },
  ): Promise<PerfilEmpresaIa> {
    const data: Record<string, any> = {};
    if (dto.aiIdentidade !== undefined) data.aiIdentidade = normalizeModo(dto.aiIdentidade);
    if (dto.aiNome !== undefined) {
      data.aiNome = String(dto.aiNome || '').trim().slice(0, AI_NOME_MAX) || null;
    }
    if (dto.aiUserId !== undefined) {
      const userId = Number(dto.aiUserId || 0);
      if (userId) {
        const user = await (this.prisma as any).user
          ?.findFirst?.({ where: { id: userId, companyId: Number(companyId) }, select: { id: true } })
          .catch(() => null);
        if (!user?.id) throw new Error('Usuário escolhido não pertence a esta empresa.');
        data.aiUserId = userId;
      } else {
        data.aiUserId = null;
      }
    }
    if (dto.empresaFazTexto !== undefined) {
      data.empresaFazTexto = String(dto.empresaFazTexto || '').trim().slice(0, 280) || null;
    }
    if (Object.keys(data).length) {
      await (this.prisma as any).vendasComercialConfig.upsert({
        where: { companyId: Number(companyId) },
        create: { companyId: Number(companyId), ...data },
        update: { ...data },
      });
    }
    return this.getPerfil(companyId);
  }

  /**
   * O nome com que a IA assina AGORA, com fallback explícito do chamador
   * (caminhos manuais continuam funcionando antes da entrevista — o gate de
   * bot é quem exige perfil completo, não a renderização).
   */
  async assinatura(companyId: number, fallback: string): Promise<string> {
    const perfil = await this.getPerfil(companyId).catch(() => null);
    return perfil?.persona?.nome || String(fallback || '').trim() || 'time comercial';
  }

  /**
   * 🔴 03/08 — QUANDO A CONVERSA TEM DONA, A PERSONA É DELA.
   *
   * A identidade nasceu por EMPRESA porque naquela época a empresa tinha UM chip:
   * dois nomes no mesmo número é teatro que o lead percebe, e isso continua
   * valendo. Só que agora cada vendedora tem o número DELA
   * (`company-N-user-M`) — e a régua verdadeira nunca foi "uma empresa, um nome",
   * foi **"um número, um nome"**. Com a identidade presa na empresa, cinco chips
   * de cinco pessoas assinariam todos "Jhonatan": o lead recebe da Bianca e é
   * respondido por outro nome, no mesmo número.
   *
   * Ordem do dono (03/08): *"a persona tem q puxar o nome da pessoa logada"*.
   * Então: tendo pessoa atrás do envio (a dona da campanha, que é de quem sai o
   * chip), o nome é o DELA. Sem pessoa, cai na identidade da empresa exatamente
   * como antes — nenhum caminho de hoje fica sem nome.
   *
   * O nome vem SEMPRE do usuário vivo, nunca de cópia (mesma lei do
   * `se_passa_por`), e o `where` com companyId é a lei multi-tenant. Login NÃO
   * serve de nome: "mariaclara" no lugar de "Maria Clara" é o mesmo teatro por
   * outro caminho — sem `name` preenchido, a empresa responde.
   */
  async assinaturaDaPessoa(
    companyId: number,
    userId: number | null | undefined,
    fallback: string,
  ): Promise<string> {
    const id = Math.trunc(Number(userId || 0));
    if (id > 0) {
      const user = await (this.prisma as any).user
        ?.findFirst?.({
          where: { id, companyId: Number(companyId) },
          select: { name: true },
        })
        .catch(() => null);
      const nome = String(user?.name || '').trim().slice(0, AI_NOME_MAX);
      if (nome) return nome;
    }
    return this.assinatura(companyId, fallback);
  }
}
