import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSignedInboxMediaPath,
  extractInboxMediaFilename,
  inboxUploadExtensionForMime,
  isSafeInboxMediaFilename,
  matchesDeclaredMagicBytes,
  resolveInboxMediaResponseType,
  signInboxMediaUrlIfLocal,
  stripInboxMediaSignature,
  verifyInboxMediaSignature,
} from './inbox-media.util';

const SECRET = 'segredo-de-teste-com-32-caracteres!';

// ---------------------------------------------------------------------------
// Assinatura: validade, expiração e tamper
// ---------------------------------------------------------------------------

function signedParts(filename: string, opts?: { nowMs?: number; ttlMs?: number }) {
  const path = buildSignedInboxMediaPath(filename, { secret: SECRET, ...opts });
  const url = new URL(`http://x${path}`);
  return {
    path,
    e: url.searchParams.get('e'),
    s: url.searchParams.get('s'),
  };
}

test('assinatura válida verifica dentro do prazo', () => {
  const { e, s } = signedParts('foto.jpg');
  assert.equal(verifyInboxMediaSignature('foto.jpg', e, s, { secret: SECRET }), true);
});

test('assinatura expira depois do TTL', () => {
  const now = Date.now();
  const { e, s } = signedParts('foto.jpg', { nowMs: now, ttlMs: 1000 });
  assert.equal(
    verifyInboxMediaSignature('foto.jpg', e, s, { secret: SECRET, nowMs: now + 500 }),
    true,
  );
  assert.equal(
    verifyInboxMediaSignature('foto.jpg', e, s, { secret: SECRET, nowMs: now + 2000 }),
    false,
  );
});

test('tamper em qualquer parte derruba a assinatura', () => {
  const { e, s } = signedParts('foto.jpg');
  // outro arquivo
  assert.equal(verifyInboxMediaSignature('outra.jpg', e, s, { secret: SECRET }), false);
  // expiração esticada
  assert.equal(
    verifyInboxMediaSignature('foto.jpg', Number(e) + 999999, s, { secret: SECRET }),
    false,
  );
  // assinatura adulterada (troca o primeiro hex)
  const tampered = (s![0] === 'a' ? 'b' : 'a') + s!.slice(1);
  assert.equal(verifyInboxMediaSignature('foto.jpg', e, tampered, { secret: SECRET }), false);
  // segredo diferente
  assert.equal(verifyInboxMediaSignature('foto.jpg', e, s, { secret: 'outro-segredo' }), false);
  // lixo não-hex nunca passa
  assert.equal(verifyInboxMediaSignature('foto.jpg', e, 'zzz', { secret: SECRET }), false);
  assert.equal(verifyInboxMediaSignature('foto.jpg', 'abc', s, { secret: SECRET }), false);
});

// ---------------------------------------------------------------------------
// Filename estrito (o nome vira caminho no disco)
// ---------------------------------------------------------------------------

