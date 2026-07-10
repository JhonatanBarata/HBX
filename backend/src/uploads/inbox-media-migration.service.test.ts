import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { InboxMediaMigrationService } from './inbox-media-migration.service';

function withTempCwd(run: (tempDir: string) => void) {
  const previousCwd = process.cwd();
  const previousDelete = process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE;
  delete process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE;
  const tempDir = mkdtempSync(join(tmpdir(), 'inbox-migration-'));
  try {
    process.chdir(tempDir);
    run(tempDir);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
    if (previousDelete === undefined) delete process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE;
    else process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE = previousDelete;
  }
}

test('migração copia arquivos do public legado pro storage privado PRESERVANDO o original', () => {
  withTempCwd((tempDir) => {
    const legacyDir = join(tempDir, 'public', 'uploads', 'inbox');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'a.jpg'), 'bytes-a');
    writeFileSync(join(legacyDir, 'b.ogg'), 'bytes-b');

    new InboxMediaMigrationService().onModuleInit();

    assert.equal(readFileSync(join(tempDir, 'storage', 'inbox', 'a.jpg'), 'utf8'), 'bytes-a');
    assert.equal(readFileSync(join(tempDir, 'storage', 'inbox', 'b.ogg'), 'utf8'), 'bytes-b');
    // original fica (volume persistente do prod é o public/uploads até a infra mudar);
    // ele não vaza: a rota assinada intercepta /uploads/inbox/* na frente do estático.
    assert.equal(existsSync(join(legacyDir, 'a.jpg')), true);
    assert.equal(existsSync(join(legacyDir, 'b.ogg')), true);
  });
});

test('migração é idempotente: cópia existente no privado não é sobrescrita', () => {
  withTempCwd((tempDir) => {
    const legacyDir = join(tempDir, 'public', 'uploads', 'inbox');
    const privateDir = join(tempDir, 'storage', 'inbox');
    mkdirSync(legacyDir, { recursive: true });
    mkdirSync(privateDir, { recursive: true });
    writeFileSync(join(privateDir, 'c.png'), 'privado-vale');
    writeFileSync(join(legacyDir, 'c.png'), 'copia-publica-velha');

    const service = new InboxMediaMigrationService();
    service.onModuleInit();
    service.onModuleInit(); // segunda rodada: nada muda

    assert.equal(readFileSync(join(privateDir, 'c.png'), 'utf8'), 'privado-vale');
  });
});

test('HBX_INBOX_MEDIA_MIGRATION_DELETE=true remove as cópias públicas após copiar', () => {
  withTempCwd((tempDir) => {
    const legacyDir = join(tempDir, 'public', 'uploads', 'inbox');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'd.pdf'), 'bytes-d');
    process.env.HBX_INBOX_MEDIA_MIGRATION_DELETE = 'true';

    new InboxMediaMigrationService().onModuleInit();

    assert.equal(readFileSync(join(tempDir, 'storage', 'inbox', 'd.pdf'), 'utf8'), 'bytes-d');
    assert.equal(existsSync(join(legacyDir, 'd.pdf')), false);
  });
});

test('boot não quebra com dir legado inexistente ou vazio', () => {
  withTempCwd((tempDir) => {
    const service = new InboxMediaMigrationService();
    // inexistente
    assert.doesNotThrow(() => service.onModuleInit());
    // vazio
    mkdirSync(join(tempDir, 'public', 'uploads', 'inbox'), { recursive: true });
    assert.doesNotThrow(() => service.onModuleInit());
    // não cria storage à toa quando não há nada pra migrar
    assert.equal(existsSync(join(tempDir, 'storage')), false);
  });
});
