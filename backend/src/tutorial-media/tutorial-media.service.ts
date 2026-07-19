import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getBackendPublicUploadDir } from '../public-assets';

// TUTORIAL FRONT — mídia dos passos do tutorial público (/tutorialexterno).
// O dono sobe UM vídeo por passo pelo /master ("Tutorial front"); o arquivo
// vai pra public/uploads/tutorial/ (servido público em /uploads/tutorial/* pelo
// ServeStatic) e o manifesto mapeia passo → { url, mode }. A página pública lê
// o manifesto por GET /tutorial-media (sem login). A lista de passos e as
// descrições de 1 linha são ESTÁTICAS no frontend (tutorial-content.ts) — aqui
// só guardamos o vídeo e o modo de exibição.

export type TutorialMode = 'video' | 'light';

export type TutorialStepMedia = {
  url: string; // relativo à raiz do backend: /uploads/tutorial/<arquivo>
  mode: TutorialMode;
  filename: string;
  updatedAt: string;
};

export type TutorialManifest = { steps: Record<string, TutorialStepMedia> };

// stepId chega do frontend (id do passo em tutorial-content.ts). É master-only,
// mas validamos assim mesmo pra nunca virar path traversal na escrita do arquivo.
const STEP_ID_RE = /^[a-z0-9-]{1,60}$/;

// vídeo curto de tutorial; teto generoso mas não absurdo (protege o disco do VPS).
export const TUTORIAL_MAX_BYTES = 80 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

@Injectable()
export class TutorialMediaService {
  private dir() {
    return getBackendPublicUploadDir('tutorial');
  }

  private manifestPath() {
    return join(this.dir(), 'manifest.json');
  }

  readManifest(): TutorialManifest {
    try {
      const raw = readFileSync(this.manifestPath(), 'utf8');
      const parsed = JSON.parse(raw);
      const steps = parsed && typeof parsed === 'object' ? parsed.steps : null;
      return { steps: steps && typeof steps === 'object' ? steps : {} };
    } catch {
      return { steps: {} };
    }
  }

  private writeManifest(manifest: TutorialManifest) {
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(this.manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  }

  private assertStepId(stepId: string) {
    if (!STEP_ID_RE.test(String(stepId || ''))) {
      throw new BadRequestException('Passo do tutorial inválido.');
    }
  }

  saveVideo(stepId: string, file?: { buffer?: Buffer; mimetype?: string; originalname?: string; size?: number }): TutorialStepMedia {
    this.assertStepId(stepId);
    if (!file?.buffer?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    if ((file.size ?? file.buffer.length) > TUTORIAL_MAX_BYTES) {
      throw new BadRequestException('Arquivo grande demais (máx. 80 MB).');
    }
    const ext = EXT_BY_MIME[String(file.mimetype || '')];
    if (!ext) throw new BadRequestException('Formato não suportado (envie um vídeo MP4/WebM/MOV).');

    mkdirSync(this.dir(), { recursive: true });
    // 1 arquivo por passo: sobrescreve. Nome = stepId.<ext>. Se a extensão mudar
    // (mp4 → webm), apaga a versão antiga pra não deixar órfão no disco.
    const manifest = this.readManifest();
    const prev = manifest.steps[stepId];
    if (prev?.filename && prev.filename !== `${stepId}.${ext}`) {
      try { rmSync(join(this.dir(), prev.filename), { force: true }); } catch { /* ignore */ }
    }

    const filename = `${stepId}.${ext}`;
    writeFileSync(join(this.dir(), filename), file.buffer);

    const entry: TutorialStepMedia = {
      url: `/uploads/tutorial/${filename}`,
      mode: prev?.mode === 'light' ? 'light' : 'video',
      filename,
      updatedAt: new Date().toISOString(),
    };
    manifest.steps[stepId] = entry;
    this.writeManifest(manifest);
    return entry;
  }

  setMode(stepId: string, mode: TutorialMode): TutorialStepMedia {
    this.assertStepId(stepId);
    if (mode !== 'video' && mode !== 'light') throw new BadRequestException('Modo inválido.');
    const manifest = this.readManifest();
    const entry = manifest.steps[stepId];
    if (!entry) throw new BadRequestException('Nenhum vídeo neste passo ainda.');
    entry.mode = mode;
    entry.updatedAt = new Date().toISOString();
    this.writeManifest(manifest);
    return entry;
  }

  remove(stepId: string): TutorialManifest {
    this.assertStepId(stepId);
    const manifest = this.readManifest();
    const entry = manifest.steps[stepId];
    if (entry?.filename) {
      try { rmSync(join(this.dir(), entry.filename), { force: true }); } catch { /* ignore */ }
    }
    delete manifest.steps[stepId];
    this.writeManifest(manifest);
    return manifest;
  }
}
