#!/usr/bin/env node
/**
 * PROVA DO TUTORIAL GUIADO — o fiscal da LIÇÃO, que nenhum portão media.
 *
 *     node scripts/prova-tutorial.js
 *     HBX_MOCK=<caminho> node scripts/prova-tutorial.js   (red-first no mock velho)
 *
 * Abre o MOCK direto (`docs/mockups/logistica2.0/logistica-2.0.html`): o motor
 * do tour (`TUTOR`, `CAPITULOS`, `AULAS`, `tourRepintar`) mora nele, e é dele
 * que o `casca-injetar` faz o `mock.js` do aparelho. Sem ponte, sem rede.
 *
 * 🔴 POR QUE ELE NASCEU (dono, 17/08, depois de percorrer o tutorial no g15):
 * *"veja tela por tela, e corrija toda essa feiura q está, erro de contraste,
 * travado, bugado"*. Seis defeitos MEDIDOS no aparelho, e nenhum deles tinha
 * régua — o `casca-prova` mede TELAS, e o tour não é tela: é uma camada que
 * nasce de um toque, por cima de qualquer uma delas. Mesma cegueira que deixou
 * o "Sim" do portão em 1,96:1 até 15/08.
 *
 * As seis réguas, na ordem em que o dono viu o estrago:
 *
 *  1. O FORA CONTINUA LEGÍVEL. O véu era `rgba(3,7,14,.8)` numa casa que já é
 *     noite: o texto do app atrás caía pra 1,58:1 — não é véu, é APAGADOR, e a
 *     lição passava a apontar pro nada. Régua de dois lados, porque véu que não
 *     escurece também não é véu: o texto de fora fica entre 3:1 e 8:1.
 *  2. O FURO NÃO VAZA A CAMADA. Alvo colado na borda (o dock do pé, 410 numa
 *     camada de 432) dava `left:-6 / right:438` e o anel saía cortado dos dois
 *     lados.
 *  3. A BARRA NÃO PASSA POR BAIXO DO X. Eram duas peças no mesmo canto.
 *  4. O PASSO `fazer` NÃO TEM RODAPÉ VAZIO. Sem "Próximo" (quem anda é o dedo
 *     no botão de verdade), sobrava meia caixa em branco e o cliente parava.
 *  5. O CONTADOR NÃO MENTE. Passo pulado saía do índice mas ficava no TOTAL:
 *     "1 de 5" → "4 de 5" num toque; o capítulo do Chat abria em "2 de 2".
 *  6. TELA CARREGANDO NÃO MATA PASSO. O tour media o alvo no mesmo quadro da
 *     troca de tela, antes do seam trazer o dado, e a lição morria.
 *
 * E uma sétima, de conteúdo, que é a mesma doença dos créditos de 12/08:
 *  7. TODO CAPÍTULO DO CATÁLOGO TEM PASSO. `entregar` apontava pra `AULAS.folha`
 *     — que não existia. A lição de ENTREGAR, num app de entrega, era derrubada
 *     calada por `capitulosDoCatalogo`.
 *
 * Sai 1 se qualquer régua reprovar.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const MOCK = process.env.HBX_MOCK || path.join(raiz, 'docs/mockups/logistica2.0/logistica-2.0.html');
const urlDe = (p) => 'file:///' + p.split(path.sep).join('/');

let ok = 0;
let mau = 0;
const falhas = [];
const eq = (nome, real, esperado) => {
  const bom = real === esperado;
  bom ? ok++ : (mau++, falhas.push(`${nome}: ${real} (esperado ${esperado})`));
  console.log(`  ${bom ? '✓' : '✗'} ${nome} — ${real}`);
};
const faixa = (nome, real, min, max) => {
  const n = Number(real);
  const bom = Number.isFinite(n) && n >= min && n <= max;
  bom ? ok++ : (mau++, falhas.push(`${nome}: ${real} (esperado entre ${min} e ${max})`));
  console.log(`  ${bom ? '✓' : '✗'} ${nome} — ${real} (piso ${min}, teto ${max})`);
};
const naoMenos = (nome, real, min) => faixa(nome, real, min, Number.POSITIVE_INFINITY);

// ---------------------------------------------------------------- utilidades
// Injetadas na página: WCAG com composição de alpha (fundo translúcido não é
// cor final, é MISTURA com o que está atrás — mesma conta da prova dos diálogos).
const FERRAMENTAS = `
window.__hbx = (() => {
  const par = s => { const m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null;
    const n=m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);
    return {r:n[0],g:n[1],b:n[2],a:n.length>3?n[3]:1}; };
  const lin = v => { v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
  const lum = c => .2126*lin(c.r)+.7152*lin(c.g)+.0722*lin(c.b);
  const comp = (f,b) => ({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
  const razao = (a,b) => { const x=lum(a), y=lum(b);
    return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100; };
  /* 🔴 UM FUNDO PODE SER GRADIENTE, E GRADIENTE NÃO TEM backgroundColor
     (mesma régua da prova dos diálogos). Ler só a cor sólida fez este fiscal
     ATRAVESSAR o papel do modo claro — que nesta casa é pintado com
     linear-gradient — e cair no fundo escuro da moldura do visualizador lá
     atrás: tinta escura contra fundo escuro, 1,08:1, reprovando uma tela que
     na foto do g15 está perfeitamente legível. Quem tem gradiente devolve
     TODAS as paradas e quem julga usa a PIOR. */
  function paradas(el){ const cs=getComputedStyle(el), img=cs.backgroundImage;
    if(img&&img!=='none'&&img.indexOf('gradient')>=0){
      const cores=img.match(/rgba?\\([^)]+\\)/g);
      if(cores&&cores.length) return cores.map(par).filter(Boolean); }
    const bg=par(cs.backgroundColor);
    return (bg&&bg.a>0)?[bg]:[]; }
  function fundos(el){ const camadas=[]; let n=el;
    while(n){ const ps=paradas(n);
      if(ps.length){ camadas.push(ps); if(ps.every(p=>p.a>=.999)) break; }
      n=n.parentElement; }
    let acc=[{r:255,g:255,b:255,a:1}];   // papel, se nada opaco aparecer
    for(let i=camadas.length-1;i>=0;i--){ const prox=[];
      for(const base of acc) for(const p of camadas[i]) prox.push(comp(p,base));
      acc=prox; }
    return acc; }
  const fundo = el => fundos(el)[0];
  const tinta = el => { const f=par(getComputedStyle(el).color); if(!f) return null;
    return f.a<1?comp(f,fundo(el)):f; };
  /** A PIOR razão do texto de \`el\` contra todos os fundos possíveis dele. */
  const razaoDe = (el,veu) => { const f=par(getComputedStyle(el).color); if(!f) return 0;
    return fundos(el).reduce((pior,b)=>{
      const t=f.a<1?comp(f,b):f;
      const T=veu?comp(veu,t):t, B=veu?comp(veu,b):b;
      return Math.min(pior, razao(T,B)); }, Infinity); };
  return { par, lum, comp, razao, fundo, fundos, tinta, razaoDe };
})();
`;

/** O véu do furo: a cor com alpha que o `box-shadow: 0 0 0 9999px` derrama. */
const VEU_DO_FURO = `(() => {
  const f = document.querySelector('.aula-wrap .aula-furo');
  const sombras = getComputedStyle(f).boxShadow;
  // a camada de 9999px é a que cobre a tela inteira
  const m = sombras.match(/rgba?\\([^)]+\\)[^,]*9999px[^,]*/);
  return m ? (m[0].match(/rgba?\\([^)]+\\)/)||[null])[0] : null;
})()`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('PROVA DO TUTORIAL — ' + MOCK.replace(raiz + path.sep, ''));
  if (!fs.existsSync(MOCK)) { console.error('mock não encontrado'); process.exit(2); }

  const nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 432, height: 871 } });
  const gritos = [];
  pag.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') gritos.push(m.text()); });
  await pag.goto(urlDe(MOCK));
  await pag.waitForFunction('typeof window.TUTOR === "object"');
  await pag.addScriptTag({ content: FERRAMENTAS });

  // ============================================================ 7) CATÁLOGO
  console.log('\n=== 7) TODO CAPÍTULO DO CATÁLOGO TEM PASSO ===');
  const cat = await pag.evaluate('capitulosDoCatalogo().map(x=>x[0])');
  eq('"entregar" (a lição de entregar) está no catálogo', cat.includes('entregar'), true);
  eq('nenhum capítulo caiu por falta de passo',
    gritos.filter((g) => g.includes('sem passo, fora do catálogo')).length, 0);
  const semPasso = await pag.evaluate(
    `CATALOGO.filter(id=>CAPITULOS[id] && !passosDoCapitulo(CAPITULOS[id]).length)`);
  eq('capítulos vazios', JSON.stringify(semPasso), '[]');

  // ==================================================== 1,2,3,4) O DESENHO
  // Um passo de verdade, no alvo que ENCOSTA nas bordas (o dock do pé da
  // Montagem) — é ele que fabricava o anel cortado.
  for (const luz of ['escuro', 'claro']) {
    console.log(`\n=== O DESENHO DO PASSO — modo ${luz} ===`);
    await pag.evaluate(`(async()=>{
      trocarLuz('${luz}'); tourEncerrar(); TOUR.volta=null;
      /* O mock nasce com a rota RODANDO, e rota viva rebaixa \`fazer\` pra
         \`mostrar\` (lei de 09/08 — lição não pede o dedo em botão que move
         dinheiro). O passo \`fazer\` só existe pra medir com o dia parado. */
      estadoRota='montar';
      ir('montagem'); await new Promise(r=>setTimeout(r,260));
      TOUR.id='teste'; TOUR.cap={titulo:'teste'}; TOUR.obrig=false; TOUR.i=0;
      TOUR.passos=[{tela:'montagem',alvo:'.tmx-dock,.acts',tipo:'mostrar',titulo:'Salvar ou começar',texto:'Duas saídas.'},
                   {tela:'montagem',alvo:'.tmx-dock,.acts',tipo:'fazer',titulo:'Toque',texto:'Agora é com você.'}];
      tourRepintar(); await new Promise(r=>setTimeout(r,700));
    })()`);

    // 1) O FORA CONTINUA LEGÍVEL — mede o texto do app atrás do véu.
    const forasLeg = await pag.evaluate(`(() => {
      const veu = window.__hbx.par(${VEU_DO_FURO});
      const cam = camadaViva();
      const alvo = [...cam.querySelectorAll('h2,.box-t,.stop b,.linha-cfg strong,.vazio b')]
        .find(e => (e.textContent||'').trim() && e.getBoundingClientRect().height > 6);
      if(!alvo || !veu) return null;
      return window.__hbx.razaoDe(alvo, veu);
    })()`);
    faixa(`texto do app ATRÁS do véu continua legível (${luz})`, forasLeg, 3, 8);

    // 2) O FURO NÃO VAZA
    const vaza = await pag.evaluate(`(() => {
      const cam = camadaViva(), c = cam.getBoundingClientRect();
      const f = cam.querySelector('.aula-furo').getBoundingClientRect();
      return { l: Math.round(f.left-c.left), t: Math.round(f.top-c.top),
               r: Math.round(f.right-c.left), b: Math.round(f.bottom-c.top),
               larg: Math.round(c.width), alt: Math.round(c.height) };
    })()`);
    eq(`furo dentro da camada (${luz}) [${vaza.l},${vaza.t}→${vaza.r},${vaza.b} em ${vaza.larg}×${vaza.alt}]`,
      vaza.l >= 0 && vaza.t >= 0 && vaza.r <= vaza.larg && vaza.b <= vaza.alt, true);

    // 3) A BARRA NÃO PASSA POR BAIXO DO X
    const cruza = await pag.evaluate(`(() => {
      const cx = camadaViva().querySelector('.aula-cx');
      const p = cx.querySelector('.aula-prog'), x = cx.querySelector('.fechar');
      if(!p || !x) return null;
      const a = p.getBoundingClientRect(), b = x.getBoundingClientRect();
      const cruzou = !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
      return { cruzou, barra: Math.round(a.top)+'..'+Math.round(a.bottom), x: Math.round(b.top)+'..'+Math.round(b.bottom) };
    })()`);
    eq(`barra de progresso × X não se sobrepõem (${luz}) [barra ${cruza.barra} · x ${cruza.x}]`, cruza.cruzou, false);

    // contraste de TODO texto do balão
    const tintas = await pag.evaluate(`(() => {
      const cx = camadaViva().querySelector('.aula-cx');
      return [...cx.querySelectorAll('b,.txt,.conta,.dedo,button')].map(el => {
        const cs = getComputedStyle(el);
        const gr = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight,10) >= 700);
        return { q: (el.className||el.tagName).toString().trim(), txt: (el.textContent||'').trim().slice(0,20),
                 razao: window.__hbx.razaoDe(el), piso: gr ? 3 : 4.5 };
      }).filter(t => t.txt);
    })()`);
    for (const t of tintas) naoMenos(`  balão "${t.txt}" (${luz})`, t.razao, t.piso);

    // 4) O RODAPÉ DO `fazer` NÃO É VAZIO
    await pag.evaluate(`(async()=>{ TOUR.i=1; tourRepintar(); await new Promise(r=>setTimeout(r,600)); })()`);
    const pe = await pag.evaluate(`(() => {
      const cx = camadaViva().querySelector('.aula-cx');
      const w = camadaViva().querySelector('.aula-wrap');
      const d = cx.querySelector('.dedo');
      return { tipo: w.dataset.tipo, temDica: !!d, texto: d ? d.textContent.trim() : '',
               ehBotao: !!(d && (d.tagName === 'BUTTON' || d.getAttribute('data-acao'))) };
    })()`);
    eq(`passo "fazer" diz o que fazer no rodapé (${luz})`, pe.temDica && pe.tipo === 'fazer', true);
    eq(`e a dica NÃO é botão morto (${luz})`, pe.ehBotao, false);
    const dicaCor = await pag.evaluate(`(() => {
      const d = camadaViva().querySelector('.aula-cx .dedo');
      if(!d) return 0;
      return window.__hbx.razaoDe(d);
    })()`);
    naoMenos(`  dica "Toque no destaque" (${luz})`, dicaCor, 4.5);
  }

  // ============================================== 5) O CONTADOR NÃO MENTE
  console.log('\n=== 5) CONTADOR HONESTO — passo que não aparece sai do TOTAL ===');
  const conta = await pag.evaluate(`(async()=>{
    trocarLuz('escuro'); tourEncerrar(); TOUR.volta=null;
    ir('montagem'); await new Promise(r=>setTimeout(r,260));
    TOUR.id='teste2'; TOUR.cap={titulo:'t'}; TOUR.obrig=false; TOUR.i=0;
    TOUR.passos=[{tela:'montagem',alvo:'.tmx-dock,.acts',tipo:'mostrar',titulo:'Existe',texto:'.'},
                 {tela:'montagem',alvo:'.nao-existe-em-lugar-nenhum',tipo:'mostrar',titulo:'Fantasma',texto:'.'},
                 {tela:'montagem',alvo:'.tmx-dock,.acts',tipo:'mostrar',titulo:'Existe 2',texto:'.'}];
    tourRepintar(); await new Promise(r=>setTimeout(r,500));
    const antes = camadaViva().querySelector('.aula-cx .conta').textContent.trim();
    TOUR.i++; tourRepintar();
    await new Promise(r=>setTimeout(r,2200));   // deixa a paciência estourar
    const cx = camadaViva().querySelector('.aula-cx');
    return { antes, depois: cx ? cx.querySelector('.conta').textContent.trim() : '(fim)',
             total: TOUR.passos.length };
  })()`);
  eq('abre em "1 de 3"', conta.antes, '1 de 3');
  eq('o passo fantasma sai do total: "2 de 2"', conta.depois, '2 de 2');
  eq('a lista encolheu de 3 pra 2', conta.total, 2);

  // ================================ 6) TELA CARREGANDO NÃO MATA O PASSO
  console.log('\n=== 6) PACIÊNCIA — alvo que chega depois não perde a lição ===');
  const paciencia = await pag.evaluate(`(async()=>{
    tourEncerrar(); TOUR.volta=null;
    ir('montagem'); await new Promise(r=>setTimeout(r,260));
    const cam = camadaViva();
    // a peça nasce 420 ms DEPOIS — é o seam chegando atrasado, medido no g15
    setTimeout(()=>{ const d=document.createElement('div');
      d.className='hbx-tarde';
      d.style.cssText='position:absolute;top:300px;left:40px;width:200px;height:44px';
      cam.appendChild(d); }, 420);
    TOUR.id='teste3'; TOUR.cap={titulo:'t'}; TOUR.obrig=false; TOUR.i=0;
    TOUR.passos=[{tela:'montagem',alvo:'.hbx-tarde',tipo:'mostrar',titulo:'A peça atrasada',texto:'.'}];
    tourRepintar();
    await new Promise(r=>setTimeout(r,1400));
    const cx = camadaViva().querySelector('.aula-cx');
    return { vivo: !!TOUR.cap, titulo: cx ? cx.querySelector('b').textContent.trim() : '(sumiu)' };
  })()`);
  eq('a lição esperou a peça chegar', paciencia.vivo && paciencia.titulo === 'A peça atrasada', true);

  console.log('\n=== ROLAGEM — alvo abaixo da dobra é trazido, não descartado ===');
  const rolou = await pag.evaluate(`(async()=>{
    tourEncerrar(); TOUR.volta=null;
    ir('ajustes'); await new Promise(r=>setTimeout(r,400));
    const cam = camadaViva();
    const linhas = [...cam.querySelectorAll('.linha-cfg,.cartao-lista > *')];
    const fora = linhas.find(e => e.getBoundingClientRect().top > cam.getBoundingClientRect().bottom + 40);
    if(!fora) return { pulou: null, motivo: 'nada abaixo da dobra nesta tela' };
    fora.classList.add('hbx-fundo-da-tela');
    TOUR.id='teste4'; TOUR.cap={titulo:'t'}; TOUR.obrig=false; TOUR.i=0;
    TOUR.passos=[{tela:'ajustes',alvo:'.hbx-fundo-da-tela',tipo:'mostrar',titulo:'Lá embaixo',texto:'.'}];
    tourRepintar(); await new Promise(r=>setTimeout(r,1200));
    const cx = camadaViva().querySelector('.aula-cx');
    return { pulou: !cx, titulo: cx ? cx.querySelector('b').textContent.trim() : '(sumiu)' };
  })()`);
  if (rolou.pulou === null) console.log('  — pulado: ' + rolou.motivo);
  else eq('alvo abaixo da dobra virou lição', rolou.pulou, false);

  await nav.close();

  console.log(`\n${'='.repeat(58)}`);
  console.log(`${ok}/${ok + mau} réguas verdes`);
  if (mau) { console.log('\nREPROVADO:'); falhas.forEach((f) => console.log('  · ' + f)); }
  process.exit(mau ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
