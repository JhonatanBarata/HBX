import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_CRED_SECRET_ENV,
  decryptCred,
  emailCredConfigured,
  encryptCred,
  sanitizeSmtpError,
} from './email-cred.util';
import { LeadEmailService } from './lead-email.service';

// Pinar env (host/worktree não tem .env garantido — ver MEMORY.md).
function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const SECRET = { [EMAIL_CRED_SECRET_ENV]: 'unit-test-email-cred-secret-32bytes-min' };

// ── Cifra: ida e volta, formato opaco, secret ausente = OFF. ──
test('cifra: encrypt/decrypt ida-e-volta com o secret presente', async () => {
  await withEnv(SECRET, () => {
    assert.equal(emailCredConfigured(), true);
    const plain = 'senha-de-app-abcd-1234';
    const enc = encryptCred(plain);
    assert.ok(enc && enc.startsWith('v1.'), 'formato v1.iv.tag.data');
    assert.notEqual(enc, plain, 'cifrado nunca é o texto puro');
    assert.equal(decryptCred(enc), plain, 'decifra volta ao original');
  });
});

test('cifra: vazio/nulo => null (campo não-configurado)', async () => {
  await withEnv(SECRET, () => {
    assert.equal(encryptCred(''), null);
    assert.equal(encryptCred(null), null);
    assert.equal(decryptCred(null), null);
    assert.equal(decryptCred(''), null);
  });
});

test('cifra: secret AUSENTE => feature OFF (sem crash)', async () => {
  await withEnv({ [EMAIL_CRED_SECRET_ENV]: undefined }, () => {
    assert.equal(emailCredConfigured(), false);
    // construir o service NÃO pode explodir (boot gracioso)
    const svc = new LeadEmailService({} as any);
    assert.equal(svc.enabled, false);
    assert.deepEqual(svc.status(), { ok: true, enabled: false });
  });
});

// ── Sanitização: a senha NUNCA vaza numa mensagem de erro. ──
test('sanitiza: remove a senha e a cifra opaca da mensagem de erro', () => {
  const pass = 'MinhaSenhaSecreta123';
  const raw = `535 auth failed for user contato@x.com with pass ${pass} (v1.AAAAAAAAAAAA.BBBBBBBBBBBB.CCCCCCCCCCCCDDDD)`;
  const safe = sanitizeSmtpError(new Error(raw), pass, 'contato@x.com');
  assert.equal(safe.includes(pass), false, 'senha não pode aparecer');
  assert.equal(/v1\.[A-Za-z0-9+/=]{8,}\./.test(safe), false, 'cifra opaca não pode aparecer');
  assert.ok(safe.includes('535'), 'mantém o resto do erro (honesto)');
});

// ── OFF gracioso: sem secret, send recusa sem tocar SMTP nem banco. ──
test('service OFF: send lança ServiceUnavailable sem tocar prisma', async () => {
  await withEnv({ [EMAIL_CRED_SECRET_ENV]: undefined }, async () => {
    let touched = false;
    const prisma: any = {
      emailAccount: { findUnique: async () => { touched = true; return null; } },
      emailMessage: { count: async () => { touched = true; return 0; } },
    };
    const svc = new LeadEmailService(prisma);
    await assert.rejects(
      () => svc.send(1, 2, { leadId: 'lead1', to: 'a@b.com', subject: 'oi', bodyText: 'texto' }),
      /não está disponível/i,
    );
    assert.equal(touched, false, 'OFF não consulta banco');
  });
});

