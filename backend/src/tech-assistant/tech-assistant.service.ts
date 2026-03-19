import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TechAssistantAiProvider } from './tech-assistant-ai.provider';
import { AnalyzeTechAssistantDto } from './dto/analyze-tech-assistant.dto';
import {
  type TechAssistantBlocks,
  type TechAssistantDiagnostic,
  type TechAssistantHistoryItem,
  type TechAssistantInput,
  type TechAssistantResponse,
} from './tech-assistant.types';

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  manual: 'Mensagem manual',
  page_analysis: 'Analisar página atual',
  ctrl_u: 'Colar Ctrl+U',
  error_analysis: 'Analisar erro',
  codex_prompt: 'Gerar prompt para Codex',
  prompt_review: 'Revisar prompt',
  pre_publish_checklist: 'Checklist pré-publicação',
};

const ROUTE_FILE_HINTS: Array<{ pattern: RegExp; files: string[] }> = [
  {
    pattern: /^\/dashboard\/master(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/master/page.client.tsx',
      'backend/src/modules/modules.controller.ts',
      'backend/src/modules/modules.service.ts',
    ],
  },
  {
    pattern: /^\/dashboard\/master\/assistente-tecnico(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/master/assistente-tecnico/page.client.tsx',
      'backend/src/tech-assistant/tech-assistant.controller.ts',
      'backend/src/tech-assistant/tech-assistant.service.ts',
    ],
  },
  {
    pattern: /^\/dashboard\/website(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/website/page.client.tsx',
      'backend/src/website/website.controller.ts',
      'backend/src/website/website.service.ts',
    ],
  },
  {
    pattern: /^\/dashboard\/inbox(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/inbox/page.client.tsx',
      'backend/src/inbox/inbox.controller.ts',
      'backend/src/inbox/inbox.service.ts',
    ],
  },
  {
    pattern: /^\/dashboard\/webscraping(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/webscraping/page.client.tsx',
      'backend/src/modules/modules.controller.ts',
      'webscraping/app.py',
    ],
  },
  {
    pattern: /^\/dashboard\/importacoes(?:\/|$)/i,
    files: [
      'frontend/src/app/dashboard/importacoes/followup-global/page.client.tsx',
      'backend/src/importacoes/importacoes.controller.ts',
      'backend/src/importacoes/importacoes.service.ts',
    ],
  },
  {
    pattern: /^\/hbx-recovery(?:\/|$)/i,
    files: [
      'frontend/src/app/hbx-recovery/page.client.tsx',
      'backend/src/hbx-recovery/hbx-recovery.controller.ts',
      'backend/src/hbx-recovery/hbx-recovery.service.ts',
    ],
  },
];

