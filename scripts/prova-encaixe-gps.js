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
const { regenerarGerados } = require('./_regenerar');

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
  // 16/08 — os rótulos do rodapé mudaram junto com os verbos: `encerrar`/'Sair'
  // virou `panoramica`/'Panorâmica' e nasceu `encerrarDia`. A semente PRECISA
  // acompanhar: ela é injetada inteira em `usarDados('gps', …)` e vence o
  // default do template, então uma semente velha faria este portão medir a
  // geometria de um botão de 4 letras num slot que hoje carrega 12.
  registrar: 'Registrar', panoramica: 'Panorâmica', encerrarDia: 'Encerrar dia',
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
  /* os dois números que decidem onde a seta pousa, lidos da FOLHA e não
     digitados aqui: `--map-respiro` é o respiro do chão do cromo e
     `--gps-puck-sobe` é o quanto o ponteiro sobe acima dele (16/08). Régua que
     copia o número que ela deveria conferir não confere nada. */
  const tok = (nome) => {
    const gps = document.querySelector('.gps');
    if (!gps) return null;
    const v = parseFloat(getComputedStyle(gps).getPropertyValue(nome));
    return Number.isFinite(v) ? v : null;
  };
  return {
    altura: window.innerHeight,
    largura: window.innerWidth,
    respiro: tok('--map-respiro'),
    sobe: tok('--gps-puck-sobe'),
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
  /* 🔴 O GERADO PRIMEIRO (LOTE 1.4): esta prova abre `assets/app/**`, que é
     SAÍDA de `ponte-costurar`/`casca-injetar`. Sem regenerar, ela mede o
     gerado que estiver no disco — e um red-first feito na FONTE sai VERDE
     sobre código velho. Ver `scripts/_regenerar.js`. */
  regenerarGerados();
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
    /* 🔴 A FOLGA DEIXOU DE SER FAIXA E VIROU CONTA (16/08 — dono, com as duas
       fotos: *"visual amassado: foto1, eu quero assim: foto2"*). O alvo antigo
       (4..28px) era o "colado no bottom" de 09/08 virado régua — e era ele que
       amontoava seta, velocímetro e botão na mesma faixa do rodapé. Hoje a seta
       pousa no chão do cromo MAIS `--gps-puck-sobe`, e é isso que se cobra: o
       número tem que sair da FOLHA, senão a régua vira um segundo lugar onde a
       âncora mora — que é o defeito que este portão nasceu pra matar. */
    const alvoFolga = (m.respiro || 0) + (m.sobe || 0);
    diz(m.sobe > 0, `a folha declara a subida do ponteiro (--gps-puck-sobe = ${m.sobe}px)`);
    diz(Math.abs(folgaSeta - alvoFolga) <= 2,
      `a folga é o respiro + a subida do ponteiro (${folgaSeta}px × ${alvoFolga}px)`);

    const centro = (m.seta.left + m.seta.right) / 2;
    diz(Math.abs(centro - m.largura / 2) <= 1, `a seta está no centro da largura (${centro.toFixed(1)} × ${m.largura / 2})`);

    const folgaVel = +(teto - m.vel.bottom).toFixed(1);
    console.log(`  vel     y ${m.vel.top}..${m.vel.bottom}   folga ${folgaVel}px`);
    diz(folgaVel >= 0, `o velocímetro cabe inteiro acima do rodapé (folga ${folgaVel}px)`);

    console.log(`  botões  ${m.botoes.map((b) => `${b.rotulo} ${b.top}..${b.bottom}`).join(' · ')}`);
    /* 🔴 3 VIROU 4 EM 16/08: o cadeado do "Encerrar dia" desceu do rodapé pra
       cá (ordem do dono — o slot ao lado do polegar passou a ser do Registrar,
       que é o verbo de toda porta; encerrar o dia acontece uma vez). O número
       é CRAVADO de propósito: botão que entra ou sai desta coluna muda a altura
       dela e passa a disputar espaço com o cartão da manobra, então a conta tem
       que ser refeita à mão e não descoberta em produção. */
    diz(m.botoes.length === 4,
      `a coluna tem os 4 botões — chat, voz, encerrar dia, recentralizar (tem ${m.botoes.length})`);
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
