#!/usr/bin/env node
/**
 * PROVA DO ENCAIXE — a tela de dirigir, medida com régua.
 *
 *     node scripts/prova-encaixe-gps.js
 *
 * 🔴 POR QUE ELA EXISTE (dono, 11/08: *"seta cortada, eu quero esse encaixe"*).
 * O rodapé da tela de dirigir ganhou a linha dos atalhos em 10/08 e engordou
 * 41px. Ninguém percebeu porque CSS nenhum reclama: a seta, o velocímetro e a
 * coluna de botões continuaram ancorados em números escolhidos contra o rodapé
 * ANTIGO, e passaram a viver atrás dele. Medido no moto g15: a cauda da seta,
 * 40% do velocímetro e 57% do botão de baixo estavam escondidos.
 *
 * 🔴 E A RÉGUA TEM QUE SER EM VÁRIAS ALTURAS. A âncora da seta era a única
 * medida da tela em PORCENTAGEM (`top:86%`) contra um rodapé em PIXEL — então o
 * defeito dependia do tamanho do aparelho e sumia na moldura de 940px do mock
 * de mesa. Por isso aqui é a PELE (a que vai dentro do APK) em três telas.
 *
 * O que se mede: nada fica atrás do rodapé, a seta continua no centro da
 * largura, as peças das duas beiradas pousam na MESMA linha, a bússola não sobe
 * por cima do cartão da manobra, e a seta não PULA no quadro em que o dedo pega
 * o mapa (o estado `solta`, antes de a ponte projetar o ponto).
 */
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const APP = 'file:///' + path.join(raiz, 'EntregaShell/app/src/logistica/assets/app/index.html').replace(/\\/g, '/');

/* g15 = 432x960 CSS (1080x2400 @ dpr 2,5), que é o aparelho do dono. As outras
   duas são telas mais curtas — onde a âncora em porcentagem afundava mais. */
const TELAS = [
  { nome: 'g15   432x960', w: 432, h: 960 },
  { nome: 'médio 393x800', w: 393, h: 800 },
  { nome: 'curto 360x640', w: 360, h: 640 },
];

/* Dado de verdade nos campos que MUDAM a altura do cromo: sem a linha da parada
   o rodapé encolhe 22px e a prova mediria uma tela mais folgada que a real.
   🔴 E O NOME DO CLIENTE ENTRA NOS DOIS TAMANHOS. Ele é dado de cadastro, não
   tem teto, e a linha da parada é a única do rodapé que ele alcança: com um
   nome de razão social a linha quebrava em duas, o rodapé engordava 16px e a
   cauda da seta voltava pra trás dele. O caso longo é o que segura essa porta. */
const CROMO = {
  manobraIcone: 'turn-right', manobraDist: '60 m', manobraVerbo: 'Vire à direita',
  manobraRua: 'Avenida Nove Nv', manobraDepois: 'depois, vire à direita',
  rumo: 'NO', velocidade: '0', paradaN: '1', paradaTotal: '51', paradaNome: 'Ademir',
  chegada: '06:46', restante: '2 h 30', distancia: '80,7 km',
  registrar: 'Registrar', fechar: 'Fechamento', encerrar: 'Sair',
};
const NOMES = [
  { nome: 'nome curto', paradaNome: 'Ademir' },
  { nome: 'razão social', paradaNome: 'Supermercado Nossa Senhora Aparecida Ltda ME' },
];

const MEDIR = () => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1),
      left: +b.left.toFixed(1), right: +b.right.toFixed(1),
    };
  };
  return {
    altura: window.innerHeight,
    largura: window.innerWidth,
    rodape: r('.gps-rodape'),
    seta: r('.gps-seta'),
    vel: r('.gps-vel'),
    lado: r('.gps-lado'),
    bussola: r('.gps-bussola'),
    manobra: r('.gps-manobra'),
    botoes: Array.from(document.querySelectorAll('.gps-lado button')).map((el) => {
      const b = el.getBoundingClientRect();
      return { rotulo: el.getAttribute('aria-label'), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1) };
    }),
  };
};

