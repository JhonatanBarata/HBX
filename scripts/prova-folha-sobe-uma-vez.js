#!/usr/bin/env node
/**
 * PROVA DA FOLHA QUE SUBIA DE NOVO (12/08) — trocar a forma de pagamento
 * reencenava a entrada do bottom sheet.
 *
 *     node scripts/prova-folha-sobe-uma-vez.js
 *     node scripts/prova-folha-sobe-uma-vez.js --antes    (só MEDE, não reprova)
 *
 * Cena do dono: na Folha da venda, alternar Dinheiro/Pix/Cartão/Marcar e "a tela
 * fica subindo novamente". A raiz não é o botão: é a FOLHA. Cada toque chama
 * `repintarFolha()` → `usarDados('venda', …)` → `pintar()` monta uma CAMADA NOVA,
 * e a regra da folha (`.tela .sheet`) não estava presa à marca `entra` — então o
 * `.sheet` recém-nascido tocava `mvFolha` (translateY(100%) → 0) do quadro ZERO
 * a cada escrita. Mesma família do pisca de 08/08 e do cancelar de 11/08: a cura
 * de lá foi "camada nova nasce PARADA", e ela não tinha alcançado a folha.
 *
 * Mede no MOCK (a fonte do `pintar()` e da folha), e `casca-conferir` já prova
 * mock ≡ casca byte a byte.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'docs/mockups/logistica2.0/logistica-2.0.html')
  .replace(/\\/g, '/');

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, det) => (cond ? ok : falhou).push(nome + (cond ? '' : `  [${det}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

/* A régua: o que a PESSOA vê. `transform` do sheet resolvido (folha no lugar =
   'none' ou matriz sem deslocamento em Y) e a opacidade do scrim, mais as
   animações de entrada da folha VIVAS na camada da vez (a última — mesma lei do
   pintar). Animação com `both` fica na lista depois de terminar: o que separa
   "tocando de novo" de "parada" é o playState + o relógio. */
const MEDIR = `(() => {
  const c = [...document.querySelectorAll('#app .tela')].pop();
  const sh = c && c.querySelector('.sheet');
  const sc = c && c.querySelector('.scrim');
  const vivas = (n) => (c && c.getAnimations ? c.getAnimations({ subtree: true }) : [])
    .filter((a) => a.animationName === n && a.playState === 'running')
    .map((a) => Math.round(Number(a.currentTime) || 0));
  const ty = (el) => {
    if (!el) return null;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\\(([^)]+)\\)/);
    return m ? Math.round(Number(m[1].split(',')[5]) || 0) : 0;
  };
  return {
    classes: c ? c.className : '(sem camada)',
    sheetY: ty(sh),
    scrimOp: sc ? Number(getComputedStyle(sc).opacity) : null,
    folha: vivas('mvFolha'),
    scrim: vivas('mvScrim'),
    rolagem: sh ? Math.round(sh.scrollTop) : null,
  };
})()`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  await p.goto(APP);
  // a abertura anda sozinha; medir camada antes de ela sair é medir a abertura
  await p.waitForTimeout(4200);

  for (const tela of ['venda', 'folha']) {
    /* 1 — a ENTRADA continua existindo. É o que a cura não pode custar: a folha
       tem que subir de baixo quando o motorista ABRE a parada. Medida no
       nascimento da camada, não depois. */
    const nasce = await p.evaluate(([t, M]) => {
      window.ir('rota');
      return new Promise((fim) => setTimeout(() => {
        window.ir(t);
        setTimeout(() => fim(eval(M)), 60);
      }, 900));
    }, [tela, MEDIR]);
    nota(`[${tela}] ao ABRIR: y=${nasce.sheetY}px · mvFolha=${JSON.stringify(nasce.folha)} · classes=${nasce.classes}`);
    eh(`F1 · ${tela}: abrir a parada faz a folha SUBIR (a entrada sobrevive)`,
      nasce.folha.length >= 1 && nasce.sheetY > 40, JSON.stringify(nasce));

    // deixa a entrada terminar e a camada de saída morrer: é o estado em que o
    // motorista está quando escolhe como o cliente pagou.
    await p.waitForTimeout(1400);

    /* 2 — O BUG. Trocar a forma é exatamente `repintarFolha()`: uma escrita no
       seam. Mede 60 ms depois — se a folha reencenar, ela está lá embaixo. */
    const trocou = await p.evaluate(([t, M]) => new Promise((fim) => {
      const alvo = [...document.querySelectorAll('#app .tela')].pop().querySelector('.sheet');
      if (alvo) alvo.scrollTop = 120;          // dedo já rolou até a forma de pagamento
      /* LÊ DE VOLTA, nunca assume: `scrollTop` é APARADO pelo que sobra de
         conteúdo, e nesta viewport a folha da venda nem sempre transborda.
         Cravar 120 no teste faria a prova reprovar a folha que rolou tudo o que
         tinha — medida de teste que mente é pior que teste nenhum. */
      const antes = alvo ? Math.round(alvo.scrollTop) : null;
      window.usarDados(t, { forma: 'pix' });
      setTimeout(() => fim(Object.assign(eval(M), { antes })), 60);
    }), [tela, MEDIR]);
    nota(`[${tela}] ao TROCAR a forma: y=${trocou.sheetY}px · scrim=${trocou.scrimOp} · mvFolha=${JSON.stringify(trocou.folha)} · rolagem=${trocou.antes}→${trocou.rolagem}`);
    eh(`F2 · ${tela}: trocar a forma NAO faz a folha subir de novo`,
      trocou.folha.length === 0 && trocou.sheetY === 0, JSON.stringify(trocou));
    eh(`F3 · ${tela}: trocar a forma NAO reacende o fundo escuro`,
      trocou.scrim.length === 0 && trocou.scrimOp === 1, JSON.stringify(trocou));
    eh(`F4 · ${tela}: a rolagem da folha sobrevive a troca`,
      trocou.rolagem === trocou.antes, `scrollTop ${trocou.antes} -> ${trocou.rolagem}`);

    /* 3 — não é só a primeira: o dono alterna os quatro botões. */
    const denovo = await p.evaluate(([t, M]) => new Promise((fim) => {
      window.usarDados(t, { forma: 'cartao' });
      setTimeout(() => fim(eval(M)), 60);
    }), [tela, MEDIR]);
    eh(`F5 · ${tela}: a 2a troca tambem nasce parada`,
      denovo.folha.length === 0 && denovo.sheetY === 0, JSON.stringify(denovo));
  }

  /* 4 — o repinte que chega NO MEIO da entrada continua herdando o relógio: é a
     lei de 08/08, e reprová-la aqui seria trocar um pisca por outro. */
  await p.evaluate(() => window.ir('rota'));
  await p.waitForTimeout(900);
  const dentro = await p.evaluate((M) => new Promise((fim) => {
    window.ir('venda');
    setTimeout(() => {
      window.usarDados('venda', { forma: 'dinheiro' });
      setTimeout(() => fim(eval(M)), 60);
    }, 140);
  }), MEDIR);
  nota(`[dentro] repinte aos 140ms da entrada: y=${dentro.sheetY}px · mvFolha=${JSON.stringify(dentro.folha)} · classes=${dentro.classes}`);
  eh('F6 · repinte DENTRO da entrada herda e CONTINUA a subida (nao zera)',
    dentro.folha.length >= 1 && Math.max(...dentro.folha, 0) >= 120, JSON.stringify(dentro));

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: a folha sobe UMA vez ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();
