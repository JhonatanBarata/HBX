import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export type MasterEmailFormState = {
  recipientName: string;
  recipientEmail: string;
  testEmail: string;
  sampleName: string;
  sampleCompany: string;
};

const FORM_STATE_KEY = 'default';
const FORM_STATE_DIR = join(process.cwd(), 'storage', 'master-email');
const FORM_STATE_PATH = join(FORM_STATE_DIR, 'form-state.json');

const DEFAULT_FORM_STATE: MasterEmailFormState = {
  recipientName: 'Amanda',
  recipientEmail: '',
  testEmail: '',
  sampleName: 'Amanda',
  sampleCompany: 'Empresa Teste',
};

@Injectable()
export class MasterEmailSettingsService {
  private readonly logger = new Logger(MasterEmailSettingsService.name);
  private legacyMigrationChecked = false;

  constructor(private readonly prisma: PrismaService) {}

  async getFormState(): Promise<MasterEmailFormState> {
    if (await this.canUseDatabaseStorage()) {
      await this.migrateLegacyFormStateToDatabase();
      const row = await this.prisma.masterEmailFormState.findUnique({ where: { key: FORM_STATE_KEY } });
      return this.normalizeFormState(row || {});
    }

    return this.readLegacyFormState();
  }

  async saveFormState(input: Partial<MasterEmailFormState>): Promise<MasterEmailFormState> {
    const current = await this.getFormState();
    const patch = Object.fromEntries(Object.entries(input || {}).filter(([, value]) => value !== undefined));
    const state = this.normalizeFormState({ ...current, ...patch });

    if (await this.canUseDatabaseStorage()) {
      await this.migrateLegacyFormStateToDatabase();
      const row = await this.prisma.masterEmailFormState.upsert({
        where: { key: FORM_STATE_KEY },
        create: { key: FORM_STATE_KEY, ...state },
        update: state,
      });
      return this.normalizeFormState(row);
    }

    await mkdir(FORM_STATE_DIR, { recursive: true });
    await writeFile(FORM_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    return state;
  }

  private async canUseDatabaseStorage() {
    return this.prisma.hasTable('MasterEmailFormState');
  }

  private normalizeFormState(input: Partial<Record<keyof MasterEmailFormState, unknown>>): MasterEmailFormState {
    return {
      recipientName: this.normalizeText(input.recipientName, 120, DEFAULT_FORM_STATE.recipientName),
      recipientEmail: this.normalizeText(input.recipientEmail, 180, DEFAULT_FORM_STATE.recipientEmail).toLowerCase(),
      testEmail: this.normalizeText(input.testEmail, 180, DEFAULT_FORM_STATE.testEmail).toLowerCase(),
      sampleName: this.normalizeText(input.sampleName, 120, DEFAULT_FORM_STATE.sampleName),
      sampleCompany: this.normalizeText(input.sampleCompany, 180, DEFAULT_FORM_STATE.sampleCompany),
    };
  }

  private normalizeText(value: unknown, maxLength: number, fallback: string) {
    if (value === null || value === undefined) return fallback;
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  private async readLegacyFormState() {
    if (!existsSync(FORM_STATE_PATH)) return DEFAULT_FORM_STATE;
    try {
      const parsed = JSON.parse(await readFile(FORM_STATE_PATH, 'utf8'));
      return this.normalizeFormState(parsed || {});
    } catch (error) {
      this.logger.warn(`Failed to read master email form state: ${error instanceof Error ? error.message : error}`);
      return DEFAULT_FORM_STATE;
    }
  }

  private async migrateLegacyFormStateToDatabase() {
    if (this.legacyMigrationChecked) return;
    this.legacyMigrationChecked = true;
    if (!existsSync(FORM_STATE_PATH)) return;

    try {
      const existing = await this.prisma.masterEmailFormState.findUnique({
        where: { key: FORM_STATE_KEY },
        select: { key: true },
      });
      if (existing) return;
      const state = await this.readLegacyFormState();
      await this.prisma.masterEmailFormState.create({
        data: { key: FORM_STATE_KEY, ...state },
      });
    } catch (error) {
      this.logger.warn(`Failed to migrate master email form state: ${error instanceof Error ? error.message : error}`);
    }
  }
}