(async () => {
  const browser = await chromium.launch();
  let falhas = 0;
  const diz = (ok, txt) => { if (!ok) falhas += 1; console.log(`${ok ? '  ok  ' : ' FALHA'} ${txt}`); };

  const casos = [];
  for (const t of TELAS) for (const n of NOMES) casos.push({ ...t, ...n, nome: `${t.nome} · ${n.nome}` });

  for (const t of casos) {
    const ctx = await browser.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(APP);
    await p.waitForTimeout(400);

    /* A tela TROCA de camada na transição, e medir no meio dela mede a camada
       que está SAINDO (a régua deu rodapé fora do viewport na 1ª tentativa). */
    await p.evaluate(() => window.ir('mapa'));
    await p.waitForFunction(
      () => !document.querySelector('#app .tela.sai') && !!document.querySelector('#app .tela .gps-rodape'),
      null, { timeout: 8000 },
    );
    await p.waitForTimeout(500);
    await p.evaluate((c) => window.usarDados('gps', c), { ...CROMO, paradaNome: t.paradaNome });
    await p.waitForTimeout(400);

    const m = await p.evaluate(MEDIR);
    console.log(`\n=== ${t.nome} (viewport ${m.largura}x${m.altura}) ===`);
    if (erros.length) diz(false, `erro de página: ${erros[0]}`);
    if (!m.rodape || !m.seta) {
      diz(false, 'a tela de dirigir não montou (sem rodapé ou sem seta)');
      await ctx.close();
      continue;
    }

    const teto = m.rodape.top;
    console.log(`  rodapé y=${teto} (altura ${(m.altura - teto).toFixed(1)}px)`);

    const folgaSeta = +(teto - m.seta.bottom).toFixed(1);
    console.log(`  seta    y ${m.seta.top}..${m.seta.bottom}   folga ${folgaSeta}px`);
    diz(folgaSeta >= 0, `a seta cabe INTEIRA acima do rodapé (folga ${folgaSeta}px)`);
    diz(folgaSeta >= 4 && folgaSeta <= 28, `a folga é de encaixe, não de sobra (${folgaSeta}px, alvo 4..28)`);

    const centro = (m.seta.left + m.seta.right) / 2;
    diz(Math.abs(centro - m.largura / 2) <= 1, `a seta está no centro da largura (${centro.toFixed(1)} × ${m.largura / 2})`);

    const folgaVel = +(teto - m.vel.bottom).toFixed(1);
    console.log(`  vel     y ${m.vel.top}..${m.vel.bottom}   folga ${folgaVel}px`);
    diz(folgaVel >= 0, `o velocímetro cabe inteiro acima do rodapé (folga ${folgaVel}px)`);

    console.log(`  botões  ${m.botoes.map((b) => `${b.rotulo} ${b.top}..${b.bottom}`).join(' · ')}`);
    diz(m.botoes.length === 3, `a coluna tem os 3 botões — chat, voz, recentralizar (tem ${m.botoes.length})`);
    diz(m.botoes.some((b) => /chat/i.test(b.rotulo || '')), 'o botão de chat existe na beirada');
    const maisBaixo = m.botoes.length ? Math.max(...m.botoes.map((b) => b.bottom)) : 0;
    diz(teto - maisBaixo >= 0, `nenhum botão fica atrás do rodapé (folga ${(teto - maisBaixo).toFixed(1)}px)`);
    diz(Math.abs(m.vel.bottom - m.lado.bottom) <= 0.5, 'as duas beiradas pousam na MESMA linha');

    if (m.bussola && m.manobra) {
      const folgaB = +(m.bussola.top - m.manobra.bottom).toFixed(1);
      console.log(`  bússola y ${m.bussola.top} · manobra termina em ${m.manobra.bottom} (folga ${folgaB}px)`);
      diz(folgaB >= 0, `a bússola não sobe por cima do cartão da manobra (folga ${folgaB}px)`);
    }

    /* `marcarSolta` liga a classe ANTES de a ponte escrever --px/--py: existe um
       quadro de verdade usando o valor padrão, e um número velho ali faz a seta
       pular toda vez que o dedo encosta no mapa. */
    const solta = await p.evaluate(() => {
      const gps = document.querySelector('.gps');
      gps.classList.add('solta');
      const b = document.querySelector('.gps-seta').getBoundingClientRect();
      gps.classList.remove('solta');
      return +b.top.toFixed(1);
    });
    const pulo = +Math.abs(solta - m.seta.top).toFixed(1);
    console.log(`  solta (sem --py): seta y ${solta} → pulo ${pulo}px`);
    diz(pulo <= 1, `a seta não PULA no quadro em que o dedo pega o mapa (${pulo}px)`);

    await ctx.close();
  }

  await browser.close();
  console.log(falhas ? `\n❌ ${falhas} falha(s)` : '\n✅ encaixe provado nas 3 alturas');
  process.exit(falhas ? 1 : 0);
})();