@Injectable()
export class TechAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: TechAssistantAiProvider,
  ) {}

  async analyze(userId: number, dto: AnalyzeTechAssistantDto) {
    const input = this.normalizeInput(dto);
    const heuristics = this.buildHeuristicResponse(input);
    const warnings = [...heuristics.warnings];

    let response: TechAssistantResponse = heuristics.response;
    let providerLabel = 'Heurística interna HBX';
    let providerStatus: 'heuristic' | 'ai' | 'ai_fallback' = 'heuristic';

    try {
      const enriched = await this.aiProvider.enrichAnalysis(input, heuristics.response);
      if (enriched?.partial) {
        response = this.mergeAiResponse(heuristics.response, enriched.partial);
        providerLabel = enriched.providerLabel;
        providerStatus = 'ai';
      }
    } catch (error: any) {
      warnings.push(error?.message || 'Falha ao usar o provedor externo; resposta heurística aplicada.');
      providerStatus = 'ai_fallback';
    }

    response = {
      ...response,
      providerLabel,
      providerStatus,
      warnings,
    };

    const maskedInput = this.buildMaskedInput(input);
    const interaction = await this.prisma.techAssistantInteraction.create({
      data: {
        userId: Number(userId),
        mode: response.mode,
        analysisType: input.analysisType,
        title: response.title,
        route: input.route || null,
        environment: input.environment,
        expectedBehavior: input.expectedBehavior || null,
        currentBehavior: input.currentBehavior || null,
        maskedInput: JSON.stringify(maskedInput),
        responseJson: JSON.stringify(response),
        providerLabel,
        providerStatus,
      },
    });

    return {
      interactionId: interaction.id,
      response,
    };
  }

  async listHistory(userId: number) {
    const rows = await this.prisma.techAssistantInteraction.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return rows.map((row) => this.mapHistoryRow(row));
  }

  async deleteHistoryItem(userId: number, interactionId: string) {
    await this.prisma.techAssistantInteraction.deleteMany({
      where: { id: interactionId, userId: Number(userId) },
    });
    return { ok: true };
  }

  async clearHistory(userId: number) {
    await this.prisma.techAssistantInteraction.deleteMany({ where: { userId: Number(userId) } });
    return { ok: true };
  }

  getExamples() {
    return {
      examples: [
        {
          label: 'Erro de build no publish',
          payload: {
            analysisType: 'error_analysis',
            environment: 'localhost',
            route: '/dashboard/website',
            expectedBehavior: 'O build do frontend deve concluir sem erro.',
            currentBehavior: 'O build quebra ao rodar npm run publish.',
            buildError: 'Type error: Property x does not exist on type Y.',
          },
        },
        {
          label: 'HTML/Ctrl+U de página quebrada',
          payload: {
            analysisType: 'ctrl_u',
            environment: 'producao',
            route: '/dashboard/inbox',
            expectedBehavior: 'A página deve renderizar o painel de atendimento.',
            currentBehavior: 'A página mostra layout vazio.',
            htmlSource: '<html>...conteudo colado do Ctrl+U...</html>',
          },
        },
        {
          label: 'Revisão de prompt',
          payload: {
            analysisType: 'prompt_review',
            environment: 'desconhecido',
            promptDraft: 'Corrija esse erro no HBX e melhore o sistema inteiro.',
          },
        },
      ],
    };
  }

  private normalizeInput(dto: AnalyzeTechAssistantDto): TechAssistantInput {
    const input: TechAssistantInput = {
      analysisType: dto.analysisType,
      environment: dto.environment || 'desconhecido',
      route: this.cleanInline(dto.route),
      message: this.cleanMultiline(dto.message),
      technicalContent: this.cleanMultiline(dto.technicalContent),
      expectedBehavior: this.cleanMultiline(dto.expectedBehavior),
      currentBehavior: this.cleanMultiline(dto.currentBehavior),
      htmlSource: this.cleanMultiline(dto.htmlSource),
      consoleError: this.cleanMultiline(dto.consoleError),
      buildError: this.cleanMultiline(dto.buildError),
      backendStacktrace: this.cleanMultiline(dto.backendStacktrace),
      apiError: this.cleanMultiline(dto.apiError),
      requestJson: this.cleanMultiline(dto.requestJson),
      responseJson: this.cleanMultiline(dto.responseJson),
      promptDraft: this.cleanMultiline(dto.promptDraft),
    };

    const totalLength = Object.values(input)
      .filter((value) => typeof value === 'string')
      .reduce((sum, value) => sum + String(value).length, 0);
    if (totalLength > 90000) {
      throw new Error('Conteúdo muito grande para análise. Reduza os logs ou divida em partes.');
    }

    return input;
  }

  private cleanInline(value?: string | null) {
    const normalized = String(value || '').trim();
    return normalized || undefined;
  }

  private cleanMultiline(value?: string | null) {
    const normalized = String(value || '').replace(/\u0000/g, '').trim();
    return normalized || undefined;
  }

  private buildHeuristicResponse(input: TechAssistantInput) {
    const combinedContent = this.buildCombinedContent(input);
    const mainError = this.detectMainError(input, combinedContent);
    const likelyFiles = this.detectLikelyFiles(input, combinedContent);
    const possibleCauses = this.detectPossibleCauses(input, combinedContent, mainError);
    const checkNow = this.buildCheckNow(input, combinedContent, likelyFiles);
    const checklist = this.buildChecklist(input, combinedContent);
    const risk = this.detectRisk(input, combinedContent);
    const confidence = this.detectConfidence(input, combinedContent, mainError);
    const nextActions = this.buildNextActions(input, checkNow, likelyFiles);
    const reviewNotes = input.analysisType === 'prompt_review'
      ? this.reviewPrompt(input.promptDraft || '', likelyFiles, mainError)
      : [];
    const revisedPrompt = input.analysisType === 'prompt_review'
      ? this.buildRevisedPrompt(input.promptDraft || '', input, mainError, likelyFiles)
      : '';

    const diagnostic: TechAssistantDiagnostic = {
      route: input.route || 'Nao informada',
      environment: input.environment,
      expectedBehavior: input.expectedBehavior || 'Nao informado',
      currentBehavior: input.currentBehavior || 'Nao informado',
      mainError,
      possibleCauses,
      likelyFiles,
      confidence,
      nextAction: nextActions[0] || 'Conferir o primeiro arquivo sugerido e reproduzir o erro com log limpo.',
    };

    const blocks: TechAssistantBlocks = {
      summary: this.buildSummary(input, mainError),
      probableCause: possibleCauses[0] || 'Faltam sinais suficientes; a próxima etapa é reproduzir com logs mais objetivos.',
      checkNow,
      likelyFiles,
      risk,
      codexPrompt: this.buildCodexPrompt(input, mainError, likelyFiles),
    };

    const labels = this.buildLabels(risk, input, combinedContent);
    const mode = input.analysisType === 'prompt_review'
      ? 'review_prompt'
      : input.analysisType === 'pre_publish_checklist'
        ? 'checklist'
        : 'analysis';
    const title = this.buildTitle(input, mainError);

    const response: TechAssistantResponse = {
      mode,
      analysisType: input.analysisType,
      title,
      labels,
      blocks,
      diagnostic,
      nextActions,
      checklist,
      reviewNotes,
      revisedPrompt,
      providerLabel: 'Heurística interna HBX',
      providerStatus: 'heuristic',
      warnings: [],
    };

    return {
      response,
      warnings: [],
    };
  }

  private buildCombinedContent(input: TechAssistantInput) {
    return [
      input.message,
      input.technicalContent,
      input.htmlSource,
      input.consoleError,
      input.buildError,
      input.backendStacktrace,
      input.apiError,
      input.requestJson,
      input.responseJson,
      input.promptDraft,
      input.expectedBehavior,
      input.currentBehavior,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private detectMainError(input: TechAssistantInput, combinedContent: string) {
    const prioritized = [input.consoleError, input.buildError, input.backendStacktrace, input.apiError, combinedContent]
      .filter(Boolean)
      .join('\n');
    const lines = prioritized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const candidates = lines.filter((line) => /(error|exception|failed|forbidden|unauthorized|timeout|cannot|invalid|typeerror|referenceerror|prisma|build)/i.test(line));
    if (candidates.length) {
      return candidates[0].slice(0, 280);
    }
    if (input.currentBehavior) return input.currentBehavior.slice(0, 280);
    if (input.message) return input.message.slice(0, 280);
    return 'Erro principal ainda não isolado; faltam logs mais objetivos.';
  }

  private detectPossibleCauses(input: TechAssistantInput, combinedContent: string, mainError: string) {
    const causes: string[] = [];
    const haystack = `${combinedContent}\n${mainError}`.toLowerCase();

    if (/cors|origin .* not allowed/i.test(haystack)) {
      causes.push('Configuração de CORS ou FRONTEND_URL/CORS_ALLOWED_ORIGINS inconsistente entre ambiente e backend.');
    }
    if (/401|403|forbidden|unauthorized|token|jwt|master/i.test(haystack)) {
      causes.push('Falha de autenticação/autorização, guard incorreto ou rota acessível sem contexto master válido.');
    }
    if (/prisma|migration|database|relation|column|table/i.test(haystack)) {
      causes.push('Diferença entre schema Prisma, migration aplicada e estrutura real do banco.');
    }
    if (/module not found|cannot find module|import/i.test(haystack)) {
      causes.push('Import quebrado, caminho incorreto ou dependência ausente no build.');
    }
    if (/typeerror|typescript|property .* does not exist|assignable/i.test(haystack)) {
      causes.push('Contrato de tipos divergente entre payload, componente e retorno de API.');
    }
    if (/hydration|did not match|window is not defined/i.test(haystack)) {
      causes.push('Incompatibilidade entre renderização client/server no Next.js.');
    }
    if (/timeout|timed out|econnrefused|fetch failed/i.test(haystack)) {
      causes.push('Serviço dependente indisponível, URL incorreta ou operação sem tratamento de timeout.');
    }
    if (/publish|deploy|render|build/i.test(haystack)) {
      causes.push('Pipeline de build/publicação com pré-requisitos incompletos ou arquivo alterado fora da cadeia validada.');
    }
    if (!causes.length && input.route?.startsWith('/dashboard/master')) {
      causes.push('Provável divergência entre tela master, payload do backend e regras de permissão master.');
    }
    if (!causes.length) {
      causes.push('Estado da interface, payload e regra de negócio ainda não estão alinhados; o próximo passo é confirmar o primeiro ponto onde o fluxo desvia.');
    }

    return Array.from(new Set(causes)).slice(0, 4);
  }

  private detectLikelyFiles(input: TechAssistantInput, combinedContent: string) {
    const files = new Set<string>();
    const route = String(input.route || '');
    for (const item of ROUTE_FILE_HINTS) {
      if (item.pattern.test(route)) {
        for (const file of item.files) files.add(file);
      }
    }

    const lower = combinedContent.toLowerCase();
    if (/publish|deploy|render\.yaml|build/.test(lower)) {
      files.add('scripts/publish.js');
      files.add('scripts/verify-prod.js');
      files.add('render.yaml');
    }
    if (/prisma|migration|database/.test(lower)) {
      files.add('backend/prisma/schema.prisma');
      files.add('backend/src/prisma/prisma.service.ts');
    }
    if (/master|isSystemMaster|acesso exclusivo/.test(lower)) {
      files.add('backend/src/auth/guards/master.guard.ts');
      files.add('frontend/src/app/dashboard/master/page.client.tsx');
    }
    if (/api|fetch|axios|response|status/.test(lower)) {
      files.add('frontend/src/app/dashboard/_lib/api.ts');
    }

    return Array.from(files).slice(0, 6);
  }

  private detectRisk(input: TechAssistantInput, combinedContent: string) {
    const haystack = `${input.route || ''}\n${combinedContent}`.toLowerCase();
    if (/payment|mercadopago|auth|master|jwt|permission|guard|publish|deploy|migration|database|prisma/.test(haystack)) {
      return 'Alto risco';
    }
    if (/api|backend|timeout|webhook|build|typescript/.test(haystack)) {
      return 'Médio risco';
    }
    return 'Baixo risco';
  }

  private detectConfidence(input: TechAssistantInput, combinedContent: string, mainError: string) {
    let score = 0;
    if (input.route) score += 1;
    if (input.expectedBehavior) score += 1;
    if (input.currentBehavior) score += 1;
    if (mainError && !/ainda não isolado/i.test(mainError)) score += 1;
    if (combinedContent.length > 200) score += 1;
    if (score >= 5) return 'Alta';
    if (score >= 3) return 'Média';
    return 'Baixa';
  }

  private buildCheckNow(input: TechAssistantInput, combinedContent: string, likelyFiles: string[]) {
    const checks: string[] = [];
    if (input.route) checks.push(`Reproduzir o problema exatamente na rota ${input.route}.`);
    if (input.expectedBehavior && input.currentBehavior) {
      checks.push('Comparar o comportamento esperado com o atual e identificar o primeiro ponto onde o fluxo diverge.');
    }
    if (/401|403|forbidden|unauthorized|token|jwt/i.test(combinedContent)) {
      checks.push('Validar token, usuário logado, resposta de /profile/current-user e guards aplicados na rota.');
    }
    if (/prisma|migration|database/i.test(combinedContent)) {
      checks.push('Conferir schema Prisma, migration aplicada e colunas/tabelas reais no banco alvo.');
    }
    if (/publish|deploy|build/i.test(combinedContent)) {
      checks.push('Rodar build local limpo e revisar os artefatos exigidos pelo publish antes de mexer no código.');
    }
    if (/timeout|econnrefused|fetch failed/i.test(combinedContent)) {
      checks.push('Verificar URL do serviço dependente, disponibilidade do processo e timeout configurado.');
    }
    if (likelyFiles[0]) checks.push(`Abrir primeiro ${likelyFiles[0]} e confirmar onde o dado ou erro entra no fluxo.`);
    return Array.from(new Set(checks)).slice(0, 5);
  }

  private buildNextActions(input: TechAssistantInput, checkNow: string[], likelyFiles: string[]) {
    const actions = [...checkNow];
    if (likelyFiles.length) {
      actions.push(`Se o diagnóstico se confirmar, pedir ao Codex patch mínimo focado em ${likelyFiles.slice(0, 3).join(', ')}.`);
    }
    if (input.analysisType === 'pre_publish_checklist') {
      actions.push('Executar a checklist inteira localmente antes de qualquer tentativa de publish.');
    }
    return Array.from(new Set(actions)).slice(0, 6);
  }

  private buildChecklist(input: TechAssistantInput, combinedContent: string) {
    const checklist = [
      'Variáveis de ambiente corretas para o ambiente informado',
      'Rota e navegação testadas manualmente',
      'Build local do frontend sem erro',
      'Tipagem/TypeScript sem erro',
      'Migrations e schema Prisma coerentes',
      'Endpoints críticos respondendo com status esperado',
      'Autenticação e autorização preservadas',
      'Sem impacto não intencional em produção',
      'Layout responsivo e PT-BR preservados',
      'Console sem erros relevantes',
      'Requests principais sem erro de rede',
      'Fluxo de publish/deploy seguro e validado',
    ];

    if (/publish|deploy|render/i.test(combinedContent) || input.analysisType === 'pre_publish_checklist') {
      checklist.unshift('Backup e verificação pós-deploy planejados antes do publish');
    }

    return checklist;
  }

  private buildLabels(risk: string, input: TechAssistantInput, combinedContent: string) {
    const labels = [risk];
    if (/publish|deploy|build|migration|auth|payment/i.test(combinedContent)) {
      labels.push('Corrigir agora');
    } else {
      labels.push('Pode esperar');
    }
    if (input.analysisType === 'prompt_review') {
      labels.push('Requer revisão manual');
    } else {
      labels.push('Requer Codex');
    }
    return labels;
  }

  private buildSummary(input: TechAssistantInput, mainError: string) {
    const routePart = input.route ? ` na rota ${input.route}` : '';
    const expectedPart = input.expectedBehavior ? ` Esperado: ${input.expectedBehavior}.` : '';
    const currentPart = input.currentBehavior ? ` Atual: ${input.currentBehavior}.` : '';
    return `Foi identificado um cenário de análise ${ANALYSIS_TYPE_LABELS[input.analysisType] || input.analysisType}${routePart}. Erro principal: ${mainError}.${expectedPart}${currentPart}`.trim();
  }

  private buildTitle(input: TechAssistantInput, mainError: string) {
    const route = input.route ? ` - ${input.route}` : '';
    return `${ANALYSIS_TYPE_LABELS[input.analysisType] || 'Análise técnica'}${route} - ${mainError.slice(0, 80)}`;
  }

  private buildCodexPrompt(input: TechAssistantInput, mainError: string, likelyFiles: string[]) {
    const probableFiles = likelyFiles.length ? likelyFiles.join(', ') : 'arquivos ainda não isolados';
    return [
      'Você está no projeto HBX.',
      'Faça um patch mínimo e objetivo para corrigir o problema descrito abaixo.',
      'Não altere layout sem necessidade.',
      'Não refatore partes fora do escopo.',
      'Preserve PT-BR na interface e nas mensagens.',
      `Arquivos prováveis: ${probableFiles}.`,
      `Rota/página: ${input.route || 'não informada'}.`,
      `Comportamento esperado: ${input.expectedBehavior || 'não informado'}.`,
      `Comportamento atual: ${input.currentBehavior || 'não informado'}.`,
      `Erro atual: ${mainError}.`,
      'Valide ao final que a solução não quebra build nem publish/deploy.',
      'Liste rapidamente os arquivos alterados e a validação executada.',
    ].join(' ');
  }

  private reviewPrompt(promptDraft: string, likelyFiles: string[], mainError: string) {
    const notes: string[] = [];
    const normalized = promptDraft.trim();
    if (!normalized) {
      return ['Nenhum prompt informado para revisão.'];
    }
    if (normalized.length < 80) {
      notes.push('O prompt está vago demais; faltam contexto, comportamento esperado e erro atual.');
    }
    if (!/[\\/][\w.-]+\.[a-z]+/i.test(normalized) && likelyFiles.length) {
      notes.push('Faltam arquivos prováveis; isso aumenta o risco de o Codex procurar em áreas desnecessárias.');
    }
    if (!/(error|stack|console|build|status|exception|typeerror|forbidden|unauthorized)/i.test(normalized)) {
      notes.push('Faltam logs ou descrição objetiva do erro principal.');
    }
    if (/(sistema inteiro|refatore tudo|melhore geral|frontend e backend inteiro)/i.test(normalized)) {
      notes.push('O escopo está amplo demais e pode induzir mudanças fora do necessário.');
    }
    if (!/(patch mínimo|minimo|sem refatorar|preserve|nao alterar layout)/i.test(normalized)) {
      notes.push('Vale explicitar patch mínimo, preservação de layout e proibição de refatoração fora do escopo.');
    }
    if (!notes.length) {
      notes.push(`O prompt já está razoavelmente direcionado; só reforçaria o erro principal (${mainError}) e os arquivos mais prováveis.`);
    }
    return notes;
  }

  private buildRevisedPrompt(promptDraft: string, input: TechAssistantInput, mainError: string, likelyFiles: string[]) {
    const basePrompt = promptDraft.trim();
    if (!basePrompt) {
      return this.buildCodexPrompt(input, mainError, likelyFiles);
    }
    return `${this.buildCodexPrompt(input, mainError, likelyFiles)} Prompt original resumido: ${basePrompt}`;
  }

  private buildMaskedInput(input: TechAssistantInput) {
    return {
      analysisType: input.analysisType,
      environment: input.environment,
      route: input.route || null,
      message: this.maskSensitiveData(input.message),
      technicalContent: this.maskSensitiveData(input.technicalContent),
      expectedBehavior: this.maskSensitiveData(input.expectedBehavior),
      currentBehavior: this.maskSensitiveData(input.currentBehavior),
      htmlSource: this.maskSensitiveData(input.htmlSource),
      consoleError: this.maskSensitiveData(input.consoleError),
      buildError: this.maskSensitiveData(input.buildError),
      backendStacktrace: this.maskSensitiveData(input.backendStacktrace),
      apiError: this.maskSensitiveData(input.apiError),
      requestJson: this.maskSensitiveData(input.requestJson),
      responseJson: this.maskSensitiveData(input.responseJson),
      promptDraft: this.maskSensitiveData(input.promptDraft),
    };
  }

  private maskSensitiveData(value?: string | null) {
    if (!value) return null;
    return String(value)
      .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, '$1[mascarado]')
      .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|secret|senha|password|authorization|cookie)\s*[:=]\s*["']?([^"'\s,}]+)/gi, '$1=[mascarado]')
      .replace(/(\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/g, '[jwt_mascarado]');
  }

  private mergeAiResponse(base: TechAssistantResponse, partial: Partial<TechAssistantResponse>): TechAssistantResponse {
    return {
      ...base,
      title: this.firstMeaningfulString(partial.title, base.title),
      labels: this.mergeStringArray(base.labels, partial.labels),
      blocks: {
        ...base.blocks,
        summary: this.firstMeaningfulString(partial.blocks?.summary, base.blocks.summary),
        probableCause: this.firstMeaningfulString(partial.blocks?.probableCause, base.blocks.probableCause),
        checkNow: this.mergeStringArray(base.blocks.checkNow, partial.blocks?.checkNow),
        likelyFiles: this.mergeStringArray(base.blocks.likelyFiles, partial.blocks?.likelyFiles),
        risk: this.firstMeaningfulString(partial.blocks?.risk, base.blocks.risk),
        codexPrompt: this.firstMeaningfulString(partial.blocks?.codexPrompt, base.blocks.codexPrompt),
      },
      diagnostic: {
        ...base.diagnostic,
        mainError: this.firstMeaningfulString(partial.diagnostic?.mainError, base.diagnostic.mainError),
        possibleCauses: this.mergeStringArray(base.diagnostic.possibleCauses, partial.diagnostic?.possibleCauses),
        likelyFiles: this.mergeStringArray(base.diagnostic.likelyFiles, partial.diagnostic?.likelyFiles),
        confidence: this.firstMeaningfulString(partial.diagnostic?.confidence, base.diagnostic.confidence),
        nextAction: this.firstMeaningfulString(partial.diagnostic?.nextAction, base.diagnostic.nextAction),
      },
      nextActions: this.mergeStringArray(base.nextActions, partial.nextActions),
      checklist: this.mergeStringArray(base.checklist, partial.checklist),
      reviewNotes: this.mergeStringArray(base.reviewNotes, partial.reviewNotes),
      revisedPrompt: this.firstMeaningfulString(partial.revisedPrompt, base.revisedPrompt),
      providerLabel: base.providerLabel,
      providerStatus: base.providerStatus,
      warnings: base.warnings,
    };
  }

  private firstMeaningfulString(candidate: unknown, fallback: string) {
    const normalized = String(candidate || '').trim();
    return normalized || fallback;
  }

  private mergeStringArray(base: string[], candidate?: unknown) {
    const values = Array.isArray(candidate)
      ? candidate.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...base, ...values])).slice(0, 8);
  }

  private mapHistoryRow(row: any): TechAssistantHistoryItem {
    let response: TechAssistantResponse;
    let maskedInput: Record<string, unknown>;
    try {
      response = JSON.parse(String(row.responseJson || '{}')) as TechAssistantResponse;
    } catch {
      response = this.buildHeuristicResponse({ analysisType: 'manual', environment: 'desconhecido' }).response;
    }
    try {
      maskedInput = JSON.parse(String(row.maskedInput || '{}')) as Record<string, unknown>;
    } catch {
      maskedInput = {};
    }
    return {
      id: row.id,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      mode: row.mode,
      analysisType: row.analysisType || null,
      title: row.title || null,
      route: row.route || null,
      environment: row.environment || null,
      providerLabel: row.providerLabel || null,
      providerStatus: row.providerStatus || null,
      response,
      maskedInput,
    };
  }
}