import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getBackendPublicUploadDir } from '../public-assets';
import { DEFAULT_GUIDES } from './tutorial-defaults';
import type {
  TutorialGuide,
  TutorialManifest,
  TutorialMedia,
  TutorialMode,
  TutorialStep,
} from './tutorial-media.types';

// TUTORIAL FRONT — conteúdo do tutorial público (/tutorialexterno).
// O manifesto (public/uploads/tutorial/manifest.json) é a FONTE DA VERDADE:
// guias → telas (título, descrição, vídeo). O dono edita tudo pelo /master.
// O vídeo pode ser upload (arquivo em /uploads/tutorial/, servido público pelo
// ServeStatic) ou LINK externo (YouTube etc.). A leitura é pública; toda
// escrita é master-only.

const STEP_ID_RE = /^[a-z0-9-]{1,60}$/;
export const TUTORIAL_MAX_BYTES = 80 * 1024 * 1024;
const MAX_TITLE = 120;
const MAX_DESC = 400;

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function text(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

@Injectable()
export class TutorialMediaService {
  // Padrão = pasta pública servida em /uploads/tutorial/* (é isso que faz a URL
  // do vídeo funcionar sem login). O override por env existe só para TESTE
  // isolado — apontar para fora do public quebra a entrega do arquivo.
  private dir() {
    return process.env.TUTORIAL_UPLOAD_DIR || getBackendPublicUploadDir('tutorial');
  }

  private manifestPath() {
    return join(this.dir(), 'manifest.json');
  }

  private write(manifest: TutorialManifest) {
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(this.manifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  }

  // Sem manifesto no disco = ambiente novo: semeia com o conteúdo padrão e grava,
  // pra que a primeira edição do dono já parta de algo real.
  readManifest(): TutorialManifest {
    try {
      const parsed = JSON.parse(readFileSync(this.manifestPath(), 'utf8'));
      const guides = Array.isArray(parsed?.guides) ? parsed.guides : null;
      if (guides) return { version: 2, guides };

      // v1 (conteúdo fixo no código, manifesto só com { steps: { id: media } }):
      // migra os vídeos já subidos pra estrutura nova em vez de perdê-los.
      if (parsed?.steps && typeof parsed.steps === 'object') {
        const migrated = this.migrateFromV1(parsed.steps as Record<string, any>);
        try { this.write(migrated); } catch { /* disco read-only */ }
        return migrated;
      }
    } catch {
      /* sem manifesto ou inválido → semeia */
    }
    const seeded: TutorialManifest = { version: 2, guides: DEFAULT_GUIDES };
    try { this.write(seeded); } catch { /* disco read-only: serve em memória */ }
    return seeded;
  }

  private migrateFromV1(legacy: Record<string, any>): TutorialManifest {
    const guides: TutorialGuide[] = DEFAULT_GUIDES.map((guide) => ({
      ...guide,
      steps: guide.steps.map((step) => {
        const old = legacy[step.id];
        if (!old?.url) return { ...step, media: null };
        return {
          ...step,
          media: {
            kind: 'upload' as const,
            url: String(old.url),
            mode: old.mode === 'light' ? ('light' as const) : ('video' as const),
            filename: old.filename ? String(old.filename) : undefined,
            updatedAt: String(old.updatedAt || new Date().toISOString()),
          },
        };
      }),
    }));
    return { version: 2, guides };
  }

  private uploadFilenames(manifest: TutorialManifest): Set<string> {
    const names = new Set<string>();
    for (const guide of manifest.guides || []) {
      for (const step of guide.steps || []) {
        if (step.media?.kind === 'upload' && step.media.filename) names.add(step.media.filename);
      }
    }
    return names;
  }

  private findStep(manifest: TutorialManifest, stepId: string): TutorialStep | null {
    for (const guide of manifest.guides || []) {
      const step = (guide.steps || []).find((s) => s.id === stepId);
      if (step) return step;
    }
    return null;
  }

  private deleteFile(filename?: string) {
    if (!filename) return;
    try { rmSync(join(this.dir(), filename), { force: true }); } catch { /* ignore */ }
  }

  // Salva a ESTRUTURA (guias, telas, textos, links, ordem). O cliente NÃO manda
  // url de upload: para kind='upload' preservamos o que o servidor já tem, senão
  // seria possível apontar um passo pra qualquer arquivo.
  saveStructure(incoming: TutorialManifest): TutorialManifest {
    const current = this.readManifest();
    const guidesIn = Array.isArray(incoming?.guides) ? incoming.guides : null;
    if (!guidesIn?.length) throw new BadRequestException('Estrutura do tutorial inválida.');

    const seenStepIds = new Set<string>();
    const guides: TutorialGuide[] = guidesIn.map((guide) => {
      const guideId = text(guide?.id, 60).toLowerCase();
      if (!STEP_ID_RE.test(guideId)) throw new BadRequestException(`Guia inválida: "${guide?.id}".`);
      const label = text(guide?.label, MAX_TITLE);
      if (!label) throw new BadRequestException('Toda guia precisa de um nome.');

      const steps: TutorialStep[] = (Array.isArray(guide?.steps) ? guide.steps : []).map((step) => {
        const id = text(step?.id, 60).toLowerCase();
        if (!STEP_ID_RE.test(id)) throw new BadRequestException(`Tela inválida: "${step?.id}".`);
        if (seenStepIds.has(id)) throw new BadRequestException(`Tela repetida: "${id}".`);
        seenStepIds.add(id);

        const title = text(step?.title, MAX_TITLE);
        if (!title) throw new BadRequestException('Toda tela precisa de um título.');

        return {
          id,
          title,
          desc: text(step?.desc, MAX_DESC),
          media: this.resolveMedia(step?.media, this.findStep(current, id)?.media || null),
        };
      });

      return { id: guideId, label, hint: text(guide?.hint, MAX_TITLE), steps };
    });

    const next: TutorialManifest = { version: 2, guides };

    // Arquivo que deixou de ser referenciado (tela removida ou trocada por link)
    // sai do disco — senão o volume do VPS vira cemitério de vídeo.
    const before = this.uploadFilenames(current);
    const after = this.uploadFilenames(next);
    for (const filename of before) if (!after.has(filename)) this.deleteFile(filename);

    this.write(next);
    return next;
  }

  private resolveMedia(incoming: unknown, previous: TutorialMedia | null): TutorialMedia | null {
    const media = incoming as Partial<TutorialMedia> | null | undefined;
    if (!media || !media.kind) return null;
    const mode: TutorialMode = media.mode === 'light' ? 'light' : 'video';

    if (media.kind === 'link') {
      const url = String(media.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new BadRequestException('O link do vídeo precisa começar com http(s)://');
      return { kind: 'link', url: url.slice(0, 500), mode, updatedAt: new Date().toISOString() };
    }

    // upload: só mantém o que o servidor já gravou (o cliente não define a url).
    if (previous?.kind === 'upload') return { ...previous, mode };
    return null;
  }

  saveUpload(
    stepId: string,
    file?: { buffer?: Buffer; mimetype?: string; size?: number },
  ): TutorialManifest {
    if (!STEP_ID_RE.test(String(stepId || ''))) throw new BadRequestException('Tela inválida.');
    if (!file?.buffer?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    if ((file.size ?? file.buffer.length) > TUTORIAL_MAX_BYTES) {
      throw new BadRequestException('Arquivo grande demais (máx. 80 MB).');
    }
    const ext = EXT_BY_MIME[String(file.mimetype || '')];
    if (!ext) throw new BadRequestException('Formato não suportado (envie MP4/WebM/MOV).');

    const manifest = this.readManifest();
    const step = this.findStep(manifest, stepId);
    if (!step) throw new BadRequestException('Tela não encontrada. Salve a estrutura antes de subir o vídeo.');

    // 1 arquivo por tela: se a extensão mudou, o antigo sai.
    const filename = `${stepId}.${ext}`;
    if (step.media?.kind === 'upload' && step.media.filename && step.media.filename !== filename) {
      this.deleteFile(step.media.filename);
    }

    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(join(this.dir(), filename), file.buffer);

    step.media = {
      kind: 'upload',
      url: `/uploads/tutorial/${filename}`,
      mode: step.media?.mode === 'light' ? 'light' : 'video',
      filename,
      updatedAt: new Date().toISOString(),
    };
    this.write(manifest);
    return manifest;
  }

}