// ── Rate limit: 30/h atingido => bloqueia ANTES de decifrar/enviar. ──
test('rate: >=30 na janela bloqueia sem decifrar credencial nem enviar', async () => {
  await withEnv(SECRET, async () => {
    let decrypted = false;
    const account = {
      id: 'acc1',
      companyId: 1,
      userId: 2,
      address: 'v@x.com',
      senderName: null,
      provider: 'gmail',
      smtpHost: 'smtp.x.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'v@x.com',
      // credencial marcada — se o fluxo tentar decifrar isso, o teste falha (formato inválido)
      get credentialsEnc() { decrypted = true; return 'NOT-A-REAL-CIPHER'; },
      status: 'connected',
      lastError: null,
      lastTestedAt: null,
    };
    let created = false;
    const prisma: any = {
      emailAccount: { findUnique: async () => account },
      emailMessage: {
        count: async () => 30,
        create: async () => { created = true; return {}; },
      },
    };
    const svc = new LeadEmailService(prisma);
    await assert.rejects(
      () => svc.send(1, 2, { leadId: 'lead1', to: 'a@b.com', subject: 'assunto', bodyText: 'corpo' }),
      /Limite de 30/,
    );
    assert.equal(decrypted, false, 'rate bloqueia ANTES de tocar a credencial');
    assert.equal(created, false, 'nada é gravado quando bloqueado');
  });
});

// ── Estado público NUNCA devolve a senha (nem cifrada). ──
test('getAccountState: expõe hasCredentials, NUNCA a senha/cifra', async () => {
  await withEnv(SECRET, async () => {
    const enc = encryptCred('senha-secreta');
    const prisma: any = {
      emailAccount: {
        findUnique: async () => ({
          id: 'acc1', companyId: 1, userId: 2, address: 'v@x.com', senderName: 'Vend',
          provider: 'gmail', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true,
          username: 'v@x.com', credentialsEnc: enc, status: 'connected', lastError: null,
          lastTestedAt: new Date(),
        }),
      },
    };
    const svc = new LeadEmailService(prisma);
    const state = await svc.getAccountState(1, 2);
    assert.equal(state.enabled, true);
    assert.equal(state.account?.hasCredentials, true);
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes('senha-secreta'), false, 'senha em claro nunca sai');
    assert.equal(serialized.includes(String(enc)), false, 'cifra nunca sai');
    assert.ok(state.presets.length > 0, 'traz os presets de provedor');
  });
});

// ── Validação de gravação: rejeita e-mail/host/porta ausentes; mantém senha. ──
test('saveAccount: rejeita e-mail inválido', async () => {
  await withEnv(SECRET, async () => {
    const prisma: any = { emailAccount: { findUnique: async () => null, upsert: async () => ({}) } };
    const svc = new LeadEmailService(prisma);
    await assert.rejects(
      () => svc.saveAccount(1, 2, { address: 'nao-eh-email', smtpHost: 'smtp.x.com', smtpPort: 465, password: 'p' }),
      /remetente válido/,
    );
  });
});

test('saveAccount: normaliza provider desconhecido para "outro" e cifra a senha', async () => {
  await withEnv(SECRET, async () => {
    let savedData: any = null;
    const prisma: any = {
      emailAccount: {
        findUnique: async () => null,
        upsert: async ({ create }: any) => { savedData = create; return { ...create, id: 'acc1' }; },
      },
    };
    const svc = new LeadEmailService(prisma);
    const pub = await svc.saveAccount(1, 2, {
      address: 'V@X.com', provider: 'provedor-inexistente', smtpHost: 'smtp.x.com',
      smtpPort: 587, smtpSecure: false, username: 'v@x.com', password: 'segredo123',
    });
    assert.equal(savedData.provider, 'outro', 'provider fora da whitelist vira outro');
    assert.equal(savedData.address, 'v@x.com', 'e-mail normalizado (lowercase)');
    assert.equal(savedData.status, 'draft', 'gravar sempre volta pra draft (exige testar)');
    assert.ok(savedData.credentialsEnc?.startsWith('v1.'), 'senha cifrada');
    assert.equal(decryptCred(savedData.credentialsEnc), 'segredo123', 'cifra guarda a senha certa');
    // estado público devolvido não carrega a cifra
    assert.equal((pub as any).credentialsEnc, undefined);
    assert.equal(pub.hasCredentials, true);
  });
});
