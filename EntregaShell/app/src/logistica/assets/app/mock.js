/* ==========================================================================
   SCRIPT DO MOCK — GERADO. NÃO EDITE.

   Fonte : docs/mockups/logistica2.0/logistica-2.0.html
   Gerador: node scripts/casca-injetar.js

   O mock É o front. Mexeu no mock, roda o gerador — o app acompanha.
   Editar aqui à mão some na próxima injeção.
   ========================================================================== */

/* ==========================================================================
   ÍCONES
   ========================================================================== */
const I = {
menu:'<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
bell:'<path d="M7 17V11a5 5 0 0 1 10 0v6M5.5 17h13M10 20h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
chat:'<path d="M4.5 5.5h15v10h-9l-6 4.5v-14.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
route:'<circle cx="6" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.6 18h5.4a3.4 3.4 0 0 0 0-6.8H10a3.4 3.4 0 0 1 0-6.8h5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="1 3.2"/>',
check:'<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 12.3l2.6 2.6 5-5.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
list:'<path d="M4 6.5h.01M4 12h.01M4 17.5h.01M8.5 6.5H20M8.5 12H20M8.5 17.5H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
map:'<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5V6.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" fill="none" stroke="currentColor" stroke-width="1.8"/>',
box:'<path d="M12 3l8 4.3v9.4L12 21l-8-4.3V7.3L12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7.3l8 4.4 8-4.4M12 11.7V21" fill="none" stroke="currentColor" stroke-width="1.8"/>',
note:'<rect x="6" y="3.5" width="13" height="17" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 7.5H4M6 12H4M6 16.5H4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 8.5h5M10 12.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
users:'<circle cx="10" cy="8" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 19.5c0-3.4 2.7-5.3 6-5.3s6 1.9 6 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17.4" cy="9.4" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20.5 18.4c0-2.3-1.1-3.7-3-4.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
play:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.4l6 3.6-6 3.6V8.4z" fill="currentColor"/>',
nav:'<path d="M20 4L4 10.6l7 2.6 2.4 7L20 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
/* A SETA DO CONECTOR — "daqui pro próximo cliente". Haste inteira + ponta
   aberta: numa pílula de 10px o desenho tem que se ler de relance, e ponta
   fechada (triângulo) vira uma mancha nesse tamanho. */
seta:'<path d="M12 4.4v13.4M6.8 12.6L12 17.8l5.2-5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
curvaDireita:'<path d="M7 21v-7.5a4.5 4.5 0 0 1 4.5-4.5H18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 5.5L19 9l-4.5 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
/* 🔴 A CURVA À ESQUERDA É O ESPELHO DA DIREITA (x → 24−x, e o arco troca o
   sweep). Não é desenho novo: é o MESMO traço virado. Ela entrou junto com a
   fiação da navegação porque a tabela de manobra do OSRM tem dois lados — sem
   ela, "vire à esquerda" sairia com a seta apontando pra DIREITA, que é uma
   mentira bem pior que a que esta frente veio matar. */
curvaEsquerda:'<path d="M17 21v-7.5a4.5 4.5 0 0 0-4.5-4.5H6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 5.5L5 9l4.5 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
clock:'<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.6V12l3 1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
alert:'<path d="M12 4l8.5 15h-17L12 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v3.6M12 16.4h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
chev:'<path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
search:'<circle cx="11" cy="11" r="6.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.6 15.6L20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
sliders:'<path d="M4 8h9M17 8h3M4 16h3M11 16h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="16" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
cash:'<rect x="2.8" y="6" width="18.4" height="12" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 9.5v5M18 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
pix:'<path d="M12 3.6l3.4 3.4H8.6L12 3.6zM3.6 12L7 8.6v6.8L3.6 12zM20.4 12L17 15.4V8.6L20.4 12zM12 20.4L8.6 17h6.8L12 20.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
card:'<rect x="3" y="6" width="18" height="12" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10.2h18" stroke="currentColor" stroke-width="1.8"/>',
lock:'<rect x="4.5" y="10" width="15" height="10" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.4 10V7.6a3.6 3.6 0 0 1 7.2 0V10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.4 15h3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
chart:'<path d="M4.5 19V11M9.5 19V5M14.5 19v-5M19.5 19v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
receipt:'<path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6L8.4 20.5 6 18.9V3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 8.5h5.6M9.2 12.2h5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
close:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
back:'<path d="M20 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
enter:'<path d="M15 4h4v16h-4M12 8l4 4-4 4M4 12h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
copy:'<rect x="8" y="8" width="12" height="12" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
dots:'<circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/>',
target:'<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
layers:'<path d="M12 3.5l8.5 4.3-8.5 4.3-8.5-4.3L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 12.4l8 4 8-4M4 16.6l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
plus:'<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
minus:'<path d="M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
gallon:'<path d="M10 3.5h4v2.2l2.4 1.6c.9.6 1.4 1.6 1.4 2.7v7.6c0 1.6-1.3 2.9-2.9 2.9H9.1A2.9 2.9 0 0 1 6.2 17.6V10c0-1.1.5-2.1 1.4-2.7L10 5.7V3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.6 12.4h6.8" stroke="currentColor" stroke-width="1.5"/>',
edit:'<path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
photo:'<rect x="3" y="7" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 7l1.4-2.5h4.2L15.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
/* Os 10 que faltavam — sem eles o transmux perdia justo o Pausar e o Cancelar,
   e 32 das 33 telas tinham buraco. Ver a trava em `ic()` logo abaixo. */
pause:'<rect x="7.5" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/><rect x="13.1" y="5" width="3.4" height="14" rx="1.4" fill="currentColor"/>',
stop:'<rect x="6" y="6" width="12" height="12" rx="2.6" fill="currentColor"/>',
gear:'<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
gps:'<circle cx="12" cy="12" r="2.8" fill="currentColor"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
volume:'<path d="M4.5 9.2h3.2L12 5.6v12.8L7.7 14.8H4.5V9.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.4 9.4a3.7 3.7 0 0 1 0 5.2M17.9 6.9a7.2 7.2 0 0 1 0 10.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
trash:'<path d="M4.5 7h15M9.6 7V4.8h4.8V7M6.6 7l.9 12.4h9l.9-12.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 10.6v6M13.6 10.6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
refresh:'<path d="M20.2 12a8.2 8.2 0 1 1-2.5-5.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20.4 3.4V9h-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
calendar:'<rect x="3.4" y="5.2" width="17.2" height="15.4" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.4 10h17.2M8.2 3v4M15.8 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.6 13.8h2M11 13.8h2M14.4 13.8h2M7.6 17h2M11 17h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
download:'<path d="M12 3.6v10.8M7.6 10.4L12 14.8l4.4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.6 17.4v1.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6v-1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
logout:'<path d="M14.6 4.6H6.4a1.8 1.8 0 0 0-1.8 1.8v11.2a1.8 1.8 0 0 0 1.8 1.8h8.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.8 12H10M15.6 8.4L19.2 12l-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
/* Mais 3 que o grep não enxergava: são passados como VARIÁVEL (`linha('sales')`),
   não como literal dentro de ic(). Quem achou foi a caixa vermelha na tela. */
sales:'<path d="M4 19.4V11M9.4 19.4V5M14.8 19.4v-6M20.2 19.4V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 21.4h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
wallet:'<path d="M3.4 8.2a2.6 2.6 0 0 1 2.6-2.6h10.8a2 2 0 0 1 2 2v1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="3.4" y="8.2" width="17.2" height="11.2" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.4 13.8h1.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
moon:'<path d="M20 14.6A8.4 8.4 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
flag:'<path d="M6 21V4M6 4h11l-2 3.5L17 11H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
save:'<path d="M5 5.5h11l3 3V19H5V5.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 5.5v4.5h6V5.5M8 19v-4.5h8V19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
spark:'<path d="M12 4l1.6 4.7L18 10.3l-4.4 1.6L12 16.6l-1.6-4.7L6 10.3l4.4-1.6L12 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" fill="currentColor"/>',
/* A LÂMPADA — "como usar esta tela". Ela ACENDE (raios + miolo cheio) quando a
   aula desta tela ainda não foi vista, e fica só de contorno depois. Ícone que
   explica o próprio estado dispensa legenda. */
bulb:'<path d="M9.2 16.6a6.2 6.2 0 1 1 5.6 0v1.6H9.2v-1.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.9 20.6h4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
/* A LOJA — o grupo dos comércios da RFB no painel da busca avulsa. O toldo diz
   "isto é um ponto de comércio" sem precisar de legenda, e é o único selo dos
   três que o dicionário não tinha (cliente é `users`, rua é `map`). */
store:'<path d="M4.2 9.6h15.6v9.2a1.6 1.6 0 0 1-1.6 1.6H5.8a1.6 1.6 0 0 1-1.6-1.6V9.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3.2 9.6 5 4.4h14l1.8 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 20.4v-5.2h4.8v5.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
};
/* Traço FINO: os ícones nasceram em 1,7–2,6 (grosso demais ao lado de texto
   leve). Aqui o traço é afinado num ponto só — 0,72 do original — em vez de
   reescrever 40 desenhos. Ícone e letra passam a ter o mesmo peso na tela. */
const afinar = svg => svg.replace(/stroke-width="([\d.]+)"/g,(m,w)=>`stroke-width="${(+w*0.72).toFixed(2)}"`);

/* 🔴 ÍCONE QUE NÃO EXISTE NÃO SAI CALADO (06/08).
   O `I[n] || ''` devolvia um <svg> VAZIO: o botão continuava lá, do tamanho
   certo, sem desenho nenhum. Foram 65 buracos em 32 das 33 telas — e o
   transmux perdeu justamente o Pausar e o Cancelar sem uma linha de erro.
   Nenhuma medida de layout pega isso, porque o layout está perfeito.
   Agora o nome errado vira uma CAIXA VERMELHA na tela e um aviso no console:
   mesma lei do CNEFE — best-effort que engole erro precisa de alarme. */
const ic=(n,s=18)=>{
  const desenho=I[n];
  if(!desenho){
    console.warn('[HBX 2.0] ícone inexistente no dicionário:',n);
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" aria-label="ícone ${n} não existe">
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="none" stroke="#f2555a" stroke-width="2"/>
      <path d="M8 8l8 8M16 8l-8 8" stroke="#f2555a" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" aria-hidden="true">${afinar(desenho)}</svg>`;
};

/* ==========================================================================
   PEÇAS COMUNS
   ========================================================================== */
const status = `<div class="status"><span>9:41</span><span class="right">
  <span class="bars"><i></i><i></i><i></i><i></i></span>
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.6 8.6 0 0 1 12 0M9.4 16.4a3.8 3.8 0 0 1 5.2 0" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor"/></svg>
  <span class="batt"></span></span></div>`;

const logo = `<div class="logo"><div class="w"><b>HB</b><em>X</em></div><small>LOGÍSTICA</small></div>`;

function hdr(o={}){
  /* 🔴 O SINO E O BALÃO IAM PRO MESMO LUGAR (medido 08/08: os dois eram
     `data-ir="chat"`). Dois botões, um destino — é a mesma mentira do "dado em
     2 cards". Ficou UM: o balão, que tem o nome do módulo na barra, e o selo do
     número mudou de dono junto com ele. A vaga que sobrou virou o "+".

     O "+" é CADASTRAR CLIENTE, em toda tela, sempre a mesma coisa — cadastro
     feito NA PORTA nasce com o local de verdade; digitado no escritório depois,
     nasce sem. `data-ir` de propósito nos dois: módulo desligado leva o atalho
     embora junto (`podarDesligados`). */
  /* 🔴 A AULA TEM QUE TER PORTA EM TODA TELA QUE TEM AULA. Tela de dentro
     (cadastro, montagem) troca a lâmpada da esquerda pela VOLTA — e a aula
     ficaria escrita e inalcançável, que é o botão morto ao contrário.
     Regra, sem exceção escrita à mão: se a tela TEM aula e a esquerda virou
     Voltar, a lâmpada senta na vaga do "+". Cadastrar cliente continua a um
     toque dali (Voltar), e nessas telas o "+" era o botão menos usado. */
  const mais = (AULAS[atual] && o.voltar)
    ? `<button class="round" data-aula="1" aria-label="Como usar esta tela">${ic('bulb',18)}</button>`
    : `<button class="round" data-ir="novocliente" aria-label="Cadastrar cliente">${ic('plus',18)}</button>`;
  const dir = o.live
    ? `<div class="pill-live"><i></i>${o.live}</div>`
    : `<div style="display:flex;gap:7px">${mais}
        ${o.semChat?'':`<button class="round" data-ir="chat" aria-label="Chat com a Central">${ic('chat',17)}${DADOS.chat.sino?`<i class="cnt">${DADOS.chat.sino}</i>`:''}</button>`}</div>`;
  // Tela que se entra por dentro (ficha, folha) troca a lâmpada pela VOLTA — a
  // aula ali seria a saída errada e o Voltar do Android tem que casar.
  // O hambúrguer morreu em 08/08: não abria nada desde que a barra de 3 virou a
  // navegação (dono: "os ícones acima do HBX estão mortos"). No lugar dele, a
  // LÂMPADA — a aula da tela que está aberta.
  /* 🔴 A VOLTA VEM MARCADA (`data-voltar`), NUNCA DEDUZIDA. O Voltar do Android
     procurava "o primeiro `data-ir` do cabeçalho" — e em TODA tela sem volta
     (rota, chat, venda, ajustes, folha) o primeiro é o "+". Resultado medido:
     na Rota, o Voltar do aparelho ABRIA "Cadastrar cliente". Voltar deduzido
     por posição anda pra frente na hora que alguém mexe na ordem dos ícones;
     marcado, só o botão de voltar responde. Quem tem volta e NÃO nasce aqui
     (o × das folhas) carrega a mesma marca — a régua é a marca, não o lugar. */
  const esq = o.voltar
    ? `<button class="round" data-voltar="1" data-ir="${o.voltar}" aria-label="Voltar">${ic('back',18)}</button>`
    : `<button class="round" data-aula="1" aria-label="Como usar esta tela">${ic('bulb',18)}</button>`;
  // 🔴 O LOGO NÃO ANDA. Os flancos entram EMBRULHADOS com a mesma largura
  // mínima: com 1 ou 2 ícones do lado, o HBX fica cravado no centro em toda
  // tela (medido: sem isto o logo passeava 143↔164 entre abas).
  return `<header class="hdr"><div class="hdr-row">
      <div class="hdr-flanco">${esq}</div>${logo}<div class="hdr-flanco dir">${dir}</div>
    </div></header>`;
}

/* ==========================================================================
   A BARRA — e ela é a ORDEM DE TUDO: dos botões, do arrastar e do que some.

   ITEM 9 DO DONO (07/08): *"deixar os módulos do motorista na mão do ADMIN
   (não dentro do app, no desktop)... desativar qualquer módulo q ele quiser
   (fechamento, clientes, produtos, chat, ajustes) MENOS ROTA"*.

   🔴 ROTA NUNCA SOME. O servidor já barra (mandar "rota" grava null), e esta
   linha é o cinto por cima do suspensório: app de entrega sem a rota não é
   app de entrega, e o motorista ficaria numa tela sem saída.

   🔴 DESLIGADO SOME DE VERDADE — não é só o botão. Sai da barra, sai do
   arrastar (`arrastarModulo`), não abre por rota direta (`ir`) e os ATALHOS
   que levavam pra lá somem junto (`podarDesligados`). Botão que existe e não
   leva a lugar nenhum é pior que botão ausente.

   🔴 SEM FONTE, NADA SOME. `DADOS.barra.desligados` nasce VAZIO e só a ponte
   escreve, depois que o servidor responde. Rede caída NÃO pode esconder
   módulo — é a mesma lei do esqueleto: "vazio porque o servidor disse" e
   "vazio porque a rede caiu" são opostos, e aqui o padrão do silêncio é
   MOSTRAR TUDO.
   ========================================================================== */
/* 🔴 BARRA DE 3 (decisão do dono, 07/08): Chat na esquerda, Rota no centro,
   Ajustes na direita — padrão de app de motorista. Fechamento, Clientes e
   Produtos NÃO morreram: Clientes/Produtos moram em Ajustes › Cadastro e a
   fechamento abre pelo caixa da Rota (e por Ajustes). O CSV do admin continua
   valendo pra essas entradas via `podarDesligados`/`ir`. */
const NAV_ITENS=[['chat','Chat','chat'],['rota','Rota','map'],['ajustes','Ajustes','gear']];
/** O CSV que o admin gravou no desktop, virado em lista. Vazio = tudo ligado. */
function modulosDesligados(){
  return String((DADOS.barra&&DADOS.barra.desligados)||'')
    .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
}
function moduloDesligado(k){
  if(k==='rota') return false;                       // a lei, de novo e aqui
  if(k==='ajustes') return false;                    // é a porta de tudo agora — murar é prender
  return modulosDesligados().includes(String(k||'').toLowerCase());
}
/** Os módulos que o motorista PODE ver — a ordem é a da barra, sempre. */
const navLigados=()=>NAV_ITENS.filter(([k])=>!moduloDesligado(k));

function nav(ativo){
  return `<nav class="nav">${navLigados().map(([k,l,i])=>
    `<button data-nav="${k}" class="${ativo===k?'on':''}">${ic(i,18)}<span>${l}</span>${ativo===k?'<i class="ping"></i>':''}</button>`
  ).join('')}</nav>`;
}

/* Os atalhos espalhados pelas telas (o "Fechamento do dia" do pé da rota, por
   exemplo) apontam pro módulo por `data-ir`. Se o admin desligou o módulo,
   esse botão vira porta pra parede — o `ir` recusa e o motorista toca duas,
   três vezes achando que o app travou. Some com ele na pintura, por REGRA:
   um lugar só, e vale pra qualquer atalho que apareça amanhã. */
function podarDesligados(tela){
  if(!modulosDesligados().length) return;            // nada desligado: nem varre
  tela.querySelectorAll('[data-ir]').forEach(el=>{
    if(moduloDesligado(el.dataset.ir)) el.remove();
  });
  // Caixa dos Ajustes que ficou vazia leva o título junto — título de pé
  // sobre caixa vazia é a mesma mentira do slot sem fonte.
  tela.querySelectorAll('.cartao-lista').forEach(c=>{
    if(!c.children.length){
      const t=c.previousElementSibling;
      if(t&&t.classList.contains('grupo')) t.remove();
      c.remove();
    }
  });
}

/* ==========================================================================
   TRANSMUX + ESTADOS DA ROTA (1ª leva da injeção do app real)
   O botão do meio é SEMPRE o que se faz agora; os satélites são no máximo dois
   e trocam de dono conforme o estado. Regra dura vinda do app: quando o sino
   de rotas recebidas e o Cancelar disputam a esquerda, o Cancelar fica (ele
   controla trabalho em andamento) e o sino só assume com a rota parada.
   ========================================================================== */
/* 🔴 SATÉLITE SEM CAMINHO NÃO FICA (dono, 07/08: "remove o ícone ou acha o
   caminho"). Saíram os três que eram botão morto: "Rotas recebidas" (a rota
   indicada morreu no corte de 06/08 — 4 usos na história, 2.981 polls),
   "Rota rápida" e "Adicionar" (a rota rápida do app antigo — geo/busca, CEP,
   link, conta, encaixe — é frente própria; a tela T.rapida fica de referência
   até ela nascer LIGADA). Quando a frente vier, o satélite volta COM ação.

   🔴 09/08 — A FRENTE VEIO, E A PORTA NÃO VOLTOU PRA CÁ. Dois motivos duros:
   (1) os dois slots de satélite já têm dono em todo estado que importa
   (`pronta` = Cancelar + Montagem; `rodando` = Cancelar + Finalizar), e
   despejar um deles pra caber o "+" trocaria um botão vivo por outro;
   (2) o dono foi procurar o "+" na MONTAGEM, não aqui — "estou em montagem de
   rota... cadê o +?". Porta boa é a que fica onde a mão vai. Ela mora no dock
   da Montagem e na barra da Rota·lista; ver `T.rapida`. */
const ROTA_ESTADOS={
  /* 🔴 "E SE EU QUISER COMEÇAR AGORA? NÃO ERA PRA SER INICIAR?" (dono, 09/08).
     Era. O motor JÁ fazia isso: `iniciarRota` na ponte abre com
     `if (estadoRota === 'montar' || !ENTREGAS.size) → planejar`, ou seja, o
     Iniciar MONTA sozinho quando não há ordem gravada, e só depois abre o
     portão com o custo REAL do servidor ("Debita 4,8 · você tem 9.340"). O que
     faltava era o BOTÃO: o dia por montar oferecia só "Montar rota", então
     sair pra rua custava dois toques em telas diferentes — e o segundo toque
     não decide nada que o primeiro já não tenha decidido.

     🔴 O PREÇO CONTINUA ANTES DA COBRANÇA. Encurtar não é cobrar escondido: o
     portão de crédito é o mesmo, com o número que o servidor mandou, e ele
     abre DEPOIS de montar (que é quando o custo existe de verdade). Um toque,
     uma decisão, o valor na frente dela.

     🔴 E A MONTAGEM NÃO PODE FICAR INALCANÇÁVEL — foi por isso que o `pronta`
     ganhou o satélite da direita, e o motivo vale igual aqui: rever a lista,
     trocar o dia, escolher o espaço ou pôr uma parada na mão continua a UM
     toque, no mesmo lugar em que ele já mora no estado seguinte. Sem "Cancelar"
     à esquerda porque ainda não há rota nenhuma pra cancelar. */
  montar:   {main:{acao:'iniciar', glifo:'play', rotulo:'Iniciar'},
             dir:{tipo:'info', glifo:'route', rotulo:'Montagem', acao:'montar'}},
  /* 🔴 DIA SEM UMA PARADA ABERTA NÃO GANHA "INICIAR" — e o corte é por parada
     ABERTA, não por lista vazia (medido 09/08 na company 41: 137 cartões na
     tela, 107 deles `cancelada`; "Iniciar" ali bateria em `Nenhuma entrega
     aberta neste dia. Monte a rota antes de iniciar`, que é o beco sem saída
     que o dono já levou na cara). Sem nada aberto, o que existe é MONTAR o dia
     — e a Montagem sabe receber o dia vazio (ela vira "Adicionar parada"). */
  semparada:{main:{acao:'montar', glifo:'route', rotulo:'Montar rota'}},
  /* Com a rota pronta o satélite da direita é a PORTA DE VOLTA pra montagem:
     rever a lista, salvar o roteiro, ou trocar o dia e montar de novo. Sem ele
     a montagem ficava inalcançável depois de montada — beco sem saída. */
  pronta:   {main:{acao:'iniciar', glifo:'play', rotulo:'Iniciar'},
             esq:{tipo:'perigo', glifo:'close', rotulo:'Cancelar', acao:'cancelar-rota'},
             dir:{tipo:'info', glifo:'route', rotulo:'Montagem', acao:'montar'}},
  /* Com a rota RODANDO o que o motorista faz é ANDAR: o botão do meio abre a
     navegação. "Pausar"/"Continuar" saíram — pausa não existe no servidor
     (o estado da rota é PLANNED|ACTIVE|COMPLETED|ENCERRADA), então eram dois
     botões que não pausavam nada. Fechar o dia é o "Finalizar" do pé da lista.

     🔴 O "FINALIZAR" ABRE O FECHAMENTO — NÃO FECHA NADA (12/08, dono: "ela
     aparece algumas vezes no final, sem necessidade, transforme isso em 1x
     só"). Ele apontava pra `fechar-dia`, o MESMO gancho do botão "Fechar o dia"
     que mora dentro da tela de Fechamento. O toque abria um portão, o portão
     mandava o POST, e o caminho terminava em `ir('fechamento')` — ou seja, na
     tela que tem o botão de novo. Anel: fecha, cai onde fecha, fecha outra vez.
     E o dia nunca acabava, porque `fechamento/finalizar` não encerra rota
     nenhuma (ele carimba a página do dia e salva a Rota salva) — a rota seguia
     ACTIVE e este mesmo rodapé voltava com "Navegar" sobre um dia terminado.

     A régua desta casa já dizia o que fazer, dois blocos abaixo, na dica do dia
     vazio: repetir o verbo numa segunda peça ensina que existem dois lugares
     pra mesma coisa — e um dia os dois discordam. Então o verbo ficou com UM
     dono (o "Fechar o dia" da tela de Fechamento, que é onde o dinheiro está à
     vista) e este satélite virou o que ele sempre pareceu ser: a PORTA. É o
     padrão de todo app de rota — "Finish route" abre o recibo do dia, e o dia
     só fecha depois que o motorista viu o número. */
  rodando:  {main:{acao:'navegar', glifo:'nav', rotulo:'Navegar'},
             esq:{tipo:'perigo', glifo:'stop', rotulo:'Cancelar', acao:'cancelar-rota'},
             dir:{tipo:'info', glifo:'check', rotulo:'Finalizar', acao:'ir-fechamento'}},
  /* 🔴 O RECIBO DO TOQUE MORA NO BOTÃO TOCADO. Enquanto o servidor monta, o
     meio vira "Montando…": mesmo lugar, mesmo tamanho, SEM ação (dois toques
     não montam duas vezes) e sem satélite — cancelar ou iniciar no meio de uma
     montagem é botão que mente. Antes disto o sinal era o esqueleto da tela
     inteira, que leva o próprio rodapé embora: o dedo tocava e o botão sumia. */
  montando: {main:{glifo:'route', rotulo:'Montando…'}},
  /* 🔴 CARREGAR NÃO LEVA O CONTROLE EMBORA — e é o MESMO defeito do `montando`,
     uma linha acima, na porta ao lado. `carregando` não tinha entrada aqui, e
     sem entrada o `transmux` devolve vazio: a tela nascia SEM RODAPÉ NENHUM e o
     botão grande aparecia do nada quando o dado chegava — 120px de controle
     brotando debaixo do polegar de quem já estava mirando a tela. Mesmo lugar,
     mesma altura, respirando e SEM ação: enquanto o dia não chegou não há o que
     fazer, e prometer botão que não faz nada é pior que dizer "espera". */
  carregando: {main:{glifo:'route', rotulo:'Carregando…'}},
};
function transmux(estado){
  const c=ROTA_ESTADOS[estado]; if(!c) return '';
  const sat=(s,lado)=>s?`<span class="tmx-sat tmx-${s.tipo} tmx-${lado}">
      <button aria-label="${s.rotulo}"${s.acao?` data-acao="${s.acao}"`:''}>${ic(s.glifo,20)}${s.contagem?`<i class="cont">${s.contagem}</i>`:''}</button>
      <small>${s.rotulo}</small></span>`:'';
  // main sem `acao` = trabalho em curso: não vira gancho e não aceita dedo.
  /* 🔴 A PALAVRA ENTROU NO BOTÃO. Ela era um `<small>` de 12px POR BAIXO de um
     quadrado com um ícone de 34px — quer dizer: o desenho grande não dizia
     nada e o que dizia era a menor letra do rodapé. Agora o verbo é o botão.
     O ícone encolhe (34 → 21) porque virou o acompanhante, não o cartaz. */
  return `<div class="transmux">${sat(c.esq,'esq')}
    <span class="tmx-main">
      <button${c.main.acao?` data-estado="${c.main.acao}"`:' class="ocupado" disabled aria-busy="true"'}>${ic(c.main.glifo,21)}<b>${c.main.rotulo}</b></button>
    </span>
    ${sat(c.dir,'dir')}</div>`;
}

function stop(o){
  const cor=o.cor||'blue';
  /* 🔴 O GANCHO NASCE DO DADO. A parada só vira botão quando tem `id` — que só
     existe quando o dado é REAL. No mock (paradas de maquete, sem id) o cartão
     continua inerte e a tela sai byte a byte igual à de antes.

     🔴 DUAS PORTAS, PORQUE SÃO DUAS COISAS (dono, 09/08: "no montagem de rota
     não consigo abrir o cliente"). Na ROTA a linha é uma ENTREGA e o toque abre
     a folha dela (`abrir-parada`). Na MONTAGEM a entrega ainda não existe — a
     linha é um CLIENTE do dia — e o toque tem que abrir a FICHA dele
     (`abrir-cliente`). A montagem não tinha gancho nenhum: o cartão era papel
     de parede, e o único jeito de ver quem era aquele cliente antes de sair pra
     rua era sair da tela e procurar na lista de Clientes. */
  const gancho=o.id?` data-acao="abrir-parada" data-parada="${o.id}"`
    :o.cliente?` data-acao="abrir-cliente" data-cliente="${o.cliente}"`:'';
  /* A POSIÇÃO DE ORIGEM DO CARTÃO NA PRÉVIA — é por ela que o arrasto da
     montagem fala (ver `posicoesDaPrevia` no `ligarLista`). Só existe onde a
     lista é prévia; na rota quem viaja é o id da entrega. */
  const naPrevia=o.previa!=null&&o.previa!==''?` data-previa="${o.previa}"`:'';
  return `<div class="stop ${o.on?'on':''}"${gancho}${naPrevia}>
    <span class="grip"></span>
    <span class="numwrap"><span class="num ${cor==='lime'?'lime':cor==='off'?'off':''}">${o.n}</span>
      <span class="hh ${cor==='lime'?'lime':cor==='off'?'off':''}">${o.hora}</span></span>
    <span class="who"><strong>${o.nome}</strong><span>${o.rua}</span><span>${o.bairro}</span>
      ${o.nota?`<span class="nota">${o.nota}</span>`:''}
      <span class="tags">${(o.tags||[]).map(t=>`<b class="tag ${t[1]||''}">${t[0]}</b>`).join('')}</span></span>
    <span class="side">
      ${/* 🔴 O RÓTULO DO DINHEIRO É DADO, NÃO DESENHO (12/08, dono: "o valor está
           correto, mas o significado/rótulo está errado"). "Marcado" nesta casa é
           a palavra do FIADO — o que ficou em aberto. Na ROTA a linha é uma
           entrega e o número é o `valorHoje`, que continua sendo o que ficou
           marcado; na MONTAGEM é quantidade x preco da entrega que se está
           montando, e chamar isso de "Marcado" fazia o motorista ler dívida onde
           havia venda. Uma peça só, dois rótulos: quem sabe o que o número
           significa é quem monta a linha, e ele manda a palavra junto. */''}
      ${o.marcado?`<span class="marc"><small>${o.marcRot||'Marcado'}</small><b>R$ ${o.marcado}</b></span>`:''}
      ${/* 🔴 O ÚLTIMO REGISTRO DO CLIENTE (12/08). Mesma caixa do dinheiro, e de
           propósito: é a MESMA pergunta do lado direito do cartão ("o que eu
           preciso saber sobre esta porta antes de ir"). `.reg` só troca a tinta
           do valor — data em verde-limão se leria como dinheiro.
           Ele NÃO briga com a pílula: quem monta a linha manda uma, outra, ou as
           duas. Na Montagem, antes de montar, TODO mundo era "Pendente" e a
           coluna inteira repetia a mesma palavra — este slot passa a dizer a
           última vez que este cliente recebeu de verdade. */''}
      ${o.reg?`<span class="marc reg"><small>${o.reg[0]}</small><b>${o.reg[1]}</b></span>`:''}
      ${o.pill?`<span class="pill ${o.pill[1]}">${o.pill[2]?ic(o.pill[2],14):''}${o.pill[0]}</span>`:''}</span>
  </div>`;
}

/* ==========================================================================
   🔴 A MAQUETE DO MAPA 2D MORREU — ordem do dono, 09/08: *"esse câncer pisca,
   depois abre o 3. Remover o 2 sem legados, totalmente destrutivo."*

   Aqui morava um SVG de espera: malha de ruas em grade perfeita, uma mancha de
   parque, um traço verde e SEIS pinos de posição CRAVADA no arquivo. Ele
   existia por um motivo real — a tela não podia ficar preta no 1,0 s entre
   entrar na rota e o mapa de verdade assentar (medido no g15) — e cobrava um
   preço que só ficou visível quando o mapa virou a TELA PRINCIPAL:

   · MENTIA O DIA. Montar 56 paradas acendia 6 pinos num bairro que não é o do
     motorista, porque as posições eram do desenho, não do dado. Cada régua
     nova (`temRota`, `rotaMontada`) apertava a mentira sem matá-la: o desenho
     só sabia desenhar a rota que ele já tinha dentro.
   · PISCAVA. Maquete e mapa vivo se cruzavam num dissolve toda vez que o palco
     entrava — e é esse cruzamento que o dono via como "pisca antes de abrir".

   O que fica no lugar: NADA. O palco tem a cor do mapa (`.mapa-palco`), o mapa
   vivo entra por cima quando fica pronto. Fundo de espera não precisa de
   desenho, precisa de COR — e cor não tem o que piscar nem o que inventar.

   🔴 E O "EU" NÃO RESSUSCITA A MAQUETE. O ponto que entra aqui é DESENHO —
   existe pro mock poder mostrar a peça, e é a mesma casca (`.eu-puck`) que o
   marcador do mapa de verdade veste. No aparelho ele nunca aparece: `euDemo` é
   DADO de demonstração e o boot o apaga (`apagarDemonstracao`), e o palco
   ainda ganha `.com-mapa` quando o maplibre sobe. Duas travas porque uma
   posição inventada de "você está aqui" é a pior das mentiras que esta tela
   pode contar — pior que a maquete, que ao menos mentia sobre os OUTROS.
   ========================================================================== */
function mapa(){
  return `<div class="mapa-palco" data-mapa="geral">${DADOS.rota.euDemo
    ?'<i class="eu-puck demo" style="--rumo:34deg;--cone:1;--halo:104px"></i>':''}</div>`;
}

/* ==========================================================================
   TELAS
   ========================================================================== */
const T={};

/* ==========================================================================
   SEAM DE DADOS — o único lugar por onde o dado REAL entra.
   Os valores abaixo são os literais que estavam nos templates, MOVIDOS pra cá.
   O mock continua pintando exatamente o mesmo; o app real chama
   `usarDados('rota', {...})` e a tela se repinta com o que veio do servidor.
   🔴 LEI: traduzir ≠ decidir. Sem fonte, o campo vai VAZIO — número inventado
   em tela de dinheiro é mentira com cara de app pronto.
   ========================================================================== */
const DADOS={
  /* ITEM 9 (07/08) — o CSV dos módulos que o ADMIN desligou no desktop, do
     jeito que o servidor grava: minúsculo, separado por vírgula, sem "rota".
     🔴 NASCE VAZIO E É ASSIM QUE TEM QUE SER: enquanto ninguém disser o
     contrário, a barra mostra os 6. Quem escreve aqui é a ponte, só depois de
     o `/logistica/config` responder — falha de rede não apaga módulo. */
  barra:{ desligados:'' },
  rota:{
    kpiParadas:'12', kpiEntregues:'6', kpiEntreguesParado:'0',
    saldo:'R$ 184,00', dinheiro:'R$ 132,00', pix:'R$ 52,00',
    diaFeitas:'3', diaTotal:'14', diaPct:'21%', diaMarcado:'R$ 336,00',
    filtroFila:'8', filtroEntregue:'6',
    creditos:'240', creditosDebita:'12',
    somaProdutos:'20', somaMarcado:'R$ 336,00',
    vazioTitulo:'Sem paradas hoje',
    /* A segunda linha do dia por montar (ver `T.rota`). Ela explica o mapa
       vazio e NOMEIA a ação que já está no dock — não é um segundo botão.
       Curta de propósito: a barra é uma linha de vidro em cima do mapa, não um
       lugar de texto. */
    vazioDica:'Monte a rota pra ver o dia no mapa.',
    /* DEMONSTRAÇÃO — o "você está aqui" do desenho no palco do mapa 2D. Só o
       mock o enxerga: `apagarDemonstracao` zera este campo no boot do aparelho
       (ver `mapa()`), porque no app quem diz onde o motorista está é o GPS. */
    euDemo:1,
    /* 🔴 O ESTADO DO GPS É UM FATO DO DIA (dono, 09/08: *"cadê minha
       localização?"*). A tela não tinha uma palavra sobre isso: sem permissão,
       sem sinal ou nos primeiros segundos de busca, ela mostrava um mapa mudo e
       deixava a pergunta sem resposta — e a pergunta se responde sozinha se
       alguém a fizer em voz alta. Três valores e nada mais:
       '' = tenho a posição (nada a dizer, o ponto está lá)
       'procurando' = ainda não veio fix (informa, não alarma)
       'negado' = a localização está desligada (ALARME, e a barra vira botão)
       Quem escreve é a ponte; sem fonte fica vazio, que é o desfecho honesto —
       "procurando" eterno num app que nunca perguntou seria alarme inventado. */
    gps:'',
    /* 🔴 UM NOME SÓ, PORQUE É UMA COISA SÓ (dono, 09/08: *"estou inclinado a
       remover o agenda, não vejo utilidade q o montar rota não tem"*).
       Esta tela teve dois nomes por um dia: com rota montada, "Rota de hoje";
       sem rota, "Agenda de hoje" — e o modo agenda era a tela do print que
       dizia "0 agendadas" no topo e empilhava "Não entregues · 137" embaixo.
       O modo morreu inteiro (ver `T.rotalista`): a lista só se abre quando há
       rota, e quem responde "quem espera hoje?" é a MONTAGEM, que é a tela que
       também faz alguma coisa a respeito. COPY do desenho, não vem do servidor. */
    titulo:'Rota de hoje',
    /* DADO — a data por extenso ("Domingo, 9 de agosto"). Sem fonte, o subtítulo
       some: inventar a data do aparelho numa tela que fala do dia OPERACIONAL
       (fuso de São Paulo, virada às 00h) é a receita de mostrar o dia errado às
       21h. Quem sabe o dia é a ponte, que já o calcula pra pedir a rota.
       🔴 MUDOU DE TELA junto com o modo agenda: quem carrega a data agora é a
       MONTAGEM (o cabeçalho dela). Continua morando na seção `rota` porque quem
       calcula o dia é o mesmo carregamento da rota — o campo mudou de leitor,
       não de dono. */
    dataLonga:'',
    /* DADO — a semana da agenda: uma linha por dia com a quantidade de clientes.
       `[[diaSemana, 'Segunda', 53, ehHoje]]`. Sem fonte, o bloco some inteiro
       (Lei do IF) — dia da semana com número inventado seria pior que nada,
       porque é por ele que o dono decide em que dia sai pra rua.
       🔴 TAMBÉM MUDOU DE TELA: mora no VAZIO da Montagem. É a resposta ao
       domingo ("então quando eu entrego?") no lugar onde ela vira ação — o chip
       do dia está a um dedo de distância. Com lista cheia ela não aparece: ali
       os chips já contam os dias, e a mesma conta em dois lugares é bug de
       produto por lei desta casa. */
    semana:[], semanaTitulo:'Os dias que você entrega',
    /* 🔴 UM GESTO, UMA REAÇÃO (dono, 08/08: "ao clicar pisca e não monta").
       Montar são 3 idas ao servidor. O sinal disso era `estadoRota='carregando'`
       — que na tela Rota troca TUDO pelo esqueleto e leva o rodapé de botões
       junto (o botão some no meio do próprio toque), e na Montagem não muda
       NADA (ela nem lê `estadoRota`): repintava a tela inteira sem dizer uma
       palavra. Agora quem responde ao dedo é o BOTÃO TOCADO, no lugar dele.
       Mora na seção `rota` porque quem monta é a rota, e as duas telas leem
       daqui — uma marca só, um repinte só. */
    montando:0,
    /* a ETAPA do véu de montar: a ponte escreve no NÓ (`data-etapa-montar`,
       regra do `data-vivo` — o que muda rápido não repinta) e espelha aqui,
       pro repinte que chegar no meio renascer já com a etapa certa. */
    etapaMontar:'', etapaMontarPct:0,
  },
  /* L3b — AS EMPRESAS DO CORREDOR (prospector), na tela de navegação.
     `chip` é COPY do desenho; `empresas` é DADO e vem do servidor.

     🔴 SEM FONTE, LISTA VAZIA — e a tela fica SEM EMPRESA NENHUMA, sem chip e
     sem varredura. Os três nomes abaixo são do desenho do dono e vivem SÓ
     aqui: o app apaga esta lista no boot (`apagarDemonstracao`), porque
     empresa que não existe, com nome e endereço, é a mentira mais cara que
     esta tela poderia contar — ela termina em mensagem de WhatsApp.

     Por item: `x`/`y` são a posição NO DESENHO (no aparelho quem escreve é a
     câmera do mapa, por `lat`/`lng`); `esc` é o tamanho proporcional; `ordem`
     é a fila em que as 6 janelas acendem — uma fila por prédio, senão os três
     piscam em coro; `atraso` escalona a cena; `aceso` é o estado que o
     prospector decide no dia. `id` é o que dá o GANCHO: sem id, sai sem
     `data-acao`. */
  mapa:{
    chip:'Empresas por perto',
    empresas:[
      /* AS DUAS CORES DO DESENHO (12/08): o salão e a auto peças são o AMBIENTE
         (azuis, mudos — o corredor traz todo mundo). As três de baixo são do
         TIPO da semana (`escolhida`), e por isso são as únicas que podem acender
         e digitar o nome. É a cena que o dono decidiu: a rua tem mundo, mas só
         fala com você quem você escolheu ouvir. */
      {nome:'Salão Bela Vista',   x:'30%', y:'38%', esc:.66},
      {nome:'Auto Peças Central', x:'61%', y:'31%', esc:.58},
      {nome:'Mercado São Judas',  x:'78%', y:'49%', esc:1.12, ordem:[0,3,1,5,2,4], atraso:'.6s',   escolhida:true, aceso:true},
      {nome:'Padaria Avenida',    x:'22%', y:'57%', esc:.88,  ordem:[2,0,4,1,5,3], atraso:'2.1s',  escolhida:true, aceso:true},
      {nome:'Restaurante Sabor',  x:'74%', y:'68%', esc:1,    ordem:[1,2,5,0,4,3], atraso:'3.55s', escolhida:true, aceso:true},
    ],
  },
  /* L3b — O CROMO DA NAVEGAÇÃO. Tudo o que estava CRAVADO no template do GPS
     mora aqui: a manobra, a bússola, o velocímetro, o rodapé e a linha do
     "Você chegou".

     🔴 ERA A MENTIRA QUE SOBROU DA VARREDURA (§4.6.5). Enquanto `rota`,
     `clientes`, `ajustes`, `recarga`, `fechamento` e `semana` já nasciam
     limpas, esta tela seguia dizendo "Parada 3 de 8 · Mercado São Judas",
     "240 m · Vire à direita" e "12:26 chegada" — na ÚNICA tela em que o
     motorista está DIRIGINDO. Nome de cliente que não existe, com uma seta
     mandando virar numa rua que ninguém escolheu.

     A régua é a do §4.6.5: o que é DADO zera sem fonte (`apagarDemonstracao`);
     o que é COPY fica, porque é texto do desenho e não vem do servidor.

     🔴 SLOT SEM FONTE **SOME INTEIRO** — com rótulo, unidade e separador. O
     " · " nasce de um `join`, nunca do template: separador órfão e caixa vazia
     boiando no mapa são a mesma mentira de antes, só que mais feia. O que
     NUNCA some é o `encerrar`: é a porta de saída desta tela, e motorista
     preso na navegação é defeito pior que qualquer número faltando.

     DADO: manobra* · rumo · velocidade · paradaN · paradaTotal · paradaNome ·
           chegada · restante · distancia · chegouEndereco · chegouPrecisao ·
           chegouFaltam · chegouKm · chegouId.
     COPY: velocidadeUnidade · chegadaRotulo · restanteRotulo · distanciaRotulo
           · encerrar · chegouTitulo · chegouAcao.

     `manobraIcone` é DADO, não enfeite: é o TIPO da curva que o trajeto
     mandou. Só entra nome que existe no dicionário `I` — nome errado vira
     caixa vermelha na tela (a trava do `ic()`). */
  gps:{
    manobraIcone:'curvaDireita', manobraDist:'240 m', manobraVerbo:'Vire à direita',
    manobraRua:'R. São Judas', manobraDepois:'depois, siga em frente por 1,2 km',
    rumo:'N', velocidade:'38', velocidadeUnidade:'km/h',
    paradaN:'3', paradaTotal:'8', paradaNome:'Mercado São Judas',
    chegada:'12:26', chegadaRotulo:'chegada',
    restante:'45 min', restanteRotulo:'restante',
    distancia:'8,2 km', distanciaRotulo:'distância',
    /* 🔴 "Sair", nunca "Encerrar" (09/08). Este botão só volta pra tela Rota
       com a rota VIVA — não fecha dia, não devolve parada, não desfaz nada.
       Verbo destrutivo em botão que não destrói é a mesma mentira do "cancelar"
       de duas caras: quem lê "Encerrar" no meio do trânsito fica preso no GPS
       com medo de perder o dia. A CHAVE segue `encerrar` porque é o nome do
       slot no seam (a ponte não a reescreve); o que o motorista lê é o valor. */
    encerrar:'Sair',
    /* Os dois atalhos que dividem a linha de baixo com o Sair (10/08). São COPY
       fixa como o `encerrar`: a ponte não os reescreve, e por isso eles nunca
       "somem por falta de dado" — botão de saída e botão de registro não podem
       depender do que o servidor respondeu.
       "Registrar" é o verbo curto de "registrar o local onde eu estou": é dele
       que saem o cadastro na porta, a venda avulsa e a correção do endereço,
       todos com o GPS carimbado no toque (a folha da rua). */
    registrar:'Registrar', fechar:'Fechamento',
    chegouTitulo:'Você chegou', chegouEndereco:'R. São Judas, 142',
    chegouPrecisao:'GPS ±6 m, você está na porta',
    /* `chegouFaltamVerbo` é COPY com CONCORDÂNCIA: "faltam 5 paradas" mas
       "falta 1 parada". Quem escolhe a forma é quem sabe o número — a ponte —,
       e ela não inventa palavra: as duas são do desenho. O desenho só tinha a
       plural porque o exemplo dele tinha 5. */
    chegouFaltamVerbo:'faltam', chegouFaltam:'5 paradas',
    chegouKm:'6,4 km', chegouAcao:'Registrar entrega',
    /* 🔴 `chegouId` é o INTERRUPTOR do botão verde, e nasce VAZIO de propósito.
       No desenho não existe parada de verdade: sem id o botão não é desenhado,
       porque botão que promete "Registrar entrega" e não abre folha nenhuma é
       pior que vaga vazia — era exatamente o que estava no ar, um verde grande
       sem `data-acao`. Quem liga é a ponte, com a parada em que se chegou. */
    chegouId:'',
  },
  /* L4 — A PORTA. Os literais abaixo são os que estavam nos templates da folha
     de chegada e da folha da venda, MOVIDOS pra cá. `itens` é [ícone, nome,
     linha de baixo, quantidade]; `motivos` é a lista do "não entregue".
     🔴 O comprovante por FOTO saiu da folha na decisão do dono de 06/08 (0 uso
     na história do produto): chave que aparece e não controla nada é pior que
     chave ausente. */
  folha:{
    n:'3', cor:'lime', nome:'Maria Aparecida',
    endereco:'R. Sargento Silva Nunes, 72 • Moema', pill:'Chegou',
    cabecalho:'Parada 3 · Maria Aparecida',
    nota:'Portão azul · deixar na área · <b>cachorro solto</b>',
    itens:[
      ['gallon','Galão 20 Litros','previsto 2 · R$ 11,00 cada','2'],
      ['box','Água c/ gás 1,5L','previsto 1 · R$ 24,00 cada','0'],
    ],
    anterior:'R$ 21,00', hoje:'R$ 22,00', total:'R$ 43,00',
    forma:'dinheiro',
    motivos:['Ninguém atendeu','Cliente pediu pra voltar depois','Endereço não encontrado',
      'Sem troco / não tinha o dinheiro','Estabelecimento fechado'],
    motivo:'Ninguém atendeu',
  },
  venda:{
    n:'3', titulo:'Parada 3 • Maria Aparecida',
    endereco:'R. Sargento Silva Nunes, 72 • Moema', pill:'Chegou',
    produto:'Água Mineral HBX',
    tags:[['20L x1','blue'],['Vasilhame',''],['Chip dia','lime']],
    contaItem:'R$ 21,00', contaChegada:'R$ 21,00', lancamento:'R$ 21,00',
    recebido:'R$ 21,00', paraMarcado:'R$ 21,00', forma:'dinheiro',
  },
  /* L5 — O FECHAMENTO DO DIA. Literais do template do fechamento, MOVIDOS.
     `selo` é o cartão do canto ("Tudo certo!"); as formas são o caixa do dia. */
  fechamento:{
    entregues:'6', selo:'Tudo certo!',
    formas:[['cash','var(--lime)','Dinheiro','R$ 132,00'],['pix','var(--blue-l)','Pix','R$ 52,00'],
            ['card','var(--purple)','Cartão','R$ 84,00'],['note','var(--amber)','Marcado','R$ 68,00']],
    formaTotal:'R$ 336,00',
    clientes:'14', produtos:'20', marcado:'R$ 336,00',
  },
  /* L5b — O FIM DO DIA. Só o que é FATO do momento em que ele fechou: a hora e
     quem ficou pra amanhã. O dinheiro NÃO se repete aqui — a tela desenha o
     `fechamentoCorpo()`, o mesmo corpo da tela de Fechamento, porque número em
     dois donos é número que um dia diverge. `titulo` é COPY (texto do desenho,
     não vem de porta nenhuma) e por isso NÃO entra no apagador da demonstração;
     `quando` e `sobra` são DADO e nascem vazios no aparelho. */
  terminou:{ titulo:'Dia encerrado', quando:'Fechado às 19:12', sobra:'' },
  /* A SEMANA. `dias` é [dia, data, vendas, produtos, recebido, marcado]; slot sem
     fonte vai VAZIO e a coluna some — número de enfeite em tela de dinheiro é
     mentira com cara de app pronto. */
  semana:{
    dias:[
      ['Segunda','04/08','10','32','380,00','420,00'],
      ['Terça','05/08','11','36','412,00','468,00'],
      ['Quarta','06/08','9','28','301,00','340,00'],
      ['Quinta','07/08','12','40','478,00','512,00'],
      ['Sexta','08/08','13','44','560,00','620,00'],
      ['Sábado','09/08','8','24','260,00','288,00'],
    ],
    marcado:'R$ 2.648,00', recebido:'R$ 2.391,00', pendencia:'R$ 257,00',
  },
  /* L6 — CLIENTES. `lista` é [inicial, nome, endereço, dia, marcado, destaque,
     alerta, id]; o `id` no fim é o que faz o cartão virar botão (mesmo pacto do
     `stop()`: gancho nasce do dado). `diaSel` é o chip ligado (1=SEG…7=DOM). */
  clientes:{
    subtitulo:'14 na rota de hoje', busca:'', diaSel:3,
    lista:[
      ['JS','João da Silva','R. das Palmeiras, 145 • Santo Amaro','Chip dia','42,00',0,'',''],
      ['MB','Mercadinho Bom Preço','Av. João Dias, 890 • Brooklin','','84,00',0,'',''],
      ['MA','Maria Aparecida','R. Sargento Silva Nunes, 72 • Moema','Chip dia','21,00',1,'',''],
      ['PN','Padaria Pão Nosso','Av. Ibirapuera, 2331 • Moema','','42,00',0,'',''],
      ['LY','Larissa Ypê','Rua 3a, 1354 • Jd. Ypê','','',0,'sem número',''],
      ['BZ','Bar do Zé','R. dos Otonis, 317 • Jabaquara','','63,00',0,'',''],
      ['ME','Mercado Estrela','R. Aracanguá, 210 • Jabaquara','','84,00',1,'',''],
      ['QB','Quitanda do Bairro','R. das Orquídeas, 55 • Campo Belo','Chip dia','42,00',0,'',''],
      ['DC','Depósito Central','R. Dr. Jesuíno Maciel, 980 • Santo Amaro','','126,00',0,'',''],
    ],
    total:'128', semEndereco:'3', marcadoHoje:'R$ 336,00',
  },
  /* A FICHA. `dias` são os 7 dias em ordem SEG…DOM (1 = entrega nesse dia).
     `numeroPendente` acende o campo que RESOLVE a pendência — nunca um aviso
     solto no topo (a regra que o dono cobrou ~10 vezes). */
  /* CADASTRAR CLIENTE (o "+" do cabeçalho). Nasce VAZIO de propósito: é a única
     tela do app que começa em branco por natureza. `local` é o recado do GPS —
     vazio = ninguém apertou "Usar meu local" ainda. */
  novocliente:{ nome:'', telefone:'', cep:'', rua:'', numero:'', bairro:'', local:'', localOk:0, salvando:0 },
  /* 🔴 PARADA AVULSA — o "+" que voltou (dono, 09/08: "cadê o + que eu
     adicionava uma rota avulsa, e tinha opções?").

     Ele existia no app antigo com o nome "Rota rápida" e foi APAGADO em 07/08
     pela regra do satélite morto ("remove o ícone ou acha o caminho"): na
     virada pro app novo o MIOLO dele nunca tinha sido reescrito, então o botão
     não levava a lugar nenhum. A promessa escrita na época — "quando a frente
     vier, o botão volta COM ação" — é esta tela. O motor no servidor nunca foi
     tocado: `/logistica/geo/*`, `/nucleo/contas`, `/logistica/entregas` com
     `paraMinhaRota` e o `ordemManual` do `/rota/planejar` seguem de pé.

     Nasce EM BRANCO como o `novocliente`, e pelo mesmo motivo: são as duas
     telas do app que começam vazias por natureza. Tudo aqui tem porta na
     ponte — o que ela não souber responder não é desenhado (Lei do IF). */
  rapida:{
    volta:'montagem',    // a porta de entrada: Montagem ou Rota (ver `ficha.volta`)
    /* 🔴 AS DUAS PORTAS DO "+" (dono, 09/08: "eu quero montar uma rota AGORA,
       5 pontos, como eu faço?"). A tela nascia com UMA porta — endereço — e
       quem já era cliente só aparecia DEPOIS que o endereço resolvia. Montar
       5 pontos do próprio cadastro custava 5 endereços digitados. A porta
       `cadastro` é a que o mercado tem primeiro (Circuit, Route4Em, Onfleet):
       a rota é uma LISTA que se compõe, e a 1ª fonte da lista é a sua base. */
    // (Circuit, Route4Me, Onfleet — todas abrem pela lista, não pelo endereço.)
    /* 🔴 AQUI O DESENHO ABRE NO PAINEL, O APARELHO ABRE NA LISTA — de propósito.
       No aparelho quem manda é `rapidaEmBranco` (ponte), que publica
       `porta:'cadastro'`: a porta padrão continua sendo a base do dono. Este
       'endereco' é o estado da MAQUETE, pra que o painel da busca seja a tela
       que o mock mostra — e, com isso, a tela que o portão de pixel confere.
       Desenho que só existe atrás de um toque é desenho que ninguém mede. */
    porta:'endereco',    // 'cadastro' | 'endereco'
    busca:'bar do ze',   // o que o dedo escreveu — devolvido a cada repinte
    buscando:0, salvando:0,
    opcoes:[],           // [{titulo, detalhe, dist}] — as portas parecidas
    achado:null,         // {titulo, detalhe, quem} — a porta escolhida
    aviso:'',            // faixa âmbar: sem número, não achei, já está na rota
    modo:'direcao',      // 'direcao' | 'cadastro'
    soDirecao:0,         // link/coordenada colada: não há cadastro a fazer
    nome:'', pedeNome:0,
    temRota:0,           // rota de pé ⇒ a pergunta "onde ela entra" existe
    posicao:'perto',     // 'perto' | 'primeira'
    /* A porta do cadastro tem fonte PRÓPRIA (a lista de clientes) — por isso
       bandeiras próprias, e não as do `buscando` da busca de endereço: uma
       porta no chão não pode apagar a outra (a escada do `mioloDe`). */
    buscaCliente:'', listaCarregando:0, listaSemFonte:0,
    /* ---- O PAINEL DA BUSCA (F2, `docs/mockups/pesquisa-avulsa-v2.html`) ----
       UMA busca, TRÊS fontes, todas do nosso banco: `GET /logistica/busca`
       devolve clientes (fuzzy), ruas do Censo e comércios da RFB, já
       ranqueados pela distância do GPS. Aqui é só o DESENHO com dado de
       demonstração — quem enche no aparelho é a ponte, e ela escreve DIRETO
       no rolo a cada tecla (§ `roloDaBuscaAvulsa`), sem repintar a camada. */
    recentes:['Bar do Zé','Rua 8','Márcia'],   // as 6 últimas ESCOLHAS (do aparelho)
    /* 🔴 A DICA É TEXTO FIXO, e o "Procurando…" mora DENTRO do rolo. Pôr o
       estado do pedido numa peça de FORA do rolo obrigaria a passar pelo seam a
       cada tecla — que é exatamente o repinte que este painel existe pra não
       ter. Quem não achou nada AINDA não diz "não existe": diz "procurando". */
    semNada:0,           // respondeu e não achou nada (≠ ainda não perguntei)
    grupos:{
      clientes:[
        {titulo:'Marcos Bar do Zé',detalhe:'Av. 8, 402 · Centro · cliente desde 03/26',dist:'350 m',fonte:'cliente'},
      ],
      enderecos:[
        {titulo:'Rua 8',detalhe:'Centro · 214 portas no Censo',dist:'400 m',fonte:'censo',cep:'13500-100'},
      ],
      comercios:[
        {titulo:'Bar do Zé',detalhe:'Av. 8, 415 · Centro',dist:'350 m',fonte:'rfb'},
        {titulo:'Bar do Zé Bebidas',detalhe:'Rua 21, 780 · Cervezão',dist:'2,1 km',fonte:'rfb'},
        {titulo:'Bar do Zé',detalhe:'Piracicaba · Rua do Porto',dist:'34,0 km',fonte:'rfb'},
      ],
    },
    /* O DEGRAU DO NÚMERO. Só a rua escolhida abre o dele — e um por vez: duas
       perguntas de número abertas na mesma tela é o formulário de seis campos
       que esta tela existe pra não ser. */
    numAberto:-1,        // índice da rua com o degrau aberto (-1 = nenhum)
    numValor:'', numSn:0,
    colar:'',            // texto colado que é link do Maps/coordenada (cartão próprio)
    /* O PÉ SÓ NASCE COM ESCOLHA FEITA — {tipo, i, titulo, dist, cep}. Botão
       verde sem nada escolhido seria toque mudo, a doença que esta tela
       persegue. (`tipo`+`i` também MARCAM o cartão escolhido lá em cima: o pé
       e o cartão falam da mesma parada, e a tela mostra qual.) */
    pe:{tipo:'loja',i:0,titulo:'Bar do Zé',dist:'350 m',cep:'13500-100'},
    escolhidos:[],       // ids marcados — o que vai virar parada num toque só
    clientes:[
      {id:'c1',ini:'LY',nome:'Larissa Ypê',endereco:'Rua 3a, 1354 · Jd. Ypê'},
      {id:'c2',ini:'AD',nome:'Ademir',endereco:'Av. 28a, 507 · Vila Alemã'},
      {id:'c3',ini:'AL',nome:'Alfredo',endereco:'Rua 4-a, 93 · Jd. América'},
      {id:'c4',ini:'AA',nome:'Ana Alice',endereco:'Av. 28a, 507 · Vila Alemã'},
      {id:'c5',ini:'AY',nome:'Andreia/Yan bicicletaria',endereco:'Rua 8 JP, 210 · Jd. Paulista'},
      {id:'c6',ini:'ME',nome:'Mercado Estrela',endereco:'Rua Aracanguá, 210 · Jabaquara',naRota:1},
    ],
  },
  ficha:{
    ini:'LY', nome:'Larissa Ypê', resumo:'cliente desde 03/2025 · 42 entregas',
    /* 🔴 A FICHA VOLTA PRA ONDE ELA FOI ABERTA. O Voltar era `clientes`,
       cravado: quem abriu a ficha DE DENTRO da montagem (09/08, quando o cartão
       de lá ganhou o toque) voltava pra lista de Clientes e perdia a rota que
       estava montando. Quem sabe a porta de entrada é quem abriu — a ponte
       escreve este campo; sem ela vale o padrão de sempre. */
    volta:'clientes',
    alerta:'sem número',
    telefone:'(19) 99812-4477', cpf:'',
    cep:'13503-210', rua:'Rua 3a', numero:'', bairro:'Jd. Ypê',
    numeroPendente:1,
    /* EXCLUIR só existe pra quem o SERVIDOR aceita: `DELETE /nucleo/contas/:id`
       é ADMIN-only, e o mesmo `admin` dos Ajustes (ausência do bloco comercial
       no `GET /logistica/config`) é quem responde. Mostrar pro motorista daria
       403 — que o tradutor de erro do app vira "sua sessão expirou", mentira
       pior que o botão morto que este slot veio matar (08/08). */
    admin:1,
    /* GPS da ficha (10/08, ordem do dono: "injetar o GPS que pega o endereço") —
       mesmo par local/localOk do novocliente; a ponte preenche ao tocar. */
    local:'', localOk:0,
    observacoes:'Portão azul · deixar na área · cachorro solto',
    dias:[0,1,0,1,0,0,0],
    /* [ícone, nome, linha de baixo, ID DO VÍNCULO]. O id é o que dá o toque à
       linha (mesma lei do `stop()`); vazio = linha de maquete, inerte. */
    produtos:[
      ['gallon','Galão 20 Litros','2 por entrega · R$ 11,00 (catálogo)',''],
      ['box','Água c/ gás 1,5L','1 por entrega · <b style="color:var(--lime)">R$ 22,00 só pra ela</b>',''],
    ],
    /* FINANCEIRO DO CLIENTE (12/08) — a seção inteira só existe com o módulo
       ligado (`financeiro`), e só EDITA pra quem o servidor deixa (`financeiroEdita`,
       o mesmo sinal de admin do Excluir logo abaixo: o PATCH é ADMIN-only).
       `formas` vem da CONFIG da empresa (aceitaNaHora/aceitaMensal/aceitaFiado) —
       oferecer forma que a empresa desligou é prometer o que não vale. */
    financeiro:1, financeiroEdita:1,
    saldo:'R$ 36,00', limiteLido:'R$ 150,00',
    formas:[['na_hora','Na hora'],['mensal','Mensal'],['pendura','Marcar']],
    forma:'na_hora', metodo:'pix', diaFechamento:'', limite:'150,00',
    contabilizar:1, avisarCobranca:1,
  },
  /* L6b — VÍNCULO CLIENTE x PRODUTO (12/08). NÃO é a ficha do produto: aqui se
     mexe no que ESTE cliente leva (quantidade, preço acordado, porta, ativo),
     e o catálogo da empresa não muda um centavo. */
  fichavinculo:{
    volta:'ficha', novo:0, cliente:'Larissa Ypê',
    produto:'Galão 20 Litros', ico:'gallon', produtoId:'',
    catalogo:[], qtd:'2', preco:'22,00', precoPorCliente:1,
    precoDica:'Vazio = usa o preço do catálogo',
    locais:[], localId:'', ativo:1, podeRemover:1, salvando:0,
  },
  /* L7 — PRODUTOS. `lista` é [nome, linha de baixo, preço, cor, id]. A linha de
     baixo é TEXTO PRONTO porque a fonte muda: no mock é o estoque, no app é a
     unidade — o catálogo do celular não devolve estoque nem categoria, e o app
     de hoje nunca mostrou estoque nesta tela. Slot sem fonte SOME. */
  produtos:{
    busca:'', categorias:['Todos','Água','Vasilhames','Acessórios','Kits'], categoriaSel:0,
    lista:[
      ['Água 20L','Estoque: 128 un.','18,00','azul',''],
      ['Água 10L','Estoque: 86 un.','12,00','azul',''],
      ['Vasilhame','Estoque: 64 un.','42,00','azul-escuro',''],
      ['Chip dia','Estoque: 210 un.','2,00','lima',''],
      ['Caixa térmica','Estoque: 18 un.','85,00','cinza',''],
      ['Kit entrega','Estoque: 32 un.','35,00','azul',''],
      ['Água c/ gás 1,5L','Estoque: 54 un.','24,00','azul',''],
      ['Suporte de galão','Estoque: 12 un.','69,00','cinza',''],
    ],
    ativos:'8', estoqueBaixo:'2', valorEstimado:'R$ 194,00',
  },
  fichaproduto:{
    nome:'Galão 20 Litros', resumo:'no catálogo desde 03/2025 · 1.284 entregas',
    selo:'ativo', unidade:'galão', preco:'R$ 11,00', estoque:'128',
    estoqueDica:'do controle de estoque',
  },
  /* L8 — CHAT COM A CENTRAL. `recado` vazio esconde o cartão do portão (não há
     nada a confirmar). `conversa` é [lado, texto, hora, anexo] — lado 'deles' ou
     'minha'. `sino` é o contador do cabeçalho, um só pra TODAS as telas.

     O 4º slot é o ANEXO (12/08): a parada ou a rota salva que a Central grudou
     no texto. Ausente = mensagem de sempre, e é assim que 99% das linhas ficam.
     `encaixar:1` é "existe rota ativa" — quem responde isso é a ponte. */
  chat:{
    recado:'Passa no Mercado Estrela antes das 11h', recadoTitulo:'Recado da Central',
    conversa:[
      ['deles','Bom dia! A Larissa remarcou pra quinta.','08:12'],
      ['minha','Beleza, tirei da rota.','08:14'],
      ['deles','Passa no Mercado Estrela antes das 11h, eles fecham pro almoço.','09:03',
        {id:'a1',tipo:'parada',nome:'Mercado Estrela',detalhe:'R. das Orquídeas, 55',estado:'pendente',encaixar:1}],
      ['minha','Tô a 2 paradas.','09:05'],
      ['deles','Se der, pega a rota da quarta depois do almoço.','09:06',
        {id:'a2',tipo:'rota',nome:'Quarta Centro',detalhe:'6 paradas',estado:'encaixada',encaixar:1}],
      ['deles','Show. Qualquer coisa me chama.','09:08'],
    ],
    sino:2, vazio:'',
  },
  /* L9 — AJUSTES, RECARGA e CONSUMO. Chave sem fonte nao vira chave: o grupo
     "Sem internet" inteiro some porque o download de mapa e o pacote offline
     sairam no corte de 06/08 (o PMTiles guarda 60 km sozinho, sem botao). */
  ajustes:{
    creditosLinha:'240 créditos',
    admin:1,
    sons:1, painelCreditos:1,
    grupoOffline:1, mapaBaixando:'Baixando o mapa · 62%', mapaBaixado:'14,2 MB de 23,0 MB', mapaPct:62,
    empresa:'Água Rio Claro', versao:'Versão beta1.3.2 (202)',
    versaoSub:'toque para procurar atualização', versaoTag:'',
  },
  /* As 6 chaves de dinheiro do Avançado. `admin` NÃO é papel inventado na tela:
     é o que o próprio `GET /logistica/config` responde — pra quem não é
     responsável financeiro o bloco comercial vem AUSENTE, e é essa ausência que
     o app lê (o mesmo `isAdmin()` do app que já roda).
     "Avisar chegada" mora AQUI desde 07/08 (ordem do dono: sai da raiz dos
     Ajustes, entra no Avançado). O "modo caderneta" morreu na mesma ordem — e
     em 09/08 a palavra saiu do produto inteiro: é o FECHAMENTO DO DIA. */
  avancado:{
    admin:1, financeiro:1, cobrancaSimples:0, precoPorCliente:1,
    naHora:1, mensal:1, fiado:1,
    avisarChegadaDist:'500 m', avisarChegada:1,
    /* 🔴 A CHAVE DO PROSPECTOR ATRAVESSOU O VIDRO (09/08). Ela só existia no
       desktop, e o capítulo que ensina a ligar terminava em "vá pro
       computador" — lição que acaba fora do app é lição que ninguém faz.
       `prospectorDisponivel` é a empresa PODER ter (o campo existe na config);
       `prospector` é estar ligada. São dois, e não um, pelo mesmo motivo do
       `admin`: chave que a empresa não pode ter não vira linha na tela. */
    prospector:0, prospectorDisponivel:1,
    /* PROSPECTOR v2 (12/08) — o que a PESSOA escolheu pra ESTA semana. A linha
       dos Ajustes deixa de ser uma chave liga/desliga e passa a mostrar a
       ESCOLHA ("Prospector · Mercados"), porque é ela que manda de verdade:
       chave ligada sem escolha é prospector mudo, e uma chave que diz "ligado"
       com a rua toda azul seria a tela mentindo. Vazio = ninguém escolheu. */
    prospectorTipo:'',
  },
  /* A FOLHA DA ESCOLHA (PROSPECTOR v2, 12/08). `tipos` vem do SERVIDOR (a
     curadoria mora lá, em logistica-prospector-tipos.ts) — a tela não tem uma
     segunda cópia da lista, senão as duas divergem no primeiro ajuste. */
  prospectortipo:{
    tipo:'mercado',
    tipos:[
      {slug:'mercado',rotulo:'Mercados e mercearias'},
      {slug:'restaurante',rotulo:'Restaurantes e lanchonetes'},
      {slug:'bar',rotulo:'Bares'},
      {slug:'padaria',rotulo:'Padarias e confeitarias'},
      {slug:'farmacia',rotulo:'Farmácias e drogarias'},
      {slug:'salao',rotulo:'Salões e barbearias'},
      {slug:'oficina',rotulo:'Oficinas e autopeças'},
      {slug:'construcao',rotulo:'Materiais de construção'},
    ],
  },
  /* O TUTOR. Quem escreve é a ponte, no boot; o motor só LÊ.
     🔴 AUSENTE ≠ VAZIO, e aqui isso é o coração da coisa: enquanto
     `carregando` valer 1 o motor não decide NADA — não dispara o obrigatório e
     não esconde capítulo. Chave que não chegou é "não sei", e "não sei" nunca
     apaga uma lição nem prende ninguém num tutorial.
     `obrigatorioVisto` é do USUÁRIO (vem do servidor), não do aparelho: por
     aparelho ele repetiria a cada reinstalação e sumiria no celular novo — a
     mesma lição que o recado já custou. O resto é a empresa: `admin`,
     `financeiro`, `chat` e os dois do prospector decidem quais capítulos
     existem pra esta pessoa. */
  tutorial:{
    carregando:0, obrigatorioVisto:0,
    admin:1, financeiro:1, chat:1,
    /* `prospectorVejo` = "esta pessoa enxerga os prédios" (admin sempre,
       funcionário só com a chave da equipe). É a régua do servidor, traduzida
       pela ponte; separada de `prospectorAtivo`, que é só "a empresa ligou". */
    prospectorAtivo:0, prospectorDisponivel:1, prospectorVejo:0,
  },
  /* A ABERTURA NÃO TEM SEÇÃO DE DADO, e isso é de propósito — ver o comentário
     em cima do `.splash-barra`, na folha. Slot com valor de desenho aqui NÃO
     resolveria: o `casca-conferir` mede mock e app PIXEL A PIXEL, então o que
     o desenho mostrar o aparelho mostra igual; e a abertura é a única tela que
     a ponte não repinta (cena com relógio), então o `apagarDemonstracao` nunca
     alcança o que o `pintar(false)` do fim desta folha já pintou. Sem porta, a
     linha sai do DESENHO — não é escondida no aparelho. */
  /* 🔴 CRÉDITOS — UMA TELA SÓ (09/08, pedido do dono: *"faça uma tela só, com
     os dados de consumo e bônus, e a recarga de créditos; foco na recarga"*).
     Eram DUAS linhas vizinhas na Administração abrindo duas telas que falam do
     MESMO número: "Recarga de créditos" mostrava o saldo e vendia pacote,
     "Consumo e bônus" mostrava o saldo de novo e o extrato. Saldo em dois
     cartões é bug de produto — e pra recarregar, que é o ato que traz dinheiro,
     o dono tinha que adivinhar qual das duas portas era.

     🔴 UMA SEÇÃO, DUAS PORTAS DE REDE — e por isso DOIS PARES de estado. O
     saldo e os pacotes vêm de `/credits/me`; o movimento vem de
     `/logistica/creditos/extrato`. `carregando`/`semFonte` são do primeiro (a
     espinha da tela) e `movCarregando`/`movSemFonte` são do segundo. Extrato
     fora do ar NÃO pode tirar a recarga do ar: quem entrou aqui pra comprar
     crédito compra do mesmo jeito, com o extrato mostrando "tentar de novo" no
     seu próprio quadrado.

     O catálogo de demonstração é o catálogo REAL de fábrica (starter/growth/
     scale, 100/300/800 por R$ 97/247/597). Os R$ 49/129/239/449 com "+8%
     grátis" que moravam aqui não existem em servidor nenhum — desenho de tela
     de dinheiro que inventa preço ensina o preço errado a quem desenha depois.

     `detalhe` (6º campo do pacote) é COMPOSTO pela ponte a partir de `price`,
     `credits` e `defaultExpiryDays` — preço por crédito é a única conta que
     responde "qual é o mais barato", e validade é a pergunta que ninguém faz
     antes de o crédito vencer. */
  creditos:{
    saldo:'240', vence:'60 vencem em 12/09',
    pacotes:[['100','97,00','',0,'starter','R$ 0,97 por crédito · vale 90 dias'],
             ['300','247,00','Mais vendido',1,'growth','R$ 0,82 por crédito · vale 90 dias'],
             ['800','597,00','',0,'scale','R$ 0,75 por crédito · vale 90 dias']],
    cta:'Recarregar 300 créditos · R$ 247,00',
    mes:'agosto', gastosHoje:'14', gastosMes:'63', bonus:'24',
    /* 🔴 SÓ ENTRA O QUE O EXTRATO ITEMIZA: entrega rastreada e bônus. O crédito
       "essencial" (1 por bloco de rota) o servidor devolve como TOTAL do mês,
       nunca linha a linha — então ele vive no cartão "no mês" e não inventa
       linha nenhuma aqui. Desenho que mostra uma linha que o app não sabe
       preencher é promessa que o aparelho quebra. */
    linhas:[
      ['menos','Entrega rastreada','hoje 06:12','2'],
      ['menos','Entrega rastreada','ontem 17:40','2'],
      ['mais','Bônus de julho','creditado em 01/08','24'],
    ],
    vazio:'',
  },
  /* L11b — AJUSTES · FINANCEIRO. 🔴 ERA A ÚLTIMA TELA 100% CRAVADA do app, e a
     pior que sobrou: TODOS os números moravam no template como texto literal —
     não havia seam nenhum, então o `apagarDemonstracao` não tinha o que zerar e
     passava por cima calado. Medido por toque no g15 com a bancada (company 39,
     UMA entrega de R$ 20,00): "Recebido hoje R$ 336,00", "Em aberto R$ 257,00",
     a quebra por forma inteira, TRÊS devedores com nome e sobrenome (Maria
     Aparecida R$ 74,00, Bar do Zé R$ 96,00, Mercado Estrela R$ 87,00) e uma
     semana de R$ 2.648,00. Nome de gente que não existe cobrando dinheiro que
     não existe, dentro da Administração.

     A régua é a do §4.6.5 (a mesma da cura do GPS): o que é DADO zera sem fonte;
     o que é COPY fica. E 🔴 SLOT SEM FONTE SOME INTEIRO — com rótulo, unidade e
     separador. Aqui isso vale por SEÇÃO: `.grupo` é um título ("Por forma,
     hoje") que só existe pra apresentar a caixa de baixo. Título de pé sobre
     caixa vazia é a mesma mentira de antes, só que mais feia — então o par
     título+caixa nasce junto e some junto.

     DADO: recebido · emAberto · formas · marcou · devedores · semanaRecebido ·
           semanaMarcado · semanaPendencia.
     COPY: os rótulos, que vivem DENTRO do condicional de cada slot (mesmo
           pacto do fechamento do dia) — e o "Dinheiro/Pix/Cartão" de
           cada linha de `formas`, que viaja NO dado justamente porque a forma
           que não teve dinheiro não entra na lista (Lei do IF).

     `devedores` é [iniciais, nome, sub, valor, classe do avatar]. O `sub` ("3
     marcações · a mais antiga de 28/07") é o único pedaço desta tela SEM PORTA
     em servidor nenhum — ver o `carregarFinanceiro` da ponte. */
  financeiro:{
    recebido:'R$ 336,00', emAberto:'R$ 257,00',
    formas:[['cash','var(--lime)','Dinheiro','R$ 132,00'],['pix','var(--blue-l)','Pix','R$ 52,00'],
            ['card','var(--purple)','Cartão','R$ 84,00']],
    marcou:'R$ 68,00',
    devedores:[
      ['MA','Maria Aparecida','3 marcações · a mais antiga de 28/07','R$ 74,00',''],
      ['BZ','Bar do Zé','2 marcações · desde 02/08','R$ 96,00',''],
      ['ME','Mercado Estrela','1 marcação · ontem','R$ 87,00','lime'],
    ],
    semanaRecebido:'R$ 2.391,00', semanaMarcado:'R$ 2.648,00', semanaPendencia:'R$ 257,00',
  },
  /* (A seção `consumo:` morava AQUI e foi fundida na `creditos:` lá de cima —
     mesma tela, mesmo número. As linhas dela eram do desenho e nenhuma existia:
     "Rota de quarta · 14 paradas" e "Recarga · pacote 300 · Pix" não saem de
     porta nenhuma — o extrato do servidor só itemiza entrega rastreada e bônus,
     e Pix não existe no checkout deste app.) */
  /* L10 — ROTAS SALVAS. `lista` e [nome, quando, paradas, produtos, marcado,
     icone, destaque, id]. "Duplicar" e o menu de tres pontos NAO entram: criar
     e editar modelo sairam no corte de 06/08 (isso e trabalho de escritorio,
     no desktop). Abrir GERA a rota do dia a partir do modelo. */
  salvas:{
    busca:'', total:'6 rotas salvas', ordem:'Mais recentes', acoes:1,
    // O 9º campo é o CABEÇALHO do dia: só a 1ª linha de cada dia o carrega.
    lista:[
      ['Zona Sul manhã','23 de maio, 2025','15','20','184,00','map',0,'','Segunda'],
      ['Centro tarde','22 de maio, 2025','12','18','152,40','route',0,''],
      ['Sábado água 20L','17 de maio, 2025','18','1','98,00','gallon',0,'','Quarta'],
      ['Rota Moema','16 de maio, 2025','14','17','126,30','flag',1,''],
      ['Rota Brooklin','15 de maio, 2025','11','16','110,20','map',0,'','Sábado'],
      ['Rota clientes fiéis','10 de maio, 2025','9','14','87,60','users',1,''],
    ],
  },
  /* A MONTAGEM É A TELA DE MONTAR (07/08, ordem do dono: "clico em montar rota
     e aparece uma tela para montar a rota"). `dias`/`diaSel` são os chips do
     dia (vêm da ponte; sem eles a linha não existe). `pronta` é o que troca o
     botão do pé: 0 = ainda por montar → "Montar rota"; 1 = montada → "Iniciar
     rota". Botão de iniciar em rota que não existe foi o erro que o dono viu
     na cara ("monte a rota antes"). */
  montagem:{
    titulo:'Montagem de rota',
    somaParadas:'6', somaProdutos:'20', somaValor:'R$ 336,00',
    iniciarSub:'João da Silva',
    dias:[], diaSel:0, pronta:1, vazio:'Nenhum cliente nesse dia',
    // Vazios pelo MESMO motivo dos `dias`: nome de espaço é dinheiro do dono na
    // tela. Maquete aqui faria o motorista ler "Manhã" num espaço que não existe.
    modos:[], modoSel:'',
    // demo do HISTÓRICO (09/08) — dado vivo vem da ponte; aqui é só a peça.
    /* Os TRÊS desfechos do dia (10/08) — o desenho mostra os três porque é assim
       que a tela vai estar num dia real: completa, incompleta (teve trabalho e
       sobrou parada) e cancelada (criou e cancelou, nada aconteceu). As duas
       últimas vermelhas, com o que ficou por fazer à direita. */
    historico:[
      {data:'2026-08-08',dia:'Sáb',titulo:'Sáb · 08/08',sub:'95 paradas'},
      {data:'2026-08-06',dia:'Qui',titulo:'Qui · 06/08',sub:'32 paradas · 28 entregues',tom:'red',naoFez:'4 não feitas'},
      {data:'2026-08-05',dia:'Qua',titulo:'Qua · 05/08',sub:'7 paradas · cancelada',tom:'red',naoFez:'7 não feitas'},
      {data:'2026-08-04',dia:'Ter',titulo:'Ter · 04/08',sub:'52 paradas'},
    ],
    /* A linha da montagem é a MESMA do `.stop` da rota (ver `T.montagem`): um
       objeto, não mais uma tupla posicional de 8 casas. Foi a tupla que fez o
       cartão daqui virar cópia — cada campo novo da rota (`pill`, `perna`,
       `nota`, o gancho de toque) exigia uma 9ª casa e ninguém a abria. */
    /* 🔴 A DIREITA DA MONTAGEM MUDOU DE PERGUNTA (12/08, ordem do dono). Era
       "Marcado + Pendente" em TODAS as linhas — o rótulo do fiado sobre o valor
       da venda, e uma coluna inteira repetindo a mesma palavra. Virou:
         Valor         = quantidade x preco desta entrega (o mesmo número de antes)
         Ult. Registro = a última entrega CONCLUÍDA deste cliente (DD/MM), ou
                         "Pendente" quando nunca houve nenhuma.
       A pílula NÃO sumiu: ela volta assim que a parada tem desfecho de verdade
       (linhas 3 e 6 aqui), que é quando ela é notícia. */
    linhas:[
      {n:1,hora:'08:30',nome:'João da Silva',rua:'R. das Palmeiras, 145',bairro:'Santo Amaro',tags:[['20L x2','blue'],['Vasilhame'],['Chip dia','lime']],marcado:'42,00',marcRot:'Valor',reg:['Ult. Registro','05/08'],perna:''},
      {n:2,hora:'09:15',nome:'Mercadinho Bom Preço',rua:'Av. João Dias, 890',bairro:'Brooklin',tags:[['20L x4','blue'],['Vasilhame']],marcado:'84,00',marcRot:'Valor',reg:['Ult. Registro','01/08'],perna:'850 m · 4 min'},
      {n:3,hora:'10:05',cor:'lime',nome:'Maria Aparecida',rua:'R. Sargento Silva Nunes, 72',bairro:'Moema',tags:[['20L x1','blue'],['Chip dia','lime']],marcado:'21,00',marcRot:'Valor',reg:['Ult. Registro','29/07'],pill:['Entregue','lime','check'],perna:'1,2 km · 6 min'},
      {n:4,hora:'10:45',nome:'Padaria Pão Nosso',rua:'Av. Ibirapuera, 2331',bairro:'Moema',tags:[['20L x2','blue'],['Vasilhame']],marcado:'42,00',marcRot:'Valor',reg:['Ult. Registro','06/08'],perna:'620 m · 3 min'},
      {n:5,hora:'11:30',nome:'Bar do Zé',rua:'R. dos Otonis, 317',bairro:'Jabaquara',tags:[['20L x3','blue'],['Vasilhame']],marcado:'63,00',marcRot:'Valor',reg:['Ult. Registro','Pendente'],perna:'2,1 km · 9 min'},
      {n:6,hora:'12:15',cor:'off',nome:'Mercado Estrela',rua:'R. Aracanguá, 210',bairro:'Jabaquara',tags:[['20L x4','blue'],['Chip dia','lime']],marcado:'84,00',marcRot:'Valor',reg:['Ult. Registro','04/08'],pill:['Não entregue','mute','close'],perna:'sem trajeto — não sei onde fica'},
    ],
  },
};
/** Entra dado novo numa seção e a tela se repinta — SÓ se algo mudou de verdade.
    🔴 O FREIO DO PISCA (07/08): a ponte relê a config a cada minuto e a cada
    volta de foco, e escrevia aqui mesmo com o dado idêntico — e cada escrita
    troca o DOM inteiro (`pintar` monta outra camada). Tela repintando por
    minuto na cara do motorista era o "fica piscando às vezes". Dado igual
    morre aqui, sem repinte; quem muda de verdade continua pintando na hora. */
function usarDados(secao,valor){
  const atual=DADOS[secao]||{}, novo=valor||{};
  const mudou=Object.keys(novo).some(k=>JSON.stringify(atual[k])!==JSON.stringify(novo[k]));
  if(!mudou) return;
  DADOS[secao]=Object.assign({},atual,novo);
  if(typeof pintar==='function') pintar(false);
}

/* ==========================================================================
   A 1ª PINTURA DE QUEM BUSCA NO SERVIDOR — esqueleto, nunca demonstração.

   🔴 Tela que carrega ao abrir nascia com o dado de DEMONSTRAÇÃO desta folha
   (João da Silva, Mercadinho Bom Preço). São 60 ms na bancada, mas numa rede
   ruim o motorista lê nome de cliente que não existe — mentira com cara de app
   pronto. Agora nasce ESQUELETO; e se a fonte não responder, nasce o aviso, não
   uma lista vazia que finge que a base está vazia (a Lei nº1: "vazio porque o
   servidor disse vazio" e "vazio porque a rede caiu" são opostos).

   `carregando` e `semFonte` nascem AUSENTES em `DADOS`: quem os liga é a ponte,
   no aparelho. Então o mock — que é o DESENHO — continua byte a byte o mesmo.
   ========================================================================== */
/* 🔴 As barras vão SOLTAS, nunca dentro do `.lista-card`: o `.esq` é feito de
   `var(--card)` e o cartão TEM `background:var(--card)` — esqueleto dentro do
   cartão fica invisível (medido: um retângulo vazio). É por isso que a `rota`
   já desenhava assim, contra o fundo da página. */
const esqLista=(n)=>`<div style="margin-top:6px">${'<div class="esq esq-linha"></div>'.repeat(n)}</div>`;
const semFonte=(glifo,acao)=>`<div class="vazio">
  <span class="ico">${ic(glifo,24)}</span>
  <strong>Não consegui carregar</strong>
  <span>Sem resposta do servidor agora.</span>
  <button class="ghost" data-acao="${acao}">${ic('refresh',15)} Tentar de novo</button></div>`;
/* 🔴 A MESMA ESCADA, COM AS BANDEIRAS NA MÃO. Uma tela pode ter DUAS fontes de
   rede independentes — a de Créditos tem: `/credits/me` traz saldo e pacotes,
   `/logistica/creditos/extrato` traz o movimento. Com um par único de bandeiras
   por SEÇÃO, a queda de uma porta apagaria o bloco da outra: extrato no chão
   levaria junto a recarga, que é o que a pessoa veio fazer. Aqui cada bloco
   sobe, cai e se recupera sozinho, com o seu próprio "Tentar de novo". */
const mioloDe=(carregando,sem,glifo,acao,linhas,conteudo)=>
  carregando ? esqLista(linhas) : sem ? semFonte(glifo,acao) : conteudo;
/** O miolo de uma tela de lista: esqueleto → aviso → o conteúdo de verdade. */
const miolo=(d,glifo,acao,linhas,conteudo)=>
  mioloDe(d.carregando,d.semFonte,glifo,acao,linhas,conteudo);

/* 1 — ROTA DO MOTORISTA, com os 7 estados que o app tem de verdade --------- */
let estadoRota='rodando';
let PARADAS=[
  {n:1,hora:'08:30',nome:'João da Silva',rua:'R. das Palmeiras, 145',bairro:'Santo Amaro',tags:[['20L x2','blue'],['Vasilhame'],['Chip dia','lime']],marcado:'42,00',pill:['A caminho','blue','nav'],perna:''},
  {n:2,hora:'09:15',nome:'Mercadinho Bom Preço',rua:'Av. João Dias, 890',bairro:'Brooklin',tags:[['20L x4','blue'],['Vasilhame']],marcado:'84,00',pill:['A caminho','blue','nav'],perna:'850 m · 4 min'},
  {n:3,hora:'10:05',cor:'lime',nome:'Maria Aparecida',rua:'R. Sargento Silva Nunes, 72',bairro:'Moema',tags:[['20L x1','blue'],['Chip dia','lime']],marcado:'21,00',pill:['Chegou','lime','check'],perna:'1,2 km · 6 min'},
  {n:4,hora:'10:45',cor:'lime',nome:'Padaria Pão Nosso',rua:'Av. Ibirapuera, 2331',bairro:'Moema',tags:[['20L x2','blue'],['Vasilhame']],marcado:'42,00',pill:['Chegou','lime','check'],perna:'620 m · 3 min'},
  {n:5,hora:'11:30',nome:'Bar do Zé',rua:'R. dos Otonis, 317',bairro:'Jabaquara',nota:'cachorro solto no pátio',tags:[['20L x3','blue'],['Vasilhame'],['15 min','amber'],['Janela rígida','red']],marcado:'63,00',pill:['Pendente','amber','clock'],perna:'2,1 km · 9 min'},
  {n:6,hora:'12:15',cor:'off',nome:'Mercado Estrela',rua:'R. Aracanguá, 210',bairro:'Jabaquara',tags:[['20L x4','blue'],['Chip dia','lime']],marcado:'84,00',pill:['Pendente','mute','clock'],perna:'sem trajeto — não sei onde fica'},
];
/* 🔴 O CONECTOR É UMA PEÇA SÓ, USADA PELAS DUAS LISTAS (dono, 09/08: ele pediu
   a seta e a distância "entre um cliente e outro" na MONTAGEM, e ali não havia
   conector nenhum). Ele vivia embutido no `listaParadas` da rota; embutido, a
   montagem teria que reescrever o mesmo HTML — e casca duplicada é casca que
   sai de sincronia no primeiro ajuste de cor.
   "sem trajeto" ganha o tom de ALERTA: não é uma distância a menos, é um pino
   faltando. Com a mesma cara do "850 m · 4 min" ele passava batido. */
function perna(txt){
  if(!txt) return '';
  const semRota=String(txt).startsWith('sem');
  return `<div class="perna${semRota?' alerta':''}">
    <span>${ic(semRota?'alert':'seta',12)}${txt}</span></div>`;
}
function listaParadas(comPerna){
  return PARADAS.map(p=>`${comPerna?perna(p.perna):''}${stop(p)}`).join('');
}
/* ==========================================================================
   ⚰️ A LISTA SEPARADA POR DESFECHO MORREU COM O MODO AGENDA (09/08, no mesmo
   dia em que nasceu).

   Ela existia SÓ no estado sem rota: os três grupos ("Agendadas", "Entregues",
   "Não entregues · 137") eram o corpo da tela "Agenda de hoje" do print do
   dono. Com o modo agenda fora, esta tela só abre COM rota montada — e aí a
   lista É a sequência da visita, que não se quebra em três blocos (quebrar põe
   a parada 7 depois da 40). Quem conta desfecho durante a rota é o filtro
   "Fila / Entregue", que já mora aqui embaixo.

   Fica o registro do porquê, que é o que se leva pra próxima: agrupar lendo a
   PÍLULA seria amarrar a separação à copy; o desfecho viajava como DADO (`st`,
   o status cru do servidor). Se um dia voltar, volta assim.
   ========================================================================== */
/* Quantas paradas o dia ainda ESPERA. É a conta que decide duas coisas — o
   número do KPI sem rota e o verbo do rodapé (`dockDaRota`) —, e por isso mora
   num lugar só: KPI dizendo "30 agendadas" com um botão que responde "nenhuma
   entrega aberta" seriam duas verdades diferentes sobre o mesmo dia.
   Parada de maquete não tem `st` e conta como aberta: o mock segue igual. */
const paradasAbertasNaTela=()=>PARADAS.filter(p=>{
  const s=String(p.st||''); return s!=='entregue'&&s!=='cancelada';}).length;
/* 🔴 EXISTE ROTA NO DIA? — a régua da PORTA da lista (09/08, com a morte do
   modo agenda). Ela inclui o `semsinal`, e é essa a diferença pra régua da
   BARRA do mapa: sem sinal a rota está montada e guardada no aparelho (o
   próprio `dockDaRota` manda o rodapé do `pronta` nesse estado), e é justamente
   offline que o motorista mais precisa abrir a lista das paradas. A barra do
   mapa continua com a régua dela, mais curta, porque lá o estado GANHA da
   contagem: "Sem sinal" e "12 paradas" não cabem na mesma linha de 412px. */
const temRotaNoDia=e=>e==='pronta'||e==='rodando'||e==='pausada'||e==='semsinal';
/* O RODAPÉ DA ROTA — a mesma conta pro mapa e pra lista. As duas telas
   escreviam esta escada à mão, em duas cópias que já divergiam num ponto (a
   lista lia `DADOS.rota.montando`, o mapa lia o `d` local); e é numa cópia
   dessas que o estado novo aparece só em metade das telas. */
/* 🔴 `semparada` NÃO ERA ALCANÇÁVEL NO MOCK — e por isso a tela que o dono
   estava olhando no aparelho não existia aqui (09/08: *"nem existe essa tela no
   mock"*). Ele é um estado DERIVADO: nasce de `montar` + zero parada aberta, e
   o mock sempre teve as 6 paradas de maquete, então a conta nunca dava zero e o
   rodapé de um dia vazio nunca aparecia no desenho. Agora ele é também um chip
   do topo (`data-er="semparada"`), que entra direto por baixo da derivação.
   LEI: estado que o aparelho consegue mostrar tem que ter porta no mock —
   estado sem porta é estado que se desenha no escuro. */
function dockDaRota(e){
  if(DADOS.rota.montando) return transmux('montando');
  if(e==='semsinal') return transmux('pronta');
  if(e==='montar'&&!paradasAbertasNaTela()) return transmux('semparada');
  return transmux(e);
}
/* A SEMANA DA AGENDA — uma linha por dia, com quantas pessoas esperam nele.
   Sem fonte não existe bloco: ver `DADOS.rota.semana`.
   🔴 QUEM CHAMA É A MONTAGEM, e só com a lista vazia (dono, 09/08). Ela nasceu
   na tela da agenda; quando a agenda saiu, a pergunta que ela responde — "então
   quando eu entrego?" — continuou existindo, e mudou pra tela onde o dia se
   decide. */
function semanaAgenda(){
  const d=DADOS.rota;
  if(!Array.isArray(d.semana)||!d.semana.length) return '';
  return `<div class="grupo">${d.semanaTitulo}</div>
  <div class="semana">${d.semana.map(x=>`
    <div class="d${x[3]?' hoje':''}${x[2]?'':' vazio-dia'}">
      <span class="nm">${x[1]}${x[3]?' · hoje':''}</span>
      <span class="qt">${x[2]}<small>${x[2]==1?'cliente':'clientes'}</small></span>
    </div>`).join('')}</div>`;
}
/* 🔴 A LISTA SE ENTRA POR DENTRO, ENTÃO ELA TEM VOLTA. Desde 08/08 quem abre a
   aba Rota vê o MAPA; a lista é a tela de dentro. Sem o Voltar no header o
   botão do Android não teria par aqui e o único caminho de saída seria a
   própria aba — que é a definição de tela sem porta. */
function shellRota(conteudo,dock){
  return `${status}${hdr({voltar:'rota'})}
    <div class="body${dock?' com-dock':''}">${conteudo}</div>
    ${dock?`<div class="tmx-dock">${dock}</div>`:''}${nav('rota')}`;
}
/* ==========================================================================
   A TELA PRINCIPAL DA ROTA = O MAPA, 2D E LIMPO (dono, 08/08).

   O que ela mostra é o DIA VISTO DE CIMA: as paradas numeradas na ordem, onde
   o motorista está e o traço da rota quando o roteador já disse por onde é.
   Nada mais. Os painéis que moravam aqui (kpis, saldo, dinheiro/pix, barra do
   dia, filtro, créditos, a lista e a soma) mudaram de casa pra `T.rotalista` —
   não morreram, andaram UM toque: o botão "Lista" da barra de cima.

   🔴 O DOCK CONTINUA SENDO O DOCK. O transmux é o controle da operação em
   andamento e a lei dele não mudou de tela: rodapé fixo, logo acima das abas,
   nunca rolando. Aqui ele fica por cima do mapa — que é o mesmo lugar de
   sempre, só com outra coisa embaixo.

   🔴 FALHA DE CARREGAR NÃO GANHA MAPA. Dia que não veio do servidor com um
   mapa bonito por baixo é a tela fingindo que está tudo em ordem: o estado
   `vazia` continua sendo o aviso, sozinho, como já era.
   ========================================================================== */
T.rota={nome:'Rota do dia (mapa 2D)',grupo:'Rota',render(){
  const e=estadoRota, d=DADOS.rota;
  const emCurso=e==='rodando'||e==='pausada';
  const dock=dockDaRota(e);

  if(e==='vazia') return `${status}${hdr({})}
    <div class="body">
      <div class="vazio">
        <span class="ico">${ic('route',24)}</span>
        <strong>Rota indisponível</strong>
        <span>Não consegui carregar o dia de hoje.</span>
        <button class="ghost">${ic('refresh',15)} Tentar de novo</button>
      </div>
    </div>${nav('rota')}`;

  /* O FATO DO DIA em UMA linha, montado por JOIN — o " · " nasce do join e nunca
     do template, senão um número sem fonte deixa o separador órfão na barra
     (a mesma lei do rodapé da navegação). Dia ainda por montar diz isso com
     PALAVRA ("Sem paradas hoje"): um "0 paradas" pareceria contagem de verdade.
     E fato nenhum ⇒ nada escrito: ícone sozinho é cromo, mas número inventado
     numa barra que fala do dia é pior. */
  /* 🔴 O ESTADO GANHA DA CONTAGEM. Os banners de "Sem sinal" e "Rota pausada"
     ficaram na lista, e aqui não existe linha pra eles: sem isto o mapa dizia
     "12 paradas · 6 entregues" e nem uma palavra sobre o dia estar PARADO ou o
     aparelho estar SEM REDE — que é a informação mais importante das duas. A
     barra é o fato do dia; quando o dia está num estado, o estado É o fato, e o
     "entregues" cede a vaga (a linha é uma, e nome de estado + duas contagens
     não cabe em 412px — este app já perdeu texto por isso). */
  /* 🔴 E O GPS ENTRA NA MESMA FILA, NO TOPO DELA (dono, 09/08: *"cadê minha
     localização?"*). Pela lei de cima, quando o dia está num estado o estado É
     o fato — e "não sei onde você está" é o estado mais forte que esta tela
     pode ter: sem posição, o ponto não existe, o botão de centralizar não tem
     onde centralizar e o mapa vira um pedaço de cidade qualquer. Vinha ANTES
     dos outros dois de propósito: rota pausada com GPS desligado é o GPS que
     precisa de dedo, a pausa espera.
     'negado' é ALARME e a barra inteira vira BOTÃO — o único jeito de sair
     dali é a permissão do Android, então a informação e a porta são a mesma
     peça. 'procurando' informa e não alarma: ele se resolve sozinho em
     segundos, e âmbar piscando pra coisa que passa é o app gritando à toa. */
  const gps = d.gps==='negado'     ? ['gps','Localização desligada','alerta','gps-ligar']
            : d.gps==='procurando' ? ['gps','Procurando você…','',''] : null;
  const aviso = gps            ? gps
              : e==='pausada'  ? ['pause','Rota pausada','pausa']
              : e==='semsinal' ? ['alert','Sem sinal','alerta'] : null;
  /* 🔴 SEM ROTA MONTADA A BARRA NÃO CONTA PARADA (dono, 09/08: ele cancelou a
     rota, limpou tudo, e a tela continuou dizendo "52 paradas · 0 entregues").
     Aquele 52 era a AGENDA do dia — clientes que ninguém montou — vestida de
     rota pronta. É a mesma régua dos pinos do mapa (`rotaMontada` na ponte),
     e aqui ela sai de graça do estado que esta folha JÁ tem na mão: paradas só
     existem depois de montar. A contagem some inteira e o `vazioTitulo` assume,
     que é a frase que esta barra já usava pra dia sem rota.
     Por que a régua mora AQUI e não no dado: `kpiParadas` é lido por mais
     quatro telas (lista, foto, fechamento, semana), onde ele é o total do DIA e
     tem que continuar aparecendo. Esvaziar o campo apagaria o número lá também
     — a régua é desta barra, então o dono dela é esta linha. */
  const temRota=e==='pronta'||emCurso;
  const entregues=emCurso?d.kpiEntregues:d.kpiEntreguesParado;
  const conta=[aviso?`<b>${aviso[1]}</b>`:'',
               (temRota&&d.kpiParadas)?`<b>${d.kpiParadas}</b> paradas`:'',
               (aviso||!temRota||!entregues)?'':`<b>${entregues}</b> entregues`]
              .filter(Boolean).join(' <small>·</small> ');
  /* 🔴 O DIA POR MONTAR MERECE UMA LINHA A MAIS — e SÓ ele (09/08, dono, sobre
     a tela inicial da rota: *"essa é a tela 2d e tá um lixo"*). O que a tela
     dizia era "Sem paradas hoje" e ponto: um fato sem saída, numa faixa fina em
     cima de um mapa vazio. A frase está certa (a lei acima: PALAVRA, nunca um
     "0 paradas" que pareceria contagem) — o que faltava era dizer POR QUE o
     mapa está vazio e o que enche ele.
     🔴 E NÃO ENTRA BOTÃO AQUI. O dock desta mesma tela já é o "Montar rota"
     (`transmux('semparada')`), grande e no alcance do polegar. Repetir o verbo
     numa segunda peça é a receita de o motorista aprender que existem dois
     lugares pra mesma coisa — e de um dia os dois discordarem. A dica NOMEIA a
     ação que já está na tela; quem executa continua sendo um botão só.
     Só no vazio LIMPO: com aviso (GPS, pausa, sem sinal) o estado é OUTRO e ele
     é que manda na barra — duas explicações empilhadas seria a barra falando
     por cima de si mesma. */
  const abertas = paradasAbertasNaTela();
  const vazioNoMapa = !temRota && !aviso && e!=='carregando' && !abertas;
  /* 🔴 O DIA QUE EXISTE APARECE (dono, 10/08: *"rota que se auto cria e eu não
     vejo ela criada"*). Company 41 tinha 51 paradas agendadas esperando e esta
     barra dizia "Sem paradas hoje" do mesmo jeito, porque `conta` só nasce com
     `temRota` (a lei duas telas acima) — o dia por montar caía direto no
     `vazioTitulo` mesmo com o servidor cheio. A régua que separa os dois
     vazios é a mesma de sempre, `paradasAbertasNaTela()`: zero é vazio DE
     VERDADE (frase intacta, linha de cima); uma ou mais é dia esperando
     montagem, e ganha a MESMA moldura de duas linhas — mas com "agendadas",
     nunca "paradas" seco, que pareceria rota pronta e ressuscitaria a mentira
     que a lei de cima matou. */
  const diaPorMontar = !temRota && !aviso && e!=='carregando' && !!abertas;
  const fato = e==='carregando'
    ? '<span class="esq" style="height:15px;width:118px;border-radius:8px"></span>'
    : vazioNoMapa
      ? `<span class="txt"><span><b>${d.vazioTitulo}</b></span><em>${d.vazioDica}</em></span>`
      : diaPorMontar
        ? `<span class="txt"><span><b>${abertas} paradas agendadas</b></span><em>${d.vazioDica}</em></span>`
        : `<span>${(PARADAS.length||aviso)&&conta?conta:`<b>${d.vazioTitulo}</b>`}</span>`;

  return `${status}${hdr({})}
<div class="body flush" style="overflow:hidden;padding:0">
  <div class="plano${dock?' com-dock':''}">
    ${mapa()}
    <div class="plano-bar${aviso&&aviso[2]?' '+aviso[2]:''}${(vazioNoMapa||diaPorMontar)?' estado':''}">
      ${aviso&&aviso[3]
        ? `<button class="f" data-acao="${aviso[3]}">${ic(aviso[0],16)}${fato}</button>`
        : `<span class="f">${ic(aviso?aviso[0]:'route',16)}${fato}</span>`}
      ${/* 🔴 SEM ROTA NÃO HÁ LISTA PRA ABRIR (dono, 09/08: *"estou inclinado a
           remover o agenda"*). Este botão era a única porta do modo agenda — a
           tela que dizia "0 agendadas" e listava 137 canceladas num domingo
           sem cliente nenhum. Com o modo morto, o botão sem rota abriria uma
           tela sem assunto; e quem quer ver quem espera hoje tem a MONTAGEM, a
           um toque daqui pelo dock (satélite "Montagem", ou o próprio "Montar
           rota" quando o dia não tem nada aberto).
           Porta que some junto com o que ela abria não deixa beco: o dock desta
           mesma tela é quem carrega as ações do dia por montar. */''}
      ${temRotaNoDia(e)?`<button class="ghost" data-ir="rotalista">${ic('list',15)} Lista</button>`:''}
    </div>
    ${/* 🔴 O MESMO BOTÃO, DOIS TRABALHOS — e ele tem que DIZER qual é o da vez.
         Com rota, ele devolve o dia inteiro pra tela; sem rota (o dia por
         montar) não há o que enquadrar e o que ele faz é ir até MIM. O código
         já era esse (`enquadrarGeral` com um ponto só = a minha posição); o que
         faltava era o nome — "Enquadrar a rota" num dia sem rota é botão
         prometendo coisa que não existe. */''}
    ${/* 🔴 O ALVO DIZ QUANDO ESTÁ TRABALHANDO. Ele é o botão mais apertado desta
         tela e não tinha estado nenhum: sem posição, o toque ia buscar o GPS e a
         tela não mudava um pixel — então o dedo tocava de novo, e de novo, que é
         o desenho ensinando que o botão não funciona. `buscando` é o mesmo dado
         que a barra já usa ('procurando'), lido no mesmo lugar: uma fonte, duas
         peças. Ele se apaga sozinho quando o fix chega. */''}
    <div class="plano-lado">
      <button data-acao="mapa-enquadrar"${d.gps==='procurando'?' class="buscando"':''}
        aria-label="${temRotaNoDia(e)?'Enquadrar a rota':'Centralizar em mim'}">${ic('target',19)}</button>
    </div>
  </div>
</div>
${dock?`<div class="tmx-dock">${dock}</div>`:''}${nav('rota')}`;
}};

/* Os chips de dia MUDARAM DE TELA em 07/08 — moram na Montagem, ao lado da
   lista que eles trocam. Aqui eles ficavam a uma tela de distância do efeito. */
/* 🔴 ESTA ERA A `T.rota` ATÉ 08/08, INTEIRA — mudou de nome e de porta, não de
   conteúdo: os 7 estados, os kpis, o caixa, a barra do dia, o filtro, os
   créditos, a lista com os gestos (`data-gestos="rota"`) e a soma continuam
   byte a byte aqui. O que mudou é quem abre: agora ela é a LISTA por trás do
   mapa, e o header ganha o Voltar (o botão do Android tem que casar com a
   porta pela qual se entrou). */
T.rotalista={nome:'Rota do dia · lista (7 estados)',grupo:'Rota',render(){
  const e=estadoRota;
  const rodando=e==='rodando', pausada=e==='pausada', montada=e==='pronta';
  const emCurso=rodando||pausada;
  /* 🔴 ESTA TELA SÓ EXISTE COM ROTA (dono, 09/08). Ela tinha duas
     personalidades: com rota montada era a lista da operação; sem rota virava
     "Agenda de hoje", com outro título, outro KPI, a lista quebrada em três
     grupos e a semana no pé. O modo agenda saiu inteiro — a porta que o abria
     (o botão "Lista" da barra do mapa) só nasce com rota, ver `temRotaNoDia`.
     O que sobra aqui é UMA tela com UM assunto, e por isso nada mais pergunta
     "tem rota?" folha adentro: era espalhando essa pergunta por três funções
     que a mentira dos pinos nasceu em três lugares. */
  /* O NOME DA TELA. `.screen-head` é a peça central dos títulos (centralizada
     pela régua de 08/08) — a mesma da Montagem, que é a tela vizinha: título
     que muda de tamanho a um toque de distância é o defeito que "padronizar é
     IGUALAR" descreve. Sem ícone de propósito: uma linha acima já mora o botão
     redondo de Voltar, e dois glifos empilhados na margem viram um só. */
  const cabeca=`<div class="screen-head"><span>
      <h2>${DADOS.rota.titulo}</h2>
      ${DADOS.rota.dataLonga?`<p>${DADOS.rota.dataLonga}</p>`:''}</span></div>`;

  // O esqueleto é do CONTEÚDO; o rodapé de controle não é conteúdo e por isso
  // não vira esqueleto nem desaparece — ver `ROTA_ESTADOS.carregando`.
  if(e==='carregando') return shellRota(`
    <div class="kpis"><div class="kpi esq" style="height:47px;border:0"></div><div class="kpi esq" style="height:47px;border:0"></div>
      <div class="kpi esq" style="height:47px;border:0"></div></div>
    <div class="esq" style="height:34px;margin-top:6px"></div>
    <div style="margin-top:6px">${'<div class="esq esq-linha"></div>'.repeat(5)}</div>`, transmux('carregando'));

  if(e==='vazia') return shellRota(`
    <div class="vazio">
      <span class="ico">${ic('route',24)}</span>
      <strong>Rota indisponível</strong>
      <span>Não consegui carregar o dia de hoje.</span>
      <button class="ghost">${ic('refresh',15)} Tentar de novo</button>
    </div>`);

  // Dia sem parada nenhuma NÃO é "rota indisponível" (aquilo é falha de
  // carregar). Aqui isto virou GUARDA, não estado de trabalho: com o modo
  // agenda fora, quem chega nesta tela tem rota, e rota tem parada. Se um dia
  // a lista chegar vazia mesmo assim (corrida entre o estado e o dado), a tela
  // diz o fato em vez de desenhar uma casca sem conteúdo. A semana saiu daqui
  // pra Montagem junto com o modo agenda — era ela quem respondia o domingo.
  if(!PARADAS.length) return shellRota(`${cabeca}
    <div class="vazio">
      <span class="ico">${ic('route',24)}</span>
      <strong>${DADOS.rota.vazioTitulo}</strong>
    </div>`, dockDaRota(e));
  /* `kpiParadas` é o total do DIA (o servidor manda `itens.length` cru, e outras
     quatro telas leem esse campo como total). Aqui ele é o que sempre quis ser:
     as paradas da rota que está de pé. O "107 paradas" que eram 107 canceladas
     morreu com o modo agenda — sem rota, esta tela não abre. */
  return shellRota(`${cabeca}
  <div class="kpis">
    <div class="kpi"><span style="color:var(--lime)">${ic('route',20)}</span><span><b class="v">${DADOS.rota.kpiParadas}</b><span class="l">paradas</span></span></div>
    <div class="kpi"><span style="color:var(--lime)">${ic('check',20)}</span><span><b class="v">${emCurso?DADOS.rota.kpiEntregues:DADOS.rota.kpiEntreguesParado}</b><span class="l">entregues</span></span></div>
    ${DADOS.rota.saldo?`<div class="kpi money"><span class="l">Saldo</span><b class="v">${DADOS.rota.saldo}</b><span class="go">${ic('chev',15)}</span></div>`:''}
    ${(DADOS.rota.dinheiro||DADOS.rota.pix)?`<div class="kpi split">
      ${DADOS.rota.dinheiro?`<span class="ln"><span style="color:var(--lime)">${ic('cash',16)}</span><span><span class="t" style="color:var(--lime)">Dinheiro</span><span class="m">${DADOS.rota.dinheiro}</span></span></span>`:''}
      ${DADOS.rota.pix?`<span class="ln"><span style="color:var(--blue-l)">${ic('pix',16)}</span><span><span class="t" style="color:var(--blue-l)">Pix</span><span class="m">${DADOS.rota.pix}</span></span></span>`:''}
    </div>`:''}
  </div>
  ${e==='semsinal'?`<div class="banner alerta">${ic('alert',16)}<span><b>Sem sinal.</b> A rota está guardada no aparelho.</span><button>Sincronizar</button></div>`:''}
  ${pausada?`<div class="banner pausa">${ic('pause',16)}<span><b>Rota pausada.</b> Os dados ficam guardados.</span></div>`:''}
  <!-- 🔴 "Ver mapa" AGORA VOLTA PRO MAPA, não abre a navegação. Ele apontava
       pra tela de DIRIGIR (3D, tela cheia, sem barra): quem só queria olhar o
       dia caía dentro do GPS. Com o mapa 2D sendo a tela principal, o par certo
       é o de ida e volta — Lista ↔ Mapa. Quem começa a dirigir é o transmux. -->
  <!-- 🔴 A SEGUNDA PORTA DO "+" (09/08). Com a rota RODANDO a Montagem fica
       inalcançável — o satélite da direita ali é "Finalizar", não "Montagem" —
       e é justamente dirigindo que aparece a parada avulsa de verdade: o
       cliente liga, o dono manda um endereço no WhatsApp. Sem esta porta, quem
       está na rua teria que cancelar a rota pra adicionar uma parada nela.
       Aqui o encaixe é o que interessa: "No caminho" põe a parada onde ela
       custa menos, em vez de jogar pro fim do dia. -->
  <div class="bar"><span class="t">${ic('list',17)} Sua rota de hoje</span>
    <button class="ghost" data-ir="rapida" aria-label="Adicionar parada">${ic('plus',15)} Adicionar parada</button>
    <button class="ghost" data-ir="rota">${ic('map',15)} Ver mapa</button></div>
  ${emCurso?`<div class="dia-bar"><small>${DADOS.rota.diaFeitas} de ${DADOS.rota.diaTotal}</small><span class="trilho"><i style="width:${DADOS.rota.diaPct}"></i></span><b>${DADOS.rota.diaMarcado}</b><small>marcado</small></div>`:''}
  ${emCurso?`<div class="filtro">
      <button class="on">Fila <b>${DADOS.rota.filtroFila}</b></button><button>Entregue <b>${DADOS.rota.filtroEntregue}</b></button></div>`:''}
  ${/* O crédito do dia. O ramo "monte a rota pra saber" mudou de tela junto com
       o modo agenda: ele falava de um dia SEM rota, e dia sem rota agora é
       assunto da Montagem — que é onde o toque que gasta o crédito acontece.
       Aqui sobra o que esta tela sabe: a rota está de pé, e iniciar debita
       tanto. */''}
  ${montada?`<div class="creditos">${ic('card',17)}
      <span><b class="v">${DADOS.rota.creditos}</b> <small>créditos hoje</small></span>
      <span class="debita">${DADOS.rota.creditosDebita?`Iniciar debita ${DADOS.rota.creditosDebita}`:'não consegui o custo agora'}</span></div>`:''}
  <div class="stops" data-gestos="rota">${listaParadas(emCurso)}</div>
  <div class="sum" data-ir="fechamento">
    <span class="c"><span style="color:var(--lime)">${ic('box',17)}</span><span><b>${DADOS.rota.somaProdutos}</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--ink-2)">${ic('receipt',17)}</span><span><b>${DADOS.rota.somaMarcado}</b><small>marcado</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('check',17)}</span><span><b>${emCurso?DADOS.rota.kpiEntregues:DADOS.rota.kpiEntreguesParado}</b><small>entregas</small></span></span>
    <span class="go">${ic('chev',15)}</span>
  </div>
  ${emCurso?''   /* o Finalizar é o satélite do dock: no polegar, sem rolar a lista inteira */
           :`<button class="act full" style="margin-top:8px;justify-content:center" data-ir="fechamento">${ic('note',17)}<b>Fechamento do dia</b></button>`}
  `, dockDaRota(e));
}};


/* ⚰️ A TELA DE RESERVA MORREU (09/08, ordem do dono: *"já remove do mock e da
   tela standby"*).

   `T.rotafoto` — "Rota — igual à foto" — era a versão ANTIGA desta tela,
   guardada como referência das fotos do desenho original. Ela não tinha porta
   nenhuma (nenhum `data-ir` no app inteiro apontava pra cá): só existia na
   fileira do visualizador, e viajava dentro do APK como tela morta.

   Por que ela some agora, e não "fica que não atrapalha":
   · Era uma CÓPIA da tela de Rota — a peça que não recebe nada do que a
     original ganha. Enquanto a Rota virava mapa, ganhava régua de rota
     montada, arrasto, desfecho e dock, esta seguia com "Iniciar próxima
     parada" e a lista de 6 nomes de mentira.
   · E os nomes de mentira são o custo real: João da Silva, Mercadinho Bom
     Preço, Bar do Zé — cliente que não existe, com rua e valor, na mesma
     fileira das telas de verdade.
   Quem quiser a foto antiga abre o git. Referência é história, não tela. */

/* O MUNDO DO GPS — desenhado achatado e inclinado pelo CSS. A rua em que se
   anda é a coluna do meio: como o carro fica no centro horizontal, ele cai em
   cima dela em qualquer altura, e o giro à direita aparece lá na frente. */
function mapaGps(){ return `<div class="mapa-palco" data-mapa="gps">${mapaGpsDesenho()}</div>`; }
function mapaGpsDesenho(){
  const quadra=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="var(--map-quadra)"/>`;
  /* UM TRAÇO DA COBRA = dois caminhos no mesmo `d`: o CORPO, que cresce, e a
     CABEÇA, um risco curto e aceso viajando colado na ponta (a conta mora na
     folha de estilo, no bloco "3 — A COBRA").
       `l`   comprimento do caminho, em unidades do viewBox — a régua do
             `stroke-dashoffset`. Escrito à mão porque TODA linha aqui é reta:
             é a soma dos segmentos. Medir com `getTotalLength()` obrigaria o
             desenho a estar no DOM antes do primeiro quadro da cena, e a cena
             não pode depender de nada ter subido.
       ini   a hora de brotar · `dur` quanto leva · `cab` a espessura da
             cabeça (0 = galho SEM cabeça).
     🔴 CABEÇA SÓ NOS TRAÇOS QUE MANDAM — tronco, avenidas, ruas do horizonte e
     a rota: 6 e não 20. Cada caminho a mais é o mundo em perspectiva inteiro
     repintado de novo a cada quadro, e esta é a tela mais cara do app (medida
     lá embaixo). Os galhos que saem de trás da via principal já se leem pelo
     próprio crescimento — quem precisa da ponta acesa é quem LIDERA. */
  const traco=(d,l,ini,dur,cor,w,cab)=>
    `<path class="m-corpo" d="${d}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="--l:${l}px;--d:${ini}s;--t:${dur}s"/>`+
    (cab?`<path class="m-cabeca" d="${d}" fill="none" stroke-width="${cab}" stroke-linecap="round" stroke-linejoin="round" style="--l:${l}px;--h:${cab*5}px;--d:${ini}s;--t:${dur}s"/>`:'');
  const RUA='var(--map-rua2)', TRONCO='M400 1420 V520 H800';
  /* AS RUAS QUE BROTAM DO TRONCO: [y do cruzamento, hora]. A hora é onde a
     ponta do tronco passa nele — (1420-y)/1300 do percurso, começando em .26
     e durando .52 s. Elas saem PROS DOIS LADOS a partir de x=400, que é o que
     dá o galho abrindo em vez de a rua acendendo. */
  const cruz=[[1180,.36],[960,.44],[750,.53],[555,.61]];
  /* 🔴 A ORDEM DE PINTURA NÃO É A ORDEM DO TEMPO, e as duas convivem: no SVG
     quem vem depois cobre quem veio antes, então as ruas finas têm que ficar
     EMBAIXO do leito da rota (senão elas riscam por cima da pista, que é o
     desenho errado). O tronco nasce aos 260 ms mas é pintado depois das ruas
     — e é por isso que cada galho parece SAIR DE TRÁS da via principal. */
  return `<div class="gps-mundo"><svg viewBox="0 0 800 1400" preserveAspectRatio="xMidYMax slice">
    <rect width="800" height="1400" fill="var(--map-fundo)"/>
    <path d="M600 180h230v210H600z" fill="var(--map-parque)"/>
    ${quadra(40,1000,300,140)}${quadra(460,1000,300,140)}${quadra(40,780,300,150)}
    ${quadra(460,780,300,150)}${quadra(40,590,300,120)}${quadra(460,590,300,120)}
    ${quadra(40,380,300,140)}${quadra(60,180,250,120)}
    <g class="m-cobra">
      ${cruz.map(([y,q])=>traco(`M400 ${y}H-40`,440,q,.30,RUA,17,0)+traco(`M400 ${y}H840`,440,q,.30,RUA,17,0)).join('')}
      ${traco('M110 1180V-20',1200,.56,.42,RUA,13,8)}${traco('M110 1180V1420',240,.56,.18,RUA,13,0)}
      ${traco('M690 1180V-20',1200,.56,.42,RUA,13,8)}${traco('M690 1180V1420',240,.56,.18,RUA,13,0)}
      ${traco('M110 350H840',730,.85,.30,RUA,17,10)}${traco('M110 350H-40',150,.85,.10,RUA,17,0)}
      ${traco('M690 165H-40',730,.92,.30,RUA,17,10)}${traco('M690 165H840',150,.92,.10,RUA,17,0)}
      ${traco(TRONCO,1300,.26,.52,'var(--map-leito)',48,16)}
      ${traco(TRONCO,1300,.84,.42,'var(--map-rota-borda)',34,0)}
      ${traco(TRONCO,1300,.84,.42,'var(--map-rota)',23,16)}
    </g>
    <g class="m-pontilhado" stroke="var(--map-fundo)" stroke-width="3" stroke-dasharray="16 22" opacity=".5">
      <path d="M400 1420 V520 H800" fill="none"/>
    </g>
  </svg></div>`;
}

/* 2 — ROTA INICIADA = GPS ------------------------------------------------
   Ordem do dono (06/08): "suma tudo ao redor, ficar igual GPS". Aqui não
   existe cabeçalho, abas nem cartão de resumo — só o mapa, a parada da vez e
   UMA ação. O "Chegou" não fica aceso: ele nasce quando o aparelho chega
   (regra que já existe no app hoje, pelo raio de chegada).
   -------------------------------------------------------------------------- */
/* Dois estados, dois MAPAS diferentes — e essa é a regra, não enfeite:
   DIRIGINDO → mapa inclinado, girado pelo rumo, carro a 68%, manobra mandando.
   CHEGOU    → a navegação ACABOU. Volta o mapa de VISÃO GERAL (o mesmo da
               rota), porque a pergunta mudou: não é mais "por onde eu vou",
               é "onde eu estou e o que falta". Manter a visão de direção com
               o carro parado na porta é tela mentindo sobre o que se faz ali. */
/* AS EMPRESAS DO CORREDOR — duas camadas, e a divisão tem motivo:
   `empresasChao()` é MUNDO e entra ANTES da névoa do horizonte, pra empresa
   lá longe ficar embaçada junto com a rua (é o que faz ela parecer estar no
   chão, e não colada no vidro); `empresasCromo()` é INTERFACE e entra depois,
   por cima de tudo.

   🔴 Só na tela de DIRIGINDO. Na de "chegou" a pergunta é outra — o motorista
   está na porta e a tela tem UMA ação — e cinco prédios em cima dela seriam
   ruído numa hora em que ninguém vai prospectar.

   🔴 O GANCHO NASCE DO DADO: `data-acao` só sai quando a empresa tem `id`
   real, e `data-lat/lng` só saem quando há coordenada. É isso que mantém
   desenho e app byte a byte iguais — e que impede botão sem porta. */
function empresasDoMapa(){ const d=DADOS.mapa||{}; return Array.isArray(d.empresas)?d.empresas:[]; }
/* --- O PRÉDIO ISOMÉTRICO do mock rota (gps-ruas-prospector-v4), 1:1.
       Meia-largura 15, altura 20; as janelas são PARALELOGRAMOS DA FACE,
       calculados no plano da face — retângulo colado por cima é o que fazia
       o prédio parecer adesivo. --- */
const EMP_BW=15, EMP_BH=20;
const empFaceEsq=(a,b)=>({x:-EMP_BW+EMP_BW*a, y:-EMP_BW/2+(EMP_BW/2)*a-EMP_BH*b});
const empFaceDir=(a,b)=>({x:EMP_BW*a,         y:-(EMP_BW/2)*a-EMP_BH*b});
function empJanela(f,a,b,da,db){
  const p=[f(a,b),f(a+da,b),f(a+da,b+db),f(a,b+db)];
  return p.map(q=>`${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');
}
const EMP_JANELAS=[
  ['e',.14,.28,.30,.20],['e',.14,.60,.30,.20],['e',.56,.44,.30,.20],
  ['d',.16,.30,.28,.20],['d',.56,.30,.28,.20],['d',.36,.62,.28,.20]
];
function svgPredio(ordem){
  const fila=(n)=>{                       // ordem [3,0,5,...] = lugar de cada janela na fila
    const p=Array.isArray(ordem)?ordem[n]:n;
    return Number.isFinite(p)?p:n;
  };
  const jan=EMP_JANELAS.map(([f,a,b,da,db],n)=>
    `<polygon class="emp-jan" style="--j:${fila(n)}" points="${empJanela(f==='e'?empFaceEsq:empFaceDir,a,b,da,db)}"/>`).join('');
  return `<svg viewBox="-30 -56 60 64">
    <ellipse class="emp-luz" cx="0" cy="0" rx="27" ry="13"/>
    <ellipse class="emp-sombra" cx="1.5" cy="1" rx="16" ry="7"/>
    <circle class="emp-varre" cx="0" cy="0" r="14"/>
    <path class="emp-aro" d="M-20,0 A20,9.5 0 1,1 20,0 A20,9.5 0 1,1 -20,0 Z" transform="translate(0,0)"/>
    <polygon class="emp-esq"  points="-15,-7.5 0,0 0,-20 -15,-27.5"/>
    <polygon class="emp-dir"  points="0,0 15,-7.5 15,-27.5 0,-20"/>
    <polygon class="emp-topo" points="0,-20 15,-27.5 0,-35 -15,-27.5"/>
    ${jan}
    <circle class="emp-pe" cx="0" cy="0" r="2.2"/>
  </svg>`;
}
function empresasChao(){
  const lista=empresasDoMapa(); if(!lista.length) return '';
  return lista.map(e=>{
    const nome=e.nome||'';
    const gancho=e.id?` data-acao="abrir-empresa" data-empresa="${e.id}"`:'';
    const geo=(e.lat!=null&&e.lng!=null)?` data-lat="${e.lat}" data-lng="${e.lng}" data-dist="${e.distM||0}"`:'';
    /* 🔴 A COR VEM DO SERVIDOR, NUNCA DA TELA (PROSPECTOR v2, 12/08). `escolhida`
       é o CNAE da empresa batendo no TIPO que a pessoa escolheu pra semana — e
       essa pergunta se responde no backend, com a curadoria na mão. A tela só
       veste a classe. E o `on` só sai JUNTO com o `escolhida`: azul é ambiente,
       e ambiente não fala (a ponte defende de novo em `vestirFase`). */
    const verde=e.escolhida?' escolhida':'';
    return `<div class="emp no-ar${verde}${e.aceso&&e.escolhida?' on':''}"${gancho}${geo}
      style="--x:${e.x||'50%'};--y:${e.y||'50%'};--esc:${e.esc||1};--n:${nome.length||1};--atraso:${e.atraso||'0s'}">
      <span class="emp-obj">${svgPredio(e.ordem)}</span>
      <span class="emp-rotulo">
        <span class="emp-chip-nome"><i class="pt"></i><b class="emp-nome">${nome}</b>
          <span class="emp-trilho"><i class="emp-barra"></i></span></span>
        <span class="emp-guia"></span>
      </span>
    </div>`;
  }).join('');
}
function empresasCromo(){
  const d=DADOS.mapa||{}; if(!empresasDoMapa().length) return '';
  return `${d.chip?`<div class="emp-chip">${d.chip}</div>`:''}<div class="emp-scan"></div>`;
}

/* 🔴 NENHUM LITERAL AQUI DENTRO. Todo o cromo desta tela vem de `DADOS.gps`
   (ver o seam, seção L3b) e cada pedaço SÓ EXISTE se tiver fonte.
   `trilha` é a régua: o " · " é do `join`, nunca do template — assim o campo
   que não veio leva o separador embora junto, em vez de deixar um "·" órfão
   boiando no mapa. */
function telaGps(chegou){
  const g=DADOS.gps||{};
  const trilha=(ps)=>ps.filter(Boolean).join(' · ');
  const paradaDeM=(g.paradaN&&g.paradaTotal)?`Parada <b>${g.paradaN} de ${g.paradaTotal}</b>`:'';
  /* o número grande + o rótulo embaixo: sem número não sobra rótulo sozinho
     ("chegada" sem hora é uma coluna vazia com legenda). */
  /* 🔴 `data-vivo` — A MARCA DO QUE MUDA A CADA SEGUNDO (08/08). Aqui no
     desenho ela não faz NADA: é atributo inerte, não pinta um pixel, e o mock
     no navegador segue idêntico. Ela existe pro APARELHO: a tela de dirigir
     tinha a camada INTEIRA reconstruída toda vez que a distância da manobra
     caía de 90 m pra 80 m, e reconstruir a camada arranca o mapa do pai e o
     enxerta noutro — que é a piscada. Com a marca, a ponte troca o TEXTO no
     lugar e a tela não é derrubada. Só ganha marca o que é texto puro num nó
     só: o que muda a ESTRUTURA da tela (a manobra que nasce, o pedaço que
     some) continua repintando, que é o certo. */
  const num=(v,rot,destaque,campo)=>v
    ?`<span class="n${destaque?' destaque':''}"><b${campo?` data-vivo="${campo}"`:''}>${v}</b>${rot?`<small>${rot}</small>`:''}</span>`:'';

  if(chegou){
    const rodape=trilha([paradaDeM,g.chegouFaltam?`${g.chegouFaltamVerbo||''} <b>${g.chegouFaltam}</b>`:'',
      g.chegouKm?`<b>${g.chegouKm}</b>`:'']);
    const baixo=trilha([g.chegouEndereco,g.chegouPrecisao?`${ic('gps',13)} ${g.chegouPrecisao}`:'']);
    return `${status}
<div class="body flush" style="overflow:hidden;padding:0">
  <div class="gps">
    ${mapa()}
    <div class="gps-manobra chegou">
      <div class="cima">
        <span class="seta">${ic('check',30)}</span>
        <span>${g.chegouTitulo?`<b class="dist">${g.chegouTitulo}</b>`:''}${g.paradaNome?`
          <span class="verbo">${g.paradaNome}</span>`:''}</span>
      </div>
      ${baixo?`<div class="baixo">${baixo}</div>`:''}
    </div>
    <div class="gps-lado" style="bottom:118px">
      <button data-acao="gps-centrar" aria-label="Recentralizar">${ic('target',24)}</button>
    </div>
    <!-- 🔴 ESTA TELA ERA UM BECO SEM SAÍDA (09/08). Quem chegava na parada não
         tinha PORTA nenhuma: nem um data-ir, nem um data-acao — e o verde
         grande, o botão mais chamativo do app, era MORTO (toque no vidro, nada
         acontecia). Agora são duas portas na mesma linha do ramo de dirigir: o
         verde abre a folha da parada e o "Sair" volta pro mapa 2D com a rota
         viva, no MESMO canto do polegar das duas telas. O verde só existe se
         houver chegouId: sem parada de verdade a vaga fica vazia, nunca com um
         botão fingindo. (Sem CRASE aqui dentro: este comentário mora num
         template literal e a crase o fecharia — foi o que eu quase fiz agora,
         escrevendo o nome do campo entre crases.) -->
    <div class="gps-rodape">
      ${rodape?`<div class="parada">${ic('route',14)} <span class="txt">${rodape}</span></div>`:''}
      <div class="linha" style="justify-content:flex-end">
        ${g.chegouId?`<button class="act go full" style="justify-content:center"
          data-acao="abrir-parada" data-parada="${g.chegouId}">${ic('check',20)}<b>${g.chegouAcao||''}</b></button>`:''}
        <button class="sair" data-ir="rota">${g.encerrar||''}</button>
      </div>
    </div>
  </div>
</div>`;
  }

  /* A MANOBRA INTEIRA SOME sem trajeto — cartão arredondado vazio no topo do
     mapa é cromo fingindo que sabe pra onde ir. */
  const manobraBaixo=trilha([g.manobraRua,g.manobraDepois]);
  const manobra=(g.manobraIcone||g.manobraDist||g.manobraVerbo||manobraBaixo)
    ?`<div class="gps-manobra">
      <div class="cima">
        ${g.manobraIcone?`<span class="seta">${ic(g.manobraIcone,30)}</span>`:''}
        <span>${g.manobraDist?`<b class="dist" data-vivo="manobraDist">${g.manobraDist}</b>`:''}${g.manobraVerbo?`<span class="verbo" data-vivo="manobraVerbo">${g.manobraVerbo}</span>`:''}</span>
      </div>
      ${manobraBaixo?`<div class="baixo">${manobraBaixo}</div>`:''}
    </div>`:'';
  const rodape=trilha([paradaDeM,g.paradaNome?`<b>${g.paradaNome}</b>`:'']);

  return `${status}
<div class="body flush" style="overflow:hidden;padding:0">
  <div class="gps dirigindo">
    ${mapaGps()}
    ${empresasChao()}
    <div class="gps-horizonte"></div>
    ${empresasCromo()}

    <!-- O VÉU DA ENTRADA. Ele não guarda dado nenhum e não sabe se o mapa
         subiu: é só a cena de "entrar na rota", com hora pra começar e hora
         pra acabar. Parado ele é invisível — quem o acende é a classe "cena"
         da camada, e ela cai aos 900 ms. (Sem CRASE aqui dentro: este
         comentário mora num template literal e a crase o fecharia.) -->
    <div class="gps-veu"></div>

    <!-- O SELO DO RETRAÇO: nó permanente e inerte como o véu. Quem o acende é
         a ponte (classe "on") quando pede caminho novo fora do traçado, e quem
         o apaga é a resposta — ou o teto de 4 s dela, o que vier antes. -->
    <div class="gps-redir">Redirecionando…</div>

    <!-- O AVISO DE RADAR: mesmo contrato do selo acima — nó permanente, inerte,
         apagado. A ponte acende a classe "on" quando existe radar no corredor
         da rota À FRENTE do motorista, escreve o limite em ".lim" (vazio quando
         a fonte não tem limite) e apaga quando ele fica para tras. Nada disto
         passa pelo seam: aviso que muda a cada fix repintaria a camada do mapa
         uma vez por segundo. (Sem CRASE aqui dentro: este comentario mora num
         template literal e a crase o fecharia.) -->
    <div class="gps-radar"><b class="lim"></b><span class="txt">Radar</span></div>

    <!-- eu: no centro da largura, com a cauda pousada no --gps-piso (o mesmo
         chão do velocímetro e dos botões). A tela é a rua À FRENTE. -->
    <div class="gps-puck">
      <!-- o radar pulsa porque há o que varrer: sem empresa no corredor ele não
           existe, senão a tela finge procurar o que não está lá. -->
      ${empresasDoMapa().length?'<span class="emp-radar"><i></i><i></i></span>':''}
      <span class="gps-facho"></span>
      <svg class="gps-seta" viewBox="0 0 34 38">
        <path d="M17 1.5 L31.5 35 L17 27 L2.5 35 Z" fill="#3d8bff" stroke="#eaf1ff" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </div>

    <!-- a manobra manda: distância grande, verbo grande, rua embaixo -->
    ${manobra}

    <!-- bússola: só existe porque o mapa gira pelo rumo — sem rumo, ela não
         tem o que apontar e sai de cena inteira -->
    ${g.rumo?`<div class="gps-bussola">
      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3.5 L16 13 L12 10.6 L8 13 Z" fill="#ff8b85"/></svg><span data-vivo="rumo">${g.rumo}</span>
    </div>`:''}
    ${g.velocidade?`<div class="gps-vel"><b data-vivo="velocidade">${g.velocidade}</b>${g.velocidadeUnidade?`<small>${g.velocidadeUnidade}</small>`:''}</div>`:''}
    <!-- Os botões da beirada: até 08/08 eles não tinham GANCHO nenhum e o
         toque morria no vidro. A voz é a do APARELHO (a chave voz do
         soundPrefs), então o estado "mudo" chega pelo seam como qualquer outro
         dado da tela. (Sem CRASE aqui dentro: este comentário mora num
         template literal e a crase o fecharia — foi o que eu fiz agora.)

         🔴 O CHAT ENTROU AQUI EM 11/08 (ordem do dono: "botoes envolta
         friendly - desativar som, abrir chat"). Dirigindo, a barra de navegação
         não está na tela: o balão do cabeçalho, que é por onde a Central se
         responde no resto do app, some junto — e quem está na rua é justamente
         quem mais precisa dele. Ele usa data-ir, o MESMO verbo do balão: ganha
         o roteador de graça e, se o admin desligar o módulo Chat, o botão sai
         sozinho na poda em vez de virar porta pra parede. SEM o selo de
         não-lidas do balão: ele é estrutura que nasce e some, e nesta tela
         cada nascimento desses derruba a camada inteira do mapa. -->
    <div class="gps-lado">
      <button data-ir="chat" aria-label="Chat com a Central">${ic('chat',24)}</button>
      <button data-acao="gps-voz" class="${g.vozMuda?'mudo':''}"
        aria-label="${g.vozMuda?'Ligar voz':'Silenciar voz'}">${ic('volume',24)}</button>
      <button data-acao="gps-centrar" aria-label="Recentralizar">${ic('target',24)}</button>
    </div>

    <!-- 🔴 O RODAPÉ PODE FICAR SÓ COM O "Sair", e é o certo: ele é a PORTA
         DE SAÍDA da navegação. Motorista preso nesta tela é pior que qualquer
         número faltando — por isso o "encerrar" é COPY e nunca zera. O rótulo
         virou "Sair" em 09/08: o botão volta pra tela Rota com a rota VIVA, e
         verbo de destruir em botão que não destrói é mentira (a razão longa
         mora no seam, em DADOS.gps). (Sem CRASE aqui dentro: este comentário
         mora num template literal.) -->
    <div class="gps-rodape">
      ${rodape?`<div class="parada">${ic('route',14)} <span class="txt">${rodape}</span></div>`:''}
      <div class="linha">
        ${num(g.chegada,g.chegadaRotulo,1,'chegada')}
        ${num(g.restante,g.restanteRotulo,0,'restante')}
        ${num(g.distancia,g.distanciaRotulo,0,'distancia')}
      </div>
      <!-- 🔴 OS NUMEROS SUBIRAM E A LINHA DE BAIXO VIROU DAS ACOES (10/08,
           ordem do dono: "abaixo de chegada, restante e distancia crie os
           botoes, 3 opcoes"). O "Sair" estava espremido ao lado de tres
           numeros que ele nao tem nada a ver: numero se LE, botao se APERTA,
           e misturar os dois na mesma fila deixa o polegar decidindo entre
           coisas de natureza diferente. Agora a barra tem duas leituras: em
           cima o CONTRATO da viagem, embaixo o que da pra FAZER.
           O Sair fica na DIREITA, no mesmo canto do polegar de sempre — a
           tela mudou, o gesto que ele ja tem na memoria nao. -->
      <div class="linha acoes">
        <button class="atalho" data-acao="registrar-local">${ic('gps',16)}<b>${g.registrar||''}</b></button>
        <button class="atalho" data-ir="fechamento">${ic('note',16)}<b>${g.fechar||''}</b></button>
        <button class="sair" data-ir="rota">${g.encerrar||''}</button>
      </div>
    </div>
  </div>
</div>`;
}
T.mapa={nome:'Rota iniciada (dirigindo)',grupo:'Rota',render:()=>telaGps(false)};
T.mapachegou={nome:'Chegou (mapa geral)',grupo:'Rota',render:()=>telaGps(true)};

/* 3 — MAPA + FILA --------------------------------------------------------- */
T.mapalista={nome:'Mapa + fila',grupo:'Rota',render(){
  const l=(n,h,nome,end,tags,pill,cor)=>`
    <div class="stop ${n===3?'on':''}" style="grid-template-columns:10px 36px minmax(0,1fr) auto">
      <span class="grip" style="margin-top:6px"></span>
      <span class="numwrap"><span class="num ${cor}" style="width:29px;height:29px;font-size:12.5px">${n}</span>
        <span class="hh ${cor}">${h}</span></span>
      <span class="who"><strong style="font-size:12.5px">${nome}</strong><span style="font-size:10.5px">${end}</span>
        <span class="tags">${tags.map(t=>`<b class="tag ${t.startsWith('20L')?'blue':t==='Chip dia'?'lime':''}">${t}</b>`).join('')}</span></span>
      <span class="side" style="min-width:0"><span class="pill ${pill[1]}">${ic(pill[2],14)}${pill[0]}</span></span>
    </div>`;
  return `${status}
${hdr({})}
<div class="body flush" style="position:relative">
  <div style="padding:0 11px 7px;display:flex;gap:7px">
    <div class="kpi" style="flex:0 0 auto"><span style="color:var(--ink-2)">${ic('box',18)}</span><span><b class="v">8</b><span class="l">paradas</span></span></div>
    <div class="kpi"><span class="num lime" style="width:26px;height:26px;font-size:12px;border-width:1px">3</span>
      <span><span class="l">próxima</span><b style="font-size:12.5px;font-weight:500;display:block">Mercado São Judas</b></span></div>
    <div class="kpi" style="flex:0 0 auto"><span style="width:7px;height:7px;border-radius:50%;background:var(--lime);box-shadow:0 0 7px var(--lime)"></span>
      <span><b style="font-size:12.5px;font-weight:500;display:block;color:var(--lime)">Rota ativa</b><span class="l">ETA 12:26</span></span></div>
  </div>
  <div style="position:relative;height:236px;overflow:hidden">${mapa()}
    <div class="map-ctrl" style="top:10px">
      <button style="width:34px;height:34px">${ic('target',16)}</button>
      <button class="ativo" style="width:34px;height:34px">${ic('layers',16)}</button>
      <button style="width:34px;height:34px">${ic('plus',16)}</button>
      <button style="width:34px;height:34px">${ic('minus',16)}</button></div>
  </div>
  <div style="position:relative;z-index:20;background:linear-gradient(180deg,var(--glass),var(--bg) 34px);
              border-radius:18px 18px 0 0;border-top:.7px solid var(--line);padding:9px 10px 0;margin-top:-16px">
    <span style="display:block;width:36px;height:3px;border-radius:2px;background:var(--handle);margin:0 auto 7px"></span>
    ${l(1,'08:30','João da Silva','R. das Palmeiras, 145 • Santo Amaro',['20L x2','Vasilhame','Chip dia'],['A caminho','lime','nav'],'lime')}
    ${l(2,'09:15','Mercadinho Bom Preço','Av. João Dias, 890 • Brooklin',['20L x4','Vasilhame'],['Chegou','lime','check'],'lime')}
    ${l(3,'10:05','Mercado São Judas','R. São Judas, 142 • São Paulo',['20L x2','Vasilhame','Chip dia'],['Próxima parada','blue','nav'],'')}
    ${l(4,'10:45','Padaria Pão Nosso','Av. Ibirapuera, 2331 • Moema',['20L x1','Vasilhame'],['Entregue','lime','check'],'lime')}
    ${l(5,'11:30','Bar do Zé','R. dos Otonis, 317 • Jabaquara',['20L x3','Vasilhame'],['Pendente','amber','clock'],'off')}
    ${l(6,'12:15','Mercado Estrela','R. Aracanguá, 210 • Jabaquara',['20L x4','Vasilhame'],['Pendente','mute','clock'],'off')}
    ${l(7,'13:00','Quitanda do Bairro','R. das Orquídeas, 55 • Campo Belo',['20L x2','Vasilhame'],['Pendente','mute','clock'],'off')}
    ${l(8,'13:45','Depósito Central','R. Dr. Jesuíno Maciel, 980 • Santo Amaro',['20L x6','Vasilhame'],['Pendente','mute','clock'],'off')}
  </div>
</div>
${nav('rota')}`;}};

/* 4 — FOLHA DA VENDA ------------------------------------------------------ */
T.venda={nome:'Folha da venda',grupo:'Rota',render(){const d=DADOS.venda;return `${status}
${hdr({})}
<div class="body flush" style="overflow:hidden">
  ${mapa()}<div class="scrim"></div>
  <div class="sheet">
    <span class="handle"></span>
    <div class="sheet-head"><div><h2>Folha da venda</h2></div>
      <button class="round sm" data-voltar="1" data-ir="rota">${ic('close',16)}</button></div>
    <div class="box" style="display:flex;align-items:center;gap:10px">
      <span class="num lime" style="width:36px;height:36px">${d.n}</span>
      <span style="flex:1"><span class="box-t">${d.titulo}</span>
        <span class="box-s">${d.endereco}</span></span>
      <span class="pill lime">${ic('check',14)}${d.pill}</span>
    </div>
    <div class="box">
      <div style="display:flex;gap:11px;align-items:flex-start">
        <span class="thumb">${ic('gallon',30)}</span>
        <span style="flex:1"><span class="box-t">${d.produto}</span>
          <span class="tags" style="margin-top:6px">${d.tags.map(t=>`<b class="tag${t[1]?' '+t[1]:''}">${t[0]}</b>`).join('')}</span></span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <span style="font-size:12.5px;color:var(--ink-2)">Conta do item</span>
        <b style="font-size:18px;color:var(--lime);font-weight:500">${d.contaItem}</b></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <div class="box" style="display:flex;align-items:center;justify-content:space-between;margin:0">
        <span><span class="box-s">Conta da chegada</span><b style="display:block;font-size:15px;color:var(--lime);margin-top:2px">${d.contaChegada}</b></span>
        <span style="color:var(--lime)">${ic('check',19)}</span></div>
      <div class="box" style="display:flex;align-items:center;justify-content:space-between;margin:0">
        <span><span class="box-s">Ficou marcado</span><b style="display:block;font-size:15px;color:var(--lime);margin-top:2px">${d.lancamento}</b></span>
        <span style="color:var(--blue-l)">${ic('note',19)}</span></div>
    </div>
    <div class="box">
      <div class="box-t">Forma de pagamento</div>
      <div class="pays">
        <button class="pay${d.forma==='dinheiro'?' sel':''}" data-acao="forma" data-forma="dinheiro"><span style="color:var(--lime)">${ic('cash',21)}</span><b>Dinheiro</b>${d.forma==='dinheiro'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay blue${d.forma==='pix'?' sel':''}" data-acao="forma" data-forma="pix"><span style="color:var(--blue-l)">${ic('pix',21)}</span><b>Pix</b>${d.forma==='pix'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay${d.forma==='cartao'?' sel':''}" data-acao="forma" data-forma="cartao"><span style="color:var(--ink-2)">${ic('card',21)}</span><b>Cartão</b>${d.forma==='cartao'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay${d.forma==='fiado'?' sel':''}" data-acao="forma" data-forma="fiado"><span style="color:var(--ink-2)">${ic('note',21)}</span><b>Marcar</b>${d.forma==='fiado'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
      </div>
    </div>
    <div class="box">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="box-t">Resumo do recebimento</span>
        <button class="ghost">${ic('edit',13)} Editar valores</button></div>
      <div class="rowline"><span>Recebido hoje</span><b>${d.recebido}</b></div>
      <div class="rowline"><span>Vai ficar marcado</span><b>${d.paraMarcado}</b></div>
    </div>
    <div class="foot2">
      <button class="act go" style="justify-content:center" data-acao="confirmar-venda">${ic('check',19)}<b>Confirmar venda</b></button>
      <button class="act" style="justify-content:center" data-ir="rota">${ic('enter',17)}<b>Voltar para rota</b></button>
    </div>
  </div>
</div>
${nav('rota')}`;}};

/* 5 — O FECHAMENTO DO DIA -------------------------------------------------
   🔴 É O FECHAMENTO DO DIA, E SÓ (dono, 09/08: "a caderneta devia ser o
   ser o finalizar, fechamento do dia — você entra e tem 150 clientes ali").
   A lista de paradas que morava aqui era o roster INTEIRO do dia — assunto da
   Rota, repetido numa tela de dinheiro: com agenda grande viravam 150 cartões
   na frente do caixa, e o fechamento ficava espremido numa folha de 52%. O
   corpo é um só e a `semana` o desenha desbotado no fundo. O selo só aparece
   com fato ("N vendas"): sem venda, pill com um check sozinho era veredito
   sem fonte. */
function fechamentoCorpo(){const d=DADOS.fechamento;return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 10px">
    <span style="display:flex;align-items:center;gap:10px">
      <span class="round" style="border-color:var(--line-2)">${ic('lock',18)}</span>
      <b style="font-size:16px;font-weight:500;display:block">Fechamento do dia</b></span>
    ${d.selo?`<span class="pill mute">${d.selo} ${ic('check',14)}</span>`:''}
  </div>
  ${(d.formas.length||d.formaTotal)?`<div class="forms">
    ${d.formas.map(f=>`<div class="form-c"><span style="color:${f[1]}">${ic(f[0],19)}</span><small>${f[2]}</small><b>${f[3]}</b></div>`).join('')}
    ${d.formaTotal?`<div class="form-c total"><small style="margin-top:0">Total</small><b>${d.formaTotal}</b></div>`:''}
  </div>`:''}
  ${(d.entregues||d.clientes||d.produtos)?`<div class="sum">
    ${d.entregues?`<span class="c"><span style="color:var(--lime)">${ic('check',17)}</span><span><b>${d.entregues}</b><small>entregues</small></span></span>`:''}
    ${d.clientes?`<span class="c"><span style="color:var(--ink-2)">${ic('users',17)}</span><span><b>${d.clientes}</b><small>clientes</small></span></span>`:''}
    ${d.produtos?`<span class="c"><span style="color:var(--ink-2)">${ic('box',17)}</span><span><b>${d.produtos}</b><small>produtos</small></span></span>`:''}
  </div>`:''}`;}
T.fechamento={nome:'Fechamento do dia',grupo:'Fechamento',render(){return `${status}
${hdr({voltar:'rota'})}
<div class="body">
  ${fechamentoCorpo()}
  <div class="acts">
    <button class="act go" style="justify-content:center" data-acao="fechar-dia">${ic('check',19)}<b>Fechar o dia</b></button>
    <button class="act" style="justify-content:center" data-ir="semana">${ic('chart',17)}<b>Ver detalhes</b></button>
  </div>
</div>
${nav('rota')}`;}};

/* 5b — TERMINOU: O RECIBO DO DIA ------------------------------------------
   🔴 A TELA QUE NÃO EXISTIA (12/08, dono: *"ao finalizar (última rota), criar
   uma tela de finalizou… fecha bonitinho, e não volta pra essa tela. Entra no
   estado de 'tudo certo até agora' e o botão Gerar Rota"*).

   Sem ela o dia não tinha fim: fechado o caixa, o app devolvia o motorista pro
   Fechamento (a tela do botão que ele acabou de apertar) com a rota ainda viva
   atrás. Aqui a corrente termina — e termina do jeito que todo app de rota
   termina: uma marca, o recibo, e o verbo do dia SEGUINTE.

   🔴 O CORPO É O MESMO `fechamentoCorpo()` DA TELA DE FECHAMENTO, de propósito.
   Redesenhar os números aqui criaria um segundo dono pro caixa do dia, e dois
   donos do mesmo número um dia discordam (é a lei que a `semana` já obedece:
   ela desenha este mesmo corpo, desbotado, como fundo).

   🔴 O QUE ESTA TELA NÃO DIZ: "tudo certo". O selo desta família diz FATO,
   nunca veredito — o app não tem como saber que o dia foi bom, e com parada
   sobrando "tudo certo" seria mentira na cara de quem parou no meio. O repouso
   é o DESENHO (tela calma, um verbo só); o texto é a hora e quem ficou.

   🔴 O RODAPÉ É `semparada` CRAVADO, e não `dockDaRota(estadoRota)`. Não é
   régua repetida: é que aqui o dia ACABOU por construção, e o próximo verbo é o
   mesmo nos dois desfechos possíveis — encerrar devolve as paradas que sobraram
   pra pendência SEM ordem (`rotaOrdem: null`, no `encerrarRota` do servidor),
   então pra tirar qualquer uma delas de novo é preciso MONTAR. O estado vivo da
   rota continua morando na aba Rota, com o dock de verdade; esta tela é RECIBO,
   não painel de controle. */
T.terminou={nome:'Dia encerrado',grupo:'Fechamento',render(){const d=DADOS.terminou;return `${status}
${hdr({})}
<div class="body com-dock">
  <div class="vazio">
    <span class="ico" style="color:var(--lime)">${ic('check',26)}</span>
    <strong>${d.titulo}</strong>
    ${d.quando?`<span>${d.quando}</span>`:''}
    ${d.sobra?`<span>${d.sobra}</span>`:''}
  </div>
  ${fechamentoCorpo()}
  <div class="acts">
    <button class="act" style="justify-content:center" data-ir="fechamento">${ic('note',17)}<b>Ver fechamento</b></button>
  </div>
</div>
<div class="tmx-dock">${transmux('semparada')}</div>
${nav('rota')}`;}};

/* 6 — HISTÓRICO DA SEMANA ------------------------------------------------- */
T.semana={nome:'Histórico da semana',grupo:'Fechamento',render(){
  // Slot sem fonte não vira "R$ 0,00": ele SOME. A linha encolhe e continua
  // verdadeira — é a diferença entre "não tenho esse número" e "esse número é
  // zero", e numa tela de dinheiro as duas coisas nunca podem se parecer.
  const dia=(d,dt,cli,prod,rec,mk)=>`<div class="week">
    <span class="d"><strong>${d}</strong><span>${dt}</span></span>
    <span class="q">${cli?`<i>${ic('users',14)} <b style="color:var(--ink);font-weight:500">${cli}</b> ${cli==='1'?'venda':'vendas'}</i>`:''}
      ${prod?`<i>${ic('box',14)} <b style="color:var(--ink);font-weight:500">${prod}</b> produtos</i>`:''}</span>
    ${rec?`<span class="r"><small>Recebido</small><b>R$ ${rec}</b></span>`:''}
    <span class="mk"><span><small>Marcado</small><b>R$ ${mk}</b></span>${ic('chev',14)}</span></div>`;
  return `${status}
${hdr({})}
<div class="body" style="opacity:.4;pointer-events:none">
  <!-- O fundo é a tela de trás DESBOTADA, não um enfeite: fundo também é tela,
       e a tela de trás é o fechamento — o MESMO corpo, apagado. Com a lista de
       paradas aqui, o dono lia um roster de 150 por cima do dinheiro dele. -->
  ${fechamentoCorpo()}
</div>
<div class="scrim"></div>
<div class="sheet" style="max-height:80%">
  <span class="handle"></span>
  <div style="display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:12px">
    <h2 style="margin:0;font-size:20px;font-weight:500">Histórico da semana</h2>
    <button class="round sm" style="position:absolute;right:0" data-voltar="1" data-ir="fechamento">${ic('close',15)}</button></div>
  ${DADOS.semana.dias.map(l=>dia(l[0],l[1],l[2],l[3],l[4],l[5])).join('')}
  ${DADOS.semana.marcado?`<div class="box" style="margin-top:9px">
    <div class="box-t" style="margin-bottom:7px">Resumo da semana</div>
    <div style="display:flex;align-items:center">
      <span style="flex:1;border-right:.7px solid var(--line)"><small style="display:block;font-size:10.5px;color:var(--ink-2)">Marcado da semana</small>
        <b style="font-size:15px;color:var(--lime);font-weight:500">${DADOS.semana.marcado}</b></span>
      ${DADOS.semana.recebido?`<span style="flex:1;padding-left:11px;border-right:.7px solid var(--line)"><small style="display:block;font-size:10.5px;color:var(--ink-2)">Recebido</small>
        <b style="font-size:15px;color:var(--blue-l);font-weight:500">${DADOS.semana.recebido}</b></span>`:''}
      ${DADOS.semana.pendencia?`<span style="flex:1;padding-left:11px"><small style="display:block;font-size:10.5px;color:var(--ink-2)">Pendência</small>
        <b style="font-size:15px;color:var(--amber);font-weight:500">${DADOS.semana.pendencia}</b></span>`:''}
      <span style="color:var(--ink-2);padding-left:5px">${ic('chev',15)}</span></div>
  </div>`:''}
</div>
${nav('rota')}`;}};

/* 7 — CONFERÊNCIA --------------------------------------------------------- */
T.conferencia={nome:'Conferência da carga',grupo:'Rota',render(){
  const l=(n,h,nome,rua,bairro,tags,pill,cor)=>`
    <div class="stop" style="grid-template-columns:40px minmax(0,1fr) auto auto">
      <span class="numwrap"><span class="num ${cor}">${n}</span><span class="hh ${cor}">${h}</span></span>
      <span class="who"><strong>${nome}</strong><span>${rua}</span><span>${bairro}</span>
        <span class="tags">${tags.map(t=>`<b class="tag ${t.startsWith('20L')?'blue':t==='Chip dia'?'lime':''}">${t}</b>`).join('')}</span></span>
      <span class="side" style="min-width:0;justify-content:center"><span class="pill ${pill[1]}">${ic(pill[2],14)}${pill[0]}</span></span>
      <span style="color:var(--ink-3);align-self:center;padding-left:4px">${ic('chev',15)}</span></div>`;
  return `${status}
${hdr({})}
<div class="body">
  <div class="sum" style="margin-top:2px">
    <span class="c"><span style="color:var(--lime)">${ic('route',18)}</span><span><b style="font-size:16px">12</b><small>paradas</small></span></span>
    <span class="c"><span style="color:var(--blue-l)">${ic('box',18)}</span><span><b style="font-size:16px">20</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('check',18)}</span><span><b style="font-size:16px">6</b><small>conferidos</small></span></span>
  </div>
  <div class="stops">
    ${l(1,'08:30','João da Silva','R. das Palmeiras, 145','Santo Amaro',['20L x2','Vasilhame','Chip dia'],['Conferido','lime','check'],'')}
    ${l(2,'09:15','Mercadinho Bom Preço','Av. João Dias, 890','Brooklin',['20L x4','Vasilhame'],['Falta 1','amber','alert'],'')}
    ${l(3,'10:05','Maria Aparecida','R. Sargento Silva Nunes, 72','Moema',['20L x1','Chip dia'],['Conferido','lime','check'],'lime')}
    ${l(4,'10:45','Padaria Pão Nosso','Av. Ibirapuera, 2331','Moema',['20L x2','Vasilhame'],['Conferido','lime','check'],'lime')}
    ${l(5,'11:30','Bar do Zé','R. dos Otonis, 317','Jabaquara',['20L x3','Vasilhame'],['Separado','blue','box'],'')}
    ${l(6,'12:15','Mercado Estrela','R. Aracanguá, 210','Jabaquara',['20L x4','Chip dia'],['Pendente','mute','clock'],'off')}
  </div>
  <div class="prog">
    <span class="prog-l"><span><b>6</b> de <b>12</b> paradas conferidas</span><span><b>50%</b> concluído</span></span>
    <span class="prog-b"><i style="width:50%"></i></span></div>
  <button class="act go full" style="margin-top:9px" data-ir="mapa">${ic('check',21)}
    <span><b>Confirmar carga</b><small>Concluir conferência e iniciar rota</small></span><span class="chev">${ic('chev',16)}</span></button>
  <button class="act full" style="margin-top:7px" data-ir="rota">${ic('back',18)}
    <b>Voltar</b><span class="chev">${ic('chev',16)}</span></button>
</div>
${nav('rota')}`;}};

/* 8 — MONTAGEM DE ROTA ----------------------------------------------------
   A TELA DE MONTAR, e não mais o relatório do que já foi montado. Entra pelo
   botão do meio da Rota, mostra QUEM vai entrar (o dia escolhido nos chips) e
   só então monta. O botão do pé é UM SÓ e segue o estado:
   por montar → "Montar rota" · montada → "Iniciar rota".
   "Otimizar ordem" saiu: o planejar do servidor JÁ otimiza a ordem — botão que
   promete o que já aconteceu é botão morto (e este não fazia nada mesmo). */
T.montagem={nome:'Montagem de rota',grupo:'Rota',render(){
  const d=DADOS.montagem;
  /* 🔴 A MONTAGEM PASSOU A USAR A MESMA PEÇA DA ROTA (dono, 09/08, três queixas
     que eram UM defeito só: "não consigo abrir o cliente", "colocar uma seta
     bem bonita e a distância entre um cliente e outro", "os botões do status
     não estão aparecendo").

     Ela tinha um cartão PRÓPRIO, escrito à mão aqui dentro — parecido com o
     `.stop` da rota, mas sem gancho de toque, sem conector de perna e sem a
     pílula de status. Três buracos numa peça só porque a peça era uma CÓPIA:
     tudo o que a rota ganhou desde então nasceu do lado de fora dela.
     Agora a linha é `stop()`, a mesma da rota — e o que a montagem tem de
     próprio viaja no DADO (`cliente` em vez de `id`, `previa` pro arrasto),
     nunca num segundo desenho.

     De quebra some o "Marcado R$ " vazio: o cartão da montagem imprimia a
     etiqueta de dinheiro mesmo sem preço nenhum (financeiro desligado), e o
     `stop()` obedece a Lei do IF — sem valor, sem etiqueta. */
  /* Os chips do dia moram AQUI (07/08). Antes ficavam na tela Rota, longe da
     lista que eles mudam — o dono trocava de dia e via a lista de hoje. Quem
     sabe quais dias existem é a ponte; sem ela — o desenho — a linha some.
     🔴 SAÍRAM E VOLTARAM NO MESMO DIA (09/08). O dono mandou tirar ("remova os
     dias da semana, estamos em avulsas") e, vendo a tela sem eles, mandou
     devolver: *"os dias tem q ficar sim"*. Ficou a medida de que eles NÃO são
     enfeite da agenda — são a única porta pra montar a rota de outro dia
     (`montarDia`); sem eles a Montagem vira "hoje" e ponto. O que saiu de vez
     na mesma faxina foi a linha de crédito e o cabeçalho "Rota avulsa". */
  const chips=Array.isArray(d.dias)&&d.dias.length?`<div class="chips centro">
    ${d.dias.map(x=>`<button class="chip${(d.diaSel||0)===x[0]?' on':''}" data-acao="montar-dia" data-dia="${x[0]}">${x[1]}</button>`).join('')}</div>`:'';
  /* 🔴 O SELETOR DE ORDEM (dono, 08/08; o 3º espaço em 10/08) — o botão do MEIO
     da montagem. Quatro posições e uma só acesa por vez: a ordem automática por
     DISTÂNCIA (a que a lista já nasce) e os 3 ESPAÇOS de rota salva daquele dia
     da semana. O rótulo do espaço é o nome que o motorista digitou — "Manhã" no
     sábado é o Manhã do sábado, sempre.
     Espaço vazio NÃO some da fileira ("Espaço 1"…"Espaço 3"): posição que só
     aparece depois de existir é função que ninguém descobre sozinho — e no
     começo o seletor ficaria com uma opção de verdade só, que é botão morto.
     Quem sabe quais espaços existem é a ponte; sem ela — o desenho — a linha
     some inteira, mesma lei dos chips de dia acima. */
  const modos=Array.isArray(d.modos)&&d.modos.length?`<div class="modos${d.modos.length>3?' fino':''}">
    ${d.modos.map((m,i)=>`<button class="modo${(d.modoSel||'')===m[0]?' on':''}${m[1]?'':' vaga'}" data-acao="modo-rota" data-modo="${m[0]}">
      <b>${m[1]||`Espaço ${i}`}</b>${m[2]?'<i class="ponto"></i>':''}</button>`).join('')}</div>`:'';
  /* 🔴 A SEMANA CHEGOU AQUI COM A MORTE DO MODO AGENDA (dono, 09/08). Ela
     morava na tela "Agenda de hoje"; quando a agenda saiu, a pergunta que ela
     responde ficou — e o domingo é o dia em que ela é a ÚNICA pergunta: a tela
     diz "Nada a exibir hoje" e o dono não tem pista nenhuma de que a empresa
     tem 253 clientes agendados nos outros seis dias.
     Só no VAZIO, de propósito: com lista na tela os chips de dia logo acima já
     contam quem tem gente, e a mesma conta em dois lugares da MESMA tela é
     exatamente o bug de produto que esta casa persegue. O dado é o mesmo que os
     chips já pedem no boot (`DADOS.rota.semana`) — nenhuma ida nova à rede. */
  /* A PARTE AVULSA PERDEU A FAIXA ESCRITA (dono, 09/08: *"remover 'Rota
     avulsa' o escrito"*). O avulso continua vindo etiquetado pela ponte e
     continua sentando no TOPO da lista — o que saiu foi o RÓTULO: com a lista
     inteira avulsa (é o caminho normal desde que os chips de dia saíram) ele
     nomeava o óbvio, e cabeçalho que aparece sempre não separa nada.
     A etiqueta `avulsa` saiu da linha junto: campo que ninguém desenha é campo
     morto, e campo morto vira parede na próxima leitura. A ORDEM (avulso na
     frente) é da ponte e não depende dele. */
  const lista=d.linhas.length
    ? `<div class="stops" data-gestos="rota">${d.linhas.map(p=>`${perna(p.perna)}${stop(p)}`).join('')}</div>`
    : `<div class="vazio"><span class="ico">${ic('route',24)}</span><strong>${d.vazio}</strong></div>
       ${semanaAgenda()}`;
  /* O HISTÓRICO (dono, 09/08: "criar um histórico, salva por 14 dias. SIMPLES
     E FÁCIL, sem inventar moda. E tem como reutilizar"). Cada linha é um dia
     que JÁ rodou; o toque enche o rascunho com os clientes daquele dia — nada
     grava até o Salvar/Iniciar. Sem fonte, sem seção (Lei do IF). A peça é a
     mesma `lista-card`/`cli` da porta "Meus clientes": casca única, por lei. */
  /* 🔴 O DIA INCOMPLETO SE ANUNCIA (10/08, dono: "tem q ficar registrado rotas que
     eu criei e cancelei… ambas ficam VERMELHAS, não foram completadas — em ambos
     os casos fica registrado O QUE não foi completado").
     Quem decide a cor é o SERVIDOR (`h.tom`), nunca uma conta desta tela: as duas
     pontas discordando sobre o que é "completa" é o bug de produto desta casa. A
     etiqueta da direita diz o número que ele pediu — o que ficou por fazer. */
  const hist=Array.isArray(d.historico)&&d.historico.length?`<div class="grupo">Histórico · 14 dias</div>
  <div class="lista-card">${d.historico.map(h=>`<button type="button" class="cli" data-acao="historico-usar" data-data="${h.data}">
    <span class="ava${h.tom==='red'?' red':''}">${h.dia}</span>
    <span><strong>${h.titulo}</strong><span>${h.sub}</span></span>
    <span class="rgt">${h.naoFez?`<span class="nao-fez">${h.naoFez}</span>`:''}<span class="go">${ic('chev',15)}</span></span></button>`).join('')}</div>`:'';
  /* 🔴 O BOTÃO DE MONTAR NÃO ROLA (dono, 08/08: "montar rota não está sempre
     visível"). Ele nascia no PÉ da lista: com 52 clientes na tela isso é
     3.259 px abaixo da dobra — MEDIDO no g15 — e cada repinte devolvia o dedo
     pro topo, então na prática ele não existia. A lei já estava escrita nesta
     folha desde o rodapé da Rota ("quem rola é conteúdo; controle de operação
     em andamento, nunca"); faltava aplicá-la aqui. Mesma peça, `.tmx-dock`.
     Lado a lado e não empilhados: dois botões cheios comiam 22% da tela do
     motorista pra sempre. O que MONTA leva a largura maior (`wide`). */
  /* 🔴 O "+" VOLTOU PRO LUGAR ONDE ELE FOI PROCURADO (dono, 09/08: "estou em
     montagem de rota... cadê o +?"). É a porta da `T.rapida`, e ela mora AQUI
     porque é aqui que se decide quem entra no dia. Ícone só, sem rótulo: o dono
     procura o SÍMBOLO, e dois botões cheios já comem 22% da tela — um terceiro
     com palavra empurraria "Salvar rota" pra fora.

     🔴 E O DOCK PASSA A NASCER MESMO COM A LISTA VAZIA. Domingo (ou qualquer
     dia sem cliente agendado) caía num `d.linhas.length` falso: sem linha não
     havia rodapé, e sem rodapé a tela ficava SEM UM ÚNICO BOTÃO — beco sem
     saída justamente no dia em que a única coisa que resta é adicionar uma
     parada na mão. Com lista vazia o "+" é o dock inteiro, com o nome escrito:
     é a única ação que existe ali, e ação única não se esconde atrás de glifo.
     Montar/Iniciar continuam fora nesse caso — montar um dia sem ninguém é o
     botão que promete o que não vai acontecer. */
  const maisParada=(largo)=>`<button class="act${largo?' go wide':''}"
    style="${largo?'':'flex:0 0 46px;'}justify-content:center" data-ir="rapida" aria-label="Adicionar parada">
    ${ic('plus',19)}${largo?'<b>Adicionar parada</b>':''}</button>`;
  const pe=!d.linhas.length?`<div class="acts pe-montagem" style="margin-top:0">${maisParada(1)}</div>`
    :`<div class="acts pe-montagem" style="margin-top:0">
    ${maisParada(0)}
    <button class="act" style="background:linear-gradient(180deg,var(--btn-blue-1),var(--btn-blue-2));border:0;color:var(--white);justify-content:center" data-acao="salvar-rota">
      ${ic('save',18)}<b>Salvar rota</b></button>
    ${DADOS.rota.montando
      ?`<button class="act go wide ocupado" style="justify-content:center" disabled aria-busy="true">${ic('route',19)}
      <b>Montando…</b></button>`
      :d.pronta
      ?`<button class="act go wide" style="justify-content:center" data-acao="iniciar-rota">${ic('play',19)}
      <span style="text-align:center"><b>Iniciar rota</b>${d.iniciarSub?`<small>${d.iniciarSub}</small>`:''}</span></button>`
      :`<button class="act go wide" style="justify-content:center" data-acao="montar-agora">${ic('route',19)}
      <span style="text-align:center"><b>Montar rota</b>${d.iniciarSub?`<small>${d.iniciarSub}</small>`:''}</span></button>`}
  </div>`;
  return `${status}
${hdr({voltar:'rota'})}
<div class="body com-dock-1">
  <h2 style="font-size:23px;font-weight:500;margin:4px 0 2px;letter-spacing:-.4px;text-align:center">${d.titulo}</h2>
  ${/* A DATA POR EXTENSO — mudou de tela com o modo agenda (09/08). Ela nomeia
       o DIA de que a tela fala, e desde que os chips trocam o dia da lista essa
       é a informação que some primeiro: "Montagem de rota" não diz se o que
       está embaixo é hoje ou a quarta que vem. Some sem fonte (Lei do IF) —
       data do aparelho numa tela que fala do dia OPERACIONAL mostra o dia
       errado às 21h. Estilo colado no `.screen-head p`, que é o subtítulo das
       outras telas: título de tela é família única, por lei de 08/08. */''}
  ${DADOS.rota.dataLonga?`<p style="margin:1px 0 0;font-size:11.5px;color:var(--ink-2);text-align:center">${DADOS.rota.dataLonga}</p>`:''}
  ${chips}
  ${modos}
  ${/* ⚰️ A LINHA DE CRÉDITO SAIU DAQUI (dono, 09/08: *"remover linha toda:
       9340 créditos…"*). Ela chegou nesta tela hoje de manhã, pela lei do
       portão de crédito ("o número na frente da decisão"), e o dono cortou:
       saldo de 9.340 com um "monte a rota pra saber" do lado é ruído no topo
       da lista que ele veio montar. O saldo continua onde ele é resposta a uma
       pergunta — a tela de Créditos — e o custo REAL continua aparecendo na
       Rota já montada (`.creditos` do `T.rotalista`), que é onde ele deixa de
       ser estimativa. Quem cobra segue cobrando: o portão de crédito é do
       Iniciar, não deste texto. */''}
  ${miolo(d,'route','recarregar-montagem',5,`${lista}
  <div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('route',17)}</span><span><b>${d.somaParadas}</b><small>paradas</small></span></span>
    <span class="c"><span style="color:var(--blue-l)">${ic('box',17)}</span><span><b>${d.somaProdutos}</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('cash',17)}</span><span><b>${d.somaValor}</b><small>valor marcado</small></span></span>
  </div>
  ${hist}`)}
</div>
${/* o VÉU DE MONTAR (ver a folha): teatro da espera com a etapa REAL. O texto
     e a barra nascem do seam e a ponte segue escrevendo DIRETO nos nós
     `data-etapa-montar`/`data-barra-montar` enquanto o servidor trabalha. */''}
${DADOS.rota.montando?`<div class="veu-montar">
  <div class="vm">
    <span class="vm-glifo">${ic('route',26)}</span>
    <b data-etapa-montar>${DADOS.rota.etapaMontar||'Organizando as paradas…'}</b>
    <small>Montando a rota do dia</small>
    <span class="vm-barra"><i data-barra-montar style="width:${DADOS.rota.etapaMontarPct||8}%"></i></span>
  </div>
</div>`:''}
<div class="tmx-dock">${pe}</div>${nav('rota')}`;}};

/* 9 — ROTAS SALVAS -------------------------------------------------------- */
T.salvas={nome:'Rotas salvas',grupo:'Rota',render(){
  const d=DADOS.salvas;
  /* 🔴 A LISTA SE DIVIDE PELOS DIAS (dono, 08/08). Rota salva deixou de ser um
     monte só: cada dia da semana guarda até 2, e é aqui que o dono vê tudo o
     que existe — inclusive o que sobrou além dos 2 espaços da tela de montar.
     O cabeçalho vem NA LINHA (`cab`), não numa segunda lista, porque quem sabe
     onde o dia troca é quem ordenou: a ponte. */
  const r=(nome,data,paradas,prod,valor,icone,tomLime,id,cab)=>`
    ${cab?`<div class="grupo">${cab}</div>`:''}
    <div class="rowcard">
      <span class="ico ${tomLime?'lime':''}">${ic(icone,20)}</span>
      <span><strong>${nome}</strong>${data?`<span>${data}</span>`:''}
        <span class="meta"><i>${ic('list',12)} ${paradas} paradas</i>${prod?`<i>${ic('box',12)} ${prod} produtos</i>`:''}</span></span>
      <span style="display:flex;align-items:center;gap:9px">
        ${valor?`<span class="rgt"><small>Marcado</small><b>R$ ${valor}</b></span>`:''}
        <span class="mini-acts">
          <span class="mini"${id?` data-acao="abrir-salva" data-salva="${id}"`:''}><span class="c">${ic('play',19)}</span>Abrir</span>
          ${d.acoes?`<span class="mini"><span class="c">${ic('copy',17)}</span>Duplicar</span>
          <span class="mini" style="align-self:center">${ic('dots',16)}</span>`:''}</span></span></div>`;
  /* Entra pelos Ajustes › Rota (07/08) — antes esta tela não tinha porta
     NENHUMA no app: salvar a rota funcionava e o dono não tinha onde conferir.
     Saíram a busca/filtro (não filtravam nada) e a caixa "Usar hoje" (o mesmo
     que o "Abrir" de cada linha já faz, e ela não fazia). */
  return `${status}
${hdr({voltar:'ajustes',semChat:1})}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('save',30)}</span>
    <span><h2>Rotas salvas</h2>${d.total?`<p>${d.total}</p>`:''}</span></div>
  ${miolo(d,'save','recarregar-salvas',4,d.lista.length
    ? d.lista.map(x=>r(x[0],x[1],x[2],x[3],x[4],x[5],x[6],x[7],x[8])).join('')
    : `<div class="vazio"><span class="ico">${ic('save',24)}</span><strong>Nenhuma rota salva ainda</strong></div>`)}
</div>
${nav('ajustes')}`;}};

/* 10 — PRODUTOS ----------------------------------------------------------- */
T.produtos={nome:'Produtos',grupo:'Cadastro',render(){
  // A cor do produto vira CLASSE, não hex inline: o hex era do tema escuro e
  // no claro virava ícone claro sobre fundo claro (1,43:1, medido).
  const d=DADOS.produtos;
  const p=(nome,sub,preco,cor,id)=>`<div class="prod"${id?` data-acao="abrir-produto" data-produto="${id}"`:''}>
    <span class="thumb t-${cor}" style="width:46px;height:46px;flex:0 0 46px">${ic('gallon',24)}</span>
    <span><span class="nm">${nome}</span>${sub?`<span class="st">${ic('box',13)} ${sub}</span>`:''}</span>
    ${preco?`<span class="price">R$ ${preco}</span>`:''}</div>`;
  return `${status}
${hdr({voltar:'ajustes',semChat:1})}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('box',30)}</span>
    <span><h2>Produtos</h2></span></div>
  <div class="searchrow">
    <label class="search">${ic('search',17)}<input placeholder="Buscar produto" data-campo="busca-produto" value="${d.busca}"></label>
    <button class="filt">${ic('sliders',18)}</button></div>
  ${d.categorias.length?`<div class="chips">
    ${d.categorias.map((c,i)=>`<button class="chip${d.categoriaSel===i?' on':''}">${c}</button>`).join('')}</div>`:''}
  ${miolo(d,'box','recarregar-produtos',6,`<div class="lista-card">
    ${d.lista.map(l=>p(l[0],l[1],l[2],l[3],l[4])).join('')}
  </div>`)}
  <div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('box',17)}</span><span><b>${d.ativos}</b><small>produtos ativos</small></span></span>
    ${d.estoqueBaixo?`<span class="c"><span style="color:var(--amber)">${ic('alert',17)}</span><span><b>${d.estoqueBaixo}</b><small style="color:var(--amber)">estoque baixo</small></span></span>`:''}
    ${d.valorEstimado?`<span class="c"><span style="color:var(--blue-l)">${ic('cash',17)}</span><span><b>${d.valorEstimado}</b><small>valor estimado</small></span></span>`:''}
  </div>
</div>
${nav('ajustes')}`;}};

/* 11 — CLIENTES ----------------------------------------------------------- */
T.clientes={nome:'Clientes',grupo:'Cadastro',render(){
  const d=DADOS.clientes;
  const DIAS=['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  /* Chip de dia SÓ pra dia que TEM cliente (o dono, 07/08: "não tem terça nem
     domingo nas rotas, e ainda está aparecendo"). Quem sabe quais têm é a
     ponte (`dias`); sem ela — o DESENHO — os 7 aparecem. O dia selecionado
     entra mesmo sem gente, senão o filtro ativo ficaria sem botão de soltar. */
  const comGente=Array.isArray(d.dias)?d.dias.slice():[1,2,3,4,5,6,7];
  if(d.diaSel&&comGente.indexOf(d.diaSel)<0) comGente.push(d.diaSel);
  comGente.sort((a,b)=>a-b);
  const c=(ini,nome,end,dia,valor,tomLime,alerta,id)=>`<div class="cli"${id?` data-acao="abrir-cliente" data-cliente="${id}"`:''}>
    <span class="ava ${tomLime?'lime':''}">${ini}</span>
    <span><strong>${nome}</strong><span>${end}</span>
      <span class="tags">${dia?`<b class="tag lime">${dia}</b>`:''}${alerta?`<b class="tag" style="border-color:rgba(245,165,36,.55);color:var(--amber)">${alerta}</b>`:''}</span></span>
    <span class="rgt">${valor?`<small>Marcado</small><b>R$ ${valor}</b>`:`<span style="color:var(--ink-3)">${ic('chev',15)}</span>`}</span></div>`;
  return `${status}
${hdr({voltar:'ajustes',semChat:1})}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('users',30)}</span>
    <span><h2>Clientes</h2><p>${d.subtitulo}</p></span></div>
  <div class="searchrow">
    <label class="search">${ic('search',17)}<input placeholder="Buscar cliente" data-campo="busca-cliente" value="${d.busca}"></label>
    <button class="filt">${ic('sliders',18)}</button></div>
  ${comGente.length?`<div class="chips">
    ${comGente.map(n=>`<button class="chip${d.diaSel===n?' on':''}" data-acao="chip-dia" data-dia="${n}">${DIAS[n]}</button>`).join('')}</div>`:''}
  ${miolo(d,'users','recarregar-clientes',7,`<div class="lista-card">
    ${d.lista.map(l=>c(l[0],l[1],l[2],l[3],l[4],l[5],l[6],l[7])).join('')}
  </div>`)}
  <div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('users',17)}</span><span><b>${d.total}</b><small>clientes</small></span></span>
    ${d.semEndereco?`<span class="c"><span style="color:var(--amber)">${ic('alert',17)}</span><span><b>${d.semEndereco}</b><small style="color:var(--amber)">sem endereço</small></span></span>`:''}
    <span class="c"><span style="color:var(--lime)">${ic('cash',17)}</span><span><b>${d.marcadoHoje}</b><small>marcado hoje</small></span></span>
  </div>
</div>
${nav('ajustes')}`;}};

/* 31 — CADASTRAR CLIENTE (o "+" do cabeçalho) ------------------------------
   🔴 POR QUE ESTA TELA EXISTE NO CELULAR (dono, 08/08): o endereço bom nasce na
   PORTA. Medido na empresa 41 em 04/08: 117 paradas sem local nenhum e 130 com
   local empilhado no mesmo ponto — cadastro digitado no escritório depois não
   tem como saber onde a casa fica. Com "Usar meu local", a coordenada é a do
   entregador parado na frente do cliente.

   Campos ao MÍNIMO: nome e endereço. Telefone é opcional, e o resto (CPF, dias,
   produtos) é a FICHA — quem cadastra na rua está com o motor ligado.
   ========================================================================== */
T.novocliente={nome:'Cadastrar cliente',grupo:'Cadastro',render(){const n=DADOS.novocliente;return `${status}
${hdr({voltar:'clientes',semChat:1})}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('plus',30)}</span>
    <span><h2>Cadastrar cliente</h2><p>Cadastre na porta: o local fica certo.</p></span></div>

  <div class="grupo">Quem é</div>
  <div class="campos">
    <label class="campo"><label>Nome</label><input placeholder="Nome do cliente" value="${n.nome}" data-campo="novo-nome"></label>
    <label class="campo"><label>Telefone / WhatsApp</label><input placeholder="(19) 99999-0000" value="${n.telefone}" data-campo="novo-telefone"></label>
  </div>

  <!-- 🔴 O CEP MANDA EM TUDO (lei do dono, 10/08): sem CEP o servidor recusa;
       digitou o CEP completo, rua e bairro entram SOZINHOS (a ponte consulta
       geo/cep); número em branco o servidor preenche com S/N. Layout na ordem
       da lei: CEP e Número numa linha, Rua e Bairro embaixo. -->
  <div class="grupo">Onde é</div>
  <div class="campos">
    <div class="dupla">
      <label class="campo"><label>CEP</label><input inputmode="numeric" placeholder="00000-000" value="${n.cep}" data-campo="novo-cep"></label>
      <label class="campo"><label>Número</label><input placeholder="nº ou SN" value="${n.numero}" data-campo="novo-numero"></label>
    </div>
    <div class="dupla">
      <label class="campo"><label>Rua</label><input value="${n.rua}" data-campo="novo-rua"></label>
      <label class="campo"><label>Bairro</label><input value="${n.bairro}" data-campo="novo-bairro"></label>
    </div>
  </div>
  <button class="act full" style="margin-top:7px;justify-content:center" data-acao="usar-meu-local">
    ${ic('gps',17)}<b>GPS — usar onde estou</b></button>
  <!-- azul = local pego; âmbar = pego mas impreciso. Sem os dois tons o
       entregador não saberia que precisa chegar mais perto da porta. -->
  ${n.local?`<div class="banner ${n.localOk?'pausa':'alerta'}" style="margin-top:7px">${ic(n.localOk?'check':'alert',15)}
    <span>${n.local}</span></div>`:''}

  <div class="acts" style="margin-top:12px">
    <button class="act go wide" style="justify-content:center" data-acao="salvar-novo-cliente">
      ${ic('check',19)}<b>${n.salvando?'Salvando…':'Salvar cliente'}</b></button>
    <button class="act" style="justify-content:center" data-ir="clientes">${ic('back',17)}<b>Voltar</b></button>
  </div>
</div>
${nav('ajustes')}`;}};

/* 0 — ENTRADA (abertura do app) ------------------------------------------ */
/* A MARCA DA ABERTURA MORA AQUI, E EM UM LUGAR SÓ. A entrada usa e a SAÍDA usa
   (§ `T.saida`) — a cena que fecha é a que abre, ao contrário, e duas cópias da
   mesma marca é como elas passam a discordar. */
function splashMarca(){
  // As hastes nascem com coordenadas provisórias: quem crava é `ajustarHastes`,
  // que MEDE o glifo do X depois da tela montada. Cravar aqui na mão faria a
  // haste e o glifo desencontrarem a cada mudança de fonte ou de tamanho.
  return `<div class="splash">
    <div class="splash-fundo"></div>
    <svg class="splash-xis" viewBox="0 0 412 900" preserveAspectRatio="none">
      <line class="rastro haste-a" x1="0" y1="0" x2="0" y2="0"/>
      <line class="rastro haste-b" x1="0" y1="0" x2="0" y2="0"/>
      <line class="haste-a" x1="0" y1="0" x2="0" y2="0"/>
      <line class="haste-b" x1="0" y1="0" x2="0" y2="0"/>
    </svg>
    <i class="splash-flash"></i>
    <div class="splash-centro">
      <span class="splash-anel"></span>
      <div class="splash-logo">
        <div class="w"><b>H</b><b>B</b><em>X</em><i class="splash-brilho"></i></div>
        <small>LOGÍSTICA</small>
      </div>
      <div class="splash-barra"><i></i></div>
    </div>
  </div>`;
}
T.entrada={nome:'Entrada (abertura)',grupo:'Sistema',render(){
  return `${status}
<div class="body flush" style="overflow:hidden">${splashMarca()}</div>`;}};

/** Põe as duas hastes exatamente em cima das diagonais do glifo do X, e o
 *  clarão no cruzamento. Medido, nunca chutado — a haste é a MESMA forma que o
 *  glifo assume depois; 2px de erro aqui viram um pulo visível na troca. */
function ajustarHastes(camada){
  const splash=camada.querySelector('.svg-ok, .splash'); if(!splash) return;
  const em=splash.querySelector('.w em'); if(!em) return;
  /* 🔴 O SVG É ESTICADO, ENTÃO A CONTA TEM QUE MANDAR NO viewBox — e este era o
     defeito que o dono viu na foto do g15: *"o X está se deslocando"*, e com ele
     o "apareceu 2x" (a pessoa vê o X das hastes num lugar e o X do logotipo em
     outro). O viewBox estava CRAVADO em `0 0 412 900` com
     `preserveAspectRatio="none"`: numa tela de 940 de altura, cada unidade do
     desenho virava 1,044 px e a medida — feita em PIXEL — pousava 19 px abaixo
     do glifo (MEDIDO na bancada; no g15, mais baixo ainda, porque lá a caixa não
     tem 900 nem 940). Nenhuma conta de posição sobrevive a um sistema de
     coordenadas que se estica sozinho: o viewBox passa a ser a caixa de verdade,
     e aí 1 unidade = 1 px, sempre.
     A medida também sai do `getBoundingClientRect` e não da corrente de
     `offsetParent` — retângulo de tela é o que o olho vê, e não depende de quem
     está posicionado no meio do caminho. */
  const cRect=splash.getBoundingClientRect();
  const svg=splash.querySelector('.splash-xis');
  if(svg) svg.setAttribute('viewBox',`0 0 ${Math.round(cRect.width)} ${Math.round(cRect.height)}`);
  /* 🔴 O X CRESCIA NA TROCA (dono, 10/08: *"o X cresce do nada"*) — e a culpa era
     de DOIS CHUTES nesta função. As hastes desenhavam um X com 68% da largura e
     60% da altura da CAIXA do glifo (os antigos `.34`/`.30`), com traço fixo de
     5px contra a perna de ~7px da letra. Medido na bancada: haste de 27px, letra
     de 40px. Ou seja, no instante em que o glifo assumia, o X engordava e
     esticava — que é exatamente o "cresce do nada".
     Caixa de LAYOUT nunca foi a forma da letra: ela carrega o avanço lateral e a
     entrelinha inteira. Quem tem que casar é a TINTA. Então agora a letra é
     MEDIDA (`moldeDoX`) e as hastes viram o molde dela: mesma largura, mesma
     altura, mesma espessura de perna, mesma inclinação. */
  const molde=moldeDoX(em);
  const eRect=em.getBoundingClientRect();
  const cx=eRect.x-cRect.x+eRect.width/2, cy=eRect.y-cRect.y+eRect.height/2;
  let hw,hh,tintaCy;
  if(molde){
    hw=molde.larg/2; hh=molde.alt/2;
    // onde a tinta mora na vertical: da linha de base pra cima, o quanto ela sobe
    tintaCy=(baseDoGlifo(em)-cRect.y)-molde.sobe+hh;
  }else{
    hw=eRect.width*.34; hh=eRect.height*.30; tintaCy=cy;   // rede: o chute de antes
  }
  /* A letra é INCLINADA (`skewX(-8deg)`), e a inclinação nasce no centro do
     elemento — sem repeti-la, as duas pernas da haste ficariam simétricas e a
     letra não é. São ~2,6px em cada ponta: pouco pra descrever, o bastante pra
     ler como "trocou de peça". */
  const inclina=Math.tan(-8*Math.PI/180);
  const ponto=(dx,dy)=>({ x:cx+dx+(dy)*inclina, y:cy+dy });
  const dyTopo=(tintaCy-cy)-hh, dyBase=(tintaCy-cy)+hh;
  /* A ponta REDONDA da haste passa meio traço do fim da linha; a perna da letra
     acaba cortada. Sem encurtar, o X das hastes nasce mais comprido que o glifo. */
  const recuo=molde&&molde.perna>1?molde.perna/2:0;
  const encurtar=(p,q)=>{
    const dx=q.x-p.x, dy=q.y-p.y, L=Math.hypot(dx,dy)||1;
    const ux=dx/L*recuo, uy=dy/L*recuo;
    return [{x:p.x+ux,y:p.y+uy},{x:q.x-ux,y:q.y-uy}];
  };
  const põe=(sel,x1,y1,x2,y2)=>splash.querySelectorAll(sel).forEach(l=>{
    l.setAttribute('x1',x1.toFixed(1)); l.setAttribute('y1',y1.toFixed(1));
    l.setAttribute('x2',x2.toFixed(1)); l.setAttribute('y2',y2.toFixed(1));});
  const [a1,a2]=encurtar(ponto(-hw,dyTopo),ponto(hw,dyBase));   // desce da esquerda pra direita
  const [b1,b2]=encurtar(ponto(hw,dyTopo),ponto(-hw,dyBase));   // sobe da direita pra esquerda
  põe('.haste-a', a1.x,a1.y,a2.x,a2.y);
  põe('.haste-b', b1.x,b1.y,b2.x,b2.y);
  if(molde&&molde.perna>1){
    splash.querySelectorAll('.splash-xis line:not(.rastro)').forEach(l=>{ l.style.strokeWidth=molde.perna.toFixed(2); });
    splash.querySelectorAll('.splash-xis line.rastro').forEach(l=>{ l.style.strokeWidth=(molde.perna*.4).toFixed(2); });
  }
  const fl=splash.querySelector('.splash-flash');
  const cruz=ponto(0,tintaCy-cy);
  if(fl){ fl.style.left=(cruz.x-48)+'px'; fl.style.top=(cruz.y-48)+'px'; fl.style.marginLeft='0'; }
}

/** A LINHA DE BASE do glifo, perguntada ao próprio navegador: uma caixa de altura
 *  ZERO em linha se apoia EXATAMENTE nela. Vale mais que qualquer conta de fonte,
 *  porque responde pela fonte que de fato entrou (a de reserva inclusive). */
function baseDoGlifo(em){
  const p=document.createElement('i');
  p.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;border:0';
  em.appendChild(p);
  const y=p.getBoundingClientRect().top;
  p.remove();
  return y;
}

/** O MOLDE DA LETRA X — largura, altura e espessura da perna, em pixel de tela.
 *  `actualBoundingBox*` é a caixa da TINTA (não a de layout), e a espessura sai de
 *  uma varredura de pixel numa faixa alta do desenho, onde as duas pernas ainda
 *  estão separadas: ali a mordida horizontal vale `perna / sen(ângulo)`.
 *  Devolve `null` em qualquer imprevisto — quem chama tem o caminho de antes. */
function moldeDoX(em){
  try{
    const cs=getComputedStyle(em);
    const fonte=`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const letra=((em.textContent||'X').trim()[0])||'X';
    const cv=moldeDoX.cv||(moldeDoX.cv=document.createElement('canvas'));
    let ct=cv.getContext('2d',{willReadFrequently:true});
    ct.font=fonte;
    const m=ct.measureText(letra);
    const larg=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
    const alt=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
    if(!(larg>1&&alt>1)) return null;
    const folga=8;
    cv.width=Math.ceil(larg)+folga*2; cv.height=Math.ceil(alt)+folga*2;
    ct=cv.getContext('2d',{willReadFrequently:true});   // redimensionar zera o estado
    ct.font=fonte; ct.fillStyle='#fff';
    ct.fillText(letra,folga+m.actualBoundingBoxLeft,folga+m.actualBoundingBoxAscent);
    const faixa=Math.round(folga+alt*.14);
    const px=ct.getImageData(0,faixa,cv.width,1).data;
    let corrida=0,maior=0;
    for(let i=0;i<cv.width;i+=1){
      if(px[i*4+3]>90){ corrida+=1; if(corrida>maior) maior=corrida; } else corrida=0;
    }
    const perna=maior>0?maior*Math.sin(Math.atan2(alt,larg)):0;
    return { larg,alt,perna,sobe:m.actualBoundingBoxAscent };
  }catch(_){ return null; }
}

/* 0b — SAÍDA (o fechamento do app) ----------------------------------------
   🔴 O INVERSO DA ENTRADA, LITERALMENTE (ordem do dono, 09/08: *"remova o efeito
   de sair, é o antigo, e faça o inverso do q foi feito no 1"*).

   O que saiu: a cena NATIVA tocada de trás pra frente (`opening.html?mode=exit`)
   — outra marca, outro desenho, outro lugar. O que entra: a MESMA cena da
   abertura, com o filme rodando ao contrário. O HBX desce do cabeçalho pro meio
   da tela, o X se desmonta nas duas hastes que voam embora, as letras descem e a
   barra esvazia.

   E ela usa as MESMAS peças: `T.saida` devolve o mesmo `.splash` da entrada
   (`splashMarca()`), e as animações são as MESMAS com `reverse`. Cena de fechar
   que é desenho próprio vira, no dia seguinte, duas marcas que discordam. */
T.saida={nome:'Saída (fechamento)',grupo:'Sistema',render(){
  return `${status}
<div class="body flush" style="overflow:hidden">${splashMarca()}</div>`;}};

/* 19 — SUB-TELAS DOS AJUSTES ---------------------------------------------- */
const telaAjuste=(titulo,corpo,rodape)=>`${status}
${hdr({voltar:'ajustes',semChat:1})}
<div class="body${rodape?' com-dock':''}">${titulo?`<h1 class="tela-tit">${titulo}</h1>`:''}${corpo}</div>
${rodape?`<div class="tmx-dock">${rodape}</div>`:''}${nav('ajustes')}`;

/* 🔴 A TELA DE DINHEIRO É A ÚLTIMA QUE PODE MENTIR — e a que morreu aqui mentia
   em TRÊS lugares, todos em cima do botão que cobra.

   1. "Pagar com: [Pix ✓ cai na hora] [Cartão até 3× sem juros]". O Pix vinha
      MARCADO como escolhido, e Pix NÃO EXISTE neste app: o checkout nativo
      (`RechargeCheckoutActivity` + `assets/checkout/`) é tokenização de CARTÃO
      no Mercado Pago, ponto — nenhuma linha de Pix, nenhuma de parcelamento, e
      o `POST /financeiro/credits/recharge` do servidor se chama
      `rechargeWithCard`. Os dois botões não tinham `data-acao` nenhum: era
      MAQUETE viajando como controle, a mesma peça que em 08/08 fez três telas
      prometerem apagar e não apagarem. Quem tocasse "Pix" e depois "Recarregar"
      caía num formulário de cartão. Saiu; no lugar entra a letra miúda que diz
      a verdade — cartão, pelo Mercado Pago, e a HBX não guarda o número.
   2. O catálogo do desenho (R$ 49/129/239/449, "+8% grátis", "melhor preço")
      não bate com pacote nenhum de fábrica (100/300/800 por R$ 97/247/597).
   3. "~17 dias no seu ritmo" não tem porta — e a conta que EXISTE não serve:
      o `usage` do extrato soma `paidCreditsConsumed`, que é o crédito vindo de
      lote PAGO (a base do cashback), não tudo que saiu da carteira. Quem usa
      crédito de bônus apareceria gastando menos do que gasta, e a tela diria
      que o saldo dura MAIS do que dura — o erro pro lado errado numa tela de
      recarga. Fica de fora até existir "consumo por dia" de verdade.

   O que a tela ganhou, tudo com fonte: o preço POR CRÉDITO (a única conta que
   responde "qual é o mais barato"), a VALIDADE de cada pacote
   (`defaultExpiryDays`, que já vinha no `/credits/me` e ninguém mostrava) e o
   aviso de crédito VENCENDO (`lots[].expiresAt` — dinheiro que evapora sem
   ninguém avisar era a pior surpresa que este produto guardava). */
T.creditos={nome:'Ajustes · Créditos',grupo:'Ajustes',render(){
  const c=DADOS.creditos;
  const pac=(qtd,preco,selo,on,chave,det)=>`<button class="pacote ${on?'on':''}"${chave?` data-acao="pacote" data-pacote="${chave}"`:''}>
    <span class="qt"><b>${qtd}</b><small>créditos</small></span>
    <span class="det">${selo?`<span class="selo">${selo}</span>`:''}${det?`<small>${det}</small>`:''}</span>
    <span class="preco">R$ ${preco}</span></button>`;
  const l=(tipo,t,s,v)=>`<div class="ext-linha">
    <span class="m ${tipo}">${tipo==='mais'?'+':'−'}</span>
    <span><strong>${t}</strong><span>${s}</span></span>
    <b class="${tipo}">${v}</b></div>`;
  // Número sem fonte não vira cartão com rótulo órfão — some inteiro.
  const kpi=(glifo,cor,v,rot)=>v?`<div class="kpi"><span style="color:${cor}">${ic(glifo,20)}</span>
      <span><b class="v">${v}</b><span class="l">${rot}</span></span></div>`:'';
  const kpis=[kpi('chart','var(--ink-2)',c.gastosHoje,'gastos hoje'),
              kpi('calendar','var(--ink-2)',c.gastosMes,'no mês'),
              kpi('spark','var(--lime)',c.bonus,'de bônus')].join('');
  return telaAjuste('Créditos',`
    ${miolo(c,'card','recarregar-creditos',4,`
    ${c.saldo?`<div class="saldo">
      <span class="ico">${ic('card',20)}</span>
      <span><span class="n"><b>${c.saldo}</b><small>créditos</small></span>
        ${c.vence?`<span class="vence">${c.vence}</span>`:''}</span>
    </div>`:''}
    <div class="banner pausa">${ic('alert',15)}
      <span>Crédito só é debitado quando a rota <b>inicia</b>. Conferir nunca debita.</span></div>
    ${c.pacotes.length?`<div class="grupo">Escolha o pacote</div>
    <div class="pacotes">
      ${c.pacotes.map(x=>pac(x[0],x[1],x[2],x[3],x[4],x[5])).join('')}
    </div>
    <div class="nota">${ic('lock',13)}
      <span>Pagamento no cartão, pelo Mercado Pago. A HBX não guarda o número do seu cartão.</span></div>`:''}`)}
    ${/* 🔴 UM AVISO SÓ QUANDO TUDO CAIU. As duas portas têm bandeira própria de
          propósito — extrato no chão não pode derrubar a recarga — mas o
          contrário NÃO é simétrico: sem a carteira não há saldo, não há pacote e
          não há botão, então a tela inteira está no chão e o bloco de baixo só
          repetiria "Não consegui carregar / Tentar de novo" um palmo abaixo do
          primeiro. Duas vezes a mesma frase na mesma tela é ruído, e o `Tentar
          de novo` que sobra rebusca as DUAS portas de qualquer jeito. */''}
    ${c.semFonte?'':`
    <div class="grupo">Consumo e bônus${c.mes?` · ${c.mes}`:''}</div>
    ${kpis?`<div class="kpis" style="margin-top:0">${kpis}</div>`:''}
    ${mioloDe(c.movCarregando,c.movSemFonte,'sales','recarregar-movimento',4,`<div class="extrato">
      ${c.linhas.length?c.linhas.map(x=>l(x[0],x[1],x[2],x[3])).join('')
                       :`<div class="vazio"><b>${c.vazio||'Sem movimento ainda'}</b></div>`}
    </div>`)}
    <div class="banner pausa">${ic('alert',15)}
      <span>Migração entre rotas é <b>grátis</b>: a mesma entrega não debita duas vezes.</span></div>`}`,
    c.cta?`<button class="act go full" style="justify-content:center" data-acao="recarregar">${ic('check',19)}<b>${c.cta}</b></button>`:'');
}};

/* 🔴 NENHUM LITERAL DE DINHEIRO AQUI DENTRO. Tudo vem de `DADOS.financeiro`
   (o seam, seção L11b) e cada pedaço SÓ EXISTE se tiver fonte — inclusive o
   `.grupo`, que é o TÍTULO da caixa de baixo e some junto com ela. É a mesma
   régua da cura do GPS, no tamanho desta tela: aqui o "separador órfão" é um
   título de seção anunciando uma caixa que não veio. */
T.financeiro={nome:'Ajustes · Financeiro',grupo:'Ajustes',render(){const f=DADOS.financeiro;
  // título + caixa nascem e somem JUNTOS: é o par indivisível desta tela.
  const secao=(titulo,corpo)=>corpo?`<div class="grupo">${titulo}</div>${corpo}`:'';
  const dev=(a,nome,sub,val,cor)=>`<div class="item-linha"><span class="ava${cor?` ${cor}`:''}">${a}</span>
        <span><strong>${nome}</strong>${sub?`<span>${sub}</span>`:''}</span>
        <b style="color:var(--amber);font-size:14px">${val}</b></div>`;
  // o número grande com a legenda embaixo: sem número não sobra legenda sozinha
  // ("pendência" sem valor é uma coluna vazia com nome).
  const cel=(v,rot,cor)=>v?`<span class="c"><span><b${cor?` style="color:${cor}"`:''}>${v}</b><small>${rot}</small></span></span>`:'';
  const semana=[cel(f.semanaRecebido,'recebido'),cel(f.semanaMarcado,'marcado'),
    cel(f.semanaPendencia,'pendência','var(--amber)')].join('');
  const kpis=`${f.recebido?`<div class="kpi money"><span class="l">Recebido hoje</span><b class="v">${f.recebido}</b></div>`:''}${f.emAberto?`
      <div class="kpi money"><span class="l">Em aberto</span><b class="v" style="color:var(--amber)">${f.emAberto}</b></div>`:''}`;
  const formas=`${f.formas.map(x=>`<div class="form-c"><span style="color:${x[1]}">${ic(x[0],19)}</span><small>${x[2]}</small><b>${x[3]}</b></div>`).join('')}${f.marcou?`
      <div class="form-c total"><small style="margin-top:0">Marcou</small><b>${f.marcou}</b></div>`:''}`;
  /* A TELA INTEIRA É DADO, então ela inteira passa pelo `miolo`. Sem isto, a
     rede no chão pintaria a MESMA tela que "não entrou nada hoje" — e esses
     dois vazios são opostos (Lei nº1 desta frente). Com ele: esqueleto na
     primeira carga, aviso com "Tentar de novo" se a fonte não responder. */
  return telaAjuste('Financeiro',miolo(f,'wallet','recarregar-financeiro',4,`
    ${kpis?`<div class="kpis" style="margin-top:2px">
      ${kpis}
    </div>`:''}
    ${secao('Por forma, hoje',formas?`<div class="forms">
      ${formas}
    </div>`:'')}
    ${secao('Quem marcou',f.devedores.length?`<div class="cartao-lista" style="padding:0 11px">
      ${f.devedores.map(x=>dev(x[0],x[1],x[2],x[3],x[4])).join('')}
    </div>`:'')}
    ${secao('Semana',semana?`<div class="sum" style="margin-top:0">
      ${semana}
    </div>`:'')}`));
}};

/* 🔴 AS CHAVES DE DINHEIRO DO DONO MORAM AQUI — e as 6 que não tinham porta
   saíram (07/08). O que havia nesta tela era desenho: `Aceitar cartão` e `Voz na
   navegação` não existem em campo nenhum do servidor; `Conferência de rota`
   (`rotaConferidaAtiva`) o app só LÊ — não está no UpdateLogisticaConfigDto, e o
   ValidationPipe (forbidNonWhitelisted) devolve 400 pra quem tentar gravar;
   `Rastreamento` saiu do celular por ordem do dono em 26/07 (só o painel do PC
   grava, por `PATCH /logistica/config/modo-rota`). A "Zona de perigo" foi junto:
   "Limpar dados do aparelho" não tem porta nativa nenhuma (só existe `logout()`
   na ponte), e "Desvincular este aparelho" É o `logout()` — o mesmo que o "Sair"
   dos Ajustes já faz, com o mesmo aviso de reparear. Dois nomes pro mesmo verbo
   é a lei "mostra num lugar, edita num lugar" quebrada.

   No lugar entram as 6 que o dono cobrou e que EXISTEM no servidor, com os
   MESMOS nomes do app que já roda (`financeiroModal` do app.js): "Marcar" é o
   `aceitaFiado` — o "pagou não" dele. O mestre esconde os 5 de baixo quando
   está desligado porque com o financeiro OFF nenhum deles muda coisa alguma
   (`abrirParada` já resolve `simples = !financeiroAtivo || cobrancaSimples`).
   Sem texto embaixo da chave: o nome carrega a consequência, e o grupo
   "Formas de pagamento" é o que faz "Marcar" ser lido como forma, não como
   verbo solto. */
T.avancado={nome:'Ajustes · Avançado',grupo:'Ajustes',render(){const a=DADOS.avancado;
  const ch=(ic0,t,on,acao)=>`<button class="linha-cfg" data-acao="${acao}"><span class="ico">${ic(ic0,16)}</span>
    <span><strong>${t}</strong></span><span class="chave ${on?'on':''}"><i></i></span></button>`;
  /* Chave que também mostra um NÚMERO à direita. O número é DADO (o raio que o
     servidor tem gravado), não explicação — some sozinho quando não chega. */
  const chVal=(ic0,t,val,on,acao)=>`<button class="linha-cfg" data-acao="${acao}"><span class="ico">${ic(ic0,16)}</span>
    <span><strong>${t}</strong></span>
    <span style="display:flex;align-items:center;gap:9px">${val?`<b style="font-size:12px;color:var(--ink-2)">${val}</b>`:''}<span class="chave ${on?'on':''}"><i></i></span></span></button>`;
  return telaAjuste('Avançado',miolo(a,'gear','recarregar-ajustes',5,!a.admin?'':`
    <div class="grupo" style="margin-top:2px">Cobrança</div>
    <div class="cartao-lista">
      ${ch('wallet','Financeiro ligado',a.financeiro,'chave-financeiro')}
      ${a.financeiro?ch('note','Cobrança simples na chegada',a.cobrancaSimples,'chave-cobranca-simples'):''}
      ${a.financeiro?ch('sales','Preço por cliente',a.precoPorCliente,'chave-preco-cliente'):''}
    </div>
    ${a.financeiro?`<div class="grupo">Formas de pagamento</div>
    <div class="cartao-lista">
      ${ch('cash','Na hora',a.naHora,'chave-na-hora')}
      ${ch('calendar','Mensal',a.mensal,'chave-mensal')}
      ${ch('note','Marcar',a.fiado,'chave-fiado')}
    </div>`:''}
    <div class="grupo">Avisos</div>
    <div class="cartao-lista">
      ${chVal('gps','Avisar chegada',a.avisarChegadaDist,a.avisarChegada,'aviso-chegada')}
    </div>
    ${/* 🔴 SÓ DESENHA SE A EMPRESA PODE (`prospectorDisponivel`). Chave que a
          empresa não tem é botão que promete e devolve erro — e este devolveria
          400 no `UpdateLogisticaConfigDto`, que o app traduz como "sua sessão
          expirou". Grupo próprio porque não é cobrança nem aviso: é uma FONTE
          DE CLIENTE. O nome carrega a consequência inteira, sem linha de
          explicação embaixo — mesma régua das 6 de cima. */''}
    ${/* 🔴 A CHAVE VIROU DUAS LINHAS (PROSPECTOR v2, 12/08), e a de baixo é a
          que manda. A chave de cima continua sendo a da EMPRESA (opt-in do
          admin, um campo, um PATCH). A de baixo é a da PESSOA: o que ELA quer
          caçar nesta semana. Sem escolha, o prospector fica mudo mesmo com a
          chave ligada — então a linha diz "Escolher" em vez de fingir que
          ligado basta. Ela só existe com a chave ligada, porque escolher tipo
          numa empresa que não tem o recurso é decisão sem consequência. */''}
    ${a.prospectorDisponivel?`<div class="grupo">Vender no caminho</div>
    <div class="cartao-lista">
      ${ch('sales','Prospector — empresas no caminho',a.prospector,'chave-prospector')}
      ${a.prospector?`<button class="linha-cfg" data-acao="abrir-prospector-tipo"><span class="ico">${ic('sales',16)}</span>
        <span><strong>${a.prospectorTipo?`Procurando: ${a.prospectorTipo}`:'Escolher o que procurar'}</strong></span>
        <span style="color:var(--ink-3)">${ic('chev',15)}</span></button>`:''}
    </div>`:''}`));
}};

/* 19b — PROSPECTOR: O QUE TE INTERESSA ESTA SEMANA (12/08) -----------------
   FOLHA, não tela cheia: é uma decisão de UM toque em cima do Avançado, e a
   folha é a peça que o app já usa pra isso (mesma família do "Histórico da
   semana"). A entrada desliza pelo `.tela.entra .sheet` que já existe — regra
   de ENTRADA que cita `.entra`, que é o que impede a folha de subir de novo a
   cada toque de chip (o defeito do APK 267, `prova-folha-sobe-uma-vez`).

   COPY MÍNIMA de propósito: a pergunta, os chips e o Desligar. Sem parágrafo
   explicando o que é prospector — quem chegou aqui já ligou a chave de cima. */
T.prospectortipo={nome:'Prospector · o que procurar',grupo:'Ajustes',render(){
  const d=DADOS.prospectortipo||{};
  const tipos=Array.isArray(d.tipos)?d.tipos:[];
  return `${status}
${hdr({voltar:'avancado',semChat:1})}
<div class="body" style="opacity:.4;pointer-events:none"><h1 class="tela-tit">Avançado</h1></div>
<div class="scrim"></div>
<div class="sheet" style="max-height:76%">
  <span class="handle"></span>
  <div class="sheet-head">
    <div><h2>O que te interessa esta semana?</h2><p>Só o que você escolher aparece aceso na rua.</p></div>
    <button class="round sm" data-voltar="1" data-ir="avancado">${ic('close',16)}</button></div>
  ${/* Lista VAZIA não vira tela vazia calada: sem os tipos (a porta não
        respondeu) a folha diz o que houve e oferece a saída. */''}
  ${tipos.length?`<div class="chips centro" style="flex-wrap:wrap;overflow:visible">
    ${tipos.map(t=>`<button class="chip${d.tipo===t.slug?' on':''}" data-acao="prospector-tipo" data-tipo="${t.slug}">${t.rotulo}</button>`).join('')}
  </div>
  ${d.tipo?`<div style="margin-top:14px"><button class="linha-cfg" data-acao="prospector-desligar" style="border-radius:13px;background:var(--card);border:.7px solid var(--line)">
    <span class="ico">${ic('close',16)}</span><span><strong>Desligar esta semana</strong></span><span></span></button></div>`:''}`
  :`<div class="box"><div class="box-t">Não consegui carregar os tipos</div>
    <div class="box-s">Toque em Fechar e abra de novo.</div></div>`}
</div>
${nav('ajustes')}`;}};

T.sons={nome:'Ajustes · Sons',grupo:'Ajustes',render(){
  const linha=(t,s,on)=>`<button class="linha-cfg"><span class="ico">${ic('volume',16)}</span>
    <span><strong>${t}</strong>${s?`<span>${s}</span>`:''}</span>
    <span style="display:flex;align-items:center;gap:9px">
      <span class="ghost" style="padding:4px 9px;font-size:10.5px">ouvir</span>
      <span class="chave ${on?'on':''}"><i></i></span></span></button>`;
  return telaAjuste('Sons e voz',`
    <div class="cartao-lista" style="margin-top:2px">
      <button class="linha-cfg"><span class="ico" style="background:var(--lime-bg-2);color:var(--lime)">${ic('volume',16)}</span>
        <span><strong>Todos os sons</strong></span>
        <span class="chave on"><i></i></span></button>
    </div>
    <div class="grupo">O que fala</div>
    <div class="cartao-lista">
      ${linha('Voz da navegação','',1)}
      ${linha('Chegada na parada','toca quando entra no raio de 60 m',1)}
      ${linha('Recado da Central','sirene até você abrir',1)}
      ${linha('Entrega registrada','',1)}
      ${linha('Erro','',0)}
    </div>`);
}};

T.historico={nome:'Ajustes · Histórico',grupo:'Ajustes',render(){
  const dia=(d,par,km,val)=>`<div class="rowcard">
    <span class="ico lime">${ic('route',18)}</span>
    <span><strong>${d}</strong><span>${par} paradas · ${km}</span></span>
    <span class="rgt"><small>Recebido</small><b>R$ ${val}</b></span></div>`;
  return telaAjuste('Histórico de rotas',`
    <div class="searchrow"><label class="search">${ic('search',17)}<input placeholder="Buscar por dia ou cliente"></label>
      <button class="filt">${ic('sliders',18)}</button></div>
    <div style="margin-top:9px">
      ${dia('Terça · 05/08','14','61,2 km','412,00')}
      ${dia('Segunda · 04/08','11','48,7 km','380,00')}
      ${dia('Sábado · 02/08','8','31,4 km','260,00')}
      ${dia('Sexta · 01/08','13','57,9 km','560,00')}
      ${dia('Quinta · 31/07','12','52,1 km','478,00')}
    </div>`);
  /* 🔴 "APAGAR O HISTÓRICO TODO" SAIU (08/08) — era a terceira cópia da
     confirmação decorativa (`data-superficie="confirmar"`): prometia apagar e
     abria "Retirar da rota de hoje? Mercado Estrela". Não existe endpoint que
     apague o histórico de rotas (o que a allowlist tem é
     `DELETE /logistica/clientes/:id/historico`, que é o histórico de UM
     cliente — outra coisa). Botão de apagar sem porta é o pior tipo de botão
     morto: o motorista acha que apagou. Esta tela ainda é ÓRFÃ (os Ajustes não
     têm linha pra ela e os 5 dias acima são do desenho) — quando ganhar porta,
     ela ganha dado real, não este botão de volta. */
}};

/* (A tela `T.consumo` — "Consumo e bônus" — morava AQUI e virou o bloco de
   baixo da `T.creditos`, lá em cima. Ela mostrava o SALDO num cartão e a
   Recarga mostrava o MESMO saldo em outro: dado em dois cartões é bug de
   produto. As duas linhas vizinhas na Administração viraram uma; a copy do
   "Migração entre rotas é grátis" foi junto, e agora fica colada no extrato,
   que é o lugar onde a dúvida "por que não debitou duas vezes?" nasce.) */

/* 20 — PARADA AVULSA (era "Rota rápida") ----------------------------------
   O histórico mora em `DADOS.rapida`; aqui só o desenho.

   A tela é uma ESCADA de um degrau por vez — procurar, escolher a porta, dizer
   o que ela é, dizer onde ela entra — e cada degrau só nasce quando o de cima
   respondeu. Formulário que abre as seis perguntas de uma vez é formulário que
   ninguém termina em pé na porta de um cliente, com o carro ligado. */
/* 🔴 O NOME DIZ O VERBO (dono, 10/08: "o + não é um botão de rota avulsa, ele
   adiciona clientes na minha rota atual!"). A tela herdou "Rota avulsa" da
   "Rota rápida" do app antigo e o título mentia a função. ROTA avulsa é o
   ESTADO da Montagem sem dia aceso (chip desligado); esta tela é só a porta de
   pôr gente/endereço na rota da vez — em qualquer modo. */
/* ==== O PAINEL DA BUSCA (F2 do PR12082026) ================================
   🔴 O ROLO É UMA FUNÇÃO SÓ, E ISSO É ARQUITETURA, NÃO ARRUMAÇÃO. A ponte
   REESCREVE ESTE NÓ a cada tecla, sem passar pelo seam — a mesma divisão que o
   velocímetro já tinha ("o DADO passa pelo seam; o que muda a cada quadro,
   NÃO"), porque `usarDados` remonta a camada inteira e uma camada nova por
   letra digitada é a tela piscando na mão de quem está em pé na calçada.
   Se o desenho tivesse duas cópias — uma aqui, outra na ponte — a primeira
   mexida faria o aparelho parar de ser o mock. Tem uma só, e é esta.

   Por isso também NÃO EXISTE `animation:` nas regras `.avb-*`: elas nascem de
   repinte, e repinte não "entra" (a lei do `.tela.entra`). */

/* dobra acento e caixa SEM MUDAR O TAMANHO da string — o índice tem que
   continuar valendo no texto original, senão o grifo cai no lugar errado. */
const AVB_COM='áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const AVB_SEM='aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn';
const dobrarBusca=s=>String(s==null?'':s).toLowerCase().split('').map(c=>{
  const i=AVB_COM.indexOf(c);return i<0?c:AVB_SEM[i];}).join('');
/* 🔴 O GRIFO É DO TRECHO QUE CASOU, e ele é a resposta visual à pergunta "por
   que este resultado está aqui?". Sem ele, "Mracia" trazendo "Márcia" parece
   defeito. Some quando o casamento foi por erro de digitação (não há trecho
   igual pra grifar) — e some CALADO, que é o certo: o cartão vale por si. */
function grifarBusca(txt,q){
  const t=String(txt==null?'':txt); const alvo=String(q||'').trim();
  if(!alvo) return t;
  const i=dobrarBusca(t).indexOf(dobrarBusca(alvo));
  if(i<0) return t;
  return t.slice(0,i)+'<mark>'+t.slice(i,i+alvo.length)+'</mark>'+t.slice(i+alvo.length);
}
/* um cartão do painel. `tipo` é a chave do grupo (cli/rua/loja) e viaja no
   `data-` porque é ele que a ponte usa pra achar o item cru de volta. */
function cartaoDaBusca(x,tipo,i,q,glifo,selo,marcado){
  return `<button type="button" class="rowcard avb-item${marcado?' on':''}"
    data-acao="busca-escolher" data-tipo="${tipo}" data-i="${i}">
    <span class="ico${selo?' '+selo:''}">${ic(glifo,18)}</span>
    <span><strong>${grifarBusca(x.titulo,q)}</strong>${x.detalhe?`<span>${x.detalhe}</span>`:''}</span>
    <span class="rgt">${x.dist?`<b>${x.dist}</b>`:''}${x.fonte?`<small>${x.fonte}</small>`:''}</span>
  </button>`;
}
/* O DEGRAU DO NÚMERO. Rua não é parada: "Rua 8" sozinha é 214 portas. Aqui a
   pessoa diz o número (ou diz que NÃO TEM — metade do interior é S/N) e o
   Censo devolve o pino da porta com o CEP junto. */
function numeroDaBusca(x,i,d){
  if(d.numAberto!==i) return '';
  const sn=!!d.numSn;
  return `<div class="avb-num">
    <p>Qual o número na <b>${x.titulo}</b>?${x.cep?` <span style="color:var(--ink-3)">o Censo dá o pino da porta e o CEP ${x.cep}</span>`:''}</p>
    <div class="fila">
      <input data-campo="busca-numero" inputmode="numeric" enterkeyhint="done" autocomplete="off"
        placeholder="nº" value="${sn?'S/N':d.numValor}"${sn?' disabled':''}>
      <button type="button" class="chip${sn?' on':''}" data-acao="busca-sn">S/N</button>
      <button type="button" class="act go" data-acao="busca-usar-rua"><b>Usar</b></button>
    </div>
  </div>`;
}
function roloDaBuscaAvulsa(d){
  const q=String(d.busca||'');
  /* NADA ESCRITO = a pergunta, mais os atalhos. Os recentes são as 6 últimas
     ESCOLHAS (não as últimas digitações): repetir a parada de ontem é o gesto
     mais comum de quem entrega, e ele merece um toque, não onze letras. */
  if(!q){
    const recs=(d.recentes||[]).slice(0,6);
    return `${recs.length?`<div class="chips avb-recentes">${recs.map(r=>
      `<button type="button" class="chip" data-acao="busca-recente" data-rec="${r}">${ic('clock',12)} ${r}</button>`).join('')}</div>`:''}
    <div class="vazio"><span class="ico">${ic('search',24)}</span>
      <strong>Pra onde vai a parada?</strong>
      <span>Nome do cliente, rua com número, comércio,<br>CEP ou link do Maps.</span></div>`;
  }
  /* 🔴 O LINK DO MAPS NÃO ENTRA NO FLUXO POR TECLA — ele vira um CARTÃO. O que
     a pessoa colou não se procura em banco nenhum: já é um ponto. O caminho
     antigo (`/logistica/geo/link`, que segue o redirecionamento do link curto)
     continua inteiro, só que agora atrás de um toque explícito, e não de uma
     regex decidindo em silêncio o que fazer com o que foi digitado. */
  const colar=d.colar?`<div class="avb-grupo">Localização colada</div>
    <button type="button" class="rowcard avb-item" data-acao="busca-colar">
      <span class="ico lime">${ic('target',18)}</span>
      <span><strong>${d.colar}</strong><span>abrir este ponto e usar como parada</span></span>
      <span class="rgt"><small>colado</small></span></button>`:'';
  const g=d.grupos||{};
  const bloco=(titulo,itens,tipo,glifo,selo)=>{
    const lista=Array.isArray(itens)?itens:[];
    if(!lista.length) return '';
    return `<div class="avb-grupo">${titulo} <em>${lista.length}</em></div>`
      +lista.map((x,i)=>cartaoDaBusca(x,tipo,i,q,glifo,selo,d.pe&&d.pe.tipo===tipo&&d.pe.i===i)
        +(tipo==='rua'?numeroDaBusca(x,i,d):'')).join('');
  };
  const html=colar
            +bloco('Meus clientes',g.clientes,'cli','users','')
            +bloco('Endereços',g.enderecos,'rua','map','rua')
            +bloco('Comércios perto de você',g.comercios,'loja','store','lime');
  if(html) return html;
  /* 🔴 "AINDA NÃO PERGUNTEI" NÃO É "NÃO ACHEI" (a lição do `start-process`).
     Enquanto o pedido está em voo a tela não pode dizer que não existe nada —
     ela diria isso no meio de toda palavra digitada. */
  if(!d.semNada) return `<div class="vazio"><span class="ico">${ic('search',24)}</span>
    <strong>Procurando…</strong><span>o mais perto de você vem primeiro</span></div>`;
  return `<div class="vazio"><span class="ico">${ic('search',24)}</span>
    <strong>Nada por aqui com esse nome.</strong>
    <span>Confira a grafia — ou cole o link do Maps<br>que a pessoa mandou.</span></div>`;
}

T.rapida={nome:'Adicionar parada',grupo:'Rota',render(){
  const d=DADOS.rapida;
  const a=d.achado;
  const procurando=!!d.buscando, salvando=!!d.salvando, ocupado=procurando||salvando;
  const noCadastro=d.porta!=='endereco';

  /* 🔴 AS DUAS PORTAS, NA MESMA TELA. "Montar rota" só cumpre o verbo se os
     pontos puderem ser ESCOLHIDOS; até aqui a única entrada era digitar
     endereço, um por um. A porta "Do cadastro" busca por NOME e marca vários;
     "Endereço" é a tela que já existia, intacta. Duas portas e não duas telas
     porque a pergunta é a mesma ("quem entra na rota?") e a resposta é que
     muda de fonte — tela nova faria o dedo escolher antes de saber. */
  const ativa=noCadastro?'cadastro':'endereco';
  /* "Meus clientes" e não "Do cadastro": a porta de dentro do Endereço já tem
     um botão chamado CADASTRO (Direção × Cadastro, que decide se o ponto vira
     cliente). Mesma palavra em dois sentidos na mesma tela é o defeito que a
     pessoa lê como bug. */
  /* 🔴 A 2ª PORTA DEIXOU DE SE CHAMAR "ENDEREÇO" (12/08). O campo dela agora
     acha CLIENTE, RUA e COMÉRCIO na mesma digitada — chamar isso de "Endereço"
     era a tela mentindo o que ela faz, e no mesmo lugar em que o placeholder
     diz "Cliente, rua ou comércio…". "Procurar" é o verbo, e o verbo é o que
     não envelhece quando a fonte muda. */
  const portas=`<div class="modos" style="margin-top:4px">${[['cadastro','Meus clientes'],['endereco','Procurar']].map(p=>`
    <button class="modo${ativa===p[0]?' on':''}" data-acao="rapida-porta" data-porta="${p[0]}"><b>${p[1]}</b></button>`).join('')}</div>`;

  /* A LISTA DA BASE. Marcar é um toque no cartão inteiro — alvo de dedo, não
     quadradinho de 18px. Quem JÁ está na rota de hoje aparece marcado e
     DESLIGADO: some a dúvida "já pus esse?" sem tirar a pessoa da lista. */
  const escolhidos=Array.isArray(d.escolhidos)?d.escolhidos:[];
  const buscaNome=`<label class="search" style="height:48px;margin-top:8px">${ic('search',18)}
    <input data-campo="rapida-cliente-busca" enterkeyhint="search" autocomplete="off"
      placeholder="Buscar cliente pelo nome" value="${d.buscaCliente}"></label>`;
  const linhaCliente=(c)=>{
    const on=escolhidos.indexOf(c.id)>=0;
    const marca=c.naRota?`<span class="pill mute">${ic('check',13)}na rota</span>`
      :on?`<span class="pill lime">${ic('check',13)}escolhido</span>`
      :`<span style="color:var(--ink-3)">${ic('plus',16)}</span>`;
    return `<button type="button" class="cli"${c.naRota?' disabled':` data-acao="rapida-marcar" data-cliente="${c.id}"`}>
      <span class="ava${on||c.naRota?' lime':''}">${c.ini}</span>
      <span><strong>${c.nome}</strong><span>${c.endereco}</span></span>
      <span class="rgt">${marca}</span></button>`;
  };
  const lista=d.clientes.length?`<div class="lista-card">${d.clientes.map(linhaCliente).join('')}</div>`
    :`<div class="vazio"><span class="ico">${ic('users',24)}</span>
      <strong>Nenhum cliente com esse nome</strong>
      <span>Se ele ainda não existe, use o Procurar: rua ou comércio.</span></div>`;
  const listaMiolo=mioloDe(d.listaCarregando,d.listaSemFonte,'users','rapida-recarregar',6,lista);

  /* 🔴 UM CAMPO SÓ — E AGORA ELE PROCURA SOZINHO (F2, 12/08). Era um campo
     CEGO: digitava tudo, apertava "Buscar endereço", e uma regex decidia em
     silêncio se caía no CNEFE ou no Nominatim público (1 req/s, fraco no
     interior, até 7 s de espera). Agora ele responde por TECLA, contra o nosso
     próprio banco (`GET /logistica/busca`): cliente com erro de digitação, rua
     do Censo e comércio da RFB, o mais perto de você primeiro.
     Zero Google, zero Nominatim neste caminho — autocomplete no Nominatim
     público viola o ToS dele, e o preço é ban.
     O link do Maps e a coordenada colada continuam vivos: eles não passam por
     aqui, passam pelo cartão que a ponte oferece quando reconhece o texto. */
  const busca=`<label class="search grande">${ic('search',18)}
    <input data-campo="rapida-busca" enterkeyhint="search" autocomplete="off"
      placeholder="Cliente, rua ou comércio…" value="${d.busca}"><span
      class="avb-x" data-acao="busca-limpar">×</span></label>
  <div class="avb-dica">O mais <b>perto de você</b> vem primeiro · erro de digitação não atrapalha</div>`;

  const aviso=d.aviso?`<div class="banner alerta">${ic('alert',16)}<span>${d.aviso}</span></div>`:'';

  /* 🔴 O PÉ SÓ EXISTE QUANDO TEM O QUE FAZER. Sem ninguém marcado, um botão
     verde ali seria toque mudo — a doença que esta tela persegue. Ele nasce no
     1º toque, contando quantos vão entrar: o número é o recibo da escolha. */
  const quantos=escolhidos.length;
  const peCadastro=quantos?`<div class="tmx-dock"><div class="acts" style="margin-top:0">
  <button class="act go wide${salvando?' ocupado':''}" style="justify-content:center"
    ${salvando?'disabled aria-busy="true"':'data-acao="rapida-adicionar-escolhidos"'}>
    ${ic('plus',19)}<b>${salvando?'Adicionando…':`Adicionar ${quantos} na rota`}</b></button>
</div></div>`:'';
  /* O PÉ DO PAINEL: o resumo do que foi escolhido (com o CEP que a parada vai
     NASCER carregando — a lei do CEP em pessoa) e um botão só, que diz o verbo
     inteiro. "Onde ela entra" virou a letra miúda do próprio botão: o encaixe
     por menor custo já é o padrão, e transformar isso em pergunta era pedir pra
     quem está na calçada decidir uma conta que o app faz melhor. */
  const pePainel=(!noCadastro&&d.pe)?`<div class="tmx-dock">
  <div class="avb-pe-resumo"><b>${d.pe.titulo}</b>${d.pe.dist?` · ${d.pe.dist} de você`:''}
    ${d.pe.cep?`<span class="pill lime">nasce com CEP ${d.pe.cep}</span>`:''}</div>
  <div class="acts" style="margin-top:0">
  <button class="act go wide${salvando?' ocupado':''}" style="justify-content:center"
    ${salvando?'disabled aria-busy="true"':'data-acao="rapida-confirmar"'}>
    ${ic('plus',19)}<b>${salvando?'Adicionando…':'Adicionar à rota'}</b>
    ${salvando?'':'<small>· encaixa na melhor posição sozinho</small>'}</button>
</div></div>`:'';
  const pe=noCadastro?peCadastro:pePainel;

  return `${status}
${hdr({voltar:d.volta||'montagem'})}
<div class="body${pe?' com-dock-1':''}">
  ${portas}
  ${noCadastro?`${buscaNome}
  ${aviso}
  ${listaMiolo}`:`${busca}
  ${aviso}
  <div class="avb-rolo" data-rolo="busca">${roloDaBuscaAvulsa(d)}</div>`}
</div>
${pe}
${nav('rota')}`;}};

/* 20b — VÍNCULO CLIENTE × PRODUTO -----------------------------------------
   🔴 A DIFERENÇA QUE ESTA TELA EXISTE PRA GUARDAR (12/08, ordem do dono:
   *"editar Galão 20 Litros → preço global é diferente de editar Cidinha →
   Galão 20 Litros → quantidade/preço/configuração dela"*).

   `T.fichaproduto` mexe no CATÁLOGO (`/logistica/produtos/:id`) — o preço de
   todo mundo. Esta mexe no VÍNCULO (`/logistica/cliente-produtos/:id`): quanto
   ESTE cliente leva por entrega, o preço combinado só com ele, em qual porta e
   se o vínculo está ativo. Confundir as duas é mudar o preço da empresa inteira
   achando que se acertou o de uma pessoa.

   Sem `<select>` de propósito: esta casca não tem um, e select nativo no WebView
   é outro app dentro do app. "Escolher um de N" aqui é o que já é em toda a
   casca — uma LISTA que se toca. */
T.fichavinculo={nome:'Produto do cliente',grupo:'Cadastro',render(){
  const f=DADOS.fichavinculo;
  const temProduto=!!String(f.produto||'').trim();
  /* O catálogo só aparece enquanto não há produto escolhido. Editando, o produto
     NÃO troca (o servidor não aceita trocar o productId de um vínculo — é outro
     vínculo): mostrar a lista ali seria oferecer o que não vai acontecer. */
  const escolha=(!temProduto&&(f.catalogo||[]).length)?`
    <div class="grupo" style="margin-top:2px">Qual produto</div>
    <div class="lista-card">${f.catalogo.map(p=>`<button type="button" class="cli" data-acao="escolher-produto-vinculo" data-produto="${p[0]}">
      <span class="ava">${ic(p[2]||'box',16)}</span>
      <span><strong>${p[1]}</strong>${p[3]?`<span>${p[3]}</span>`:''}</span>
      <span class="rgt"><span class="go">${ic('chev',15)}</span></span></button>`).join('')}</div>`:'';
  /* O preço por cliente só aparece quando a empresa liga a chave — OU quando
     este vínculo JÁ tem um preço combinado (senão a tela esconderia um número
     que está valendo, e o dono nunca saberia por que a entrega sai por 22). */
  const preco=(f.precoPorCliente||String(f.preco||'').trim())?`<label class="campo"><label>Preço só pra este cliente</label>
      <input inputmode="decimal" placeholder="R$ 0,00" value="${f.preco}" data-campo="vinculo-preco">
      ${f.precoDica?`<span class="dica" style="color:var(--ink-2)">${f.precoDica}</span>`:''}</label>`:'';
  /* A porta só é pergunta pra quem tem mais de uma: com um endereço só, a
     resposta é óbvia e a fileira seria enfeite. */
  const porta=(f.locais||[]).length>1?`
    <div class="grupo">Onde entrega</div>
    <div class="lista-card">${f.locais.map(l=>`<button type="button" class="cli" data-acao="local-vinculo" data-local="${l[0]}">
      <span class="ava${String(f.localId||'')===String(l[0])?' lime':''}">${ic('map',16)}</span>
      <span><strong>${l[1]}</strong>${l[2]?`<span>${l[2]}</span>`:''}</span>
      <span class="rgt">${String(f.localId||'')===String(l[0])?`<span style="color:var(--lime)">${ic('check',15)}</span>`:`<span class="go">${ic('chev',15)}</span>`}</span></button>`).join('')}</div>`:'';
  return `${status}
${hdr({voltar:f.volta||'ficha',semChat:1})}
<div class="body">
  <div class="stop-top" style="margin:2px 0 10px;grid-template-columns:auto 1fr auto">
    <span class="thumb" style="width:52px;height:52px;flex:0 0 52px">${ic(f.ico||'box',26)}</span>
    <span><strong style="font-size:16px">${temProduto?f.produto:'Novo produto / entrega'}</strong>
      ${f.cliente?`<span style="font-size:11px;color:var(--ink-2)">${f.cliente}</span>`:''}</span>
    ${!temProduto?'':`<span class="tag${f.ativo?' lime':''}">${f.ativo?'ativo':'pausado'}</span>`}
  </div>
  ${escolha}
  ${!temProduto?'':`
  <div class="campos">
    <label class="campo"><label>Quantidade por entrega</label>
      <input inputmode="numeric" placeholder="1" value="${f.qtd}" data-campo="vinculo-qtd"></label>
    ${preco}
  </div>
  ${porta}
  ${/* PAUSAR não é excluir, e a tela diz isso com duas peças diferentes: a chave
       PAUSA (o vínculo fica, some das próximas rotas) e o botão vermelho REMOVE
       (o vínculo morre; entregas já geradas continuam intactas). É a mesma
       distinção que o servidor faz entre PATCH ativo=false e DELETE. */''}
  <div class="cartao-lista" style="margin-top:9px">
    <button class="linha-cfg" data-acao="chave-vinculo-ativo"><span class="ico">${ic('route',16)}</span>
      <span><strong>Entra nas próximas rotas</strong><span>desligado, o produto para de ser gerado</span></span>
      <span class="chave ${f.ativo?'on':''}"><i></i></span></button>
  </div>
  <div class="acts" style="margin-top:12px">
    ${f.salvando
      ?`<button class="act go wide ocupado" style="justify-content:center" disabled aria-busy="true">${ic('check',19)}<b>Salvando…</b></button>`
      :`<button class="act go wide" style="justify-content:center" data-acao="salvar-vinculo">${ic('check',19)}<b>Salvar</b></button>`}
    ${f.podeRemover?`<button class="act perigo" style="justify-content:center" data-acao="remover-vinculo">${ic('trash',17)}<b>Remover</b></button>`:''}
  </div>`}
</div>
${nav('ajustes')}`;}};

/* 21 — FICHA DO PRODUTO ---------------------------------------------------- */
T.fichaproduto={nome:'Ficha do produto',grupo:'Cadastro',render(){const f=DADOS.fichaproduto;return `${status}
${hdr({voltar:'produtos',semChat:1})}
<div class="body">
  <div class="stop-top" style="margin:2px 0 10px;grid-template-columns:auto 1fr auto">
    <span class="thumb" style="width:52px;height:52px;flex:0 0 52px">${ic('gallon',26)}</span>
    <span><strong style="font-size:16px">${f.nome}</strong>
      ${f.resumo?`<span style="font-size:11px;color:var(--ink-2)">${f.resumo}</span>`:''}</span>
    ${f.selo?`<span class="tag lime">${f.selo}</span>`:''}
  </div>
  <div class="campos">
    <label class="campo"><label>Nome</label><input value="${f.nome}" data-campo="produto-nome"></label>
    <div class="dupla">
      <label class="campo"><label>Unidade</label><input value="${f.unidade}" placeholder="galão, caixa, unidade" data-campo="produto-unidade"></label>
      <label class="campo"><label>Preço do catálogo</label><input value="${f.preco}" data-campo="produto-preco"></label>
    </div>
    <!-- ESTOQUE só aparece quando existe: o catálogo do celular não devolve
         essa coluna, e campo de número vazio numa tela de cadastro convida o
         usuário a digitar algo que não tem onde ser gravado. -->
    ${f.estoque?`<label class="campo"><label>Estoque</label><input value="${f.estoque}" data-campo="produto-estoque" readonly>
      <span class="dica">${f.estoqueDica}</span></label>`:''}
  </div>
  <!-- 🔴 "ARQUIVAR" SAIU (08/08, ordem do dono). Era o mesmo defeito do Excluir
       da ficha do cliente — data-superficie="confirmar" abria a confirmação
       decorativa da maquete, e numa ficha de PRODUTO o motorista lia "Retirar
       da rota de hoje? Mercado Estrela · volta na próxima quarta". E aqui não
       havia nem porta pra ligar: o backend só tem POST/PATCH de
       /logistica/produtos — arquivar/excluir produto não existe em endpoint
       nenhum, nem na allowlist do APK. Produto sai do catálogo pelo PC. -->
  <div class="acts" style="margin-top:12px">
    <button class="act go wide" style="justify-content:center" data-acao="salvar-produto">${ic('check',19)}<b>Salvar</b></button>
  </div>
</div>
${nav('ajustes')}`;}};

/* 22 — MODO PASSEIO -------------------------------------------------------- */
T.passeio={nome:'Modo Passeio',grupo:'Sistema',render(){return `${status}
${hdr({voltar:'ajustes'})}
<div class="body com-dock">
  <label class="search" style="height:46px;margin-top:2px">${ic('search',17)}<input placeholder="Buscar lugar ou endereço"></label>
  <div class="grupo">Suas paradas</div>
  <div class="stops">
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num lime">1</span><span class="hh lime">agora</span></span>
      <span class="who"><strong>Padaria do Bairro</strong><span>R. 5, 210 · 1,2 km</span></span>
      <span class="side"><span class="pill lime">${ic('check',14)}Cheguei</span></span></div>
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num">2</span><span class="hh">+15 min</span></span>
      <span class="who"><strong>Farmácia Popular</strong><span>Av. 1, 890 · 2,8 km</span></span>
      <span class="side"><span class="pill mute">Aguardando</span></span></div>
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num off">3</span><span class="hh off">+30 min</span></span>
      <span class="who"><strong>Casa da Vó</strong><span>R. 12, 45 · 5,1 km</span></span>
      <span class="side"><span class="pill mute">Aguardando</span></span></div>
  </div>
  <div class="grupo">Quanto tempo em cada parada</div>
  <div class="tempo">
    <button><b>5</b><small>min</small></button><button class="on"><b>15</b><small>min</small></button>
    <button><b>30</b><small>min</small></button><button><b>1h</b><small></small></button>
  </div>
</div>
<div class="tmx-dock">
  <div class="acts" style="margin-top:0">
    <button class="act" style="justify-content:center">${ic('plus',17)}<b>+15 min</b></button>
    <button class="act go wide" style="justify-content:center" data-ir="mapa">${ic('nav',19)}<b>Navegar</b></button>
    <button class="act perigo" style="justify-content:center">${ic('stop',17)}<b>Encerrar</b></button>
  </div>
</div>
${nav('rota')}`;}};

/* 18 — PORTÕES (catálogo navegável) --------------------------------------- */
T.portoes={nome:'Portões e bloqueios',grupo:'Sistema',render(){
  const p=(chave,nome,quando,tom)=>`
    <div class="rowcard">
      <span class="ico ${tom==='trava'?'':'lime'}" style="${tom==='trava'?'background:var(--danger-ico-bg);color:var(--danger-ico)':''}">
        ${ic(tom==='trava'?'lock':'alert',18)}</span>
      <span><strong>${nome}</strong><span>${quando}</span></span>
      <button class="ghost" data-portao="${chave}">ver</button></div>`;
  return `${status}
${hdr({})}
<div class="body">
  <div class="grupo" style="margin-top:2px">Antes de montar / iniciar</div>
  ${p('enderecos','Endereços com erro','trava o montar rota — a saída é corrigir ou retirar','alerta')}
  ${p('longe','Longe do ponto de partida','8,7 km da primeira parada','alerta')}
  ${p('creditos','Créditos acabaram','sem crédito a rota não inicia','trava')}
  <div class="grupo">No meio do dia</div>
  ${p('fora','Entrega fora da rota de hoje','vira parada avulsa','alerta')}
  ${p('ddd','Telefone sem DDD','sem DDD o WhatsApp não abre','alerta')}
  ${p('preco','Preço bloqueado','quem muda preço é o escritório','alerta')}
  <div class="grupo">Aplicativo</div>
  ${p('update','Versão nova disponível','tem "Agora não"','alerta')}
  ${p('updateObrig','Atualização obrigatória','não fecha — o app não fala mais com o servidor','trava')}
</div>
${nav('rota')}`;}};

/* 15 — FICHA DO CLIENTE ---------------------------------------------------
   No app hoje é um cartão central; aqui virou TELA, porque o conteúdo não cabe
   num cartão: são 3 blocos (quem é, onde é, o que leva) mais os produtos com
   preço próprio. Pendência aparece NO CAMPO que a resolve, nunca num aviso
   solto no topo — a regra que o dono cobrou ~10 vezes no app. */
T.ficha={nome:'Ficha do cliente',grupo:'Cadastro',render(){
  const f=DADOS.ficha;
  const ROT=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const dia=(l,n,on,i)=>`<button class="${on?'on':''}" data-acao="dia-cliente" data-dia="${i}"><b>${l}</b><small>${n}</small></button>`;
  return `${status}
${hdr({voltar:f.volta||'clientes',semChat:1})}
<div class="body">
  <div class="stop-top" style="margin:2px 0 10px;grid-template-columns:auto 1fr auto">
    <span class="ava lime">${f.ini}</span>
    <span><strong style="font-size:16px">${f.nome}</strong>
      ${f.resumo?`<span style="font-size:11px;color:var(--ink-2)">${f.resumo}</span>`:''}</span>
    ${f.alerta?`<span class="tag" style="border-color:rgba(245,165,36,.55);color:var(--amber)">${f.alerta}</span>`:''}
  </div>

  <div class="grupo">Quem é</div>
  <div class="campos">
    <label class="campo"><label>Nome</label><input value="${f.nome}" data-campo="nome"></label>
    <div class="dupla">
      <label class="campo"><label>Telefone / WhatsApp</label><input value="${f.telefone}" data-campo="telefone"></label>
      <!-- CPF edita e salva (porta aberta em 07/08 no UpdateContaDto), e NUNCA
           é obrigatório: ficha sem CPF salva igual. -->
      <label class="campo"><label>CPF</label><input placeholder="000.000.000-00" value="${f.cpf}" data-campo="cpf"></label>
    </div>
  </div>

  <!-- 🔴 O CEP MANDA EM TUDO (10/08): CEP e Número numa linha, Rua e Bairro
       embaixo; digitou o CEP completo, a ponte preenche o resto sozinha. O
       botão GPS é a ordem literal do dono ("injetar o GPS que pega o endereço
       que a pessoa está — não estou vendo!"): parado na porta, CEP/rua/bairro
       entram do Censo, e o pino fica onde o dedo tocou. -->
  <div class="grupo">Onde é</div>
  <div class="campos">
    <div class="dupla">
      <label class="campo"><label>CEP</label><input inputmode="numeric" placeholder="00000-000" value="${f.cep}" data-campo="cep"></label>
      <label class="campo${f.numeroPendente?' erro':''}"><label>Número ${f.numeroPendente?'<span class="pend">· pendente</span>':''}</label><input placeholder="nº ou SN" value="${f.numero}" data-campo="numero"></label>
    </div>
    <div class="dupla">
      <label class="campo"><label>Rua</label><input value="${f.rua}" data-campo="rua"></label>
      <label class="campo"><label>Bairro</label><input value="${f.bairro}" data-campo="bairro"></label>
    </div>
    <label class="campo"><label>Observações da porta</label>
      <textarea data-campo="observacoes">${f.observacoes}</textarea></label>
  </div>
  <button class="act full" style="margin-top:7px;justify-content:center" data-acao="usar-local-ficha">
    ${ic('gps',17)}<b>GPS — usar onde estou</b></button>
  ${f.local?`<div class="banner ${f.localOk?'pausa':'alerta'}" style="margin-top:7px">${ic(f.localOk?'check':'alert',15)}
    <span>${f.local}</span></div>`:''}

  <div class="grupo">Dias de entrega</div>
  <div class="dias">
    ${ROT.map((r,i)=>dia(r,'',f.dias[i],i+1)).join('')}
  </div>

  ${/* 🔴 A SETA PROMETIA UMA PORTA QUE NÃO EXISTIA (12/08, dono: "atualmente
       aparecem, mas não são editáveis"). A linha do produto tinha o chevron —
       o símbolo universal de "abre" — e nenhum `data-acao`; o "Novo produto /
       entrega" era um botão sem verbo nenhum. É a Lei de 08/08 outra vez:
       botão desenhado sem `data-acao` é pior que botão ausente.
       O que abre é o VÍNCULO (este cliente x este produto: quantidade, preço
       acordado, porta, ativo) — NUNCA a ficha do produto do catálogo, que é
       outra tela (`fichaproduto`) e mexe no preço de TODO mundo.
       O gancho nasce do DADO, igual ao `stop()`: sem id de vínculo a linha
       continua inerte e o mock sai byte a byte igual. */''}
  <div class="grupo">O que leva</div>
  <div class="cartao-lista" style="padding:0 11px">
    ${f.produtos.map(p=>`<div class="item-linha"${p[3]?` data-acao="abrir-vinculo" data-vinculo="${p[3]}"`:''}><span class="ava" style="width:32px;height:32px">${ic(p[0],16)}</span>
      <span><strong>${p[1]}</strong><span>${p[2]}</span></span>
      <span style="color:var(--ink-3)">${ic('chev',15)}</span></div>`).join('')}
  </div>
  <button class="act full" style="margin-top:7px;justify-content:center" data-acao="novo-vinculo">${ic('plus',17)}<b>Novo produto / entrega</b></button>

  ${/* 🔴 O FINANCEIRO DO CLIENTE VOLTOU PRA FICHA (12/08, ordem do dono: "o
       módulo Financeiro está ATIVO nos Ajustes; quando essa opção estiver ativa,
       quero que TODO o financeiro existente do cliente volte para a ficha").
       Ele existe INTEIRO no servidor (`GET /nucleo/clientes/:id` devolve os
       campos, `PATCH /logistica/clientes/:id/financeiro` grava) e existia inteiro
       no app que roda em produção (a seção 3 do editor de cliente, `paymentFields`).
       O que morreu na fusão foi a SEÇÃO — e sem ela ligar a chave nos Ajustes não
       fazia nada aparecer aqui.
       Seção inteira some com o módulo desligado: sem financeiro, dinheiro não
       aparece em lugar nenhum do app (a mesma regra da folha de chegada).
       O SALDO é de todo mundo (o motorista precisa saber quanto o cliente deve
       antes de bater na porta); a EDIÇÃO é do dono — o PATCH é ADMIN-only no
       servidor, e desenhar campo que volta 403 é o botão morto que esta ficha já
       matou uma vez no Excluir. */''}
  ${f.financeiro?`
  <div class="grupo">Financeiro</div>
  ${f.saldo?`<div class="box"><div class="rowline" style="padding-top:2px"><span>Em aberto</span>
    <b style="color:var(--amber)">${f.saldo}</b></div>
    ${f.limiteLido?`<div class="rowline"><span>Limite de fiado</span><b>${f.limiteLido}</b></div>`:''}</div>`:''}
  ${!f.financeiroEdita?'':`
  ${(f.formas||[]).length?`<div class="modos${(f.formas||[]).length>3?' fino':''}">
    ${f.formas.map(m=>`<button class="modo${f.forma===m[0]?' on':''}" data-acao="forma-cliente" data-forma="${m[0]}"><b>${m[1]}</b></button>`).join('')}</div>`:''}
  <div class="campos" style="margin-top:8px">
    ${f.forma==='na_hora'?`<label class="campo"><label>Recebe por</label>
      <div class="modos" style="margin-top:0">
        <button class="modo${f.metodo==='pix'?' on':''}" data-acao="metodo-cliente" data-metodo="pix"><b>Pix</b></button>
        <button class="modo${f.metodo==='dinheiro'?' on':''}" data-acao="metodo-cliente" data-metodo="dinheiro"><b>Dinheiro</b></button>
      </div></label>`:''}
    ${f.forma==='mensal'
      ?`<div class="dupla">
        <label class="campo"><label>Dia de pagamento</label><input inputmode="numeric" placeholder="1 a 31" value="${f.diaFechamento}" data-campo="dia-fechamento"></label>
        <label class="campo"><label>Limite de fiado</label><input inputmode="decimal" placeholder="sem limite" value="${f.limite}" data-campo="limite-fiado"></label>
      </div>`
      :`<label class="campo"><label>Limite de fiado</label><input inputmode="decimal" placeholder="sem limite" value="${f.limite}" data-campo="limite-fiado"></label>`}
  </div>
  <div class="cartao-lista" style="margin-top:7px">
    <button class="linha-cfg" data-acao="chave-contabilizar"><span class="ico">${ic('wallet',16)}</span>
      <span><strong>Contabilizar</strong><span>entra no financeiro da empresa</span></span>
      <span class="chave ${f.contabilizar?'on':''}"><i></i></span></button>
    <button class="linha-cfg" data-acao="chave-avisar-cobranca"><span class="ico">${ic('chat',16)}</span>
      <span><strong>Avisar cobrança</strong><span>mensagem quando fica em aberto</span></span>
      <span class="chave ${f.avisarCobranca?'on':''}"><i></i></span></button>
  </div>`}`:''}

  <!-- 🔴 O EXCLUIR PROMETIA E NÃO CUMPRIA (medido no aparelho em 08/08): ele era
       data-superficie="confirmar", a confirmação DECORATIVA da maquete — na
       ficha de um cliente real o diálogo dizia "Retirar da rota de hoje?
       Mercado Estrela · volta na próxima quarta" (nome de OUTRO cliente, verbo
       de OUTRA ação) e nada era excluído. Agora é data-acao própria: a ponte
       pergunta com o nome de QUEM está aberto e chama a porta de verdade.
       O botão só nasce pra admin — ver o porquê no DADOS.ficha. Com um botão
       só o .acts (flex) dá a linha inteira ao Salvar, sem buraco.
       ⚠️ Comentário DENTRO de template literal: nada de acento grave aqui, ele
       FECHA a string (custou uma tela preta na primeira injeção deste item). -->
  <div class="acts" style="margin-top:12px">
    <button class="act go wide" style="justify-content:center" data-acao="salvar-cliente">${ic('check',19)}<b>Salvar</b></button>
    ${f.admin?`<button class="act perigo" style="justify-content:center"
      data-acao="excluir-cliente">${ic('trash',17)}<b>Excluir</b></button>`:''}
  </div>
</div>
${nav('ajustes')}`;}};

/* 16 — FOLHA DE CHEGADA COMPLETA -----------------------------------------
   A do mock era a SIMPLES (cobrança direta). Esta é a completa: quantidade
   conferida item a item, motivo quando não entrega e comprovante por foto. */
function folhaCompleta(naoEntregue){
  const d=DADOS.folha;
  return `${status}
${hdr({semChat:1})}
<div class="body flush" style="overflow:hidden">
  ${mapa()}<div class="scrim"></div>
  <div class="sheet">
    <span class="handle"></span>
    <div class="sheet-head">
      <div><h2>${naoEntregue?'Não entregue':'Chegada'}</h2>
        ${naoEntregue?'':`<p>${d.cabecalho}</p>`}</div>
      <button class="round sm" data-voltar="1" data-ir="rota">${ic('close',16)}</button></div>

    ${naoEntregue?`
      <div class="box">
        <div class="box-t">Motivo</div>
        <div class="motivos">
          ${d.motivos.map(m=>`<button class="motivo${m===d.motivo?' on':''}" data-acao="motivo" data-motivo="${m}"><span class="bola"></span>${m}</button>`).join('')}
        </div>
      </div>
      <div class="foot2">
        <button class="act go" style="justify-content:center" data-acao="registrar-nao-entregue">${ic('check',19)}<b>Registrar</b></button>
        <button class="act" style="justify-content:center" data-ir="folha">${ic('back',17)}<b>Voltar</b></button>
      </div>`
    :`
      <div class="box" style="display:flex;align-items:center;gap:10px">
        <span class="num ${d.cor}" style="width:36px;height:36px">${d.n}</span>
        <span style="flex:1"><span class="box-t">${d.nome}</span>
          <span class="box-s">${d.endereco}</span></span>
        <span class="pill lime">${ic('check',14)}${d.pill}</span>
      </div>
      ${d.nota?`<div class="banner alerta" style="margin-top:8px">${ic('alert',15)}
        <span>${d.nota}</span></div>`:''}

      <div class="box">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="box-t">Conferir o que saiu</span>
          <button class="ghost">${ic('plus',13)} Produto</button></div>
        ${d.itens.map(it=>`<div class="item-linha"><span class="thumb" style="width:40px;height:40px;flex:0 0 40px">${ic(it[0],20)}</span>
          <span><strong>${it[1]}</strong><span>${it[2]}</span></span>
          <span class="passo"><button>−</button><b>${it[3]}</b><button>+</button></span></div>`).join('')}
      </div>

      <div class="box">
        <div class="rowline"><span>Anterior</span><b style="color:var(--amber)">${d.anterior}</b></div>
        <div class="rowline"><span>Venda de hoje</span><b>${d.hoje}</b></div>
        <div class="rowline"><span style="font-size:16px;color:var(--ink)">Total</span>
          <b style="font-size:19px">${d.total}</b></div>
      </div>

      <div class="box">
        <div class="box-t">Como pagou</div>
        <div class="pays">
          <button class="pay${d.forma==='dinheiro'?' sel':''}" data-acao="forma" data-forma="dinheiro"><span style="color:var(--lime)">${ic('cash',21)}</span><b>Dinheiro</b>${d.forma==='dinheiro'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
          <button class="pay blue${d.forma==='pix'?' sel':''}" data-acao="forma" data-forma="pix"><span style="color:var(--blue-l)">${ic('pix',21)}</span><b>Pix</b>${d.forma==='pix'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
          <button class="pay${d.forma==='cartao'?' sel':''}" data-acao="forma" data-forma="cartao"><span style="color:var(--ink-2)">${ic('card',21)}</span><b>Cartão</b>${d.forma==='cartao'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
          <button class="pay${d.forma==='fiado'?' sel':''}" data-acao="forma" data-forma="fiado"><span style="color:var(--amber)">${ic('note',21)}</span><b>Marcar</b>${d.forma==='fiado'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        </div>
      </div>

      <div class="foot2">
        <button class="act go" style="justify-content:center" data-acao="entregue-pagou">${ic('check',19)}<b>Entregue e pagou</b></button>
        <button class="act" style="justify-content:center" data-acao="entregue-marcou">${ic('note',17)}<b>Entregue, marcou</b></button>
      </div>
      <button class="act full perigo" style="margin-top:7px;justify-content:center"
        data-ir="folhanao">${ic('close',17)}<b>Não entregue</b></button>`}
  </div>
</div>
${nav('rota')}`;
}
T.folha={nome:'Chegada — folha completa',grupo:'Rota',render:()=>folhaCompleta(false)};
T.folhanao={nome:'Chegada — não entregue',grupo:'Rota',render:()=>folhaCompleta(true)};

/* 17 — GERENCIADOR DE ROTA ------------------------------------------------
   Onde o dia vira rota: escolhe os dias, vê quem ENTRA e quem SAI antes de
   montar, e pode partir de uma rota salva. A conferência é a tela seguinte. */
T.gerenciador={nome:'Gerenciador de rota',grupo:'Rota',render(){
  const dia=(l,n,on,vazio)=>`<button class="${on?'on':''}" ${vazio?'style="opacity:.42"':''}><b>${l}</b><small>${n}</small></button>`;
  return `${status}
${hdr({voltar:'rota'})}
<div class="body com-dock">
  <div class="grupo">Dias que entram na rota</div>
  <div class="dias">
    ${dia('SEG','12',0)}${dia('TER','9',0)}${dia('QUA','14',1)}${dia('QUI','7',0)}
    ${dia('SEX','11',0)}${dia('SÁB','5',0)}${dia('DOM','0',0,1)}
  </div>

  <div class="bar" style="margin-top:9px">
    <span class="t">${ic('save',16)} Partir de uma rota salva</span>
    <button class="ghost" data-ir="salvas">Escolher</button>
  </div>

  <div class="grupo">O que muda no dia <span style="color:var(--lime)">+3</span> <span style="color:var(--red)">−1</span></div>
  <div class="previa entra"><span class="marca">${ic('plus',13)}</span>
    <span><strong>Quitanda do Bairro</strong><span>R. das Orquídeas, 55 · quarta</span></span>
    <span class="tag blue">20L x2</span></div>
  <div class="previa entra"><span class="marca">${ic('plus',13)}</span>
    <span><strong>Depósito Central</strong><span>R. Dr. Jesuíno Maciel, 980 · quarta</span></span>
    <span class="tag blue">20L x6</span></div>
  <div class="previa entra"><span class="marca">${ic('plus',13)}</span>
    <span><strong>Lanchonete da Praça</strong><span>Av. Adolfo Pinheiro, 310 · quarta</span></span>
    <span class="tag blue">20L x2</span></div>
  <div class="previa sai"><span class="marca">${ic('close',13)}</span>
    <span><strong>Larissa Ypê</strong><span>saiu: mudou para quinta</span></span>
    <span class="tag">removido</span></div>

  <div class="grupo">Já no dia</div>
  <div class="stops" data-gestos="rota">${listaParadas(false)}</div>
</div>
<div class="tmx-dock">
  <div class="sum" style="margin:0 0 8px">
    <span class="c"><span style="color:var(--lime)">${ic('route',16)}</span><span><b>14</b><small>paradas</small></span></span>
    <span class="c"><span style="color:var(--blue-l)">${ic('box',16)}</span><span><b>38</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--amber)">${ic('alert',16)}</span><span><b>3</b><small>com aviso</small></span></span>
  </div>
  <div class="acts" style="margin-top:0">
    <button class="act go wide" style="justify-content:center" data-ir="conferencia">${ic('check',19)}<b>Conferir e montar</b></button>
    <button class="act" style="justify-content:center">${ic('save',17)}<b>Salvar rota</b></button>
  </div>
</div>
${nav('rota')}`;}};

/* 12 — CHAT COM A CENTRAL (aba nova) -------------------------------------- */
/* 🔴 O ANEXO DA MENSAGEM (12/08) — o recado que CARREGA trabalho.
   `a` = {id, tipo:'parada'|'rota', nome, detalhe, estado, encaixar}.

   `encaixar` chega PRONTO do seam e não é decidido aqui de propósito: quem sabe
   se existe rota ativa é a ponte (`rotaMontada()`), e a tela que tentasse
   adivinhar isso pelo que tem à mão ofereceria "Encaixar na rota" pra quem não
   tem rota — o botão que não pode existir. Dado viaja como ARGUMENTO.

   Sem rota ativa sobram Analisar/Negar: são os dois verbos que não dependem de
   ter para onde encaixar. */
function anexoDoRecado(a){
  if(!a) return '';
  const fim=a.estado==='encaixada'?'encaixada':a.estado==='negada'?'negada':'';
  const ico=a.tipo==='rota'?'route':'map';
  /* Referência que sumiu do cadastro (cliente excluído depois do envio) fala em
     vez de virar card mudo — e sem nome não há o que encaixar: só Negar sobra. */
  const nome=a.nome||'Não está mais no cadastro';
  const podeEncaixar=!!a.encaixar&&!!a.nome;
  const pe=fim
    ?`<div class="selo">${fim==='encaixada'?ic('check',13)+' Encaixada na rota':ic('close',13)+' Negada'}</div>`
    :`<div class="acoes">
      ${podeEncaixar?`<button class="principal" data-acao="anexo-encaixar" data-anexo="${a.id}">Encaixar na rota</button>`:''}
      ${a.nome?`<button data-acao="anexo-analisar" data-anexo="${a.id}">Analisar</button>`:''}
      <button data-acao="anexo-negar" data-anexo="${a.id}">Negar</button></div>`;
  return `<div class="anexo${fim?' '+fim:''}">
    <div class="alvo"><span class="ico">${ic(ico,15)}</span>
      <span><strong>${nome}</strong><span>${a.detalhe||''}</span></span></div>
    ${pe}</div>`;
}
T.chat={nome:'Chat com a Central',grupo:'Rota',render(){const d=DADOS.chat;return `${status}
${hdr({})}
<div class="body chat-corpo">
  ${d.recado?`<div class="recado">
    <div class="topo">
      <span class="ico">${ic('bell',17)}</span>
      <span><strong>${d.recadoTitulo}</strong><span>${d.recado}</span></span>
    </div>
    <div class="acoes"><button data-acao="responder-recado">Responder</button><button class="principal" data-acao="entendi-recado">Entendi</button></div>
  </div>`:''}
  <div class="conversa">
    ${miolo(d,'chat','recarregar-chat',4, d.conversa.length
      ? d.conversa.map(m=>`<div class="msg ${m[0]}${m[3]?' tem-anexo':''}">${m[1]}${anexoDoRecado(m[3])}<small>${m[2]}</small></div>`).join('')
      : (d.vazio?`<div class="vazio"><span>${ic('chat',26)}</span><b>${d.vazio}</b></div>`:''))}
  </div>
  <label class="escrever">${ic('chat',16)}<input placeholder="Escrever para a Central" data-campo="recado-texto">
    <button class="enviar" data-acao="enviar-recado">${ic('nav',15)}</button></label>
</div>
${nav('chat')}`;}};

/* 13 — AJUSTES (aba nova) -------------------------------------------------- */
T.ajustes={nome:'Ajustes',grupo:'Cadastro',render(){const a=DADOS.ajustes;
  const linha=(icone,titulo,sub,dir,acao)=>`<button class="linha-cfg"${acao?` data-acao="${acao}"`:''}><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span style="display:flex;align-items:center;gap:7px">${dir||''}<span style="color:var(--ink-3)">${ic('chev',15)}</span></span></button>`;
  const chave=(icone,titulo,sub,on,acao)=>`<button class="linha-cfg"${acao?` data-acao="${acao}"`:''}><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span class="chave ${on?'on':''}"><i></i></span></button>`;
  /* Linha que ABRE um módulo (barra de 3, 07/08): Clientes/Produtos/Fechamento
     agora entram por aqui. `data-ir` de propósito — é a mesma marca que o
     `podarDesligados` varre quando o admin desliga o módulo no desktop. */
  const linhaIr=(icone,titulo,ir)=>`<button class="linha-cfg" data-ir="${ir}"><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong></span>
    <span style="color:var(--ink-3)">${ic('chev',15)}</span></button>`;
  /* 🔴 CHAVE COM VALOR DESCONHECIDO NÃO ENTRA NA TELA. Aqui a mentira é pior
     que numa lista: o motorista lê uma chave LIGADA (que é só o exemplo do
     desenho), toca pra desligar e acha que desligou — quando na verdade nem
     havia configuração carregada. Nem ligada nem desligada é o estado honesto
     de uma chave que ainda não chegou; então nenhuma delas aparece até chegar.
     Antes disso a tela mostrava também "Baixando o mapa · 62%", que é um
     recurso CORTADO em 06/08 e não existe mais. */
  return `${status}
${hdr({semChat:1})}
<div class="body">
  ${miolo(a,'gear','recarregar-ajustes',6,`
  ${a.admin?`<div class="grupo">Administração</div>
  <div class="cartao-lista">
    ${/* 🔴 DUAS LINHAS VIRARAM UMA (09/08). "Consumo e bônus" e "Recarga de
          créditos" abriam duas telas que mostravam o MESMO saldo, e quem queria
          comprar crédito tinha que adivinhar qual das duas portas vendia. Uma
          linha só, com o saldo na própria linha: o número que interessa já se lê
          daqui, e o toque leva pra onde se recarrega. */''}
    ${a.painelCreditos===''?'':chave('calendar','Painel de créditos do dia','',a.painelCreditos,'painel-creditos')}
    ${linha('card','Créditos',a.creditosLinha,'','ir-creditos')}
    ${linha('wallet','Financeiro','','','ir-financeiro')}
    ${linha('gear','Avançado','','','ir-avancado')}
  </div>`:''}
  <div class="grupo">Rota</div>
  <div class="cartao-lista">
    ${linhaIr('save','Rotas salvas','salvas')}
  </div>
  <div class="grupo">Cadastro</div>
  <div class="cartao-lista">
    ${linhaIr('users','Clientes','clientes')}
    ${linhaIr('box','Produtos','produtos')}
  </div>
  <div class="grupo">Fechamento</div>
  <div class="cartao-lista">
    ${linhaIr('note','Fechamento do dia','fechamento')}
  </div>
  ${/* 🔴 O CATÁLOGO NASCE DO MOTOR, NUNCA DE UMA LISTA ESCRITA À MÃO AQUI. Se
        a régua de "este capítulo existe pra esta empresa" morasse na tela, ela
        seria a SEGUNDA cópia da regra — e a tela e o tour discordariam no
        primeiro ajuste (linha no catálogo abrindo um capítulo sem passo, que é
        botão morto com nome bonito). Um lugar só: `capitulosDoCatalogo()`.
        O ✓ é do APARELHO (o que este celular já viu), como a lâmpada — por
        isso ele é conveniência de leitura, e não a garantia do obrigatório,
        que é do usuário e mora no servidor. */''}
  ${(()=>{const cs=capitulosDoCatalogo();return cs.length?`<div class="grupo">Aprenda a usar</div>
  <div class="cartao-lista">
    ${cs.map(([id,c])=>linha(c.ico||'bulb',c.titulo,'',
        tutorFeito(id)?`<span style="color:var(--lime)">${ic('check',15)}</span>`:'','tutor-'+id)).join('')}
  </div>`:'';})()}
  <div class="grupo">Som e tela</div>
  <div class="cartao-lista">
    ${chave('volume','Sons e voz','',a.sons,'chave-sons')}
    ${chave('moon','Tema escuro','',
            document.documentElement.dataset.luz!=='claro','chave-tema')}
  </div>
  ${a.grupoOffline?`<div class="grupo">Sem internet</div>
  <div class="cartao-lista">
    <div class="linha-cfg" style="cursor:default"><span class="ico">${ic('download',16)}</span>
      <span><strong>${a.mapaBaixando}</strong><span>${a.mapaBaixado}</span></span><span></span></div>
    <div class="prog" style="margin:0 11px 10px"><span class="prog-b"><i style="width:${a.mapaPct}%"></i></span></div>
    ${linha('route','Cadastrar rota offline')}
    ${linha('trash','Apagar mapa baixado')}
  </div>`:''}
  <div class="grupo">Aplicativo</div>
  <div class="cartao-lista">
    ${a.empresa?linha('users','Nome da empresa','',`<b>${a.empresa}</b>`):''}
    ${linha('logout','Sair','','','sair')}
    ${/* 🔴 A LINHA DA VERSÃO ERA UM `div` MORTO (09/08, bronca do dono: "nem em
          ajustes eu consigo clicar em atualizar"). No app ANTIGO ela era o único
          caminho MANUAL pra atualização: tocar forçava a checagem e respondia
          sempre ("já está na mais recente" / abre o portão / "não consegui
          agora"). A fusão apagou o `app.js` e trouxe só o aviso AUTOMÁTICO — que
          é pop-up, some com o primeiro repinte e avisa uma vez por versão. Sem
          esta linha, quem perdeu o pop-up ficava preso na versão velha SEM NADA
          pra tocar. Aviso automático é conveniência; a porta manual é a garantia,
          e garantia não se apaga. */''}
    ${a.versao?linha('download',a.versao,a.versaoSub,
        a.versaoTag?`<span class="tag blue">${a.versaoTag}</span>`:'','buscar-update'):''}
  </div>`)}
</div>
${nav('ajustes')}`;}};

/* ==========================================================================
   MONTAGEM
   ========================================================================== */
const ORDEM=['entrada','saida','rota','rotalista','mapa','mapachegou','mapalista','gerenciador','montagem','conferencia',
             'venda','folha','folhanao','rapida','salvas','fechamento','terminou','semana','clientes','novocliente','ficha','produtos',
             'fichavinculo','fichaproduto','chat','ajustes','creditos','financeiro','avancado','sons','historico',
             'passeio','portoes'];
const GRUPOS=['Sistema','Rota','Fechamento','Cadastro','Ajustes'];
let atual='entrada';

/* Quanto tempo a camada que SAI ainda precisa ficar viva, por transição.
   Tirar antes da hora corta a animação no meio — o defeito clássico.
   🔴 `eixox` subiu de 300 pra 400 junto com a saída v3, e é OBRIGATÓRIO: a
   saída deixou de ser um bloco de 260 ms e virou cascata de linhas, que na
   camada mais cheia (teto de 15 posições) fecha em 14×16 ms + 150 ms = 374 ms.
   A limpeza remove a camada em `DUR+40`; com os 300 antigos ela seria ARRANCADA
   aos 340 ms, no meio da própria cascata — o defeito clássico de novo, só que
   agora causado pela cura. 400+40 = 440 ms cobre os 374 com folga. */
const DUR={escalonado:200,desfoque:180,molinha:180,eixoz:320,eixox:400,conteudo:30,nenhuma:0};
/** Telas que TOMAM o aparelho inteiro — entram e saem por outro padrão. */
const TELA_CHEIA=['mapa','mapachegou'];

function pintarRail(){/* barra lateral do visualizador: não existe no aparelho */}

/** Marca e numera as peças do corpo — é o que dá a ORDEM de entrada. Teto de
 *  14 pra tela cheia não terminar de entrar depois do dedo já ter rolado.
 *
 *  🔴 E GUARDA O TAMANHO DA FILA (`--n`). Voltando, a cena roda ao contrário —
 *  a última linha que saiu é a primeira que volta — e pra contar do fim pro
 *  começo o CSS precisa saber onde é o fim. `--i` sozinho não diz: ele é a
 *  posição, não o total. `--n` é o MAIOR `--i` que esta camada usou de verdade
 *  (já com o mesmo teto de 14), então `--n - --i` sempre cai dentro da fila.
 *  Vai na CAMADA, não no item: é um número só, e os itens herdam. */
function numerarItens(tela){
  const itens=tela.querySelectorAll('.kpi,.bar,.stop,.cli,.prod,.week,.rowcard,.sum,.acts,.box,.prog,.forms,.searchrow,.chips');
  itens.forEach((el,i)=>{el.classList.add('anim-item');el.style.setProperty('--i',Math.min(i,14));});
  tela.style.setProperty('--n', Math.max(0, Math.min(itens.length-1, 14)));
}

/** Luz: escuro · claro · sistema. "Sistema" resolve na hora e continua ouvindo
 *  o aparelho — o app não pode ficar claro quando o celular vira noite. */
const olhoDoSistema=window.matchMedia('(prefers-color-scheme: light)');
function trocarLuz(escolha){
  const efetiva = escolha==='sistema' ? (olhoDoSistema.matches?'claro':'escuro') : escolha;
  document.documentElement.dataset.luz=efetiva;
  document.documentElement.dataset.luzEscolha=escolha;
  document.querySelectorAll('#luz button').forEach(b=>b.classList.toggle('on',b.dataset.luz===escolha));
  const chave=document.querySelector('#app .chave');
  if(chave) pintar(false);
}
olhoDoSistema.addEventListener('change',()=>{
  if(document.documentElement.dataset.luzEscolha==='sistema') trocarLuz('sistema');
});

let limpezaTimer=null;
/* 🔴 A CENA DE TELA CHEIA TEM HORA PRA ACABAR — e ela mora numa marca PRÓPRIA,
   não na `entra`. A `entra` fica na camada pra sempre (é dela que o repinte
   herda o papel, Lei 10): se a cena do GPS pendurasse nela, todo repinte do
   seam RECOMEÇARIA a cena — o véu escurecendo a tela do motorista de novo aos
   5 s, cada vez que uma empresa acende. Com `cena`, o veneno tem prazo.

   O número é o MESMO do relógio herdado lá embaixo, e isso é de propósito:
   enquanto a marca vive o repinte CONTINUA a cena (`currentTime`); depois
   dela não existe cena pra continuar.

   🔴 SÃO DOIS NÚMEROS PORQUE SÃO DUAS ENTRADAS, e a lei é a mesma nas duas:
   "o relógio herdado vale exatamente enquanto a entrada roda". Uma tela comum
   entra em ~740 ms (o eixo X fecha em 150 ms e as linhas escalonadas seguem
   até lá) — pra ela o teto é `ENTRADA_COMUM`. A tela cheia do GPS tem a cena
   de entrar na rota: pra ela o teto é `CENA_CHEIA`. Um teto grande aplicado a
   TODA tela seria reabrir o buraco do "nasce terminada" de brinde.

   🔴 `CENA_CHEIA` É TETO, NÃO É A DURAÇÃO — e a diferença custou uma medição.
   As peças da cena fecham antes; este número é de RELÓGIO DE PAREDE, e os dois
   não coincidem. MEDIDO no g15 (07/08): ao entrar na rota a thread trava
   ~490 ms subindo o mapa, então no instante em que a parede marcava 519 ms o
   relógio do véu marcava 33. Teto colado na duração corta a cena no meio; a
   folga cobre a travada, e quem termina continua sendo a própria animação
   (todo `@keyframes` daqui é `both`, o estado final fica).

   🔴 CAIU DE 2200 PRA 1200 COM A COBRA (09/08). O teto era o da rota de
   mentira se desenhando (1,36 s de animação + folga). Sem ela, o que sobra na
   camada é o véu (fecha aos 620 ms) e as folhas (a última entra aos 580 ms):
   1,2 s já é folga de quase o dobro. E este número é ORQUESTRA — a descida da
   câmera espera esta marca cair (§ `entrarNaDescida` na ponte), então segurar
   2,2 s aqui era 1 segundo de tela parada esperando um show que acabou. */
const CENA_CHEIA=1200;
const ENTRADA_COMUM=900;
/* 🔴 A ENTRADA DA TELA É DA CAMADA, NUNCA DA PEÇA (dono, 08/08: "clico em
   montar rota, ele pisca, parece que abre 2x").
   Estes são os `@keyframes` que fazem a TELA entrar — os seis padrões de
   transição desta folha, mais o da abertura. Eles existem porque a tela está
   chegando; não porque a peça é nova. Quem chega DEPOIS (a lista que o
   servidor mandou 289 ms atrás) entra na cena que já está rolando, no relógio
   dela — nunca começa a cena outra vez. Fora desta lista nada muda: animação
   PRÓPRIA de peça (a empresa do corredor acendendo no mapa) continua nascendo
   do zero, que é o certo — ela é notícia, não entrada de tela. */
const ENTRADA_DA_TELA=new Set(['trFundeEntra','trItem','trDesfoque','trMola','trZEntra','trXFade','trXItem','mvScrim']);
let cenaTimer=null;
function fecharCena(){
  document.querySelectorAll('#app .tela.cena').forEach(c=>c.classList.remove('cena'));
}
let entradaEm=0;
/* 🔴 REPINTAR NÃO PODE ROLAR A TELA PRA CIMA (dono, 08/08: "ao clicar pisca").
   Cada escrita do seam monta uma CAMADA NOVA, e camada nova nasce no topo.
   MEDIDO no g15, na Montagem com 52 clientes: 3.259 px de rolagem viravam 0 em
   TODO repinte — o dedo tocava um botão e a tela fugia pra outro lugar.
   🔴 O guarda que existia pra folha de pagamento NUNCA RODOU: ele estava
   dentro do ramo `animar` perguntando `!animar`. Aqui vale pros dois ramos de
   repinte; TROCAR de tela (`animar`) continua começando do topo, que é o certo.
   `.body` e `.sheet` são os dois únicos painéis que rolam por dentro. */
const ROLAM=['.body','.sheet'];
function medirRolagem(camada){
  const m={};
  if(camada) ROLAM.forEach(s=>{const el=camada.querySelector(s); if(el&&el.scrollTop) m[s]=el.scrollTop;});
  return m;
}
/* só depois de a camada estar NO documento: nó solto não tem altura, e
   `scrollTop` de nó sem layout volta zero calado. */
function herdarRolagem(m,camada){
  if(!m) return;
  ROLAM.forEach(s=>{if(!m[s])return; const el=camada.querySelector(s); if(el) el.scrollTop=m[s];});
}
/* 🔴 REPINTAR NÃO PODE FECHAR O TECLADO (dono, 09/08: *"abri o adicionar
   parada, fui buscar clientes por nome, o teclado fecha depois de digitar 1
   palavra"*).
   Cada escrita do seam monta uma CAMADA NOVA e mata a velha — `replaceWith`
   num ramo, `app.innerHTML=''` no outro. O campo que estava SOB O DEDO morre
   junto: o Android fica sem quem receba a próxima letra e recolhe o teclado, e
   ele não volta sozinho — a pessoa tem que tocar no campo de novo, palavra por
   palavra. Não é defeito de UMA tela: vale pra toda tela onde digitar dispara
   busca ou seam (a busca da porta "Meus clientes", a de Clientes, a de
   Produtos, e qualquer campo de cadastro que repinte no meio da digitação).
   A cura é a MESMA da rolagem e mora no MESMO lugar, por isso está aqui:
   medir na camada que vai morrer, devolver na camada que nasce.

   Duas restrições que fazem a coisa funcionar de verdade:
   1. SÍNCRONO, na mesma tarefa da troca. Devolver o foco num `setTimeout` ou
      num `requestAnimationFrame` cede o quadro — o Android já fechou o teclado
      e reabri-lo não é decisão de quem programa.
   2. O VALOR VIVO VENCE o do seam. Entre a tecla e o repinte cabe mais letra:
      o dado que volta do servidor carrega o texto de 350 ms atrás, e escrevê-lo
      por cima apagaria o que o dedo acabou de digitar. No campo FOCADO quem
      manda é o dedo.
   Campo sem `data-campo` fica de fora: sem nome não há como reencontrá-lo na
   camada nova, e adivinhar por posição erraria de campo. */
function medirFoco(camada){
  const el=document.activeElement;
  if(!camada||!el||!camada.contains(el)) return null;
  const nome=el.dataset?el.dataset.campo:'';
  if(!nome) return null;
  const m={nome};
  // `value` só existe em campo de digitar. Em contenteditable volta `undefined`
  // e só o FOCO viaja — devolver undefined apagaria o texto.
  if(typeof el.value==='string') m.valor=el.value;
  // O CARETE também é dele: sem isto o cursor volta pro fim e quem estava
  // corrigindo o meio da palavra digita no lugar errado. `selectionStart`
  // ESTOURA em input sem seleção (number, email, date) — daí o try.
  try{ m.ini=el.selectionStart; m.fim=el.selectionEnd; }catch(_){}
  return m;
}
function herdarFoco(m,camada){
  if(!m||!camada) return;
  const el=camada.querySelector('[data-campo="'+m.nome+'"]');
  if(!el) return;
  if(typeof m.valor==='string'&&el.value!==m.valor) el.value=m.valor;
  // `preventScroll` é obrigatório: sem ele o navegador rola a lista até o campo
  // e desfaz na hora a rolagem que o `herdarRolagem` acabou de devolver.
  try{ el.focus({preventScroll:true}); }catch(_){ try{ el.focus(); }catch(__){} }
  if(m.ini!=null&&el.setSelectionRange){ try{ el.setSelectionRange(m.ini,m.fim); }catch(_){} }
}
function pintar(animar,dir){
  const app=document.getElementById('app');
  const tr=document.documentElement.dataset.tr||'escalonado';
  // 🔴 A CAMADA QUE SAI É A ÚLTIMA, NUNCA A PRIMEIRA. Com `querySelector` eu
  // pegava a primeira do DOM: bastava tocar de novo antes da troca anterior
  // terminar pra ele marcar como "saindo" uma camada que já estava morrendo,
  // deixar a visível intacta e empilhar. Medido: 4 camadas vivas em 14 toques.
  // Além de pegar a certa, toda camada zumbi de uma troca atropelada morre aqui
  // — e o relógio de limpeza anterior é cancelado, senão ele remove a errada.
  const camadas=[...app.querySelectorAll('.tela')];
  const antiga=camadas.length?camadas[camadas.length-1]:null;
  /* 🔴 A ABERTURA NÃO SE REPINTA — NUNCA (dono, 09/08, olhando o boot do g15:
     *"a entrada ainda está com defeito, começa e começa novamente"*).

     MEDIDO na gravação do aparelho (4 quadros/s): as duas hastes entram, somem
     e ENTRAM DE NOVO. Não é a cena "piscando": é a cena tocando duas vezes. O
     motivo é o seam: toda resposta do servidor chama `usarDados` → `pintar` →
     `T[atual].render()` numa camada NOVA. Numa tela comum isso é invisível (a
     herança logo abaixo continua o relógio da entrada). Numa CENA COM RELÓGIO
     não tem herança que salve: são quinze animações com atrasos calculados
     entre si (haste, rastro, clarão, anel, letras, brilho, barra, batida), e
     recriar o DOM devolve todas ao quadro zero.

     E ela não tem o que repintar: `T.entrada` é a única tela que não lê `DADOS`
     (ver o comentário dela). Repinte aqui é trabalho jogado fora que ainda por
     cima estraga a cena.

     🔴 POR QUE ISTO PIOROU HOJE, e a lição: a abertura passou a ESPERAR o app
     (§ `armarAbertura`), então ela fica no ar mais tempo — e quanto mais tempo,
     mais respostas do servidor caem dentro dela. O defeito era latente; segurar
     a tela por mais tempo só o trouxe pra luz. Mudança de RITMO revela bug de
     RE-ENTRADA: quem alonga uma cena tem que perguntar quem repinta durante ela.

     Só o REPINTE morre aqui. Trocar de tela (`animar`) continua passando, senão
     a abertura nunca entregaria o app. */
  if(!animar && atual==='entrada' && antiga) return;
  // medido ANTES de qualquer troca: no ramo comum a camada velha é destruída
  // (`innerHTML=''`) e depois disso não há o que perguntar.
  const rolagem=animar?{}:medirRolagem(antiga);
  // O DEDO, medido no mesmo instante e pelo mesmo motivo. Só no REPINTE: TROCAR
  // de tela leva o foco embora de propósito — campo de uma tela não segue o
  // dedo pra outra, e devolver teclado numa tela que o motorista acabou de
  // deixar seria o defeito ao contrário.
  const foco=animar?null:medirFoco(antiga);
  // 🔴 REPINTE DE DADO NÃO MATA A ENTRADA DA TELA. O seam repinta assim que o
  // servidor responde, e o repinte não anima — só que ele chegava NO MEIO da
  // entrada e a camada nova nascia sem papel nenhum. Medido no mock: 13
  // animações vivas viravam ZERO no instante do `usarDados`. Na bancada a
  // lista de clientes voltava em ~60 ms, então a tela simplesmente não tinha
  // transição — e a casca tem que ser IGUAL em toda tela, com dado ou sem.
  // Herdando: a camada nova assume as marcas da que estava entrando e o
  // relógio continua de onde parou (recomeçar do zero pisca).
  /* 🔴 O PISCA ERA A TELA ENTRANDO DE NOVO — ESTE É O DEFEITO DE RAIZ (dono,
     08/08: "ao clicar pisca"). A marca `entra` FICA na camada pra sempre, e
     todo repinte herdava ela: os itens da tela nasciam com `trXItem` (opacity
     0 → 1) começando do ZERO, porque o carimbo de `currentTime` lá embaixo só
     vale enquanto a entrada roda. MEDIDO no g15: print tirado logo depois de
     um `usarDados` mostrou a tela EM BRANCO — 57 animações reencenando a
     entrada inteira. Numa tela aberta há um minuto não existe entrada pra
     continuar: a camada nova tem que nascer PARADA, e nascer parada é nascer
     SEM `entra` (todo `@keyframes` daqui declara só o `from`, então o estado
     final é o estado do CSS). O precedente já estava na folha: a tela cheia do
     GPS ganhou `animation:none!important` justamente porque "a tela INTEIRA
     repiscava" aos 950 ms. Isto é a mesma cura, para TODA tela.
     Dentro da janela nada muda — repinte no meio da entrada continua herdando,
     senão volta o pisca que a herança existe pra matar. E `cheio`/`abertura`
     herdam ENQUANTO HOUVER CAMADA DE SAÍDA NO AR: são cenas de duas camadas, e
     o caminho comum (`innerHTML=''`) cortaria o show no meio.
     🔴 ENQUANTO, não SEMPRE (11/08 — dono: "clico em cancelar e a tela pisca
     1x no navegar"). O bypass sem janela deixava a camada que VOLTOU do GPS
     (`entra cheio voltando` — marcas que só saem na PRÓXIMA troca) herdar pra
     sempre: o 1º repinte do cancelar vestia as marcas na camada nova, o
     carimbo de relógio já não valia (t > teto), e o `mvCheioVolta` — o gesto
     de sair da navegação, 520 ms — tocava do quadro ZERO na cara de quem
     cancelou. MEDIDO na `prova-pisca-cancelar`: mvCheioVolta com 150 ms de
     vida numa camada parada havia segundos, e de novo a cada escrita.
     Morta a saída (o `limpezaTimer` a remove aos 580 ms; a janela da entrada
     vale 900), não existe show pra não cortar — a camada nova nasce PARADA,
     sem as marcas, que é a cura nº1 aplicada também aqui. Vale igual pro
     pós-abertura: `abertura` fica na camada pra sempre (a remoção da troca
     não a tira) e todo repinte tardio da 1ª tela reencenava `mvScrim`+`trItem`. */
  const entradaViva = antiga
    && (performance.now()-entradaEm) < (antiga.classList.contains('cena')?CENA_CHEIA:ENTRADA_COMUM);
  const comSaidaViva = camadas.some(c=>c.classList.contains('sai'));
  const herdando = !animar && antiga && antiga.classList.contains('entra')
    && (entradaViva || ((antiga.classList.contains('cheio') || antiga.classList.contains('abertura')) && comSaidaViva));
  // A varredura de zumbi e o cancelamento do relógio são da TROCA de tela. No
  // repinte não: a camada que SAI ainda está no ar (na abertura ela é o show
  // inteiro — é o logo voando pro cabeçalho) e o relógio dela segue valendo.
  if(!herdando){
    camadas.slice(0,-1).forEach(c=>c.remove());
    clearTimeout(limpezaTimer);
  }
  /* 🔴 O PORTÃO ATRAVESSA O REPINTE (dono, 09/08: *"tela montagem de rota — não
     consigo iniciar rota"*).
     O portão mora DENTRO da camada, e todo repinte do seam troca a camada
     inteira: `antiga.replaceWith(nova)` num ramo, `app.innerHTML=''` no outro.
     Quem perguntava alguma coisa morria calado no primeiro dado que chegasse do
     servidor — e o "Iniciar a rota? · Debita X" é EXATAMENTE isso. Medido no
     código da Montagem: ela abre com quatro buscas no ar e ainda GARANTE O GPS,
     e o 1º fix chama `publicarPrevia()` (a lista renasce encadeada pela posição
     do motorista) — numa garagem esse fix chega dezenas de segundos depois, ou
     seja, bem no meio do diálogo aberto. Some o portão, some com ele o ouvinte
     do "sim" que a ponte pendurou no `.principal`, e o toque seguinte não faz
     nada. O dono lê isso como "não consigo iniciar rota".
     O tour já tinha essa cura (`tourRepintar`), o portão não tinha.
     🔴 E ELE É MUDADO DE CAMADA, NÃO REDESENHADO. Redesenhar devolveria um
     botão NOVO, sem o ouvinte — a mesma morte com outro nome. Mover o nó leva
     junto tudo o que está pendurado nele.
     Só no REPINTE: TROCAR de tela continua fechando o portão, que é o certo —
     diálogo de uma tela não segue o dedo pra outra. */
  const portaoVivo = (!animar && antiga) ? antiga.querySelector('.portao-wrap') : null;
  const nova=document.createElement('div');
  nova.className='tela';
  nova.innerHTML=T[atual].render();
  // ITEM 9 — antes de numerar e de entrar em cena: o que o admin desligou não
  // chega a existir na camada. Numerar primeiro deixaria buraco na fila de
  // entrada (o `--i` das peças) e a animação sairia com degrau.
  podarDesligados(nova);
  numerarItens(nova);
  /* 🔴 MEDIR UMA VEZ SÓ É MEDIR ANTES DA FONTE. O glifo do X muda de largura
     quando a fonte de verdade entra no lugar da de reserva, e a haste fica no
     lugar da medida velha — o mesmo "X deslocado" por outro caminho. Três
     passadas: no primeiro quadro (pra já nascer certa), quando a fonte assenta,
     e aos 600 ms — todas antes das hastes pousarem, que é aos 1,25 s. */
  if(atual==='entrada'){
    const medir=()=>ajustarHastes(nova);
    requestAnimationFrame(medir);
    if(document.fonts&&document.fonts.ready&&document.fonts.ready.then) document.fonts.ready.then(medir).catch(()=>{});
    setTimeout(medir,600);
  }
  // Os dois gestos valem em TODA lista de paradas. A tela que os ENSINAVA saiu
  // (07/08, ordem do dono: fora as explicações); o gesto ficou e trocou de
  // endereço — quem liga não é mais o nome da tela, é a marca `data-gestos`.
  requestAnimationFrame(()=>ligarGestos(nova));
  // a lâmpada acende (ou não) junto com a tela: é o único aviso de que existe
  // aula nova ali dentro.
  marcarAula(nova);
  // DIREÇÃO (eixo X): +1 = avançando, entra pela direita; -1 = voltando, entra
  // pela esquerda. Um "voltar" que entra pelo mesmo lado do "avançar" é mentira
  // de navegação — o dedo aprende o gesto errado.
  // `--dir` é o LADO (o sinal do translate). `data-dir` é a ORDEM da fila, e
  // são duas coisas: dá pra inverter o lado sem inverter a fila, que era
  // exatamente o defeito da v2 — voltava pelo outro lado com a mesma cascata.
  // Atributo em vez de conta no `calc` porque quem lê a folha precisa VER a
  // regra do reverso; e vai nas DUAS camadas, que a cena é das duas juntas.
  const marcaDir = dir===-1 ? 'tras' : 'frente';
  nova.style.setProperty('--dir', dir===-1?-1:1);
  nova.dataset.dir = marcaDir;
  if(antiga){ antiga.style.setProperty('--dir', dir===-1?-1:1); antiga.dataset.dir = marcaDir; }

  if(animar && antiga && tr!=='nenhuma'){
    // 🔴 A camada que entrou guardava a classe `entra` pra sempre. Na troca
    // seguinte ela virava a que SAI carregando as duas regras de animação — e
    // quem decidia era a ordem da folha, não o código. Some com a marca antes
    // de marcar a saída: uma camada tem UM papel de cada vez.
    // `cena` some junto: a camada que SAI não pode reencenar a entrada dela.
    antiga.classList.remove('entra','cheio','voltando','cena');
    nova.classList.add('entra');
    antiga.classList.add('sai');
    // TELA CHEIA: vale saindo de QUALQUER tela, e o gesto inverte na volta.
    const entrandoNoCheio=TELA_CHEIA.includes(atual);
    const saindoDoCheio=TELA_CHEIA.includes(anterior);
    let espera=DUR[tr]+40;
    if(entrandoNoCheio || saindoDoCheio){
      nova.classList.add('cheio'); antiga.classList.add('cheio');
      if(saindoDoCheio && !entrandoNoCheio){ nova.classList.add('voltando'); antiga.classList.add('voltando'); }
      espera=580;
    }
    // A CENA (véu → ponteiro → mapa) só existe ENTRANDO na tela cheia, e por
    // 900 ms. O relógio anterior morre aqui: entrar duas vezes seguidas não
    // pode deixar o primeiro relógio apagar a cena do segundo.
    if(entrandoNoCheio){
      nova.classList.add('cena');
      clearTimeout(cenaTimer);
      cenaTimer=setTimeout(fecharCena, CENA_CHEIA);
    }
    app.appendChild(nova);
    // ABERTURA: mede o percurso do logo DEPOIS de a camada nova estar no ar —
    // antes disso o cabeçalho ainda não tem posição, e a conta sai errada.
    if(anterior==='entrada'){
      nova.classList.add('abertura'); antiga.classList.add('abertura');
      const alvo=nova.querySelector('.logo'), origem=antiga.querySelector('.splash-logo');
      if(alvo&&origem){
        // Quem tem que encaixar é a LINHA "HBX" (.w), não a caixa em volta: a
        // caixa da abertura carrega o "LOGÍSTICA" embaixo e o recorte do
        // brilho, então medir por ela erraria tamanho e altura.
        // Pondo a origem do transform no centro do .w, a escala não desloca
        // nada e o translate vira a conta direta entre os dois centros.
        /* 🔴 A CONTA É DE RETÂNGULO DE TELA, não de corrente de `offsetParent` —
           é o mesmo conserto das hastes do X (ver `ajustarHastes`). A corrente
           só fecha se TODO ancestral no caminho estiver posicionado; basta um
           não estar pra o logo aterrissar torto, e "encaixar no topo" é a
           promessa desta animação inteira (ordem do dono, 09/08: *"o HBX tem q
           se formar e encaixar aqui no topper, depois acontece o efeito"*).
           As duas camadas estão no mesmo lugar da tela neste instante — a nova
           acabou de entrar e ainda não tem transform —, então medir as duas em
           coordenada de VIEWPORT é comparar maçã com maçã. */
        const wO=origem.querySelector('.w'), wA=alvo.querySelector('.w');
        const rL=origem.getBoundingClientRect();
        const rO=wO.getBoundingClientRect(), rA=wA.getBoundingClientRect();
        const co={x:rO.x+rO.width/2, y:rO.y+rO.height/2};
        const ca={x:rA.x+rA.width/2, y:rA.y+rA.height/2};
        origem.style.transformOrigin=`${(co.x-rL.x).toFixed(1)}px ${(co.y-rL.y).toFixed(1)}px`;
        origem.style.setProperty('--dx',(ca.x-co.x).toFixed(1)+'px');
        origem.style.setProperty('--dy',(ca.y-co.y).toFixed(1)+'px');
        origem.style.setProperty('--esc',(rA.width/rO.width).toFixed(3));
      }
      espera=1000;
    }
    /* 🔴 O VOO DE VOLTA MEDE IGUAL, SÓ QUE AO CONTRÁRIO. Na entrada a origem é o
       splash e o alvo é o cabeçalho; aqui a camada que ENTRA é o splash e o
       cabeçalho está na que SAI. As variáveis são as mesmas (`--dx/--dy/--esc`)
       e o `@keyframes mvLogoVolta` só troca `to` por `from` — é o mesmo caminho
       percorrido de trás pra frente, que é o pedido literal do dono. */
    if(atual==='saida'){
      nova.classList.add('saida'); antiga.classList.add('saida');
      const origem=nova.querySelector('.splash-logo'), alvo=antiga.querySelector('.logo');
      if(alvo&&origem){
        const wO=origem.querySelector('.w'), wA=alvo.querySelector('.w');
        const rL=origem.getBoundingClientRect();
        const rO=wO.getBoundingClientRect(), rA=wA.getBoundingClientRect();
        const co={x:rO.x+rO.width/2, y:rO.y+rO.height/2};
        const ca={x:rA.x+rA.width/2, y:rA.y+rA.height/2};
        origem.style.transformOrigin=`${(co.x-rL.x).toFixed(1)}px ${(co.y-rL.y).toFixed(1)}px`;
        origem.style.setProperty('--dx',(ca.x-co.x).toFixed(1)+'px');
        origem.style.setProperty('--dy',(ca.y-co.y).toFixed(1)+'px');
        origem.style.setProperty('--esc',(rA.width/rO.width).toFixed(3));
      }
      espera=520;
      /* 🔴 NA SAÍDA A MEDIDA ESPERA O VOO ACABAR (10/08, visto numa grade de
         prova: a haste saía do logotipo 42px ACIMA dele). `ajustarHastes` mede o
         glifo com `getBoundingClientRect`, e no primeiro quadro da saída a marca
         ainda está VOANDO do cabeçalho pro meio da tela — o retângulo é o do meio
         do caminho, e a haste ficava cravada onde a marca só passou.
         Na entrada isso não acontece porque lá a marca já nasce parada no centro.
         O `animationend` do próprio `.splash-logo` é o instante exato do pouso, e
         ele chega ANTES de a haste ter tinta (o grupo só começa a aparecer em
         0,62s e leva 0,18s) — ninguém vê a correção.
         O `e.target` é obrigatório: as letras e o glifo são FILHOS e os
         `animationend` deles borbulham por aqui. E o relógio de reserva cobre o
         aparelho que entrega a cena sem evento (reduced-motion); medir duas vezes
         não custa nada, a função só reescreve as mesmas coordenadas. */
      const marca=nova.querySelector('.splash-logo');
      if(marca){
        marca.addEventListener('animationend',function pousou(e){
          if(e.target!==marca) return;
          marca.removeEventListener('animationend',pousou);
          ajustarHastes(nova);
        });
      }
      requestAnimationFrame(()=>ajustarHastes(nova));
      setTimeout(()=>ajustarHastes(nova),660);
    }
    // Marca de quando a entrada COMEÇOU. É o único jeito de um repinte que
    // chega no meio saber de onde continuar — a duração da própria camada não
    // serve (no eixo X ela acaba em 150 ms e as linhas seguem até ~740 ms).
    entradaEm=performance.now();
    limpezaTimer=setTimeout(()=>antiga.remove(), espera);
  }else if(herdando){
    // A camada nova VESTE o papel da que estava entrando (inclusive `cheio`,
    // `voltando` e `abertura`) e troca só ela — a que sai continua o show dela.
    [...antiga.classList].forEach(c=>{ if(c!=='tela') nova.classList.add(c); });
    // O lado E a fila viajam juntos: `data-dir` fora daqui deixaria a camada
    // herdeira com o translate do "voltando" e a cascata do "indo".
    nova.style.setProperty('--dir', antiga.style.getPropertyValue('--dir')||1);
    if(antiga.dataset.dir) nova.dataset.dir = antiga.dataset.dir;
    // 🔴 A CONTAGEM DA CAMADA VELHA É AQUI, ANTES DA TROCA. Fora do documento
    // a camada perde as animações e `getAnimations` volta vazio — contar
    // depois do `replaceWith` seria contar ZERO e não carimbar nada, que é
    // justamente o pisca que a herança existe pra matar.
    const antes=new Map();
    (antiga.getAnimations?antiga.getAnimations({subtree:true}):[]).forEach(a=>{
      const n=a.animationName||a.transitionProperty||'?';
      antes.set(n,(antes.get(n)||0)+1);
    });
    antiga.replaceWith(nova);
    herdarRolagem(rolagem,nova);
    remontarPortao(nova,portaoVivo);
    // DEPOIS do portão voltar, nunca antes: campo de portão (o "Nome" do
    // Espaço) mora DENTRO do `.portao-wrap`, e enquanto ele não é re-encaixado
    // o campo não existe na camada nova pra ser reencontrado.
    herdarFoco(foco,nova);
    // E o relógio continua: `currentTime` põe cada animação exatamente onde a
    // da camada anterior estava. Sem isto a lista recomeçaria do zero e o dado
    // chegando tarde daria um pisca. Quem não tiver a API fica sem o acerto —
    // some com o pulo, nunca com a tela.
    //
    // 🔴 MAS SÓ ENQUANTO A ENTRADA AINDA ESTÁ RODANDO. `entradaEm` é o começo
    // da ENTRADA da tela, e a marca `entra` fica na camada pra sempre — então,
    // numa tela aberta há um minuto, `t` valia SESSENTA MIL milissegundos e
    // era carimbado em TODA animação da camada nova, inclusive nas que tinham
    // acabado de nascer. Isso não "continua" nada: joga a cena inteira pro fim
    // antes do primeiro quadro.
    // MEDIDO no g15 (07/08), com as empresas do mapa chegando pelo seam: as 17
    // animações da cena nasciam TERMINADAS — o motorista via o desfecho sem
    // nunca ver o prédio acender. Passada a entrada não existe o que
    // continuar, e carimbar vira só estrago. O teto é a ENTRADA DA CAMADA: a
    // tela cheia carrega a marca `cena` e vale `CENA_CHEIA` (as folhas fecham
    // aos 580 ms); qualquer outra vale `ENTRADA_COMUM`. É O MESMO NÚMERO que tira
    // a marca `cena` lá em cima, e tem que continuar sendo: enquanto vale o
    // relógio herdado existe cena pra continuar; passado ele, não existe.
    const t=performance.now()-entradaEm;
    const teto=nova.classList.contains('cena')?CENA_CHEIA:ENTRADA_COMUM;
    if(nova.getAnimations && t<teto){
      // 🔴 SÓ CONTINUA QUEM TINHA O QUE CONTINUAR. O teto sozinho não basta:
      // dentro da janela, um elemento que NASCEU deste repinte (uma empresa
      // que o corredor acabou de trazer) também levava o carimbo e aparecia
      // pronta, sem acender. Aqui a camada velha é contada por nome de
      // animação; a nova só carimba enquanto houver contraparte. Quem sobra é
      // peça nova e começa do zero, que é o certo. Navegador sem `animationName`
      // cai no comportamento antigo — perde o refino, nunca a tela.
      //
      // 🔴 ...MENOS A ENTRADA DA TELA, QUE NÃO SE REENCENA (dono, 08/08:
      // "clico em montar rota, ele pisca, parece que abre 2x"). MEDIDO no
      // mock, abrindo a Montagem: a tela entra vazia, o esqueleto entra aos
      // 12 ms e a lista real chega aos 289 ms — e nesse repinte eram 56
      // animações com 54 COMEÇANDO DO ZERO. Contraparte não havia mesmo: o
      // corpo inteiro é peça nova (52 linhas trocando 5 barras de esqueleto),
      // então cada linha recomeçava o `trXItem` e a tela deslizava pra dentro
      // uma SEGUNDA vez, 289 ms depois de já ter entrado. É isso que o olho lê
      // como "abriu duas vezes".
      // A regra que faltava: dado que chega atrasado entra na cena que já está
      // rolando (carimbo `t`, aparece assentado), não recomeça a cena. Vale só
      // pros `@keyframes` de ENTRADA DA TELA — o resto segue a regra de cima.
      nova.getAnimations({subtree:true}).forEach(a=>{
        const n=a.animationName||a.transitionProperty||'?';
        const resta=antes.get(n)||0;
        if(resta<=0 && !ENTRADA_DA_TELA.has(n)) return;
        if(resta>0) antes.set(n,resta-1);
        try{ a.currentTime=t; }catch(_){}
      });
    }
  }else{
    app.innerHTML='';
    app.appendChild(nova);
    herdarRolagem(rolagem,nova);
    // `innerHTML=''` só DESLIGA a camada velha do documento: o nó do portão
    // continua vivo na variável (com os ouvintes), e é por isso que ele pode
    // ser re-encaixado aqui embaixo.
    remontarPortao(nova,portaoVivo);
    // idem ao ramo de cima: o foco volta por ÚLTIMO, com o portão já no lugar.
    herdarFoco(foco,nova);
  }
  pintarRail();
  /* 🔴 O TOUR SE REMONTA NA CAMADA NOVA. O `.aula-wrap` mora DENTRO da camada,
     e a camada é trocada inteira a cada repinte do seam — sem esta linha a
     lição sumia no primeiro dado que a ponte entregasse (e a jornada entre
     telas não existiria: navegar É repintar). O estado do passo vive fora do
     DOM justamente por isso; aqui só se redesenha o que já é verdade. */
  tourRepintar();
  // A abertura não fica na tela: ela ENTREGA o app (ver `armarAbertura`).
  if(atual==='entrada'){ segurarCena(nova); armarAbertura(); }
}

/* ==========================================================================
   🔴 A CENA NÃO COMEÇA ATRÁS DA CORTINA (10/08 — MEDIDO no g15, APK 248,
   screenrecord a 20 quadros/s).

   O que se viu: no primeiro quadro em que o app APARECE, as hastes já estavam
   voando. O trecho que o dono pediu — *"ele abre apenas HB"* — tocava inteiro
   escondido. A conta fecha: o `.splash` começa a animar quando esta folha pinta,
   e a cortina nativa só sai `max(agora+650ms, handoff+550ms)` DEPOIS do
   `appReady()` (§ `MainActivity.revealReadyApp`). Mais de um segundo de cena
   para ninguém.

   O remédio é o mesmo que a cortina nativa já usa em si mesma (§ `opening.html`:
   `html[data-native="true"]:not(.started) .stage *{animation-play-state:paused}`):
   a cena nasce PAUSADA e o aparelho a solta quando o app fica visível. Como toda
   animação da abertura tem `both`, pausada antes do atraso ela mostra o fundo e
   nada mais — que é exatamente o que estava por baixo da cortina.

   TRÊS GARANTIAS, porque abertura presa é app morto:
   · Só segura se HOUVER aparelho (`HBXAndroid`). No navegador e no mock nada
     muda — a cena continua começando no primeiro quadro.
   · O relógio de reserva é armado NO MESMO instante em que a pausa cai: se o
     Kotlin não chamar (casca nova em APK velho), a cena solta sozinha em 1,6 s.
   · O piso de 3,4 s da abertura passa a contar do START (§ `armarAbertura`),
     senão a cena seria cortada no fim pelo tempo que passou pausada.
   ========================================================================== */
const CENA_ESPERA_TETO=1600;
let cenaPresa=null, cenaSolta=false, cenaEsperaTimer=null;
function segurarCena(camada){
  const palco=camada&&camada.querySelector('.splash');
  if(!palco||cenaSolta||!window.HBXAndroid) return;
  cenaPresa=palco;
  palco.classList.add('cena-presa');
  clearTimeout(cenaEsperaTimer);
  cenaEsperaTimer=setTimeout(soltarCena,CENA_ESPERA_TETO);
}
function soltarCena(){
  clearTimeout(cenaEsperaTimer);
  if(cenaSolta) return;
  cenaSolta=true;
  if(cenaPresa) cenaPresa.classList.remove('cena-presa');
  cenaPresa=null;
  aberturaEm=performance.now();   // o piso conta de agora, não de antes da cortina
}
/** o aparelho avisa aqui quando a cortina saiu e o app está NA TELA */
window.HBXCenaComeca=soltarCena;

/* ==========================================================================
   🔴 A ABERTURA ENTREGA O APP QUANDO O APP ESTÁ PRONTO — não num relógio cego
   (dono, 09/08, no g15: *"o HBX na hora q sobe para a tela está até ok, mas ele
   sempre trava, pq o celular está carregando tudo as coisas enquanto funciona"*
   · *"aparece o HBX no começo, aguarda realmente ter carregado tudo a entrada,
   aí sim acontece o efeito"*).

   O que havia aqui era `clearTimeout` + `setTimeout(3400)` DENTRO do `pintar` —
   ou seja, cada repinte que chegasse durante a abertura reiniciava a contagem.
   Dois defeitos num só: a saída não tinha hora (dado que chega tarde empurrava
   a abertura) e, quando saía, saía no meio do carregamento — o logo voava pro
   cabeçalho enquanto o aparelho ainda montava mapa, e é isso que trava.

   Agora são TRÊS coisas, e as três precisam ser verdade:
   · PISO (3,4 s): a cena inteira — rota, cometa, marca, brilho e batida. Cortar
     antes é jogar fora a única animação que o motorista assiste inteira.
   · PRONTO: quem carrega avisa (`window.aberturaPronta()`). No mock não existe
     ponte, então o piso já vale como pronto — o desenho continua se explicando
     sozinho.
   · TETO (7 s): rede ruim, GPS mudo, tile que não chega. O relógio nunca falha,
     e app que não abre é pior que app que abre sem o mapa pronto.
   ========================================================================== */
const ABERTURA_PISO=3400, ABERTURA_TETO=7000;
let aberturaEm=0, aberturaOk=false, aberturaSaiu=false;
function armarAbertura(){
  if(aberturaEm) return;              // o relógio é UM, e ele não reinicia
  aberturaEm=performance.now();
  const olhar=()=>{
    if(aberturaSaiu || atual!=='entrada') return;
    const dt=performance.now()-aberturaEm;
    if(dt>=ABERTURA_TETO || (dt>=ABERTURA_PISO && aberturaOk)){ aberturaSaiu=true; ir('rota'); return; }
    aberturaTimer=setTimeout(olhar,120);
  };
  aberturaTimer=setTimeout(olhar,ABERTURA_PISO);
}
/** a ponte avisa aqui quando dado, mapa e primeiro fix estão na mão */
window.aberturaPronta=function(){ aberturaOk=true; };
/* Sem ponte (o mock aberto no navegador) ninguém avisa — e o desenho não pode
   ficar preso na primeira tela até o teto. O piso responde por ele.
   🔴 A PERGUNTA É O PROTOCOLO, NÃO `window.HBX`: o `native.js` cria o `HBX` no
   evento de load, DEPOIS desta folha rodar — perguntar por ele aqui devolveria
   "não tem ponte" dentro do próprio aplicativo, e a abertura voltaria a sair
   cega. Mock aberto à mão é `file:`; app e bancada são http(s). */
if(location.protocol==='file:') aberturaOk=true;
let aberturaTimer=null;
let anterior=null;
function ir(k){
  if(!T[k] || k===atual) return;
  // ITEM 9 — MÓDULO DESLIGADO NÃO ABRE NEM POR ROTA DIRETA. Tirar o botão da
  // barra não basta: sobra o atalho de outra tela, o `data-tela` do rail e o
  // arrastar. A recusa mora AQUI, na única porta por onde toda tela entra.
  if(moduloDesligado(k)) return;
  const dir = ORDEM.indexOf(k) >= ORDEM.indexOf(atual) ? 1 : -1;
  anterior=atual; atual=k; pintar(true,dir);
}

/* ==========================================================================
   ARRASTAR PRA TROCAR DE MÓDULO — item 1 do dono (07/08):
   *"arrastar pra direita e esquerda muda de módulo? O MAPA NÃO RECEBE ESSA
   TRATATIVA"*.

   Quem escuta o dedo é o `native.js` (ele já tem a lista do que NÃO pega:
   campo de texto, folha, modal, chips e — o que importa aqui — o mapa). Quem
   decide PRA ONDE vai é esta função, porque só a casca sabe a ordem da barra
   e o que o admin desligou.

   🔴 SÓ ANDA ONDE EXISTE BARRA. O módulo da vez não é a `atual` (a tela
   `venda` é do módulo "rota", a `ficha` é de "clientes"...): é o botão ACESO
   da barra desta tela. E tela sem barra — a navegação em tela cheia, a
   abertura — não anda de jeito nenhum, que é o pedido do dono sobre o mapa
   dito de outro jeito: lá não existe barra pra arrastar.

   🔴 PULA O QUE ESTÁ DESLIGADO. Com Produtos off, de Rota o arrastar vai
   direto pro Chat — `navLigados()` é a MESMA lista que desenhou a barra, então
   o dedo nunca cai num módulo que o motorista não pode ver.
   ========================================================================== */
function arrastarModulo(passo){
  const camadas=document.querySelectorAll('#app .tela');
  const viva=camadas.length?camadas[camadas.length-1]:null;
  const aceso=viva?viva.querySelector('.nav button.on'):null;
  if(!aceso) return;                                  // sem barra, sem gesto
  const ligados=navLigados().map(([k])=>k);
  const i=ligados.indexOf(aceso.dataset.nav);
  if(i<0) return;
  const alvo=ligados[(i+(passo>0?1:-1)+ligados.length)%ligados.length];
  if(alvo && alvo!==aceso.dataset.nav) ir(alvo);
}

/* O admin pode desligar o módulo que o motorista está OLHANDO — a config chega
   depois, no meio do turno. A tela continua pintada e a barra fica sem nenhum
   botão aceso: o motorista dentro de um cômodo cuja porta acabou de ser
   murada, sem arrastar e sem aba pra voltar. Devolve pra Rota, que nunca
   fecha. Quem chama é a ponte, logo depois de escrever a config na barra. */
function resgatarModuloDesligado(){
  const camadas=document.querySelectorAll('#app .tela');
  const viva=camadas.length?camadas[camadas.length-1]:null;
  const barra=viva?viva.querySelector('.nav'):null;
  if(barra && !barra.querySelector('button.on')) ir('rota');
}

/* ==========================================================================
   AVISOS — o cartão não "aparece", ele CHEGA. Um por vez: aviso empilhado é
   ruído, e quem está dirigindo lê UM.
   ========================================================================== */
const AVISOS={
  recado:{ico:'chat', cls:'', titulo:'Recado da Central', sub:'Passa no Mercado Estrela antes das 11h'},
  ok:{ico:'check', cls:'ok', titulo:'Entrega confirmada', sub:'Maria Aparecida · R$ 21,00 em dinheiro'},
  falta:{ico:'alert', cls:'alerta', titulo:'Falta 1 produto na carga', sub:'Mercadinho Bom Preço · 20L x4'},
};
let avisoTimer=null;

/** Distância de um elemento até a camada, somando os pais posicionados. */
function posNaCamada(el,camada){
  let x=0,y=0,n=el;
  while(n && n!==camada){ x+=n.offsetLeft; y+=n.offsetTop; n=n.offsetParent; }
  return {x,y};
}
/** Centro do sino, em coordenadas do próprio cartão de aviso. */
function origemDoSino(aviso,botao,camada){
  const b=posNaCamada(botao,camada), a=posNaCamada(aviso,camada);
  return `${(b.x+botao.offsetWidth/2-a.x).toFixed(1)}px ${(b.y+botao.offsetHeight/2-a.y).toFixed(1)}px`;
}

function avisar(tipo){
  // 🔴 A CAMADA VIVA É A ÚLTIMA — mesma lei do `portao`. Com `querySelector` (a
  // primeira) o aviso nascia na camada que estava MORRENDO numa troca de tela e
  // sumia junto com ela. Na maquete isso nunca aparecia (a demo dispara parado);
  // no app o recado chega JUSTO quando o motorista acabou de trocar de tela.
  const camadas=document.querySelectorAll('#app .tela');
  const camada=camadas.length?camadas[camadas.length-1]:null; if(!camada) return;
  // chave do catálogo OU um aviso montado na hora — mesmo contrato do `portao`.
  // O app precisa dizer o texto DE VERDADE ("Recado da Central" com a frase que
  // o escritório escreveu), e texto de verdade não cabe num catálogo estático.
  const cfg=typeof tipo==='object'&&tipo?tipo:(AVISOS[tipo]||AVISOS.recado);
  camada.querySelector('.aviso')?.remove();
  clearTimeout(avisoTimer);
  const el=document.createElement('div');
  el.className='aviso '+(cfg.cls||'');
  el.innerHTML=`<span class="ico">${ic(cfg.ico||'chat',17)}</span>
    <span><strong>${cfg.titulo||''}</strong><span class="sub">${cfg.sub||''}</span></span>
    <span class="barra"><i></i></span>`;
  camada.appendChild(el);
  // o sino acende junto: selo pulsa e sai um anel do botão. Sem isso o aviso
  // parece ter vindo do nada — e é a origem que convence numa demonstração.
  const selo=camada.querySelector('.round .cnt');
  const botao=selo?selo.parentElement:null;
  // A origem da escala é MEDIDA no sino, não chutada em porcentagem: o botão
  // muda de lugar entre telas (com e sem o balão de conversa ao lado), e origem
  // errada faz o cartão nascer do lugar errado — que é justo o que se vê.
  //
  // 🔴 Medir com getBoundingClientRect AQUI dá número errado por dois motivos:
  // a caixa já está DENTRO da animação (nasce em 16% do tamanho) e o quadro
  // inteiro tem `zoom`. Posição de layout (offset*) não sofre nenhum dos dois.
  if(botao) el.style.setProperty('--origem', origemDoSino(el,botao,camada));
  if(selo){ selo.classList.remove('pulsa'); void selo.offsetWidth; selo.classList.add('pulsa'); }
  if(botao){ botao.classList.remove('tocou'); void botao.offsetWidth; botao.classList.add('tocou'); }
  avisoTimer=setTimeout(()=>{ el.classList.add('sai'); setTimeout(()=>el.remove(),280); },3400);
}

/* ==========================================================================
   ERRO e CONFIRMAÇÃO — as duas superfícies que costumam nascer secas no
   código. Aqui elas têm entrada, saída e regra de fechamento, como o resto.
   ========================================================================== */
function fechar(wrap){
  const peca=wrap.firstElementChild;
  peca.classList.add('saindo');
  wrap.style.animation='mvScrim 200ms ease-in reverse both';
  setTimeout(()=>wrap.remove(),210);
}
function erro(){
  const camada=document.querySelector('#app .tela'); if(!camada) return;
  camada.querySelector('.erro-wrap')?.remove();
  const w=document.createElement('div');
  w.className='erro-wrap';
  w.innerHTML=`<div class="erro">
    <span class="ico">${ic('alert',22)}</span>
    <strong>Não deu pra iniciar a rota</strong>
    <span class="sub">Sem internet agora. A rota fica guardada.</span>
    <span class="acoes"><button data-fechar="1">Fechar</button>
      <button class="principal" data-fechar="1">Tentar de novo</button></span>
  </div>`;
  camada.appendChild(w);
}
/* ==========================================================================
   PORTÕES — catálogo. Cada um é uma cena que o app tem hoje e que precisa
   existir no front novo, senão vira `alert()` na hora de refatorar.
   ========================================================================== */
const PORTOES={
  enderecos:{tom:'alerta',ico:'gps',titulo:'3 endereços com erro',
    sub:'Toque na linha pra corrigir. Enquanto houver erro, a rota não monta — de propósito.',
    corpo:`
      <div class="pt-linha"><span class="m">${ic('alert',13)}</span>
        <span><strong>Larissa Ypê</strong><span>sem número</span></span>${ic('chev',15)}</div>
      <div class="pt-linha"><span class="m">${ic('alert',13)}</span>
        <span><strong>Mercado Estrela</strong><span>CEP não bate com a rua</span></span>${ic('chev',15)}</div>
      <div class="pt-linha"><span class="m">${ic('alert',13)}</span>
        <span><strong>Bar do Zé</strong><span>não sei onde fica este endereço</span></span>${ic('chev',15)}</div>`,
    acoes:[['Remover da rota',''],['Remover do dia','perigo']]},

  creditos:{tom:'trava',ico:'card',titulo:'Créditos acabaram',
    sub:'Sem crédito a rota não inicia. As entregas de hoje continuam guardadas.',
    corpo:`<div class="pt-nums"><div><b>0</b><small>créditos</small></div>
      <div><b>12</b><small>a debitar</small></div><div><b>14</b><small>paradas</small></div></div>`,
    acoes:[['Fechar',''],['Recarregar','principal']]},

  update:{tom:'info',ico:'download',titulo:'Versão nova disponível',
    sub:'beta1.3.3 · 2,3 MB. Corrige o aviso de chegada e o fechamento de sábado.',
    acoes:[['Agora não',''],['Atualizar','azul']]},

  updateObrig:{tom:'trava',ico:'download',titulo:'Atualização obrigatória',
    sub:'Esta versão não fala mais com o servidor. Atualize pra continuar o dia.',
    acoes:[['Atualizar agora','principal']],semFechar:1},

  ddd:{tom:'alerta',ico:'phone',titulo:'Falta o DDD',
    sub:'O número da Maria Aparecida está sem DDD. Sem ele o WhatsApp não abre.',
    corpo:`<div class="pt-campo"><input value="19"><span class="resto">99812-4477</span></div>`,
    acoes:[['Deixar assim',''],['Salvar','principal']]},

  longe:{tom:'alerta',ico:'route',titulo:'Longe do ponto de partida',
    sub:'Você está a 8,7 km da primeira parada. Iniciar assim conta a rota inteira.',
    acoes:[['Cancelar',''],['Iniciar mesmo assim','principal']]},

  fora:{tom:'alerta',ico:'gps',titulo:'Entrega fora da rota de hoje',
    sub:'Mercado São Judas não está no dia. Ela entra como parada avulsa e conta no fechamento.',
    acoes:[['Cancelar',''],['Entregar assim','principal']]},

  // Portão só informativo: o único botão É a saída, mesmo com cara de ação.
  // Por isso o escape vem MARCADO, não deduzido da cor — cor é aparência.
  preco:{tom:'info',ico:'lock',titulo:'Preço bloqueado',
    sub:'Quem muda preço é o escritório, no computador. Aqui o valor vem do catálogo.',
    acoes:[['Entendi','principal',true]]},
};
function portao(chave){
  // chave do catálogo OU um portão montado na hora (o app precisa dizer número
  // de verdade: "vai debitar 12, você tem 240" não cabe num catálogo estático).
  const p=typeof chave==='object'?chave:PORTOES[chave]; if(!p) return;
  // 🔴 A CAMADA VIVA É A ÚLTIMA — mesma lei do `pintar`. Com `querySelector`
  // (a primeira) o portão nascia na camada que estava MORRENDO numa troca de
  // tela: o diálogo sumia junto com ela e o toque no "Iniciar" fechava tudo
  // em silêncio — era o "Iniciar rota falha calado" do dono (07/08).
  const camadas=document.querySelectorAll('#app .tela');
  const camada=camadas.length?camadas[camadas.length-1]:null; if(!camada) return;
  camada.querySelector('.portao-wrap')?.remove();
  const w=document.createElement('div');
  w.className='portao-wrap';
  /* 🔴 DESTRUTIVO NÃO É O BOTÃO VERDE — NEM AQUI DENTRO (dono, lei do dock;
     medido em 09/08). O rodapé já obedecia: "Cancelar rota" é satélite vermelho.
     Mas o PORTÃO que ele abre pintava o "Cancelar rota" de VERDE, porque todo
     `principal` é verde nesta folha — o mesmo verde do "Iniciar" que estava ali
     três segundos antes, no mesmo lugar da tela. No teste ao vivo eu cancelei a
     rota do dono TRÊS vezes sem querer por causa disso, e o log do servidor
     provou (`rota encerrada` × 3). `perigo` troca só a COR do principal: a
     CLASSE continua `principal` porque a ponte pendura o listener nela
     (`naCamada('.portao-wrap .principal')`) — mudar o nome mataria o "sim". */
  w.innerHTML=`<div class="portao ${p.tom}${p.perigo?' perigo':''}">
    <span class="ico">${ic(p.ico,22)}</span>
    <h3>${p.titulo}</h3>${p.sub?`<span class="sub">${p.sub}</span>`:''}
    ${p.corpo?`<div class="corpo">${p.corpo}</div>`:''}
    <div class="acoes ${p.classe||(p.acoes.length===2?'duas':'')}">
      ${p.acoes.map(([t,c,marcado,acaoPropria])=>{
        // ESCAPE ≠ AÇÃO. "Agora não", "Cancelar", "Fechar" são escapes: saem sem
        // resolver. O botão principal fecha porque RESOLVE. Portão obrigatório
        // não tem escape — sobra só a ação, e é isso que o prende ali.
        const escape = marcado!==undefined ? marcado : (c!=='principal' && c!=='azul');
        /* 🔴 PORTÃO QUE PERGUNTA PRECISA QUE O "SIM" FAÇA ALGO (08/08). Até
           aqui todo botão só FECHAVA — servia pro portão que avisa, não pro que
           decide ("Já tem cliente nesta porta · Cadastrar assim"). `acaoPrincipal`
           dá um `data-acao` ao botão principal: o portão fecha (o `data-fechar`
           continua) e a ação corre por cima. Sem isto o "sim" era botão morto —
           a mesma doença do sino que não abria nada. */
        /* 🔴 E QUANDO O PORTÃO É UMA ESCOLHA, CADA BOTÃO TEM O SEU DESTINO
           (10/08). O `acaoPrincipal` resolve o portão que PERGUNTA (um sim, um
           não); não resolve o que OFERECE — "Registrar local" abre três portas
           e nenhuma delas é "a principal". O 4º campo da ação dá `data-acao`
           a QUALQUER botão. É aditivo: quem passa três campos (todos os
           portões de antes) continua byte a byte igual. */
        const acao = acaoPropria ? ` data-acao="${acaoPropria}"`
          : ((c==='principal'&&p.acaoPrincipal) ? ` data-acao="${p.acaoPrincipal}"` : '');
        return `<button class="${c}" data-fechar="1"${escape?' data-escape="1"':''}${acao}>${t}</button>`;
      }).join('')}
    </div></div>`;
  camada.appendChild(w);
}
/** Leva o portão aberto pra camada nova de um repinte — ver a nota no `pintar`.
 *  MOVE o nó (os ouvintes vão junto) e desliga a entrada dele, que já rodou. */
function remontarPortao(nova,wrap){
  if(!wrap) return;
  wrap.classList.add('remontado');
  nova.appendChild(wrap);
}

/* ==========================================================================
   OS GESTOS DA LISTA, de verdade — na LISTA DE PARADAS, não numa maquete. Um
   ponteiro só (pointer events) atende dedo e mouse. Três gestos (dono, 08/08):
   · PUNHO (coluna esquerda inteira) — arrasta NA HORA, sem espera.
   · SEGURAR o cartão parado — LEVANTA pra arrastar (Keep/Spotify).
   · DESLIZAR o cartão pra ESQUERDA — retirar da rota (o excluir morava no
     segurar; segurar virou arrastar, então o excluir mudou de gesto, não de
     peso: continua PERGUNTANDO antes de apagar).

   🔴 A TELA QUE ENSINAVA O GESTO SAIU; O GESTO NÃO. Ele só trocou de
   endereço: quem liga é a marca `data-gestos` na lista, e não mais o nome de
   uma tela de demonstração. Toda lista que DESENHA o punho tem que RESPONDER
   ao punho — punho decorativo é casca mentindo pro dedo.
   ========================================================================== */
function ligarGestos(camada){
  camada.querySelectorAll('[data-gestos]').forEach(lista=>ligarLista(camada,lista));
}
function ligarLista(camada,lista){
  // 950ms era o tempo do EXCLUIR (que hoje é deslize); levantar pra arrastar
  // pede menos dedo parado — 380ms é o "pegar" dos apps de lista do mercado.
  // 64px de deslize = o MESMO limiar do troca-módulo no native.js: o dedo
  // aprende UMA distância. 12px de tolerância seguem os números do app.
  const LEVANTA=380, TOLERANCIA=12, LIMIAR=64;

  /* Só o NÚMERO da parada renumera. A hora ao lado é ETA — quem recalcula é o
     servidor, e casca que inventa horário mente com cara de dado. */
  function renumerar(){
    [...lista.querySelectorAll('.stop')].forEach((el,i)=>{
      const n=el.querySelector('.num'); if(n) n.textContent=i+1;
    });
  }

  /* 🔴 MUDOU A ORDEM, O CONECTOR DE PERNA MORRE. "850 m · 4 min" é a distância
     até o vizinho de CIMA: o arrasto move o cartão e deixa a pílula onde
     estava, então ela passa a falar de dois clientes que não são mais vizinhos.
     Mesma lei da hora — a casca não RECALCULA distância —, mas aqui ela pode
     APAGAR, e apagar é obrigação: número errado na tela é pior que número
     nenhum. O conector volta inteiro no repinte que o servidor confirmar.
     Só quando a ordem MUDOU de verdade: pegar e soltar no mesmo lugar não pode
     comer os trechos certos que já estavam ali. */
  function apagarPernas(){
    lista.querySelectorAll('.perna').forEach(el=>el.remove());
  }

  /* 🔴 O CARTÃO NÃO É VIZINHO DO CARTÃO — TEM UMA PERNA NO MEIO (dono, 09/08:
     *"montagem de rota — estou movendo de lugar na tela e não realoca"*).
     Desde que a montagem ganhou o conector, a lista é perna-cartão-perna-cartão:
     o `previousElementSibling` de um `.stop` é a PERNA, e o teste de vizinhança
     reprovava SEMPRE — o cartão subia no dedo, voltava pro lugar e nunca trocava
     de posição. Mesma doença na rota EM CURSO, que também desenha perna.
     Quem procura vizinho, então, PULA o que não é cartão. */
  const ehStop=el=>!!el&&el.classList.contains('stop');
  function vizinhoStop(el,cima){
    let p=cima?el.previousElementSibling:el.nextElementSibling;
    while(p&&!ehStop(p)) p=cima?p.previousElementSibling:p.nextElementSibling;
    return p;
  }
  /* …E QUEM ANDA É O BLOCO, NUNCA O CARTÃO SOZINHO. A perna nasce ANTES do
     cartão dela (`${perna(p.perna)}${stop(p)}`): mover só o cartão deixaria a
     perna órfã no meio de dois clientes que não são mais aqueles. */
  const pernaDe=el=>{
    const p=el.previousElementSibling;
    return (p&&p.classList.contains('perna'))?p:null;
  };

  /* 🔴 O GESTO ANUNCIA; QUEM GRAVA É A PONTE. A casca não conhece servidor —
     ela conta o que o dedo fez e pergunta se alguém assume. `preventDefault`
     do ouvinte = "assumi": daí em diante a casca NÃO mexe mais no DOM, porque
     a lista volta a ser desenhada pelo dado que o servidor confirmar. Ninguém
     assumindo (esta folha aberta no navegador) = maquete, e a maquete segue se
     comportando como sempre — é o que mantém o mock testável sozinho.
     Mesmo par de eventos de documento que o resto da casa já usa (`hbx:theme`,
     `hbx:push-wake`): contrato é o NOME do evento, nunca uma função global. */
  function anunciar(nome,detalhe){
    return !document.dispatchEvent(new CustomEvent(nome,{detail:detalhe,cancelable:true}));
  }

  /* Só parada com id REAL viaja. O cartão de maquete nasce sem `data-parada`
     (o `stop()` só põe o gancho quando o dado é do servidor) e a lista da
     MONTAGEM é prévia de CLIENTE — a entrega nem existe ainda. Lista sem id
     não tem o que gravar: lá o gesto continua só visual, e isso é a verdade
     da tela, não um esquecimento. */
  const idsNaOrdem = () => [...lista.querySelectorAll('.stop')]
    .map(el=>el.dataset.parada||'').filter(Boolean);

  /* 🔴 …MAS A MONTAGEM TAMBÉM PRECISA CONTAR (08/08). Sem id de entrega o
     anúncio nunca saía dali, e o arrasto da prévia ficava só no DOM até alguém
     apertar "Montar rota": qualquer repinte no meio — um fix de GPS chegando da
     garagem, a troca de espaço no seletor — desfazia a decisão do dedo em
     silêncio. `data-previa` é a POSIÇÃO de origem do cartão, carimbada pela
     ponte, e viaja junto porque o arrasto MOVE o nó em vez de redesenhar. */
  const posicoesDaPrevia = () => [...lista.querySelectorAll('.stop[data-previa]')]
    .map(el=>el.dataset.previa).filter(v=>v!=null&&v!=='');

  /* O gesto abriu porta (arrastou ou armou)? Então o TOQUE não vale. Sem isto
     o `pointerup` vira `click` e a MESMA parada que o dedo acabou de mover (ou
     de mandar retirar) abre a folha dela por cima. Captura, uma vez só: quem
     ouve `data-acao` é o documento, na subida, e aí já está engolido. */
  function engolirToque(item){
    item.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();},{capture:true,once:true});
  }

  /* Quem ROLA por baixo da lista — pra rolagem automática na borda e pra
     TRAVAR a rolagem nativa enquanto um cartão está no dedo. Todos os
     roláveis, não só o primeiro: escondido um, o navegador pega o próximo. */
  function roladores(){
    const rs=[];
    for(let p=lista.parentElement;p;p=p.parentElement){
      if(p.scrollHeight>p.clientHeight+4){
        const o=getComputedStyle(p).overflowY;
        if(o==='auto'||o==='scroll') rs.push(p);
      }
    }
    return rs;
  }

  // ---- ARRASTAR (pelo punho na hora; pelo cartão, depois do segurar) --------
  function arrastar(item,ev,travarRolagem){
    ev.preventDefault&&ev.preventDefault();
    // A ordem de ANTES, medida no começo do gesto: é ela que diz, no fim, se o
    // dedo realmente mudou alguma coisa. Sem esta marca todo toque no punho
    // viraria uma gravação — inclusive pegar e soltar no mesmo lugar.
    const ordemAntes=idsNaOrdem().join('|');
    const previaAntes=posicoesDaPrevia().join('|');
    const rolos=roladores(), rolo=rolos[0]||null;
    // O punho tem touch-action:none; o CARTÃO não (ele precisa deixar a lista
    // rolar). Quando o arrasto nasce do segurar, o 1º movimento vertical faria
    // o navegador roubar o gesto (pointercancel) — então trava-se a rolagem
    // nativa enquanto durar. overflow:hidden não barra rolagem por SCRIPT: a
    // automática da borda continua funcionando por baixo da trava.
    const antes=travarRolagem?rolos.map(r=>r.style.overflowY):null;
    if(travarRolagem) rolos.forEach(r=>r.style.overflowY='hidden');
    if(navigator.vibrate) navigator.vibrate(20);   // "peguei" — o dedo sente na hora
    const y0=ev.clientY; let base=0, rolou=0, dedoY=ev.clientY, andou=false, vivo=true;
    // capturar o ponteiro é o que faz o dedo não "escapar" do cartão no meio do
    // arrasto — mas falha quando o ponteiro não está ativo (e derruba o resto
    // do gesto junto). Vai protegido: sem captura o arrasto ainda funciona.
    try{ item.setPointerCapture(ev.pointerId); }catch(e){}
    item.classList.add('arrastando');
    // dy em espaço de LISTA: o que o dedo andou MAIS o que a lista rolou por
    // baixo — sem o `rolou`, a rolagem automática deixava o cartão pra trás.
    const aplicar=()=>{
      let dy=dedoY-y0+rolou-base;
      if(Math.abs(dy)>3) andou=true;
      const cima = dy<0;
      const vizinho = vizinhoStop(item,cima);
      /* Troca quando passa de 60% do PASSO — e o passo é a distância REAL entre
         os dois cartões (cartão + perna + respiro), não a altura seca do
         vizinho: com a perna no meio, a altura seca pedia um dedo mais longo do
         que o olho enxerga. `offsetTop` é layout puro — o transform do arrasto
         não mexe nele. Abaixo disso é tremor. */
      const passo = vizinho ? (Math.abs(vizinho.offsetTop-item.offsetTop)||vizinho.offsetHeight) : 0;
      if(vizinho && passo && Math.abs(dy)>passo*.6){
        /* 🔴 O SALTO SE MEDE, NÃO SE ADIVINHA. "A altura do vizinho" só era o
           tanto que o cartão andava numa lista de cartões iguais e colados; com
           perna no meio (e cartões de alturas diferentes) ela errava e o cartão
           dava um pulo a cada troca. Mede-se o `offsetTop` antes e depois — o
           que sobra é exato em qualquer lista. */
        const antesTop=item.offsetTop;
        const meuPar=pernaDe(item), parDele=pernaDe(vizinho);
        if(cima){
          const alvo=parDele||vizinho;
          if(meuPar) lista.insertBefore(meuPar,alvo);
          lista.insertBefore(item,alvo);
        }else{
          const alvo=meuPar||item;
          if(parDele) lista.insertBefore(parDele,alvo);
          lista.insertBefore(vizinho,alvo);
        }
        base+=item.offsetTop-antesTop; dy=dedoY-y0+rolou-base;
      }
      item.style.transform=`translateY(${dy}px) scale(1.015)`;
    };
    // Rolagem AUTOMÁTICA na borda: cartão no dedo perto do topo/pé, a lista
    // anda sozinha (quanto mais fundo na borda, mais rápido). Sem isto, mover
    // uma parada 40 posições numa lista de 50 obrigava soltar no meio.
    const BORDA=64, VEL=13;
    (function quadro(){
      if(!vivo) return;
      if(rolo){
        const r=rolo.getBoundingClientRect(); let v=0;
        if(dedoY<r.top+BORDA) v=-Math.ceil((r.top+BORDA-dedoY)/BORDA*VEL);
        else if(dedoY>r.bottom-BORDA) v=Math.ceil((dedoY-(r.bottom-BORDA))/BORDA*VEL);
        if(v){
          const marca=rolo.scrollTop;
          rolo.scrollTop=marca+v;
          const real=rolo.scrollTop-marca;
          if(real){ rolou+=real; aplicar(); }
        }
      }
      requestAnimationFrame(quadro);
    })();
    const mover=e=>{ dedoY=e.clientY; aplicar(); };
    // 🔴 NO DEDO, QUEM DIRIGE É O TOQUE, NÃO O PONTEIRO (medido no aparelho,
    // 08/08): o cartão é touch-action:pan-y, e no 1º movimento vertical o
    // WebView toma o gesto pra "rolar" e dispara POINTERCANCEL — mesmo com a
    // rolagem travada (a trava impede a tela de andar, não o sequestro). Só
    // que os TOUCHMOVE continuam pingando durante o gesto sequestrado: então
    // o dedo entra por eles, e o pointercancel de toque é IGNORADO. Mouse não
    // tem sequestro — segue no fluxo de ponteiro.
    const dedo=ev.pointerType!=='mouse';
    const moverToque=e=>{
      if(!e.touches||!e.touches[0]) return;
      dedoY=e.touches[0].clientY; aplicar();
      if(e.cancelable) e.preventDefault();
    };
    const soltar=()=>{
      if(!vivo) return;                 // toque e ponteiro terminam os dois: só o 1º vale
      vivo=false;
      if(travarRolagem) rolos.forEach((r,i)=>{ r.style.overflowY=antes[i]; });
      item.classList.remove('arrastando');
      item.style.transform=''; renumerar();
      /* 🔴 O DEDO MANDOU — ALGUÉM TEM QUE GRAVAR. Enquanto este anúncio não
         existiu, arrastar era TEATRO: o DOM mudava, o servidor não sabia de
         nada e o primeiro repinte devolvia a ordem antiga (provado reiniciando
         o app). Só anuncia quando a ordem MUDOU: soltar no mesmo lugar não é
         ordem nova, e gravar à toa é ida ao servidor no meio da rua. */
      const ids=idsNaOrdem();
      if(ids.length>1&&ids.join('|')!==ordemAntes){ apagarPernas(); anunciar('hbx:ordem',{ids}); }
      // Lista sem id de entrega (a MONTAGEM) fala por posição — mesmo evento,
      // outra chave, porque quem grava é o mesmo ouvinte.
      else{
        const pos=posicoesDaPrevia();
        if(pos.length>1&&pos.join('|')!==previaAntes){ apagarPernas(); anunciar('hbx:ordem',{previa:pos}); }
      }
      if(andou) engolirToque(item);
      item.removeEventListener('pointermove',mover);
      item.removeEventListener('pointerup',soltar);
      item.removeEventListener('pointercancel',cancelou);
      item.removeEventListener('touchmove',moverToque);
      item.removeEventListener('touchend',soltar);
      item.removeEventListener('touchcancel',soltar);
    };
    const cancelou=e=>{ if(e.pointerType!=='touch') soltar(); };
    item.addEventListener('pointermove',mover);
    item.addEventListener('pointerup',soltar);
    item.addEventListener('pointercancel',cancelou);
    if(dedo){
      item.addEventListener('touchmove',moverToque,{passive:false});
      item.addEventListener('touchend',soltar);
      item.addEventListener('touchcancel',soltar);
    }
  }

  // ---- O CARTÃO: segurar LEVANTA pra arrastar, deslizar pra esquerda RETIRA -
  function cartao(item,ev){
    const x0=ev.clientX, y0=ev.clientY;
    let deslizando=false, dedoX=x0, dedoY=y0;
    const relogio=setTimeout(()=>{
      // dedo PARADO no cartão o tempo do LEVANTA: vira arrasto, com a vibrada
      // mais longa do "peguei de verdade". O toque depois disso não vale mais.
      largar();
      engolirToque(item);
      if(navigator.vibrate) navigator.vibrate(45);
      arrastar(item,{clientY:dedoY,pointerId:ev.pointerId,pointerType:ev.pointerType},ev.pointerType!=='mouse');
    },LEVANTA);
    const mexeu=e=>{
      dedoX=e.clientX; dedoY=e.clientY;
      const dx=dedoX-x0, dy=dedoY-y0;
      if(deslizando){
        // o cartão acompanha o dedo (só pra esquerda, com batente) e a tinta
        // vermelha cresce na proporção; no limiar, vibra e fica "pronto".
        item.style.transform=`translateX(${Math.max(Math.min(0,dx),-110)}px)`;
        item.style.setProperty('--puxa',String(Math.min(1,-dx/LIMIAR)));
        const passou=-dx>=LIMIAR;
        if(passou&&!item.classList.contains('pronto')&&navigator.vibrate) navigator.vibrate(25);
        item.classList.toggle('pronto',passou);
        return;
      }
      if(Math.abs(dx)>TOLERANCIA||Math.abs(dy)>TOLERANCIA){
        clearTimeout(relogio);
        // esquerda com folga sobre o vertical = retirar; o resto é rolagem do
        // navegador (vertical) ou nada (direita) — e o segurar já desarmou.
        if(dx<0&&Math.abs(dx)>Math.abs(dy)*1.2){
          deslizando=true;
          try{ item.setPointerCapture(ev.pointerId); }catch(err){}
        } else largar();
      }
    };
    const soltou=e=>{
      if(deslizando){
        const dx=dedoX-x0;
        engolirToque(item);
        item.style.transition='transform .15s';
        item.style.transform=''; item.style.removeProperty('--puxa');
        setTimeout(()=>{ item.style.transition=''; },160);
        // pointercancel/pointerleave é gesto ABORTADO — nunca pergunta.
        if(e.type==='pointerup'&&-dx>=LIMIAR) perguntarExclusao(item);
        else item.classList.remove('pronto');
      }
      largar();
    };
    function largar(){
      clearTimeout(relogio);
      item.removeEventListener('pointermove',mexeu);
      item.removeEventListener('pointerup',soltou);
      item.removeEventListener('pointercancel',soltou);
      item.removeEventListener('pointerleave',soltou);
    }
    item.addEventListener('pointermove',mexeu);
    item.addEventListener('pointerup',soltou);
    item.addEventListener('pointercancel',soltou);
    item.addEventListener('pointerleave',soltou);
  }

  // Exclusão de peso PERGUNTA — o gesto abre a porta, não apaga sozinho.
  function perguntarExclusao(item){
    const nome=item.querySelector('.who strong').textContent;
    const w=document.createElement('div');
    w.className='conf-wrap';
    w.innerHTML=`<div class="conf"><strong>Retirar ${nome} da rota?</strong>
      <span class="sub">Sai da rota de hoje.</span>
      <span class="acoes"><button data-nao="1" data-escape="1">Não</button>
        <button class="principal" data-sim="1">Retirar</button></span></div>`;
    camada.appendChild(w);
    w.addEventListener('click',e=>{
      if(e.target.closest('[data-sim]')){
        /* 🔴 SEM FONTE NADA SOME. A casca só apaga o cartão quando NINGUÉM
           assume o fio (esta folha no navegador). Com a ponte ouvindo, quem
           tira a parada da lista é o dado que o SERVIDOR confirmar — apagar
           antes da resposta perde a parada na tela se a rede cair no meio, e
           o motorista fica sem saber se retirou ou não. */
        const id=item.dataset.parada||'';
        if(!(id&&anunciar('hbx:retirar',{id,nome}))){
          item.style.transition='opacity .2s, transform .2s';
          item.style.opacity='0'; item.style.transform='translateX(-30px)';
          // Sai um cliente do meio ⇒ os trechos vizinhos deixam de ser
          // verdade, mesma razão do arrasto acima.
          setTimeout(()=>{item.remove();renumerar();apagarPernas();},210);
        }
      } else if(!e.target.closest('[data-nao]')) return;
      item.classList.remove('pronto');
      fechar(w);
    });
  }

  lista.addEventListener('pointerdown',ev=>{
    const item=ev.target.closest('.stop'); if(!item||!lista.contains(item)) return;
    if(ev.target.closest('.grip')) arrastar(item,ev,false);    // punho: pega na hora
    else cartao(item,ev);                          // cartão: segurar levanta, deslizar retira
  });
}

/* ==========================================================================
   A AULA DA TELA — a lâmpada do cabeçalho.

   🔴 A AULA APONTA PRO ELEMENTO DE VERDADE, nunca descreve a tela por escrito.
   Manual em texto separado envelhece calado: muda o botão, o manual continua
   dizendo a frase antiga e ninguém descobre. Aqui cada passo é um SELETOR — se
   a peça sumir da tela, o passo some junto e o console grita (mesma lei do
   ícone inexistente que virou caixa vermelha).

   🔴 A AULA NÃO APERTA BOTÃO — e continua não apertando. Este app tem rota
   viva e dinheiro na tela; quem faz é sempre o motorista. O que mudou em 09/08
   é que o motorista agora pode fazer DENTRO da lição: no passo `fazer` o furo
   abre passagem e é o dedo DELE, no botão de verdade, que anda o passo. A lei
   virou freio, não sumiu — ver `tourSoMostrar` lá embaixo.

   Teto de 4 passos por tela, de propósito: tela que precisa de mais é tela mal
   desenhada — a aula é o fiscal do desenho, não o remendo dele.
   ========================================================================== */
const AULAS={
  /* 🔴 A AULA SEGUIU A TELA. Ela apontava pra `.kpis`, `.stop` e `.grip` — as
     três peças que mudaram de casa em 08/08 quando a aba Rota virou o mapa. O
     filtro do `abrirAula` teria comido 3 dos 4 passos e escrito 3 avisos no
     console: aula viva apontando pro vazio. Cada tela ensina o que ELA tem. */
  rota:[
    ['.plano-bar','Seu dia','Quantas paradas você tem hoje e quantas já entregou.'],
    /* `opcional` porque a porta é do ESTADO: o botão "Lista" só existe com rota
       montada (ver `temRotaNoDia`). Num dia por montar o passo sai de fininho,
       sem alarme — a aula continua ensinando o que ESTA tela tem agora. */
    {alvo:'[data-ir="rotalista"]',titulo:'A lista das paradas',
     texto:'Toque aqui pra ver cada cliente, mudar a ordem e abrir a entrega.',opcional:1},
    ['[data-acao="mapa-enquadrar"]','Perdeu a rota de vista','Arrastou o mapa sem querer? Toque aqui que a rota inteira volta.'],
    ['.tmx-main','O que fazer agora','O botão grande é sempre o próximo passo do dia.'],
  ],
  rotalista:[
    ['.kpis','Seu dia','Quantas paradas você tem e quantas já entregou.'],
    ['.stop','Cada cartão é uma parada','Toque no cartão pra abrir a entrega do cliente.'],
    ['.grip','Mudar a ordem','Segure aqui do lado e arraste pra cima ou pra baixo. Pra tirar da rota, deslize o cartão pra esquerda.'],
    ['.tmx-main,.dock-montar','O que fazer agora','O botão grande é sempre o próximo passo do dia.'],
  ],
  montagem:[
    ['.day-chips,.chips','O dia','Escolha o dia. Só aparece dia que tem cliente.'],
    ['.stop','A ordem do dia','Arraste pra ajustar a ordem antes de sair.'],
    ['[data-ir="rapida"]','Uma parada fora do dia','O "+" põe na rota um endereço que não está agendado hoje.'],
    ['.acts,.tmx-dock','Salvar ou começar','"Salvar rota" guarda pra depois. "Iniciar rota" começa o dia agora.'],
  ],
  rapida:[
    ['.search','Diga pra onde','Endereço, CEP com o número, ou cole o link que mandaram no WhatsApp.'],
    ['.modos','Só ir, ou cadastrar','"Direção" traça a rota e pronto. "Cadastro" guarda a pessoa nos seus clientes.'],
    ['.tmx-dock','Um botão só','Primeiro ele procura o endereço. Depois de achar, ele põe a parada na rota.'],
  ],
  novocliente:[
    ['[data-campo="novo-nome"]','O nome','Comece pelo nome do cliente.'],
    ['[data-acao="usar-meu-local"]','O local certo','Parado na frente da casa, toque aqui: rua, bairro e CEP entram sozinhos, no lugar exato.'],
    ['[data-campo="novo-numero"]','O número da casa','Este você digita. Se a casa não tem número, escreva SN.'],
    ['[data-acao="salvar-novo-cliente"]','Pronto','Salvou, o cliente já aparece na sua lista.'],
  ],
  chat:[
    ['.recado','Recado da Central','Toque em "Entendi" pra Central saber que você viu.'],
    ['.escrever','Falar com a Central','Escreva aqui e mande. Ela responde no mesmo lugar.'],
  ],
  ajustes:[
    ['.cartao-lista','Seus ajustes','Cadastro de clientes e produtos, sons e conta ficam aqui.'],
    ['.nav','Os três módulos','Chat, Rota e Ajustes. A Rota é onde o dia acontece.'],
  ],
  /* 🔴 ESTA AULA NÃO EXISTIA — e o capítulo "Créditos e recarga" do catálogo
     apontava pra ela (`aula:'consumo'`). Capítulo sem passo é DERRUBADO pelo
     `capitulosDoCatalogo`, calado pro dono e com um `console.warn` que ninguém
     lê: a lição de como comprar crédito simplesmente não estava no app. Agora a
     aula existe, e a ordem dela é a ordem da tela — saldo, pacote, botão, e só
     no fim pra onde o crédito foi. */
  creditos:[
    ['.saldo','Quanto você tem','Seu saldo, e o aviso quando algum crédito está perto de vencer.'],
    ['.pacotes','Escolha o pacote','O preço por crédito diz qual sai mais barato. Toque no que você quer.'],
    ['.tmx-dock','Recarregar','O botão do pé mostra o pacote escolhido e o valor. O pagamento é no cartão.'],
    ['.extrato','Para onde o crédito foi','Cada entrega rastreada e cada bônus do mês aparece aqui.'],
  ],
};
/** O aparelho lembra o que já foi visto — a lâmpada acende só pra aula nova. */
const aulaVista=k=>{ try{ return localStorage.getItem('hbx:aula:'+k)==='1'; }catch(e){ return false; } };
const marcarVista=k=>{ try{ localStorage.setItem('hbx:aula:'+k,'1'); }catch(e){} };
/* A lâmpada ACESA é estado do APARELHO (o que este celular já viu), não dado do
   servidor: por isso é carimbada depois da pintura, e não dentro do `render()`.
   Mesma linha do velocímetro — o dado passa pelo seam, a marca local não. */
function marcarAula(camada){
  const b=camada.querySelector('[data-aula]'); if(!b) return;
  b.classList.toggle('acesa', !!(AULAS[atual]&&!aulaVista(atual)));
}
/* ==========================================================================
   O TUTOR — a MESMA aula, agora com jornada, espera de dedo e condição.

   Encomenda do dono (09/08): *"tutorial que todo cliente vai ter q ler…
   obrigatório simples, avançado ensina tudo e fecha quando quiser, blur escuro
   fora, aguardando o click, e o prospector pula sozinho pra quem não tem."*

   🔴 UM MOTOR SÓ. A lâmpada e o tour são a mesma máquina: a lâmpada é um
   CAPÍTULO montado na hora com os passos de `AULAS[atual]`; o obrigatório é
   uma FILA de capítulos. Dois motores de coach mark seriam duas verdades pra
   mesma tela — cada um com sua régua de "sumiu da tela", cada um apontando pro
   seu botão. É a mesma doença da peça copiada que custou 09/08.

   O passo virou OBJETO — `{tela, alvo, tipo, titulo, texto, se}` — e a tupla
   antiga `[seletor, título, texto]` continua valendo: é o formato das `AULAS`,
   e conteúdo que já está certo não se reescreve pra caber em motor novo.

   · `tela`  — diferente da atual? o motor navega e REMONTA na camada VIVA.
   · `tipo`  — `mostrar` anda no "Próximo"; `fazer` espera o CLIQUE REAL no
               alvo, que executa a ação de verdade (aprendeu fazendo).
   · `se(d)` — recebe `DADOS.tutorial`. Falso ⇒ o passo sai; capítulo que ficou
               sem passo NÃO aparece. "Pular sozinho" é lei do MOTOR, nunca um
               `if` repetido em cada capítulo.
   ========================================================================== */
const CAPITULOS={
  /* Os três do OBRIGATÓRIO. Nenhum `fazer` mira dinheiro (Iniciar rota debita
     crédito) nem dado de verdade (Salvar cliente cria conta): tutorial que
     gasta ou cadastra é tutorial que o cliente paga pra ver. */
  montar:{titulo:'Montar e iniciar a rota',ico:'route',passos:[
    /* O alvo é uma FILA porque o botão de montar muda de casa com o estado da
       rota: no dia zerado ele é o botão grande do meio; com a rota já pronta é
       o satélite "Montagem". Mesma porta, dois desenhos — e o grande vem
       primeiro porque é o que o dedo procura. */
    {tela:'rota',alvo:['.tmx-main button[data-estado="montar"]','[data-acao="montar"]'],tipo:'fazer',
     titulo:'Comece por aqui',texto:'Toque em montar pra armar o seu dia.'},
    {tela:'montagem',alvo:'.day-chips,.chips',tipo:'fazer',
     titulo:'O dia',texto:'Escolha o dia. Só aparece dia que tem cliente.'},
    {tela:'montagem',alvo:'.stop',
     titulo:'Cada cartão é uma parada',texto:'Segure no punho do lado pra arrastar e mudar a ordem.'},
    {tela:'montagem',alvo:'[data-ir="rapida"]',
     titulo:'Uma parada fora do dia',texto:'O "+" põe na rota um endereço que não estava agendado.'},
    {tela:'montagem',alvo:'.acts,.tmx-dock',
     titulo:'Salvar ou começar',texto:'"Salvar rota" guarda pra depois. "Iniciar rota" começa o dia — hoje é só olhar.'},
  ]},
  clientes:{titulo:'Onde moram os clientes',ico:'users',passos:[
    /* 🔴 PASSO `fazer` APONTA PRO BOTÃO, NUNCA PRA BARRA QUE O CONTÉM (09/08,
       flagrado percorrendo o tour). O alvo era `.nav` — a barra inteira, os três
       módulos dentro do mesmo furo. Dois estragos de uma vez: o dedo não sabia
       ONDE tocar (a frase diz "Ajustes", o holofote dizia "qualquer um destes"),
       e tocar o botão ERRADO satisfazia o passo — o tour seguia pro passo
       seguinte, que espera a tela de Ajustes, achava o alvo no vazio e o
       capítulo inteiro caía. Alvo de `fazer` é a peça que a frase manda tocar. */
    {tela:'rota',alvo:'[data-nav="ajustes"]',tipo:'fazer',
     titulo:'Os três módulos',texto:'Chat, Rota e Ajustes. Toque em Ajustes.'},
    {tela:'ajustes',alvo:'[data-ir="clientes"]',tipo:'fazer',
     titulo:'Cadastro fica aqui',texto:'Clientes, produtos e fechamento moram nos Ajustes.'},
    {tela:'clientes',alvo:'.cli',
     titulo:'A ficha do cliente',texto:'Toque num cliente pra ver endereço, preço e o que ele deve.'},
  ]},
  cadastro:{titulo:'Cadastrar um cliente',ico:'plus',tela:'novocliente',passos:[
    {alvo:'[data-campo="novo-nome"]',titulo:'O nome',texto:'Comece pelo nome do cliente.'},
    {alvo:'[data-acao="usar-meu-local"]',titulo:'O local certo',
     texto:'Parado na frente da casa, toque aqui: rua, bairro e CEP entram sozinhos.'},
    {alvo:'[data-campo="novo-numero"]',titulo:'O número da casa',
     texto:'Este você digita. Se a casa não tem número, escreva SN.'},
  ]},
  /* Os do AVANÇADO que REAPROVEITAM a aula da tela — `aula` em vez de `passos`.
     Copy nova não se inventa: a que está lá já foi lida e aprovada. */
  avulsa:{titulo:'Adicionar parada — o "+"',ico:'plus',aula:'rapida',tela:'rapida'},
  entregar:{titulo:'Entregar e receber',ico:'check',aula:'folha',tela:'folha'},
  fechamento:{titulo:'Fechamento do dia',ico:'note',aula:'fechamento',tela:'fechamento',
    se:d=>!!d.financeiro},
  chat:{titulo:'Recados da Central',ico:'chat',aula:'chat',tela:'chat',se:d=>!!d.chat},
  creditos:{titulo:'Créditos e recarga',ico:'card',aula:'creditos',tela:'creditos',se:d=>!!d.admin},
  /* 🔴 O CAPÍTULO QUE SE ADAPTA — a régua do "pular sozinho" do dono, inteira,
     sem um tour separado. Três estados, e quem decide é o `se` de cada passo:
     LIGADO ⇒ os 3 primeiros (o que são os prédios, o toque, o crédito);
     DESLIGADO mas o dono PODE ligar ⇒ os 2 últimos, que terminam na chave de
     verdade em Ajustes › Avançado;
     desligado pra quem não é dono, ou empresa sem prospector ⇒ o `se` do
     capítulo derruba tudo e ele NÃO EXISTE — nem linha vazia no catálogo.

     🔴 QUEM ENSINA O PRÉDIO É `prospectorVejo`, NÃO `prospectorAtivo` (09/08).
     "A empresa ligou" e "esta pessoa vê" são coisas diferentes: o prospector
     tem QUATRO chaves, e a régua de quem enxerga é do servidor — admin sempre,
     funcionário só com `prospectorEquipe`. Ensinar pelo `prospectorAtivo`
     sozinho poria "toque no prédio aceso" na frente do motorista de uma empresa
     com a chave da equipe desligada, que nunca verá prédio nenhum: o tutorial
     FABRICANDO a pergunta besta que veio matar. A ponte já traduz a régua num
     fato só; aqui é só obedecer. */
  prospector:{titulo:'Prospector — vender no caminho',ico:'sales',
    se:d=>!!(d.prospectorVejo||(d.admin&&d.prospectorDisponivel&&!d.prospectorAtivo)),passos:[
    /* 🔴 O ALVO É O PRÉDIO (`.emp-obj`), NUNCA O `.emp`. O `.emp` é um PONTO —
       `width:0;height:0`, só a coordenada no mapa — e o desenho inteiro mora no
       filho. Medido: o furo saía um pontinho de 12 px no meio do mapa, e o
       prédio que a frase explica ficava do lado de fora, embaçado. Peça que se
       posiciona por coordenada não é peça que se mede. */
    {tela:'mapa',alvo:['.emp-chip','.emp.on .emp-obj'],se:d=>!!d.prospectorVejo,
     titulo:'Empresas no seu caminho',texto:'Os prédios acesos no mapa são empresas a até 150 m da sua rota.'},
    {tela:'mapa',alvo:'.emp.on .emp-obj',se:d=>!!d.prospectorVejo,
     titulo:'Toque no prédio',texto:'Abre quem é a empresa. Se interessar, ela vira um lead seu.'},
    {tela:'mapa',alvo:'',se:d=>!!d.prospectorVejo,
     titulo:'Custa 1 crédito',texto:'Só quando você pega o lead. Olhar é de graça.'},
    {alvo:'',se:d=>!d.prospectorAtivo,
     titulo:'Vender no caminho',texto:'O app pode te mostrar empresas a até 150 m da rota que você já faz.'},
    {tela:'avancado',alvo:'[data-acao="chave-prospector"]',tipo:'fazer',se:d=>!d.prospectorAtivo,
     titulo:'Ligue aqui',texto:'Você liga e desliga quando quiser.'},
  ]},
};
/** A fila do obrigatório, na ordem em que o motorista precisa aprender. */
const OBRIGATORIO=['montar','clientes','cadastro'];
/** A ordem do catálogo de Ajustes › "Aprenda a usar". */
const CATALOGO=['montar','avulsa','entregar','fechamento','chat','prospector','creditos'];

/* O aparelho lembra o capítulo VISTO e ONDE parou — retomar de onde parou é
   conveniência de leitura, então é do aparelho. O "obrigatório visto" NÃO mora
   aqui: é do USUÁRIO e vem do servidor (`DADOS.tutorial.obrigatorioVisto`).
   Por aparelho ele repetiria a cada reinstalação e sumiria no celular novo. */
const tutorLer=k=>{ try{ return localStorage.getItem('hbx:tutor:'+k); }catch(e){ return null; } };
const tutorGravar=(k,v)=>{ try{ localStorage.setItem('hbx:tutor:'+k,v); }catch(e){} };
const tutorFeito=id=>tutorLer('feito:'+id)==='1';

/** A camada VIVA é a ÚLTIMA — mesma lei do `portao` e do `avisar`. */
function camadaViva(){
  const c=document.querySelectorAll('#app .tela');
  return c.length?c[c.length-1]:null;
}
/** O que a ponte contou sobre esta empresa. Ausente = objeto vazio, nunca nulo. */
const tutorDados=()=>DADOS.tutorial||{};
/* 🔴 "NÃO SEI" NUNCA ESCONDE. Enquanto a ponte não respondeu (`carregando`), a
   condição não é falsa — ela é desconhecida, e o motor não decide nada. É a
   mesma lei do "vazio porque o servidor disse vazio" ≠ "vazio porque a rede
   caiu": esconder capítulo por dado que não chegou some com a lição pra sempre
   naquele boot, e o cliente nunca descobre que ela existia. */
function tutorCondicao(fn){
  if(typeof fn!=='function') return true;
  const d=tutorDados();
  if(d.carregando) return true;
  try{ return !!fn(d); }catch(_){ return true; }
}
/* 🔴 ROTA VIVA REBAIXA `fazer` PRA `mostrar`, SOZINHO. Herda a lei da aula: com
   o dia rodando, os botões da tela movem entrega e dinheiro de verdade, e uma
   lição que pede o dedo ali cobra o preço do erro do motorista. O obrigatório
   roda no 1º acesso — não há rota nem dinheiro pra estragar; esta trava existe
   pro AVANÇADO, que se abre a qualquer hora do dia. */
const tourSoMostrar=()=>estadoRota==='rodando'||estadoRota==='pausada';

/* 🔴 `alvo` ACEITA UMA FILA DE SELETORES, e a fila é a ORDEM DE PREFERÊNCIA —
   `querySelector('a,b')` NÃO serve pra isso: ele devolve o primeiro na ordem do
   DOCUMENTO, não o primeiro da lista. Custou uma medida: o passo do prospector
   pedia `.emp-chip,.emp.on .emp-obj` querendo o chip, e como o prédio nasce
   antes no HTML o furo caía sempre no prédio. Um array diz "este, e se não
   houver, aquele" — que é o que uma tela com dois desenhos pro mesmo assunto
   realmente precisa. String continua valendo e continua sendo uma união CSS. */
function acharAlvo(camada,alvo){
  if(!alvo) return null;
  const fila=Array.isArray(alvo)?alvo:[alvo];
  for(const sel of fila){ const el=sel&&camada.querySelector(sel); if(el) return el; }
  return null;
}
/* 🔴 "EXISTE NO DOM" ≠ "DÁ PRA APONTAR". Duas peças desta casa mentem pro
   `querySelector`: a de tamanho ZERO (o `.emp` é `width:0;height:0` — só a
   coordenada) e a que a CÂMERA levou pra fora (o `.emp-obj`, projetado do
   lat/lng: sai da tela sozinho enquanto o motorista anda). Nenhuma das duas se
   aponta, e o tour tratá-las como alvo é o que fabrica a tela preta. Basta
   ENCOSTAR na camada — alvo meio visível ainda ensina, e o balão preso (ver
   `medir`) garante que a saída continua na tela. */
function alvoNaTela(camada,el){
  const c=camada.getBoundingClientRect(), a=el.getBoundingClientRect();
  if(a.width<=0||a.height<=0) return false;
  return a.bottom>c.top&&a.top<c.bottom&&a.right>c.left&&a.left<c.right;
}
/** Tupla velha `[sel,titulo,texto]` ou objeto novo — sai objeto dos dois lados. */
function normalizarPasso(p,telaPadrao){
  const o=Array.isArray(p)
    ? {alvo:p[0],titulo:p[1],texto:p[2]}
    : Object.assign({},p);
  if(!('tela' in o)) o.tela=telaPadrao;
  if(o.tipo!=='fazer') o.tipo='mostrar';
  return o;
}
/** Os passos que sobram pra ESTA empresa. Alvo ausente é filtrado só na hora
 *  de pintar — o passo mora em outra tela, e tela que não está no ar não tem
 *  peça pra medir. */
function passosDoCapitulo(cap){
  const crus=cap.passos||(cap.aula?AULAS[cap.aula]:null)||[];
  return crus.map(p=>normalizarPasso(p,cap.tela)).filter(p=>tutorCondicao(p.se));
}
/** O catálogo: [id, capítulo] dos que existem pra esta empresa E têm passo. */
function capitulosDoCatalogo(){
  return CATALOGO.map(id=>[id,CAPITULOS[id]]).filter(([id,c])=>{
    if(!c) return false;
    if(!tutorCondicao(c.se)) return false;
    if(passosDoCapitulo(c).length) return true;
    // Capítulo sem passo não vira linha — e não sai calado: linha no catálogo
    // abrindo um capítulo vazio seria botão morto com nome bonito.
    console.warn('[HBX 2.0] tutor — capítulo sem passo, fora do catálogo:',id,
      c.aula?`(a aula "${c.aula}" não existe em AULAS)`:'');
    return false;
  });
}

/* O ESTADO DO TOUR VIVE FORA DA CAMADA. `pintar()` troca o DOM inteiro a cada
   dado que chega — guardar o passo dentro do `.aula-wrap` era perder a lição
   no primeiro repinte do seam. Aqui a camada é só o DESENHO do passo; a
   verdade é este objeto, e `tourRepintar()` a redesenha onde ela couber. */
const TOUR={id:null,cap:null,passos:[],i:0,obrig:false,fila:0,
  alvoEl:null,esperandoDedo:false,volta:null,dicaTimer:null,remedir:[]};
const tourRodando=()=>!!TOUR.cap;

function tourLimparRelogios(){
  clearTimeout(TOUR.dicaTimer); TOUR.dicaTimer=null;
  TOUR.remedir.forEach(t=>clearTimeout(t)); TOUR.remedir=[];
}
function tourApagarDesenho(){
  document.querySelectorAll('#app .tela .aula-wrap').forEach(w=>w.remove());
}
function tourEncerrar(){
  tourLimparRelogios(); tourApagarDesenho();
  TOUR.id=null; TOUR.cap=null; TOUR.passos=[]; TOUR.i=0;
  TOUR.alvoEl=null; TOUR.esperandoDedo=false;
}

/** Abre um capítulo. `obrig` = sem X e emenda no próximo da fila. */
function tourAbrirCapitulo(id,obrig,retomar){
  const cap=CAPITULOS[id]; if(!cap) return false;
  const passos=passosDoCapitulo(cap);
  if(!passos.length){ console.warn('[HBX 2.0] tutor — capítulo sem passo:',id); return false; }
  tourLimparRelogios();
  TOUR.id=id; TOUR.cap=cap; TOUR.passos=passos; TOUR.obrig=!!obrig;
  TOUR.volta=TOUR.volta||atual;
  const guardado=retomar?parseInt(tutorLer('pos:'+id)||'0',10):0;
  TOUR.i=(guardado>0&&guardado<passos.length)?guardado:0;
  tourRepintar();
  return true;
}
/** O passo saiu do ar (alvo sumiu, tela murada): anda um e tenta de novo. */
function tourPular(motivo,p){
  console.warn('[HBX 2.0] tutor —',motivo,':',(p&&p.alvo)||'(sem alvo)','· capítulo',TOUR.id);
  TOUR.i++; tourRepintar();
}
function tourConcluirCapitulo(){
  const id=TOUR.id, obrig=TOUR.obrig;
  tutorGravar('feito:'+id,'1');
  tutorGravar('pos:'+id,'0');
  tourEncerrar();
  if(!obrig){
    const volta=TOUR.volta; TOUR.volta=null;
    // Volta pra onde o capítulo foi aberto: quem abriu a lição nos Ajustes não
    // pode ser largado na tela de dirigir.
    if(volta&&volta!==atual) ir(volta);
    else pintar(false);          // o ✓ do catálogo é dado de tela: repinta
    return;
  }
  TOUR.fila++;
  tutorGravar('obrig',String(TOUR.fila));
  const prox=OBRIGATORIO[TOUR.fila];
  if(prox&&tourAbrirCapitulo(prox,true,false)) return;
  tourFecharObrigatorio();
}
/** Anda a fila do obrigatório até achar um capítulo que tenha passo. */
function tourSeguirObrigatorio(){
  for(let n=TOUR.fila;n<OBRIGATORIO.length;n++){
    TOUR.fila=n;
    if(tourAbrirCapitulo(OBRIGATORIO[n],true,true)) return;
  }
  tourFecharObrigatorio();
}
/** O fecho do obrigatório: o portão de saída e o carimbo no servidor. */
function tourFecharObrigatorio(){
  TOUR.obrig=false; TOUR.fila=0; TOUR.volta=null;
  tutorGravar('obrig','0');
  tutorGravar('feito:obrigatorio','1');
  /* 🔴 QUEM GRAVA NO SERVIDOR É A PONTE. O motor é o DESENHO e não fala com a
     rede — aqui ele só anuncia. No mock a função nasce no-op (o seam existe
     antes da rede, como toda porta desta casa). */
  try{ window.tutorialConcluido(); }catch(_){}
  if(atual!=='rota') ir('rota');
  portao({tom:'ok',ico:'bulb',titulo:'Pronto pra rodar',
    sub:'Quer rever? Ajustes › Aprenda a usar. A 💡 lá em cima ensina cada tela.',
    acoes:[['Entendi','principal',true]]});
}

/* 🔴 O TOUR SE REMONTA NA CAMADA VIVA, a cada pintura. `portao()` já ensinou a
   lei aqui: com `querySelector` (a primeira) a peça nasce na camada que está
   MORRENDO numa troca de tela e some junto com ela. E o alvo é MEDIDO de novo
   a cada remonte — a tela repintou, a peça mudou de lugar. */
function tourRepintar(){
  if(!TOUR.cap) return;
  tourLimparRelogios();
  tourApagarDesenho();
  const p=TOUR.passos[TOUR.i];
  if(!p) return tourConcluirCapitulo();
  // JORNADA: passo em outra tela navega — e `pintar()` chama esta função de
  // novo, já na camada certa. Tela que não existe ou módulo que o admin
  // desligou não prendem a lição: o passo cai e o console grita.
  if(p.tela&&p.tela!==atual){
    if(!T[p.tela]) return tourPular('tela inexistente',p);
    if(moduloDesligado(p.tela)) return tourPular('módulo desligado',p);
    return ir(p.tela);
  }
  const camada=camadaViva(); if(!camada) return;
  const alvo=acharAlvo(camada,p.alvo);
  // Passo cujo alvo não está na tela SAI (e grita no console): estado diferente
  // desenha peça diferente, e apontar pro vazio é pior que não falar.
  if(p.alvo&&!alvo) return tourPular('sumiu da tela',p);
  /* 🔴 ALVO FORA DA TELA É ALVO AUSENTE — e custou uma TELA PRETA (09/08). Peça
     posicionada por COORDENADA DE MAPA (`.emp`, que a ponte projeta com
     `mapa.project([lng,lat])`) continua no DOM quando está 1.240 px acima do
     topo: `querySelector` acha, o freio de cima não dispara, e o furo nasce
     fora da tela levando o balão junto. O que sobra na tela é só o
     `box-shadow: 0 0 0 9999px` do furo — TUDO preto, sem balão, sem X e sem
     "Próximo". MEDIDO no capítulo do prospector: balão em `top:-1177px`,
     motorista PRESO. `querySelector` responde "existe"; quem responde "dá pra
     apontar" é a RÉGUA. */
  if(alvo&&!alvoNaTela(camada,alvo)) return tourPular('fora da tela',p);
  /* O rebaixamento é decidido AQUI, no quadro, não quando o capítulo abriu: a
     rota pode começar a rodar no meio da lição (a ponte relê a config a cada
     minuto) e um `fazer` congelado na abertura pediria o dedo do motorista num
     botão que agora move dinheiro. */
  const tipo=(p.tipo==='fazer'&&!tourSoMostrar())?'fazer':'mostrar';
  TOUR.alvoEl=alvo;
  TOUR.esperandoDedo=(tipo==='fazer');

  const w=document.createElement('div');
  w.className='aula-wrap';
  w.dataset.tipo=tipo;
  w.dataset.furo=alvo?'1':'0';
  w.innerHTML=`<div class="aula-veu"></div><div class="aula-veu"></div>
    <div class="aula-veu"></div><div class="aula-veu"></div>
    <div class="aula-furo"></div><div class="aula-cx"></div>`;
  camada.appendChild(w);
  const furo=w.querySelector('.aula-furo'), cx=w.querySelector('.aula-cx');
  const veus=[...w.querySelectorAll('.aula-veu')];

  function medir(){
    const c=camada.getBoundingClientRect();
    if(!alvo||!camada.contains(alvo)){
      // Sem alvo: o véu é um painel só, cobrindo tudo. Os outros três somem —
      // painel de largura zero ainda pinta borda em alguns navegadores.
      Object.assign(veus[0].style,{top:'0',left:'0',width:'100%',height:'100%',display:''});
      veus.slice(1).forEach(v=>v.style.display='none');
      return;
    }
    // Medida RELATIVA à camada: o quadro do visualizador tem zoom, e
    // getBoundingClientRect da janela devolveria o furo fora do lugar.
    const a=alvo.getBoundingClientRect();
    const topo=a.top-c.top, esq=a.left-c.left, alt=a.height, larg=a.width;
    const t=topo-6, l=esq-6, lg=larg+12, at=alt+12;
    Object.assign(furo.style,{top:t+'px',left:l+'px',width:lg+'px',height:at+'px'});
    veus.forEach(v=>v.style.display='');
    Object.assign(veus[0].style,{top:'0',left:'0',width:'100%',height:Math.max(0,t)+'px'});
    Object.assign(veus[1].style,{top:(t+at)+'px',left:'0',width:'100%',bottom:'0',height:'auto'});
    Object.assign(veus[2].style,{top:t+'px',left:'0',width:Math.max(0,l)+'px',height:at+'px'});
    Object.assign(veus[3].style,{top:t+'px',left:(l+lg)+'px',right:'0',width:'auto',height:at+'px'});
    // A caixa fica do lado que tem espaço: abaixo do alvo se couber, senão
    // acima. Explicação em cima da peça explicada é explicação escondida.
    /* 🔴 E O BALÃO NUNCA SAI DA TELA — a GARANTIA, irmã da régua do `alvoNaTela`
       e não uma segunda cópia dela. A régua barra o alvo que está inteiro fora;
       aqui se resolve o que ela deixa passar de propósito: alvo MEIO visível dá
       `topo` negativo, e o mapa anda por baixo do tour (`posicionarEmpresas`
       roda a cada quadro do mapa), então a remedida dos 140/520 ms pode pegar o
       prédio já saindo. Preso entre as duas bordas, o X está SEMPRE alcançável
       — e é o X que separa "lição" de "cativeiro". */
    const cxAlt=cx.offsetHeight||160;
    const preso=v=>Math.max(11,Math.min(v,Math.max(11,c.height-cxAlt-11)));
    const cabeAbaixo=topo+alt+14+cxAlt<c.height;
    cx.style.top=preso(cabeAbaixo?topo+alt+14:topo-14-cxAlt)+'px';
    cx.style.bottom='auto';
  }

  const ultimo=TOUR.i===TOUR.passos.length-1;
  const pct=Math.round(((TOUR.i+1)/TOUR.passos.length)*100);
  if(!TOUR.obrig) cx.classList.add('com-x');
  cx.innerHTML=`<span class="aula-prog"><i style="width:${pct}%"></i></span>
    ${TOUR.obrig?'':`<button class="fechar" data-aula-sair="1" data-escape="1" aria-label="Fechar">${ic('close',15)}</button>`}
    <b>${p.titulo}</b><span class="txt">${p.texto}</span>
    <div class="pe"><span class="conta">${TOUR.i+1} de ${TOUR.passos.length}</span>
      <span style="display:flex;gap:8px">
        ${tipo==='fazer'?'':`<button class="principal" data-aula-prox="1"${ultimo?' data-escape="1"':''}>${ultimo?'Entendi':'Próximo'}</button>`}
      </span></div>`;
  medir();
  /* 🔴 A TELA AINDA ESTÁ ENTRANDO QUANDO O TOUR MEDE. A camada nasce com a
     cascata de entrada (`--i` por peça), então a régua tirada no primeiro
     quadro pega o alvo NO MEIO do próprio deslize. Duas remedidas cobrem a
     entrada comum (~740 ms) e o furo transiciona sozinho até o lugar — quem
     olha vê o destaque assentar, nunca pular. */
  TOUR.remedir.push(setTimeout(medir,140),setTimeout(medir,520));
  // 4 s parado no `fazer` e o anel pulsa. Dica, não bronca.
  if(tipo==='fazer') TOUR.dicaTimer=setTimeout(()=>furo.classList.add('dica'),4000);

  w.addEventListener('click',e=>{
    if(e.target.closest('[data-aula-sair]')){
      const volta=TOUR.volta; TOUR.volta=null;
      tutorGravar('pos:'+TOUR.id,String(TOUR.i));   // retoma de onde parou
      tourEncerrar();
      if(volta&&volta!==atual) ir(volta);
      return;
    }
    if(!e.target.closest('[data-aula-prox]')) return;
    TOUR.i++; tourRepintar();
  });
}

/* 🔴 O CLIQUE QUE ANDA O PASSO É O DE VERDADE, e por isso este ouvinte OLHA e
   não atrapalha: nada de `preventDefault`, nada de `stopPropagation`. O véu já
   garantiu que só o alvo é alcançável; aqui o motor apenas toma nota de que o
   dedo chegou. Captura pra ver o toque ANTES de a ação repintar a tela e levar
   o elemento embora. */
document.addEventListener('click',e=>{
  if(!TOUR.esperandoDedo||!TOUR.alvoEl) return;
  if(e.target!==TOUR.alvoEl&&!TOUR.alvoEl.contains(e.target)) return;
  TOUR.esperandoDedo=false;
  TOUR.i++;
  tutorGravar('pos:'+TOUR.id,String(TOUR.i));
  // Some com o desenho na hora: o motorista precisa VER a ação que ele acabou
  // de fazer. Se a ação repintar a tela, `pintar()` remonta o tour no passo
  // novo; se não repintar (o clique não navegou), o relógio abaixo remonta.
  tourApagarDesenho();
  TOUR.remedir.push(setTimeout(tourRepintar,340));
},true);

/** A lâmpada: a aula DESTA tela, montada na hora — capítulo como outro qualquer. */
function abrirAula(){
  const camada=camadaViva(); if(!camada) return;
  if(tourRodando()) return;
  marcarVista(atual);
  marcarAula(camada);
  /* 🔴 O AVISO É PRA AULA VELHA, NÃO PRA PEÇA QUE A TELA ESCONDE DE PROPÓSITO
     (09/08). O grito existe pra flagrar lição apontando pro vazio depois de um
     redesenho — e ele só serve enquanto for raro. Peça que a própria tela liga
     e desliga (o botão "Lista", que só nasce com rota montada) faria o console
     gritar todo domingo, e guarda que grita à toa é guarda que se aprende a
     ignorar. Quem sabe que a ausência é legítima é quem escreveu o passo:
     `opcional:1`. O passo continua caindo fora do roteiro — o que sai é o
     alarme falso. */
  const passos=(AULAS[atual]||[]).map(p=>normalizarPasso(p,atual)).filter(p=>{
    const tem=!!acharAlvo(camada,p.alvo);
    if(!tem&&!p.opcional) console.warn('[HBX 2.0] aula de',atual,'— sumiu da tela:',p.alvo);
    return tem;
  });
  if(!passos.length){
    return portao({tom:'info',ico:'bulb',titulo:'Nada a ensinar aqui',
      sub:'Esta tela não tem aula ainda.',acoes:[['Fechar','principal',true]]});
  }
  tourLimparRelogios();
  TOUR.id='aula:'+atual; TOUR.cap={titulo:T[atual]?T[atual].nome:atual};
  TOUR.passos=passos; TOUR.i=0; TOUR.obrig=false; TOUR.volta=null;
  tourRepintar();
}

/* ==========================================================================
   AS DUAS PORTAS DO TUTOR — o que a ponte chama, e o que ela implementa.
   `window.TUTOR` é o motor se oferecendo; `window.tutorialConcluido` é o motor
   pedindo. No mock a segunda nasce NO-OP: o desenho define o seam, a ponte
   sobrescreve com a rede. Sem isto o obrigatório terminaria num erro calado.
   ========================================================================== */
window.tutorialConcluido = window.tutorialConcluido || function(){};
window.TUTOR={
  /* Abre (ou retoma) o obrigatório. Não faz nada se já tem tour na tela.
     🔴 E NÃO DECIDE COM DADO QUE NÃO CHEGOU: enquanto `carregando`, ninguém é
     preso num tutorial; quem chama de novo depois do bootstrap é a ponte. */
  obrigatorio(){
    if(tourRodando()) return;
    const d=tutorDados();
    if(d.carregando||d.obrigatorioVisto) return;
    TOUR.volta=null;
    TOUR.fila=Math.max(0,Math.min(OBRIGATORIO.length-1,parseInt(tutorLer('obrig')||'0',10)||0));
    // Quem matou o app no meio RETOMA — o cartão de boas-vindas é da primeira
    // vez, e repeti-lo a cada volta seria cobrar o mesmo minuto duas vezes.
    if(TOUR.fila>0) return tourSeguirObrigatorio();
    portao({tom:'info',ico:'bulb',titulo:'O app mudou',
      sub:'Em 1 minuto eu te mostro o que importa.',
      acoes:[['Vamos lá','principal']],semFechar:1,acaoPrincipal:'tutor-comecar'});
  },
  /** Um capítulo avulso do catálogo — sempre fechável no X. */
  abrir(id){
    if(tourRodando()) return;
    TOUR.volta=null; TOUR.obrig=false; TOUR.fila=0;
    tourAbrirCapitulo(id,false,true);
  },
  rodando(){ return tourRodando(); },
};

function confirmar(){
  const camada=document.querySelector('#app .tela'); if(!camada) return;
  camada.querySelector('.conf-wrap')?.remove();
  const w=document.createElement('div');
  w.className='conf-wrap';
  w.innerHTML=`<div class="conf">
    <strong>Retirar da rota de hoje?</strong>
    <span class="sub">Mercado Estrela · volta na próxima quarta</span>
    <span class="acoes"><button data-fechar="1">Não</button>
      <button class="principal" data-fechar="1">Retirar</button></span>
  </div>`;
  camada.appendChild(w);
}

document.addEventListener('click',e=>{
  // a lâmpada vem ANTES do `data-ir`: ela é botão do cabeçalho como os outros,
  // e sem esta linha o clique cairia no roteador e não abriria nada.
  const au=e.target.closest('[data-aula]'); if(au) return abrirAula();
  const t=e.target.closest('[data-tela]'); if(t) return ir(t.dataset.tela);
  const g=e.target.closest('[data-ir]');  if(g) return ir(g.dataset.ir);
  const n=e.target.closest('[data-nav]'); if(n) return ir(n.dataset.nav);
  const z=e.target.closest('#zoom [data-z]');
  if(z){
    
    document.querySelectorAll('#zoom button').forEach(b=>b.classList.toggle('on',b===z));
    return;
  }
  const t2=e.target.closest('#trans [data-tr]');
  if(t2){
    document.documentElement.dataset.tr=t2.dataset.tr;
    document.querySelectorAll('#trans button').forEach(b=>b.classList.toggle('on',b===t2));
    // mostra a escolha na hora: avança pra próxima tela e VOLTA — assim dá pra
    // ver o gesto de ida e o de volta, que agora são lados diferentes.
    const proxima=ORDEM[(ORDEM.indexOf(atual)+1)%ORDEM.length];
    const volta=atual; atual=proxima; pintar(true,1);
    setTimeout(()=>{atual=volta; pintar(true,-1);}, DUR[t2.dataset.tr]+260);
    return;
  }
  const lz=e.target.closest('#luz [data-luz]');
  if(lz){ trocarLuz(lz.dataset.luz); return; }
  // a chave "Tema escuro" dos Ajustes é a MESMA porta do interruptor do topo:
  // dois lugares que mudam a mesma coisa precisam falar com o mesmo código.
  // 🔴 QUEM DIZ QUE A LINHA É A CHAVE DO TEMA É O `data-acao`, NUNCA O TEXTO.
  // Ler `/Tema escuro/` do `textContent` casava com qualquer `.linha-cfg` que
  // por acaso dissesse isso, e — pior — deixava a porta ABERTA pra um segundo
  // dono: a ponte trata `data-acao` no mesmo clique, os dois viravam a luz, e
  // o motorista via a tela não mudar nada (medido no g15: escuro→claro→escuro
  // num toque só). Contrato é o atributo; o tema tem UM dono (ver ponte.js §1).
  const chaveTema=e.target.closest('[data-acao="chave-tema"]');
  if(chaveTema){
    trocarLuz(document.documentElement.dataset.luz==='claro'?'escuro':'claro'); return;
  }
  const er=e.target.closest('#estadorota [data-er]');
  if(er){
    estadoRota=er.dataset.er;
    document.querySelectorAll('#estadorota button').forEach(b=>b.classList.toggle('on',b===er));
    if(atual==='rota'){ pintar(false); } else ir('rota');
    return;
  }
  /* O estado do GPS é DADO (quem escreve é a ponte), então a porta do mock é
     um chip como o do estado da rota — sem ele as duas telas de localização
     ficariam desenhadas no escuro, que é o defeito que o `semparada` acabou de
     mostrar que existe. O ponto do mapa só aparece com fix: sem posição, o
     desenho não desenha posição. */
  const gp=e.target.closest('#estadogps [data-gps]');
  if(gp){
    DADOS.rota.gps=gp.dataset.gps;
    DADOS.rota.euDemo=gp.dataset.gps?0:1;
    document.querySelectorAll('#estadogps button').forEach(b=>b.classList.toggle('on',b===gp));
    if(atual==='rota'){ pintar(false); } else ir('rota');
    return;
  }
  const av=e.target.closest('#aventrada [data-av]');
  if(av){
    document.documentElement.dataset.av=av.dataset.av;
    document.querySelectorAll('#aventrada button').forEach(b=>b.classList.toggle('on',b===av));
    avisar('recado');
    return;
  }
  const disp=e.target.closest('#avdisparo [data-avisar]');
  if(disp){ avisar(disp.dataset.avisar); return; }
  const sup=e.target.closest('[data-superficie]');
  if(sup){ (sup.dataset.superficie==='erro'?erro:confirmar)(); return; }
  const pt=e.target.closest('[data-portao]');
  if(pt){ portao(pt.dataset.portao); return; }
  const fec=e.target.closest('[data-fechar]');
  if(fec){ fechar(fec.closest('.erro-wrap,.conf-wrap,.portao-wrap')); }
  /* O TUTOR TEM DUAS PORTAS E UM PREFIXO SÓ. `tutor-comecar` é o "Vamos lá" do
     cartão de abertura; `tutor-<id>` é a linha do catálogo dos Ajustes. O
     prefixo mantém o namespace longe do roteador de `data-acao` da ponte —
     dois donos pro mesmo nome foi o defeito que a chave do tema já pagou.
     Vem DEPOIS do `data-fechar`: o portão fecha primeiro, e a espera cobre a
     saída dele (o tour senta abaixo do portão, então abrir por cima seria
     abrir escondido). */
  const tu=e.target.closest('[data-acao^="tutor-"]');
  if(tu){
    const id=tu.dataset.acao.slice(6);
    setTimeout(()=>{ id==='comecar'?tourSeguirObrigatorio():window.TUTOR.abrir(id); },230);
  }
});
pintar(false);

/* aparelho: avisa a ponte que o app SUBIU — sem isto a cortina nativa nunca cai. */
try{
  var __ponte=window.HBXAndroid;
  if(__ponte&&__ponte.appReady){
    __ponte.appReady(document.documentElement.dataset.luz==='claro'?'light':'dark');
  }
}catch(_){/* no navegador não há ponte — o mock segue maquete */}
