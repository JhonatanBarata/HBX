import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { TechAssistantInput, TechAssistantResponse } from './tech-assistant.types';

type AiProviderResult = {
  providerLabel: string;
  status: 'ai';
  partial: Partial<TechAssistantResponse>;
};

@Injectable()
export class TechAssistantAiProvider {
  private get apiUrl() {
    return String(process.env.HBX_TECH_ASSISTANT_API_URL || '').trim();
  }

  private get apiKey() {
    return String(process.env.HBX_TECH_ASSISTANT_API_KEY || '').trim();
  }

  private get modelName() {
    return String(process.env.HBX_TECH_ASSISTANT_MODEL || 'hbx-tech-assistant').trim();
  }

  isConfigured() {
    return Boolean(this.apiUrl && this.apiKey);
  }

  async enrichAnalysis(input: TechAssistantInput, draft: TechAssistantResponse): Promise<AiProviderResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const timeoutMs = Math.max(5000, Number(process.env.HBX_TECH_ASSISTANT_TIMEOUT_MS || '15000'));
    const payload = {
      model: this.modelName,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Voce e um analista tecnico interno do sistema HBX. Responda em PT-BR, nao proponha automacoes destrutivas, nao publique nada e devolva JSON valido com as chaves summary, probableCause, checkNow, likelyFiles, risk, codexPrompt, nextActions, reviewNotes, revisedPrompt, labels.',
        },
        {
          role: 'user',
          content: JSON.stringify({ input, draft }, null, 2),
        },
      ],
    };

    try {
      const response = await axios.post(this.apiUrl, payload, {
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const content = response?.data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('Resposta vazia do provedor de IA.');
      }

      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      const rawJson = jsonStart >= 0 && jsonEnd > jsonStart ? content.slice(jsonStart, jsonEnd + 1) : content;
      const parsed = JSON.parse(rawJson) as Partial<TechAssistantResponse>;

      return {
        providerLabel: this.modelName,
        status: 'ai',
        partial: parsed,
      };
    } catch (error: any) {
      if (error?.code === 'ECONNABORTED') {
        throw new Error('Timeout ao consultar o provedor de IA do assistente técnico.');
      }
      if (error instanceof SyntaxError) {
        throw new Error('O provedor de IA respondeu em formato inválido.');
      }
      throw new Error(error?.message || 'Falha ao consultar o provedor de IA do assistente técnico.');
    }
  }
}