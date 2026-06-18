import { Injectable } from '@nestjs/common';
import { parseSignalsJson, type LeadSignalsData } from './lead-signals.util';

function normalizeCnpj(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function parseMaybeJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RadarPublicDataService {
  needsRefresh(row: { signalsJson?: string | null }): boolean {
    const stored = parseSignalsJson(row.signalsJson);
    if (!stored.computedAt) return true;
    const age = Date.now() - Date.parse(stored.computedAt);
    return !Number.isFinite(age) || age > REFRESH_TTL_MS;
  }

  async enrichSignals(
    prisma: any,
    row: { id: string; metadataJson?: string | null; signalsJson?: string | null },
  ): Promise<string> {
    const existing = parseSignalsJson(row.signalsJson);
    const metadata = parseMaybeJson(row.metadataJson);
    const cnpj = normalizeCnpj(metadata?.cnpj);

    const signals: string[] = [...existing.signals];
    let diasAberto = existing.diasAberto;
    let situacaoCadastral = existing.situacaoCadastral;
    let cnae = existing.cnae;

    if (cnpj.length >= 14) {
      const company = await prisma?.cnpjPublicCompany?.findUnique?.({
        where: { cnpj },
        select: { openedAt: true, situacao: true, cnae: true },
      }).catch(() => null);

      if (company) {
        if (company.openedAt instanceof Date) {
          const days = Math.floor((Date.now() - company.openedAt.getTime()) / 86_400_000);
          diasAberto = days;
          if (days <= 180 && !signals.includes('recem_aberto')) signals.push('recem_aberto');
        }
        const sit = String(company.situacao || '').toLowerCase().trim();
        situacaoCadastral = sit || null;
        if (['baixada', 'inapta', 'suspensa'].includes(sit) && !signals.includes('cnpj_baixado')) {
          signals.push('cnpj_baixado');
        }
        cnae = company.cnae || null;
      }
    }

    const data: LeadSignalsData = {
      signals: Array.from(new Set(signals)),
      diasAberto,
      situacaoCadastral,
      cnae,
      computedAt: new Date().toISOString(),
    };

    const signalsJson = JSON.stringify(data);
    await prisma?.radarLeadPool?.update?.({
      where: { id: row.id },
      data: { signalsJson },
    }).catch(() => { /* aditivo — ignora falha */ });

    return signalsJson;
  }
}
