import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

// Isola o disco ANTES de importar o serviço (o dir é lido em runtime, mas
// deixamos explícito que nenhum teste encosta em backend/public).
const workDir = mkdtempSync(join(tmpdir(), 'hbx-tutorial-'));
process.env.TUTORIAL_UPLOAD_DIR = workDir;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { TutorialMediaService } from './tutorial-media.service';
import type { TutorialManifest } from './tutorial-media.types';

function video(size = 32) {
  return { buffer: Buffer.alloc(size, 1), mimetype: 'video/mp4', size };
}

describe('TutorialMediaService', () => {
  let service: TutorialMediaService;

  before(() => { process.env.TUTORIAL_UPLOAD_DIR = workDir; });
  after(() => { rmSync(workDir, { recursive: true, force: true }); });

  beforeEach(() => {
    for (const entry of ['manifest.json']) rmSync(join(workDir, entry), { force: true });
    service = new TutorialMediaService();
  });

  it('semeia o conteúdo padrão quando não existe manifesto', () => {
    const manifest = service.readManifest();
    assert.equal(manifest.version, 2);
    assert.deepEqual(manifest.guides.map((g) => g.id), ['sistema', 'android', 'iphone']);
    assert.ok(manifest.guides[0].steps.length > 0);
    // e persiste, pra primeira edição do dono partir de algo real
    assert.ok(existsSync(join(workDir, 'manifest.json')));
  });

  it('edita título/descrição e mantém a ordem definida', () => {
    const manifest = service.readManifest();
    manifest.guides[0].steps[0].title = 'Entrar no sistema';
    manifest.guides[0].steps[0].desc = 'Nova descrição.';
    const saved = service.saveStructure(manifest);
    assert.equal(saved.guides[0].steps[0].title, 'Entrar no sistema');
    assert.equal(saved.guides[0].steps[0].desc, 'Nova descrição.');
    // releitura do disco confirma persistência
    assert.equal(service.readManifest().guides[0].steps[0].title, 'Entrar no sistema');
  });

  it('adiciona e remove tela inteira', () => {
    const manifest = service.readManifest();
    const antes = manifest.guides[2].steps.length;
    manifest.guides[2].steps.push({ id: 'tela-nova', title: 'Tela nova', desc: 'oi', media: null });
    let saved = service.saveStructure(manifest);
    assert.equal(saved.guides[2].steps.length, antes + 1);

    saved.guides[2].steps = saved.guides[2].steps.filter((s) => s.id !== 'tela-nova');
    saved = service.saveStructure(saved);
    assert.equal(saved.guides[2].steps.length, antes);
    assert.ok(!saved.guides[2].steps.some((s) => s.id === 'tela-nova'));
  });

  it('aceita link externo e recusa link sem http', () => {
    const manifest = service.readManifest();
    const stepId = manifest.guides[0].steps[0].id;
    manifest.guides[0].steps[0].media = {
      kind: 'link',
      url: 'https://youtu.be/abc123',
      mode: 'video',
      updatedAt: new Date().toISOString(),
    };
    const saved = service.saveStructure(manifest);
    assert.equal(saved.guides[0].steps[0].media?.kind, 'link');
    assert.equal(saved.guides[0].steps[0].media?.url, 'https://youtu.be/abc123');

    const ruim = service.readManifest();
    ruim.guides[0].steps[0].media = { kind: 'link', url: 'javascript:alert(1)', mode: 'video', updatedAt: '' };
    assert.throws(() => service.saveStructure(ruim), /http/i);
    void stepId;
  });

  it('grava o upload e o serve por URL pública da pasta de uploads', () => {
    const manifest = service.readManifest();
    const stepId = manifest.guides[0].steps[0].id;
    const saved = service.saveUpload(stepId, video());
    const media = saved.guides[0].steps[0].media;
    assert.equal(media?.kind, 'upload');
    assert.equal(media?.url, `/uploads/tutorial/${stepId}.mp4`);
    assert.ok(existsSync(join(workDir, `${stepId}.mp4`)));
  });

  it('não deixa o cliente forjar a URL de um upload', () => {
    const manifest = service.readManifest();
    const stepId = manifest.guides[0].steps[0].id;
    service.saveUpload(stepId, video());

    const forjado = service.readManifest();
    forjado.guides[0].steps[0].media = {
      kind: 'upload',
      url: '/uploads/tutorial/../../secreto.env',
      mode: 'video',
      filename: '../../secreto.env',
      updatedAt: '',
    };
    const saved = service.saveStructure(forjado);
    // preserva a verdade do servidor, ignorando o que veio do cliente
    assert.equal(saved.guides[0].steps[0].media?.url, `/uploads/tutorial/${stepId}.mp4`);
    assert.equal(saved.guides[0].steps[0].media?.filename, `${stepId}.mp4`);
  });

  it('apaga o arquivo órfão quando a tela sai ou vira link', () => {
    const manifest = service.readManifest();
    const stepId = manifest.guides[0].steps[0].id;
    service.saveUpload(stepId, video());
    assert.ok(existsSync(join(workDir, `${stepId}.mp4`)));

    const semTela = service.readManifest();
    semTela.guides[0].steps = semTela.guides[0].steps.filter((s) => s.id !== stepId);
    service.saveStructure(semTela);
    assert.ok(!existsSync(join(workDir, `${stepId}.mp4`)), 'vídeo da tela removida deve sair do disco');
  });

  it('recusa tela duplicada, título vazio e formato não suportado', () => {
    const dup = service.readManifest();
    dup.guides[0].steps.push({ ...dup.guides[0].steps[0] });
    assert.throws(() => service.saveStructure(dup), /repetida/i);

    const semTitulo = service.readManifest();
    semTitulo.guides[0].steps[0].title = '   ';
    assert.throws(() => service.saveStructure(semTitulo), /t[íi]tulo/i);

    const manifest = service.readManifest();
    assert.throws(
      () => service.saveUpload(manifest.guides[0].steps[0].id, { buffer: Buffer.alloc(4), mimetype: 'application/pdf', size: 4 }),
      /suportado/i,
    );
  });

  it('recusa upload em tela inexistente', () => {
    assert.throws(() => service.saveUpload('nao-existe', video()), /n[ãa]o encontrada/i);
  });

  it('migra o manifesto v1 preservando o vídeo já subido', () => {
    // formato antigo em produção: { steps: { <stepId>: media } }
    writeFileSync(
      join(workDir, 'manifest.json'),
      JSON.stringify({
        steps: {
          'sis-login': { url: '/uploads/tutorial/sis-login.mp4', mode: 'light', filename: 'sis-login.mp4', updatedAt: '2026-07-19T00:00:00.000Z' },
        },
      }),
      'utf8',
    );
    const manifest = new TutorialMediaService().readManifest();
    assert.equal(manifest.version, 2);
    const login = manifest.guides[0].steps.find((s) => s.id === 'sis-login');
    assert.equal(login?.media?.kind, 'upload');
    assert.equal(login?.media?.url, '/uploads/tutorial/sis-login.mp4');
    assert.equal(login?.media?.mode, 'light', 'o modo escolhido pelo dono sobrevive à migração');
    // telas sem vídeo no v1 continuam sem vídeo
    assert.equal(manifest.guides[0].steps.find((s) => s.id === 'sis-dashboard')?.media, null);
  });

  it('mantém o manifesto legível como JSON no disco', () => {
    service.readManifest();
    const raw = JSON.parse(readFileSync(join(workDir, 'manifest.json'), 'utf8')) as TutorialManifest;
    assert.equal(raw.version, 2);
    assert.ok(Array.isArray(raw.guides));
  });
});
