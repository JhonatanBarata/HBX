#!/usr/bin/env node
/**
 * PROVA DA VOZ NATIVA NA BUSCA AVULSA — F3 do PR12082026.
 *
 * Mede o contrato inteiro: Android SpeechRecognizer -> ponte nativa -> mesmo
 * caminho do teclado no C5. A página dirigida é a que entra no APK.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { regenerarGerados } = require('./_regenerar');

const raiz = path.join(__dirname, '..');
const appDir = path.join(raiz, 'EntregaShell/app/src/logistica/assets/app');
const appUrl = 'file:///' + path.join(appDir, 'index.html').split(path.sep).join('/');
const arquivo = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const kotlinBridge = arquivo('EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeAppBridge.kt');
const activity = arquivo('EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/MainActivity.kt');
const manifest = arquivo('EntregaShell/app/src/main/AndroidManifest.xml');
const nativeJs = arquivo('EntregaShell/app/src/main/assets/app/native.js');
const c5 = arquivo('EntregaShell/app/src/logistica/ponte-src/C5-busca-painel.js');
const mock = arquivo('docs/mockups/logistica2.0/logistica-2.0.html');

const falhas = [];
const ok = [];
async function medir(nome, fn) {
  try {
    const detalhe = await fn();
    if (detalhe === false) throw new Error('condição não atendida');
    ok.push(nome);
    console.log(`✓ ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e && e.message ? e.message : e}`);
    console.log(`✗ ${nome}: ${e && e.message ? e.message : e}`);
  }
}

function contem(texto, regra, nome) {
  if (!regra.test(texto)) throw new Error(nome);
}

async function pagina(comReconhecedor) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 432, height: 871 } });
  await page.addInitScript(({ disponivel }) => {
    window.__voz = { disponivel, pedidos: 0, api: [] };
    window.HBXAndroid = {
      speechRecognitionAvailable() { return window.__voz.disponivel; },
      requestSpeechRecognition() { window.__voz.pedidos += 1; },
      appInfo() { return JSON.stringify({ mode: 'logistica', platform: 'android' }); },
      request(id, method, caminho) {
        window.__voz.api.push(String(caminho));
        let corpo = {};
        if (String(caminho).startsWith('/logistica/busca?')) {
          corpo = {
            escopo: { codMunicipio: '3543907', cidade: 'rio claro', uf: 'SP' },
            grupos: { clientes: [], enderecos: [], comercios: [] },
          };
        }
        setTimeout(() => window.HBXNative && window.HBXNative._resolve(JSON.stringify({
          id, status: 200, body: JSON.stringify(corpo), error: null,
        })), 0);
      },
    };
  }, { disponivel: comReconhecedor });
  await page.goto(appUrl);
  await page.waitForFunction(() => typeof window.ir === 'function' && typeof DADOS !== 'undefined' && DADOS.rapida);
  await page.evaluate(() => window.ir('rapida'));
  await page.waitForSelector('[data-acao="rapida-porta"][data-porta="endereco"]');
  await page.click('[data-acao="rapida-porta"][data-porta="endereco"]');
  await page.waitForTimeout(80);
  return { browser, page };
}

(async () => {
  regenerarGerados();
  await medir('Android declara RECORD_AUDIO sem pedir no boot', () => {
    contem(manifest, /android\.permission\.RECORD_AUDIO/, 'RECORD_AUDIO ausente no Manifest');
    contem(activity, /Manifest\.permission\.RECORD_AUDIO/, 'MainActivity não controla RECORD_AUDIO');
    contem(activity, /ActivityResultContracts\.RequestPermission\(\)/, 'launcher unitário de áudio ausente');
    if (/onCreate[\s\S]{0,3000}\.launch\(Manifest\.permission\.RECORD_AUDIO\)/.test(activity)) {
      throw new Error('a permissão está sendo pedida no boot');
    }
  });

  await medir('Android mede e executa o SpeechRecognizer nativo', () => {
    contem(activity + kotlinBridge, /SpeechRecognizer\.isRecognitionAvailable/, 'capacidade nativa não é medida');
    contem(activity + kotlinBridge, /create(?:OnDevice)?SpeechRecognizer/, 'SpeechRecognizer não é criado');
    contem(activity + kotlinBridge, /RecognitionListener/, 'callback nativo de reconhecimento ausente');
    if (/webkitSpeechRecognition|window\.SpeechRecognition/.test(nativeJs + c5)) {
      throw new Error('Web Speech API proibida apareceu no JavaScript');
    }
  });

  await medir('ponte prova os dois lados: capacidade, toque e callbacks', () => {
    contem(kotlinBridge, /@JavascriptInterface[\s\S]{0,120}fun speechRecognitionAvailable\(/, 'capacidade não exposta pelo Kotlin');
    contem(kotlinBridge, /@JavascriptInterface[\s\S]{0,120}fun requestSpeechRecognition\(/, 'toque não exposto pelo Kotlin');
    contem(nativeJs, /speechRecognitionAvailable/, 'native.js não mede a capacidade');
    contem(nativeJs, /requestSpeechRecognition/, 'native.js não chama o toque nativo');
    contem(c5, /speechRecognitionResult/, 'C5 não recebe o texto nativo');
    contem(c5, /speechPermissionChanged/, 'C5 não recebe a mudança de permissão');
  });

  await medir('mic não nasce sem reconhecedor nativo', async () => {
    const { browser, page } = await pagina(false);
    try {
      const n = await page.locator('[data-acao="busca-voz"]').count();
      if (n !== 0) throw new Error(`nasceram ${n} microfones`);
    } finally { await browser.close(); }
  });

  await medir('toque pede áudio; recusa avisa e concessão posterior rearma', async () => {
    const { browser, page } = await pagina(true);
    try {
      const mic = page.locator('[data-acao="busca-voz"]');
      await mic.waitFor();
      await mic.click();
      if (await page.evaluate(() => window.__voz.pedidos) !== 1) throw new Error('toque não chegou ao Android');
      await page.evaluate(() => window.HBXApp.speechPermissionChanged(false));
      const aviso = await page.locator('.banner.alerta').textContent();
      if (!/microfone|permiss/i.test(aviso || '')) throw new Error(`aviso desonesto: ${aviso || '(vazio)'}`);
      await page.evaluate(() => window.HBXApp.speechPermissionChanged(true));
      await page.locator('[data-acao="busca-voz"]').click();
      if (await page.evaluate(() => window.__voz.pedidos) !== 2) throw new Error('não rearmou sem recarregar');
    } finally { await browser.close(); }
  });

  await medir('texto da voz usa a mesma função do teclado e dispara a mesma busca', async () => {
    contem(c5, /function usarTextoDaBusca\(/, 'função única usarTextoDaBusca não existe');
    const usos = c5.match(/usarTextoDaBusca\(/g) || [];
    if (usos.length < 3) throw new Error('teclado e voz não convergem na mesma função');
    const { browser, page } = await pagina(true);
    try {
      const campo = page.locator('[data-campo="rapida-busca"]');
      await campo.fill('bar do ze');
      await page.waitForTimeout(330);
      const teclado = await page.evaluate(() => window.__voz.api.filter((x) => x.startsWith('/logistica/busca?')).at(-1));
      await page.evaluate(() => { window.__voz.api = []; window.HBXApp.speechRecognitionResult('rua 8'); });
      await page.waitForTimeout(330);
      const voz = await campo.inputValue();
      const chamada = await page.evaluate(() => window.__voz.api.filter((x) => x.startsWith('/logistica/busca?')).at(-1));
      if (!/bar%20do%20ze/.test(teclado || '')) throw new Error(`teclado não buscou: ${teclado}`);
      if (voz !== 'rua 8' || !/rua%208/.test(chamada || '')) throw new Error(`voz=${voz}, chamada=${chamada}`);
    } finally { await browser.close(); }
  });

  await medir('fala vazia e erro não apagam o que já estava digitado', async () => {
    const { browser, page } = await pagina(true);
    try {
      const campo = page.locator('[data-campo="rapida-busca"]');
      await campo.fill('Rua 8, 1181');
      await page.evaluate(() => window.HBXApp.speechRecognitionResult('   '));
      await page.evaluate(() => window.HBXApp.speechRecognitionError('Não consegui entender.'));
      if (await campo.inputValue() !== 'Rua 8, 1181') throw new Error('o texto anterior foi apagado');
    } finally { await browser.close(); }
  });

  await medir('estado ouvindo sobrevive ao repinte e pulso reinicia invisível', async () => {
    contem(mock, /@keyframes\s+avbPulsoVoz\s*\{\s*0%,100%\s*\{/, 'pulso não tem from==to');
    contem(mock, /\.tela\.entra[\s\S]{0,180}avb|entrada[^\n]*\.entra/i, 'regra de entrada não cita .entra');
    const { browser, page } = await pagina(true);
    try {
      await page.evaluate(() => window.HBXApp.speechRecognitionListening());
      if (!(await page.locator('[data-acao="busca-voz"]').evaluate((el) => el.classList.contains('ouvindo')))) {
        throw new Error('mic não acendeu');
      }
      await page.evaluate(() => window.usarDados('rapida', { semNada: 1 }));
      if (!(await page.locator('[data-acao="busca-voz"]').evaluate((el) => el.classList.contains('ouvindo')))) {
        throw new Error('repinte matou o pulso');
      }
      if (!(await page.locator('.avb-veu-voz').evaluate((el) => el.classList.contains('vivo')))) {
        throw new Error('repinte matou o véu');
      }
    } finally { await browser.close(); }
  });

  console.log(`\n${ok.length} provas verdes; ${falhas.length} falhas.`);
  if (falhas.length) {
    falhas.forEach((f) => console.log(`- ${f}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