test('valida basename estrito contra path traversal', () => {
  // legados e novos passam
  assert.equal(isSafeInboxMediaFilename('47_115_MSG-MEDIA-2.ogg'), true);
  assert.equal(isSafeInboxMediaFilename('3f2c8a4e-1b2c-4d5e-8f90-abc123def456.png'), true);
  assert.equal(isSafeInboxMediaFilename('arquivo.tar.gz'), true);
  // lixo não passa
  for (const bad of [
    '',
    '..',
    '../segredo.txt',
    'a/b.png',
    'a\\b.png',
    '.env',
    '.htaccess',
    'a..b..',
    'foto.jpg%00',
    'foto .jpg',
    'a'.repeat(201),
    null,
    undefined,
    42,
  ]) {
    assert.equal(isSafeInboxMediaFilename(bad as any), false, `esperava recusar: ${String(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// Extração + reescrita na saída
// ---------------------------------------------------------------------------

test('extractInboxMediaFilename cobre path relativo, absoluto e query velha', () => {
  assert.equal(extractInboxMediaFilename('/uploads/inbox/foto.jpg'), 'foto.jpg');
  assert.equal(extractInboxMediaFilename('/uploads/inbox/foto.jpg?e=1&s=abc'), 'foto.jpg');
  assert.equal(
    extractInboxMediaFilename('https://api.hbxsystem.com.br/uploads/inbox/foto.jpg?e=1&s=x'),
    'foto.jpg',
  );
  // fora do inbox → null (avatars continuam estáticos)
  assert.equal(extractInboxMediaFilename('/uploads/avatars/foto.jpg'), null);
  assert.equal(extractInboxMediaFilename('https://pps.whatsapp.net/x.jpg'), null);
  assert.equal(extractInboxMediaFilename('texto qualquer'), null);
  // traversal embutido → null
  assert.equal(extractInboxMediaFilename('/uploads/inbox/../segredo.txt'), null);
  assert.equal(extractInboxMediaFilename('/uploads/inbox/a%2Fb.png'), null);
});

test('signInboxMediaUrlIfLocal assina só mídia do inbox e re-assina descartando query velha', () => {
  const signed = signInboxMediaUrlIfLocal('/uploads/inbox/foto.jpg', { secret: SECRET });
  assert.ok(String(signed).startsWith('/uploads/inbox/foto.jpg?e='));
  const url = new URL(`http://x${signed}`);
  assert.equal(
    verifyInboxMediaSignature('foto.jpg', url.searchParams.get('e'), url.searchParams.get('s'), {
      secret: SECRET,
    }),
    true,
  );

  // valor já assinado (query velha/expirada) sai com assinatura FRESCA
  const resigned = signInboxMediaUrlIfLocal('/uploads/inbox/foto.jpg?e=1&s=velho', {
    secret: SECRET,
  });
  const resignedUrl = new URL(`http://x${resigned}`);
  assert.equal(
    verifyInboxMediaSignature(
      'foto.jpg',
      resignedUrl.searchParams.get('e'),
      resignedUrl.searchParams.get('s'),
      { secret: SECRET },
    ),
    true,
  );

  // URL absoluta armazenada vira path relativo assinado (host descartado)
  const fromAbsolute = signInboxMediaUrlIfLocal(
    'https://api.hbxsystem.com.br/uploads/inbox/foto.jpg',
    { secret: SECRET },
  );
  assert.ok(String(fromAbsolute).startsWith('/uploads/inbox/foto.jpg?e='));

  // não-inbox passa intacto
  assert.equal(
    signInboxMediaUrlIfLocal('/uploads/avatars/foto.jpg', { secret: SECRET }),
    '/uploads/avatars/foto.jpg',
  );
  assert.equal(signInboxMediaUrlIfLocal(null), null);
});

test('stripInboxMediaSignature devolve o path cru pra armazenamento', () => {
  assert.equal(
    stripInboxMediaSignature('/uploads/inbox/foto.jpg?e=1&s=abc'),
    '/uploads/inbox/foto.jpg',
  );
  assert.equal(
    stripInboxMediaSignature('https://api.hbxsystem.com.br/uploads/inbox/foto.jpg?e=1&s=abc'),
    '/uploads/inbox/foto.jpg',
  );
  // não-inbox intacto
  assert.equal(stripInboxMediaSignature('/uploads/avatars/foto.jpg'), '/uploads/avatars/foto.jpg');
  assert.equal(stripInboxMediaSignature(null), null);
  assert.equal(stripInboxMediaSignature(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Upload: extensão pelo MIME validado + magic bytes
// ---------------------------------------------------------------------------

test('extensão deriva do MIME validado, nunca do originalname', () => {
  assert.equal(inboxUploadExtensionForMime('image/png'), '.png');
  assert.equal(inboxUploadExtensionForMime('image/jpeg'), '.jpg');
  assert.equal(inboxUploadExtensionForMime('application/pdf'), '.pdf');
  assert.equal(inboxUploadExtensionForMime('audio/ogg'), '.ogg');
  assert.equal(inboxUploadExtensionForMime('audio/mpeg'), '.mp3');
  assert.equal(inboxUploadExtensionForMime('text/html'), '.bin');
  assert.equal(inboxUploadExtensionForMime(''), '.bin');
});

test('magic bytes batem pros tipos com assinatura estável', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
  const gif = Buffer.from('GIF89a....');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  const pdf = Buffer.from('%PDF-1.7 ...');
  const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')]);
  const ogg = Buffer.from('OggS....');
  const mp3Id3 = Buffer.from('ID3....');
  const mp3Frame = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const html = Buffer.from('<html><script>alert(1)</script>');

  assert.equal(matchesDeclaredMagicBytes('image/png', png), true);
  assert.equal(matchesDeclaredMagicBytes('image/jpeg', jpg), true);
  assert.equal(matchesDeclaredMagicBytes('image/gif', gif), true);
  assert.equal(matchesDeclaredMagicBytes('image/webp', webp), true);
  assert.equal(matchesDeclaredMagicBytes('application/pdf', pdf), true);
  assert.equal(matchesDeclaredMagicBytes('video/mp4', mp4), true);
  assert.equal(matchesDeclaredMagicBytes('audio/ogg', ogg), true);
  assert.equal(matchesDeclaredMagicBytes('audio/mpeg', mp3Id3), true);
  assert.equal(matchesDeclaredMagicBytes('audio/mp3', mp3Frame), true);

  // HTML mascarado de imagem/pdf/áudio NÃO passa
  assert.equal(matchesDeclaredMagicBytes('image/png', html), false);
  assert.equal(matchesDeclaredMagicBytes('image/jpeg', html), false);
  assert.equal(matchesDeclaredMagicBytes('application/pdf', html), false);
  assert.equal(matchesDeclaredMagicBytes('audio/ogg', html), false);
  assert.equal(matchesDeclaredMagicBytes('video/mp4', html), false);

  // tipo sem assinatura estável passa pela allowlist de MIME apenas
  assert.equal(matchesDeclaredMagicBytes('text/plain', html), true);
  assert.equal(matchesDeclaredMagicBytes('text/csv', Buffer.from('a,b,c')), true);

  // buffer vazio nunca passa
  assert.equal(matchesDeclaredMagicBytes('text/plain', Buffer.alloc(0)), false);
});

// ---------------------------------------------------------------------------
// Servir: content-type + inline × attachment
// ---------------------------------------------------------------------------

test('só imagem/áudio/vídeo permitidos renderizam inline; resto é attachment', () => {
  assert.deepEqual(resolveInboxMediaResponseType('foto.jpg'), {
    contentType: 'image/jpeg',
    inline: true,
  });
  assert.deepEqual(resolveInboxMediaResponseType('audio.ogg'), {
    contentType: 'audio/ogg',
    inline: true,
  });
  assert.deepEqual(resolveInboxMediaResponseType('video.mp4'), {
    contentType: 'video/mp4',
    inline: true,
  });
  // PDF NÃO renderiza inline (origem da API vira download, não documento ativo)
  assert.deepEqual(resolveInboxMediaResponseType('doc.pdf'), {
    contentType: 'application/pdf',
    inline: false,
  });
  assert.deepEqual(resolveInboxMediaResponseType('planilha.xlsx'), {
    contentType: 'application/octet-stream',
    inline: false,
  });
  assert.deepEqual(resolveInboxMediaResponseType('paginas.html'), {
    contentType: 'application/octet-stream',
    inline: false,
  });
  assert.deepEqual(resolveInboxMediaResponseType('sem-extensao'), {
    contentType: 'application/octet-stream',
    inline: false,
  });
});
