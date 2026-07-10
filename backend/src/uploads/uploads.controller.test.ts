import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';

import { buildSignedInboxMediaPath } from './inbox-media.util';
import { UploadsController } from './uploads.controller';

// P1.3 — prova COM O APP MONTADO (não por fé) de que a rota do controller intercepta
// GET /uploads/inbox/* na frente do middleware do ServeStaticModule: um arquivo deixado
// no public/uploads/inbox NÃO é mais servível sem assinatura, enquanto o resto do
// estático continua funcionando.

const SECRET = 'segredo-de-teste-com-32-caracteres!';

async function withMountedApp(
  run: (ctx: { baseUrl: string; tempDir: string }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;

  const tempDir = mkdtempSync(join(tmpdir(), 'uploads-controller-'));
  const publicDir = join(tempDir, 'public');
  mkdirSync(join(publicDir, 'uploads', 'inbox'), { recursive: true });
  mkdirSync(join(tempDir, 'storage', 'inbox'), { recursive: true });

  // arquivo "esquecido" no public legado + asset estático normal + arquivo privado
  writeFileSync(join(publicDir, 'uploads', 'inbox', 'esquecido.txt'), 'conteudo legado');
  writeFileSync(join(publicDir, 'aberto.txt'), 'asset estatico normal');
  writeFileSync(
    join(tempDir, 'storage', 'inbox', 'privado.png'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
  );
  writeFileSync(join(publicDir, 'index.html'), '<html></html>');

  @Module({
    imports: [
      ServeStaticModule.forRoot({
        rootPath: publicDir,
        serveRoot: '/',
      }),
    ],
    controllers: [UploadsController],
  })
  class UploadsTestModule {}

  const app = await NestFactory.create(UploadsTestModule, { logger: false });
  try {
    process.chdir(tempDir);
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await run({ baseUrl: `http://127.0.0.1:${port}`, tempDir });
  } finally {
    process.chdir(previousCwd);
    await app.close();
    rmSync(tempDir, { recursive: true, force: true });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}

test('controller intercepta /uploads/inbox/* ANTES do estático: sem assinatura = 403 mesmo com o arquivo no public', async () => {
  await withMountedApp(async ({ baseUrl }) => {
    // arquivo EXISTE em public/uploads/inbox, mas a rota nega sem assinatura
    const unsigned = await fetch(`${baseUrl}/uploads/inbox/esquecido.txt`);
    assert.equal(unsigned.status, 403);

    // com assinatura, serve (fallback legado) — como attachment (não é imagem/áudio/vídeo)
    const signed = await fetch(`${baseUrl}${buildSignedInboxMediaPath('esquecido.txt')}`);
    assert.equal(signed.status, 200);
    assert.equal(await signed.text(), 'conteudo legado');
    assert.equal(signed.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(String(signed.headers.get('content-disposition')).startsWith('attachment'));

    // o resto do estático segue vivo (o serve-static não foi quebrado)
    const staticAsset = await fetch(`${baseUrl}/aberto.txt`);
    assert.equal(staticAsset.status, 200);
    assert.equal(await staticAsset.text(), 'asset estatico normal');
  });
});

test('arquivo do storage privado só sai com assinatura válida', async () => {
  await withMountedApp(async ({ baseUrl }) => {
    const signedPath = buildSignedInboxMediaPath('privado.png');

    const ok = await fetch(`${baseUrl}${signedPath}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(String(ok.headers.get('content-disposition')).startsWith('inline'));
    const body = Buffer.from(await ok.arrayBuffer());
    assert.equal(body[0], 0x89);
    assert.equal(body.length, 11);

    // sem query
    const bare = await fetch(`${baseUrl}/uploads/inbox/privado.png`);
    assert.equal(bare.status, 403);

    // assinatura adulterada
    const url = new URL(`${baseUrl}${signedPath}`);
    const sig = url.searchParams.get('s') || '';
    url.searchParams.set('s', (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1));
    const tampered = await fetch(url);
    assert.equal(tampered.status, 403);

    // expirada
    const expiredPath = buildSignedInboxMediaPath('privado.png', {
      nowMs: Date.now() - 48 * 60 * 60 * 1000,
      ttlMs: 1000,
    });
    const expired = await fetch(`${baseUrl}${expiredPath}`);
    assert.equal(expired.status, 403);
  });
});

test('filename fora do basename estrito é 404 e assinatura de arquivo inexistente é 404', async () => {
  await withMountedApp(async ({ baseUrl }) => {
    // traversal com %2F decodificado pelo Express no param
    const traversal = await fetch(`${baseUrl}/uploads/inbox/..%2Faberto.txt`);
    assert.ok([403, 404].includes(traversal.status));
    assert.notEqual(await traversal.text(), 'asset estatico normal');

    const dotdot = await fetch(`${baseUrl}/uploads/inbox/%2e%2e%2findex.html`);
    assert.ok([403, 404].includes(dotdot.status));
    assert.notEqual(await dotdot.text(), '<html></html>');

    // assinatura válida mas arquivo não existe em nenhum dir → 404
    const missing = await fetch(`${baseUrl}${buildSignedInboxMediaPath('nao-existe.png')}`);
    assert.equal(missing.status, 404);
  });
});

test('range request devolve 206 pro seek de áudio/vídeo', async () => {
  await withMountedApp(async ({ baseUrl }) => {
    const signedPath = buildSignedInboxMediaPath('privado.png');
    const partial = await fetch(`${baseUrl}${signedPath}`, {
      headers: { Range: 'bytes=0-3' },
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 0-3/11');
    const body = Buffer.from(await partial.arrayBuffer());
    assert.equal(body.length, 4);
    assert.equal(body[0], 0x89);
  });
});
