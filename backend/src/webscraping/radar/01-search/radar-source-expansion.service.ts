import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../shared/radar-types';
import type { RadarSearchStrategy } from './radar-search-strategy.service';

export type RadarSourceExpansionPlan = {
  googleTextualQueries: string[];
  siteCrawlPaths: string[];
  cnpjSeeds: Array<Record<string, any>>;
  directorySeeds: string[];
  verticalStrategies: Array<Record<string, any>>;
  opportunitySignals: Array<Record<string, any>>;
  reprocessRules: Array<Record<string, any>>;
};

function normalizeLookupValue(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function quote(value: unknown) {
  const safe = String(value || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  return safe ? `"${safe}"` : '';
}

@Injectable()
export class RadarSourceExpansionService {
  buildExpansionPlan(input: NormalizedSearchInput, strategy: RadarSearchStrategy): RadarSourceExpansionPlan {
    return {
      googleTextualQueries: this.buildGoogleTextualQueries(input, strategy),
      siteCrawlPaths: this.buildSiteCrawlPaths(strategy),
      cnpjSeeds: this.buildCnpjSeeds(input, strategy),
      directorySeeds: this.buildDirectorySeeds(input, strategy),
      verticalStrategies: this.buildVerticalStrategies(input),
      opportunitySignals: this.buildOpportunitySignals(input),
      reprocessRules: this.buildReprocessRules(input, strategy),
    };
  }

  buildGoogleTextualQueries(input: NormalizedSearchInput, strategy: RadarSearchStrategy) {
    if (!strategy.allowSecondaryProviders) return [];
    const segment = quote(input.segment);
    const city = quote(input.city);
    const state = String(input.state || '').trim().toUpperCase();
    const location = [city, state].filter(Boolean).join(' ');
    return Array.from(new Set([
      `${segment} ${location} whatsapp`,
      `${segment} ${location} instagram`,
      `${segment} ${location} telefone`,
      `${segment} ${location} site`,
      `${segment} ${location} contato`,
      `${segment} ${location} orcamento`,
    ].map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean)));
  }

  buildSiteCrawlPaths(strategy: RadarSearchStrategy) {
    if (!strategy.allowLightCrawl) return [];
    return ['/', '/contato', '/sobre', '/atendimento', '/unidades', '/links'];
  }

  buildCnpjSeeds(input: NormalizedSearchInput, strategy: RadarSearchStrategy) {
    if (strategy.mode !== 'fabrica_noturna' && strategy.mode !== 'profundo') return [];
    return [{
      city: input.city,
      state: input.state || null,
      segment: input.segment,
      normalizedSegment: input.normalizedSegment,
      status: 'ativa',
      fields: ['nome_fantasia', 'razao_social', 'cnpj', 'cnae', 'porte', 'matriz_filial'],
      enrichment: ['google', 'social_async', 'site_crawl_light'],
    }];
  }

  buildDirectorySeeds(input: NormalizedSearchInput, strategy: RadarSearchStrategy) {
    if (strategy.mode !== 'profundo' && strategy.mode !== 'fabrica_noturna') return [];
    const segment = quote(input.segment);
    const city = quote(input.city);
    return [
      `associacao comercial ${city} ${segment}`,
      `guia comercial ${city} ${segment}`,
      `sindicato ${segment} ${city}`,
      `catalogo fornecedores ${city} ${segment}`,
      `portal local ${city} ${segment}`,
    ].map((query) => query.replace(/\s+/g, ' ').trim());
  }

  buildVerticalStrategies(input: NormalizedSearchInput) {
    const segment = normalizeLookupValue(input.segment);
    const strategies: Array<Record<string, any>> = [];
    if (/restaurante|lanchonete|pizzaria|bar|hamburguer|delivery|marmitaria/.test(segment)) {
      strategies.push({ vertical: 'alimentacao', sources: ['cardapio', 'delivery', 'google_textual', 'instagram'], signal: 'vende_com_recorrencia' });
    }
    if (/clinica|medic|odont|estetica|psicolog|fisio/.test(segment)) {
      strategies.push({ vertical: 'clinicas', sources: ['portais_medicos', 'google_textual', 'site_crawl_light'], signal: 'agenda_e_atendimento' });
    }
    if (/imobiliaria|imoveis|corretor/.test(segment)) {
      strategies.push({ vertical: 'imobiliarias', sources: ['portais_imoveis', 'site_crawl_light', 'whatsapp'], signal: 'lead_imediato' });
    }
    if (/oficina|mecanica|auto|pneu|borracharia/.test(segment)) {
      strategies.push({ vertical: 'automotivo', sources: ['guias_automotivos', 'google_textual', 'whatsapp'], signal: 'urgencia_de_contato' });
    }
    if (/hotel|pousada|turismo|reserva/.test(segment)) {
      strategies.push({ vertical: 'hotelaria', sources: ['turismo', 'reservas', 'site_crawl_light'], signal: 'reserva_digital' });
    }
    if (/escola|curso|educacao|colegio/.test(segment)) {
      strategies.push({ vertical: 'educacao', sources: ['educacao', 'site_crawl_light', 'facebook'], signal: 'captacao_de_alunos' });
    }
    if (/salao|barbearia|beleza|esmalteria|sobrancelha/.test(segment)) {
      strategies.push({ vertical: 'beleza', sources: ['instagram', 'local_guides', 'whatsapp'], signal: 'atendimento_por_agenda' });
    }
    return strategies;
  }

  buildOpportunitySignals(input: NormalizedSearchInput) {
    const base = [
      { signal: 'instagram_sem_whatsapp_claro', pitch: 'tem presenca social mas falta canal direto de atendimento' },
      { signal: 'site_sem_formulario', pitch: 'site existe mas pode nao capturar lead' },
      { signal: 'telefone_sem_canal_digital', pitch: 'contato publico ainda depende de ligacao' },
      { signal: 'maps_sem_social', pitch: 'esta no mapa mas pode nao ter relacionamento digital' },
      { signal: 'social_sem_link_atendimento', pitch: 'rede social ativa sem conversao para atendimento' },
      { signal: 'avaliacoes_sem_resposta', pitch: 'reputacao pode estar sem acompanhamento' },
      { signal: 'sem_automacao_aparente', pitch: 'empresa vende mas nao demonstra esteira de atendimento' },
    ];
    return input.qualityMode === 'lead_plus'
      ? base
      : base.slice(0, 4);
  }

  buildReprocessRules(input: NormalizedSearchInput, strategy: RadarSearchStrategy) {
    if (strategy.mode === 'rapido') return [];
    return [
      { rule: 'cards_sem_social', action: 'social_async' },
      { rule: 'cards_com_telefone_sem_whatsapp', action: 'whatsapp_check' },
      { rule: 'cards_com_site_sem_email', action: 'site_crawl_light' },
      { rule: 'rejeitados_por_falta_de_canal', action: 'reprocessar_com_fontes_textuais' },
      { rule: 'cards_antigos_mesma_cidade_segmento', action: 'refresh_enrichment' },
      { rule: 'duplicados_com_dados_complementares', action: 'merge_evidencias' },
    ];
  }
}
