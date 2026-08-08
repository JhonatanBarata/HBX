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
  /* O sino e o balão são PORTAS do chat, não enfeite: badge com número que não
     abre nada é botão morto (dono, 07/08 — "tem número 2, vc clica nada abre").
     `data-ir` de propósito: se o admin desligar o chat, o `podarDesligados`
     leva os dois embora junto com o módulo. */
  const dir = o.live
    ? `<div class="pill-live"><i></i>${o.live}</div>`
    : `<div style="display:flex;gap:7px">
        <button class="round" data-ir="chat">${ic('bell',17)}${DADOS.chat.sino?`<i class="cnt">${DADOS.chat.sino}</i>`:''}</button>
        ${o.semChat?'':`<button class="round" data-ir="chat">${ic('chat',17)}</button>`}</div>`;
  // Tela que se entra por dentro (ficha, folha) troca o menu pela VOLTA — o
  // hambúrguer ali seria a saída errada e o Voltar do Android tem que casar.
  const esq = o.voltar
    ? `<button class="round" data-ir="${o.voltar}" aria-label="Voltar">${ic('back',18)}</button>`
    : `<button class="round">${ic('menu',18)}<i class="ping"></i></button>`;
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
   (caderneta, clientes, produtos, chat, ajustes) MENOS ROTA"*.

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
   Ajustes na direita — padrão de app de motorista. Caderneta, Clientes e
   Produtos NÃO morreram: Clientes/Produtos moram em Ajustes › Cadastro e a
   caderneta abre pelo caixa da Rota (e por Ajustes). O CSV do admin continua
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

/* Os atalhos espalhados pelas telas (o "Abrir caderneta" do pé da rota, por
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
   até ela nascer LIGADA). Quando a frente vier, o satélite volta COM ação. */
const ROTA_ESTADOS={
  montar:   {main:{acao:'montar', glifo:'route', rotulo:'Montar rota'}},
  /* Com a rota pronta o satélite da direita é a PORTA DE VOLTA pra montagem:
     rever a lista, salvar o roteiro, ou trocar o dia e montar de novo. Sem ele
     a montagem ficava inalcançável depois de montada — beco sem saída. */
  pronta:   {main:{acao:'iniciar', glifo:'play', rotulo:'Iniciar'},
             esq:{tipo:'perigo', glifo:'close', rotulo:'Cancelar', acao:'cancelar-rota'},
             dir:{tipo:'info', glifo:'route', rotulo:'Montagem', acao:'montar'}},
  /* Com a rota RODANDO o que o motorista faz é ANDAR: o botão do meio abre a
     navegação. "Pausar"/"Continuar" saíram — pausa não existe no servidor
     (o estado da rota é PLANNED|ACTIVE|COMPLETED|ENCERRADA), então eram dois
     botões que não pausavam nada. Fechar o dia é o "Finalizar" do pé da lista. */
  rodando:  {main:{acao:'navegar', glifo:'nav', rotulo:'Navegar'},
             esq:{tipo:'perigo', glifo:'stop', rotulo:'Cancelar', acao:'cancelar-rota'},
             dir:{tipo:'info', glifo:'check', rotulo:'Finalizar', acao:'fechar-dia'}},
  /* 🔴 O RECIBO DO TOQUE MORA NO BOTÃO TOCADO. Enquanto o servidor monta, o
     meio vira "Montando…": mesmo lugar, mesmo tamanho, SEM ação (dois toques
     não montam duas vezes) e sem satélite — cancelar ou iniciar no meio de uma
     montagem é botão que mente. Antes disto o sinal era o esqueleto da tela
     inteira, que leva o próprio rodapé embora: o dedo tocava e o botão sumia. */
  montando: {main:{glifo:'route', rotulo:'Montando…'}},
};
function transmux(estado){
  const c=ROTA_ESTADOS[estado]; if(!c) return '';
  const sat=(s,lado)=>s?`<span class="tmx-sat tmx-${s.tipo} tmx-${lado}">
      <button aria-label="${s.rotulo}"${s.acao?` data-acao="${s.acao}"`:''}>${ic(s.glifo,20)}${s.contagem?`<i class="cont">${s.contagem}</i>`:''}</button>
      <small>${s.rotulo}</small></span>`:'<span></span>';
  // main sem `acao` = trabalho em curso: não vira gancho e não aceita dedo.
  return `<div class="transmux">${sat(c.esq,'esq')}
    <span class="tmx-main">
      <button${c.main.acao?` data-estado="${c.main.acao}"`:' class="ocupado" disabled aria-busy="true"'} aria-label="${c.main.rotulo}">${ic(c.main.glifo,34)}</button>
      <small>${c.main.rotulo}</small></span>
    ${sat(c.dir,'dir')}</div>`;
}

function stop(o){
  const cor=o.cor||'blue';
  /* 🔴 O GANCHO NASCE DO DADO. A parada só vira botão quando tem `id` — que só
     existe quando o dado é REAL. No mock (paradas de maquete, sem id) o cartão
     continua inerte e a tela sai byte a byte igual à de antes. */
  const gancho=o.id?` data-acao="abrir-parada" data-parada="${o.id}"`:'';
  return `<div class="stop ${o.on?'on':''}"${gancho}>
    <span class="grip"></span>
    <span class="numwrap"><span class="num ${cor==='lime'?'lime':cor==='off'?'off':''}">${o.n}</span>
      <span class="hh ${cor==='lime'?'lime':cor==='off'?'off':''}">${o.hora}</span></span>
    <span class="who"><strong>${o.nome}</strong><span>${o.rua}</span><span>${o.bairro}</span>
      ${o.nota?`<span class="nota">${o.nota}</span>`:''}
      <span class="tags">${(o.tags||[]).map(t=>`<b class="tag ${t[1]||''}">${t[0]}</b>`).join('')}</span></span>
    <span class="side">
      ${o.marcado?`<span class="marc"><small>Marcado</small><b>R$ ${o.marcado}</b></span>`:''}
      ${o.pill?`<span class="pill ${o.pill[1]}">${o.pill[2]?ic(o.pill[2],14):''}${o.pill[0]}</span>`:''}</span>
  </div>`;
}

function mapa(){ return `<div class="mapa-palco" data-mapa="geral">${mapaDesenho()}</div>`; }
function mapaDesenho(){
  return `<div class="mapwrap"><svg viewBox="0 0 400 900" preserveAspectRatio="xMidYMid slice">
    <defs>
      <filter id="gl" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="gls" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="carc" x1="232" y1="396" x2="232" y2="470" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#5b9dff" stop-opacity=".5"/><stop offset="1" stop-color="#5b9dff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="400" height="900" fill="var(--map-fundo)"/>
    <path d="M246 160h160v180H246z" fill="var(--map-parque)" opacity=".85"/>
    <text x="296" y="218" fill="var(--map-rotulo)" font-size="10" font-family="Inter">Parque do</text>
    <text x="296" y="231" fill="var(--map-rotulo)" font-size="10" font-family="Inter">Ibirapuera</text>
    <g stroke="var(--map-rua)" stroke-width="6" opacity=".9" stroke-linecap="round">
      <path d="M-20 190H420M-20 320H420M-20 460H420M-20 600H420M-20 740H420"/>
      <path d="M56 -20V920M144 -20V920M232 -20V920M318 -20V920"/></g>
    <g stroke="var(--map-rua2)" stroke-width="2.2" opacity=".95">
      <path d="M-20 120H420M-20 255H420M-20 390H420M-20 530H420M-20 670H420M-20 806H420"/>
      <path d="M20 -20V920M100 -20V920M188 -20V920M276 -20V920M360 -20V920"/>
      <path d="M-20 66L420 320M420 66L-20 366"/></g>
    <!-- TRAÇADO: segue as ruas do desenho, sem cruzar consigo mesmo.
         Ordem visitada: bandeira → 1 → 2 → 3 (atual) → 4 → 5 → 6. -->
    <g filter="url(#gl)">
      <path d="M56 190 H144 V320 H232 V600 H318 V740 H56"
        fill="none" stroke="var(--map-rota)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g font-family="Inter" font-size="10" fill="var(--map-rotulo)" letter-spacing="1">
      <text x="14" y="150">SANTO AMARO</text><text x="256" y="286">BROOKLIN</text>
      <text x="60" y="430">CAMPO BELO</text><text x="300" y="530">MOEMA</text><text x="150" y="800">JABAQUARA</text></g>
    <g filter="url(#gls)">
      <circle cx="56" cy="190" r="13" fill="var(--map-pino)" stroke="var(--map-partida)" stroke-width="1.6"/>
      <path d="M51 185h10v10h-10z" fill="var(--map-bandeira)"/><path d="M51 185h5v5h-5zM56 190h5v5h-5z" fill="var(--map-bandeira-2)"/></g>
    ${[[144,190,'1'],[232,320,'2'],[318,600,'4'],[144,740,'5'],[56,740,'6']].map(([x,y,t])=>
      `<g filter="url(#gl)"><circle cx="${x}" cy="${y}" r="13" fill="var(--map-pino)" stroke="var(--map-rota)" stroke-width="1.5"/>
       <text x="${x}" y="${y+4.5}" text-anchor="middle" font-size="12" font-weight="400" fill="var(--map-pino-tinta)">${t}</text></g>`).join('')}
    <g filter="url(#gls)">
      <circle cx="232" cy="460" r="28" fill="var(--map-rota)" opacity=".16"/>
      <circle cx="232" cy="460" r="19" fill="var(--map-pino)" stroke="var(--map-rota)" stroke-width="1.8"/>
      <text x="232" y="466" text-anchor="middle" font-size="16" font-weight="400" fill="var(--map-pino-tinta)">3</text></g>
    <!-- eu, descendo a rua rumo à parada 3 -->
    <path d="M232 396 l-38 62 h76 z" fill="url(#carc)"/>
    <g transform="translate(232 396) rotate(180)">
      <rect x="-11" y="-17" width="22" height="34" rx="5" fill="var(--map-carro)" stroke="var(--map-carro-borda)"/>
      <rect x="-7.5" y="-12" width="15" height="10" rx="2.5" fill="var(--map-carro-vidro)"/>
      <rect x="-7.5" y="5" width="15" height="7.5" rx="2" fill="var(--map-carro-2)"/></g>
  </svg></div>`;
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
    /* 🔴 UM GESTO, UMA REAÇÃO (dono, 08/08: "ao clicar pisca e não monta").
       Montar são 3 idas ao servidor. O sinal disso era `estadoRota='carregando'`
       — que na tela Rota troca TUDO pelo esqueleto e leva o rodapé de botões
       junto (o botão some no meio do próprio toque), e na Montagem não muda
       NADA (ela nem lê `estadoRota`): repintava a tela inteira sem dizer uma
       palavra. Agora quem responde ao dedo é o BOTÃO TOCADO, no lugar dele.
       Mora na seção `rota` porque quem monta é a rota, e as duas telas leem
       daqui — uma marca só, um repinte só. */
    montando:0,
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
      {nome:'Salão Bela Vista',   x:'30%', y:'38%', esc:.66},
      {nome:'Auto Peças Central', x:'61%', y:'31%', esc:.58},
      {nome:'Mercado São Judas',  x:'78%', y:'49%', esc:1.12, ordem:[0,3,1,5,2,4], atraso:'.6s',   aceso:true},
      {nome:'Padaria Avenida',    x:'22%', y:'57%', esc:.88,  ordem:[2,0,4,1,5,3], atraso:'2.1s',  aceso:true},
      {nome:'Restaurante Sabor',  x:'74%', y:'68%', esc:1,    ordem:[1,2,5,0,4,3], atraso:'3.55s', aceso:true},
    ],
  },
  /* L3b — O CROMO DA NAVEGAÇÃO. Tudo o que estava CRAVADO no template do GPS
     mora aqui: a manobra, a bússola, o velocímetro, o rodapé e a linha do
     "Você chegou".

     🔴 ERA A MENTIRA QUE SOBROU DA VARREDURA (§4.6.5). Enquanto `rota`,
     `clientes`, `ajustes`, `recarga`, `caderneta` e `semana` já nasciam
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
           chegouFaltam · chegouKm.
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
    encerrar:'Encerrar',
    chegouTitulo:'Você chegou', chegouEndereco:'R. São Judas, 142',
    chegouPrecisao:'GPS ±6 m, você está na porta',
    /* `chegouFaltamVerbo` é COPY com CONCORDÂNCIA: "faltam 5 paradas" mas
       "falta 1 parada". Quem escolhe a forma é quem sabe o número — a ponte —,
       e ela não inventa palavra: as duas são do desenho. O desenho só tinha a
       plural porque o exemplo dele tinha 5. */
    chegouFaltamVerbo:'faltam', chegouFaltam:'5 paradas',
    chegouKm:'6,4 km', chegouAcao:'Registrar entrega',
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
    recebido:'R$ 21,00', paraCaderneta:'R$ 21,00', forma:'dinheiro',
  },
  /* L5 — O FECHAMENTO DO DIA. Literais do template da caderneta, MOVIDOS.
     `selo` é o cartão do canto ("Tudo certo!"); as formas são o caixa do dia. */
  caderneta:{
    entregues:'6', selo:'Tudo certo!',
    formas:[['cash','var(--lime)','Dinheiro','R$ 132,00'],['pix','var(--blue-l)','Pix','R$ 52,00'],
            ['card','var(--purple)','Cartão','R$ 84,00'],['note','var(--amber)','Caderneta','R$ 68,00']],
    formaTotal:'R$ 336,00',
    clientes:'14', produtos:'20', marcado:'R$ 336,00',
  },
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
  ficha:{
    ini:'LY', nome:'Larissa Ypê', resumo:'cliente desde 03/2025 · 42 entregas',
    alerta:'sem número',
    telefone:'(19) 99812-4477', cpf:'',
    cep:'13503-210', rua:'Rua 3a', numero:'', bairro:'Jd. Ypê',
    numeroPendente:1,
    observacoes:'Portão azul · deixar na área · cachorro solto',
    dias:[0,1,0,1,0,0,0],
    produtos:[
      ['gallon','Galão 20 Litros','2 por entrega · R$ 11,00 (catálogo)'],
      ['box','Água c/ gás 1,5L','1 por entrega · <b style="color:var(--lime)">R$ 22,00 só pra ela</b>'],
    ],
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
     nada a confirmar). `conversa` é [lado, texto, hora] — lado 'deles' ou
     'minha'. `sino` é o contador do cabeçalho, um só pra TODAS as telas. */
  chat:{
    recado:'Passa no Mercado Estrela antes das 11h', recadoTitulo:'Recado da Central',
    conversa:[
      ['deles','Bom dia! A Larissa remarcou pra quinta.','08:12'],
      ['minha','Beleza, tirei da rota.','08:14'],
      ['deles','Passa no Mercado Estrela antes das 11h, eles fecham pro almoço.','09:03'],
      ['minha','Tô a 2 paradas.','09:05'],
      ['deles','Show. Qualquer coisa me chama.','09:06'],
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
    empresa:'Água Rio Claro', versao:'Versão beta1.3.2', versaoSub:'atualizado hoje',
  },
  /* As 6 chaves de dinheiro do Avançado. `admin` NÃO é papel inventado na tela:
     é o que o próprio `GET /logistica/config` responde — pra quem não é
     responsável financeiro o bloco comercial vem AUSENTE, e é essa ausência que
     o app lê (o mesmo `isAdmin()` do app que já roda).
     "Avisar chegada" mora AQUI desde 07/08 (ordem do dono: sai da raiz dos
     Ajustes, entra no Avançado). "Modo caderneta" morreu na mesma ordem — o
     modo foi removido; a caderneta é a tela de anotações, e só. */
  avancado:{
    admin:1, financeiro:1, cobrancaSimples:0, precoPorCliente:1,
    naHora:1, mensal:1, fiado:1,
    avisarChegadaDist:'500 m', avisarChegada:1,
  },
  /* A ABERTURA NÃO TEM SEÇÃO DE DADO, e isso é de propósito — ver o comentário
     em cima do `.splash-barra`, na folha. Slot com valor de desenho aqui NÃO
     resolveria: o `casca-conferir` mede mock e app PIXEL A PIXEL, então o que
     o desenho mostrar o aparelho mostra igual; e a abertura é a única tela que
     a ponte não repinta (cena com relógio), então o `apagarDemonstracao` nunca
     alcança o que o `pintar(false)` do fim desta folha já pintou. Sem porta, a
     linha sai do DESENHO — não é escondida no aparelho. */
  recarga:{
    saldo:'240', ritmo:'~17 dias no seu ritmo',
    pacotes:[['100','49,00','',0,''],['300','129,00','+8% grátis',1,''],
             ['600','239,00','+15% grátis',0,''],['1.200','449,00','melhor preço',0,'']],
    cta:'Recarregar 300 créditos · R$ 129,00',
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
           pacto do fechamento da caderneta) — e o "Dinheiro/Pix/Cartão" de
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
  consumo:{
    saldo:'240', gastosHoje:'14', bonus:'24',
    linhas:[
      ['menos','Rota de quarta','14 paradas · hoje 06:12','14'],
      ['menos','Rota de terça','12 paradas · 05/08','12'],
      ['mais','Bônus de recarga','+8% no pacote de 300','24'],
      ['mais','Recarga','pacote 300 · Pix','300'],
      ['menos','Rota de segunda','11 paradas · 04/08','11'],
    ],
    vazio:'',
  },
  /* L10 — ROTAS SALVAS. `lista` e [nome, quando, paradas, produtos, marcado,
     icone, destaque, id]. "Duplicar" e o menu de tres pontos NAO entram: criar
     e editar modelo sairam no corte de 06/08 (isso e trabalho de escritorio,
     no desktop). Abrir GERA a rota do dia a partir do modelo. */
  salvas:{
    busca:'', total:'6 rotas salvas', ordem:'Mais recentes', acoes:1,
    lista:[
      ['Zona Sul manhã','23 de maio, 2025','15','20','184,00','map',0,''],
      ['Centro tarde','22 de maio, 2025','12','18','152,40','route',0,''],
      ['Sábado água 20L','17 de maio, 2025','18','1','98,00','gallon',0,''],
      ['Rota Moema','16 de maio, 2025','14','17','126,30','flag',1,''],
      ['Rota Brooklin','15 de maio, 2025','11','16','110,20','map',0,''],
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
    linhas:[
      [1,'08:30','João da Silva','R. das Palmeiras, 145','Santo Amaro',['20L x2','Vasilhame','Chip dia'],'42,00',''],
      [2,'09:15','Mercadinho Bom Preço','Av. João Dias, 890','Brooklin',['20L x4','Vasilhame'],'84,00',''],
      [3,'10:05','Maria Aparecida','R. Sargento Silva Nunes, 72','Moema',['20L x1','Chip dia'],'21,00','lime'],
      [4,'10:45','Padaria Pão Nosso','Av. Ibirapuera, 2331','Moema',['20L x2','Vasilhame'],'42,00',''],
      [5,'11:30','Bar do Zé','R. dos Otonis, 317','Jabaquara',['20L x3','Vasilhame'],'63,00',''],
      [6,'12:15','Mercado Estrela','R. Aracanguá, 210','Jabaquara',['20L x4','Chip dia'],'84,00','off'],
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
/** O miolo de uma tela de lista: esqueleto → aviso → o conteúdo de verdade. */
const miolo=(d,glifo,acao,linhas,conteudo)=>
  d.carregando ? esqLista(linhas) : d.semFonte ? semFonte(glifo,acao) : conteudo;

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
function listaParadas(comPerna){
  // "sem trajeto" ganha o tom de ALERTA: não é uma distância a menos, é um pino
  // faltando. Com a mesma cara do "850 m · 4 min" ele passava batido.
  return PARADAS.map(p=>{
    const semRota=p.perna&&p.perna.startsWith('sem');
    return `${comPerna&&p.perna?`<div class="perna${semRota?' alerta':''}"><span>${semRota?p.perna:'↓ '+p.perna}</span></div>`:''}${stop(p)}`;
  }).join('');
}
function shellRota(conteudo,dock){
  return `${status}${hdr({})}
    <div class="body${dock?' com-dock':''}">${conteudo}</div>
    ${dock?`<div class="tmx-dock">${dock}</div>`:''}${nav('rota')}`;
}
/* Os chips de dia MUDARAM DE TELA em 07/08 — moram na Montagem, ao lado da
   lista que eles trocam. Aqui eles ficavam a uma tela de distância do efeito. */
T.rota={nome:'Rota do dia (7 estados)',grupo:'Rota',render(){
  const e=estadoRota;

  if(e==='carregando') return shellRota(`
    <div class="kpis"><div class="kpi esq" style="height:47px;border:0"></div><div class="kpi esq" style="height:47px;border:0"></div>
      <div class="kpi esq" style="height:47px;border:0"></div></div>
    <div class="esq" style="height:34px;margin-top:6px"></div>
    <div style="margin-top:6px">${'<div class="esq esq-linha"></div>'.repeat(5)}</div>`);

  if(e==='vazia') return shellRota(`
    <div class="vazio">
      <span class="ico">${ic('route',24)}</span>
      <strong>Rota indisponível</strong>
      <span>Não consegui carregar o dia de hoje.</span>
      <button class="ghost">${ic('refresh',15)} Tentar de novo</button>
    </div>`);

  const rodando=e==='rodando', pausada=e==='pausada', montada=e==='pronta';
  const emCurso=rodando||pausada;
  
  // Dia sem parada nenhuma NÃO é "rota indisponível" (aquilo é falha de
  // carregar): é o dia ainda por montar. Mesma peça `.vazio`, o fato certo.
  if(!PARADAS.length) return shellRota(`
    <div class="vazio">
      <span class="ico">${ic('route',24)}</span>
      <strong>${DADOS.rota.vazioTitulo}</strong>
    </div>`, transmux(DADOS.rota.montando?'montando':(e==='semsinal'?'pronta':e)));
  return shellRota(`
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
  <div class="bar"><span class="t">${ic('list',17)} Sua rota de hoje</span>
    <button class="ghost" data-ir="mapa">${ic('map',15)} Ver mapa</button></div>
  ${emCurso?`<div class="dia-bar"><small>${DADOS.rota.diaFeitas} de ${DADOS.rota.diaTotal}</small><span class="trilho"><i style="width:${DADOS.rota.diaPct}"></i></span><b>${DADOS.rota.diaMarcado}</b><small>marcado</small></div>`:''}
  ${emCurso?`<div class="filtro">
      <button class="on">Fila <b>${DADOS.rota.filtroFila}</b></button><button>Entregue <b>${DADOS.rota.filtroEntregue}</b></button></div>`:''}
  ${montada||e==='montar'?`<div class="creditos">${ic('card',17)}
      <span><b class="v">${DADOS.rota.creditos}</b> <small>créditos hoje</small></span>
      <span class="debita">${montada
        ? (DADOS.rota.creditosDebita?`Iniciar debita ${DADOS.rota.creditosDebita}`:'não consegui o custo agora')
        : 'monte a rota pra saber'}</span></div>`:''}
  <div class="stops" data-gestos="rota">${listaParadas(emCurso)}</div>
  <div class="sum" data-ir="caderneta">
    <span class="c"><span style="color:var(--lime)">${ic('box',17)}</span><span><b>${DADOS.rota.somaProdutos}</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--ink-2)">${ic('receipt',17)}</span><span><b>${DADOS.rota.somaMarcado}</b><small>marcado</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('check',17)}</span><span><b>${emCurso?DADOS.rota.kpiEntregues:DADOS.rota.kpiEntreguesParado}</b><small>entregas</small></span></span>
    <span class="go">${ic('chev',15)}</span>
  </div>
  ${emCurso?''   /* o Finalizar é o satélite do dock: no polegar, sem rolar a lista inteira */
           :`<button class="act full" style="margin-top:8px;justify-content:center" data-ir="caderneta">${ic('note',17)}<b>Abrir caderneta</b></button>`}
  `, transmux(DADOS.rota.montando?'montando':(e==='semsinal'?'pronta':e)));
}};

/* versão antiga da tela (mantida como referência das fotos) --------------- */
T.rotafoto={nome:'Rota — igual à foto',grupo:'Rota',render(){return `${status}
${hdr({})}
<div class="body">
  <div class="kpis">
    <div class="kpi"><span style="color:var(--lime)">${ic('route',20)}</span><span><b class="v">${DADOS.rota.kpiParadas}</b><span class="l">paradas</span></span></div>
    <div class="kpi"><span style="color:var(--lime)">${ic('check',20)}</span><span><b class="v">6</b><span class="l">entregues</span></span></div>
    ${DADOS.rota.saldo?`<div class="kpi money"><span class="l">Saldo</span><b class="v">${DADOS.rota.saldo}</b><span class="go">${ic('chev',15)}</span></div>`:''}
    ${(DADOS.rota.dinheiro||DADOS.rota.pix)?`<div class="kpi split">
      ${DADOS.rota.dinheiro?`<span class="ln"><span style="color:var(--lime)">${ic('cash',16)}</span><span><span class="t" style="color:var(--lime)">Dinheiro</span><span class="m">${DADOS.rota.dinheiro}</span></span></span>`:''}
      ${DADOS.rota.pix?`<span class="ln"><span style="color:var(--blue-l)">${ic('pix',16)}</span><span><span class="t" style="color:var(--blue-l)">Pix</span><span class="m">${DADOS.rota.pix}</span></span></span>`:''}
    </div>`:''}
  </div>
  <div class="bar"><span class="t">${ic('list',17)} Sua rota de hoje</span>
    <button class="ghost" data-ir="mapa">${ic('map',15)} Ver mapa</button></div>
  <div class="stops">
    ${stop({n:1,hora:'08:30',nome:'João da Silva',rua:'R. das Palmeiras, 145',bairro:'Santo Amaro',tags:[['20L x2','blue'],['Vasilhame'],['Chip dia','lime']],marcado:'42,00',pill:['A caminho','blue','nav']})}
    ${stop({n:2,hora:'09:15',nome:'Mercadinho Bom Preço',rua:'Av. João Dias, 890',bairro:'Brooklin',tags:[['20L x4','blue'],['Vasilhame']],marcado:'84,00',pill:['A caminho','blue','nav']})}
    ${stop({n:3,hora:'10:05',cor:'lime',nome:'Maria Aparecida',rua:'R. Sargento Silva Nunes, 72',bairro:'Moema',tags:[['20L x1','blue'],['Chip dia','lime']],marcado:'21,00',pill:['Chegou','lime','check']})}
    ${stop({n:4,hora:'10:45',cor:'lime',nome:'Padaria Pão Nosso',rua:'Av. Ibirapuera, 2331',bairro:'Moema',tags:[['20L x2','blue'],['Vasilhame']],marcado:'42,00',pill:['Chegou','lime','check']})}
    ${stop({n:5,hora:'11:30',nome:'Bar do Zé',rua:'R. dos Otonis, 317',bairro:'Jabaquara',tags:[['20L x3','blue'],['Vasilhame']],marcado:'63,00',pill:['Pendente','amber','clock']})}
    ${stop({n:6,hora:'12:15',cor:'off',nome:'Mercado Estrela',rua:'R. Aracanguá, 210',bairro:'Jabaquara',tags:[['20L x4','blue'],['Chip dia','lime']],marcado:'84,00',pill:['Pendente','mute','clock']})}
  </div>
  <div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('box',17)}</span><span><b>${DADOS.rota.somaProdutos}</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--ink-2)">${ic('receipt',17)}</span><span><b>${DADOS.rota.somaMarcado}</b><small>marcado</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('check',17)}</span><span><b>6</b><small>entregas</small></span></span>
    <span class="go">${ic('chev',15)}</span>
  </div>
  <div class="acts">
    <button class="act go wide" data-ir="venda">${ic('play',21)}<span><b>Iniciar próxima parada</b><small>João da Silva</small></span></button>
    <button class="act" data-ir="caderneta">${ic('note',19)}<b>Abrir caderneta</b></button>
  </div>
</div>
${nav('rota')}`;}};

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
    return `<div class="emp no-ar${e.aceso?' on':''}"${gancho}${geo}
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
        <span class="seta">${ic('check',26)}</span>
        <span>${g.chegouTitulo?`<b class="dist">${g.chegouTitulo}</b>`:''}${g.paradaNome?`
          <span class="verbo">${g.paradaNome}</span>`:''}</span>
      </div>
      ${baixo?`<div class="baixo">${baixo}</div>`:''}
    </div>
    <div class="gps-lado" style="bottom:118px">
      <button data-acao="gps-centrar" aria-label="Recentralizar">${ic('target',18)}</button>
    </div>
    <div class="gps-rodape">
      ${rodape?`<div class="parada">${ic('route',14)} ${rodape}</div>`:''}
      <button class="act go full" style="justify-content:center">${ic('check',20)}<b>${g.chegouAcao||''}</b></button>
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
        ${g.manobraIcone?`<span class="seta">${ic(g.manobraIcone,26)}</span>`:''}
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

    <!-- eu: fixo a 68% da altura, no centro. A tela é a rua À FRENTE. -->
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
      <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 3.5 L16 13 L12 10.6 L8 13 Z" fill="#ff8b85"/></svg><span data-vivo="rumo">${g.rumo}</span>
    </div>`:''}
    ${g.velocidade?`<div class="gps-vel"><b data-vivo="velocidade">${g.velocidade}</b>${g.velocidadeUnidade?`<small>${g.velocidadeUnidade}</small>`:''}</div>`:''}
    <!-- Os dois botões da beirada: até 08/08 eles não tinham GANCHO nenhum e o
         toque morria no vidro. A voz é a do APARELHO (a chave voz do
         soundPrefs), então o estado "mudo" chega pelo seam como qualquer outro
         dado da tela. (Sem CRASE aqui dentro: este comentário mora num
         template literal e a crase o fecharia — foi o que eu fiz agora.) -->
    <div class="gps-lado">
      <button data-acao="gps-voz" class="${g.vozMuda?'mudo':''}"
        aria-label="${g.vozMuda?'Ligar voz':'Silenciar voz'}">${ic('volume',18)}</button>
      <button data-acao="gps-centrar" aria-label="Recentralizar">${ic('target',18)}</button>
    </div>

    <!-- 🔴 O RODAPÉ PODE FICAR SÓ COM O "Encerrar", e é o certo: ele é a PORTA
         DE SAÍDA da navegação. Motorista preso nesta tela é pior que qualquer
         número faltando — por isso o "encerrar" é COPY e nunca zera. (Sem
         CRASE aqui dentro: este comentário mora num template literal.) -->
    <div class="gps-rodape">
      ${rodape?`<div class="parada">${ic('route',14)} ${rodape}</div>`:''}
      <div class="linha">
        ${num(g.chegada,g.chegadaRotulo,1,'chegada')}
        ${num(g.restante,g.restanteRotulo,0,'restante')}
        ${num(g.distancia,g.distanciaRotulo,0,'distancia')}
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
      <button class="round sm" data-ir="rota">${ic('close',16)}</button></div>
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
        <span><span class="box-s">Lançamento na caderneta</span><b style="display:block;font-size:15px;color:var(--lime);margin-top:2px">${d.lancamento}</b></span>
        <span style="color:var(--blue-l)">${ic('note',19)}</span></div>
    </div>
    <div class="box">
      <div class="box-t">Forma de pagamento</div>
      <div class="pays">
        <button class="pay${d.forma==='dinheiro'?' sel':''}" data-acao="forma" data-forma="dinheiro"><span style="color:var(--lime)">${ic('cash',21)}</span><b>Dinheiro</b>${d.forma==='dinheiro'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay blue${d.forma==='pix'?' sel':''}" data-acao="forma" data-forma="pix"><span style="color:var(--blue-l)">${ic('pix',21)}</span><b>Pix</b>${d.forma==='pix'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay${d.forma==='cartao'?' sel':''}" data-acao="forma" data-forma="cartao"><span style="color:var(--ink-2)">${ic('card',21)}</span><b>Cartão</b>${d.forma==='cartao'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
        <button class="pay${d.forma==='fiado'?' sel':''}" data-acao="forma" data-forma="fiado"><span style="color:var(--ink-2)">${ic('note',21)}</span><b>Caderneta</b>${d.forma==='fiado'?`<i class="ok">${ic('check',15)}</i>`:''}</button>
      </div>
    </div>
    <div class="box">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="box-t">Resumo do recebimento</span>
        <button class="ghost">${ic('edit',13)} Editar valores</button></div>
      <div class="rowline"><span>Recebido hoje</span><b>${d.recebido}</b></div>
      <div class="rowline"><span>Vai para caderneta</span><b>${d.paraCaderneta}</b></div>
    </div>
    <div class="foot2">
      <button class="act go" style="justify-content:center" data-acao="confirmar-venda">${ic('check',19)}<b>Confirmar venda</b></button>
      <button class="act" style="justify-content:center" data-ir="rota">${ic('enter',17)}<b>Voltar para rota</b></button>
    </div>
  </div>
</div>
${nav('rota')}`;}};

/* 5 — CADERNETA + FECHAMENTO --------------------------------------------- */
T.caderneta={nome:'Caderneta · fechamento',grupo:'Caderneta',render(){const d=DADOS.caderneta;return `${status}
${hdr({voltar:'rota'})}
<div class="body">
  <div class="kpis">
    <div class="kpi"><span style="color:var(--lime)">${ic('route',20)}</span><span><b class="v">${DADOS.rota.kpiParadas}</b><span class="l">paradas</span></span></div>
    <div class="kpi"><span style="color:var(--lime)">${ic('check',20)}</span><span><b class="v">${d.entregues}</b><span class="l">entregues</span></span></div>
    <div class="kpi money"><span class="l">Saldo</span><b class="v">${DADOS.rota.saldo}</b><span class="go">${ic('chev',15)}</span></div>
  </div>
  <div class="bar"><span class="t">${ic('list',17)} Paradas de hoje</span>
    <button class="ghost" data-ir="mapa">${ic('map',15)} Ver mapa</button></div>
  <div class="stops">${listaParadas(false)}</div>
</div>
<div class="sheet" style="max-height:52%">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <span style="display:flex;align-items:center;gap:10px">
      <span class="round" style="border-color:var(--line-2)">${ic('lock',18)}</span>
      <b style="font-size:16px;font-weight:500;display:block">Fechamento do dia</b></span>
    <span class="pill mute">${d.selo} ${ic('check',14)}</span>
  </div>
  ${(d.formas.length||d.formaTotal)?`<div class="forms">
    ${d.formas.map(f=>`<div class="form-c"><span style="color:${f[1]}">${ic(f[0],19)}</span><small>${f[2]}</small><b>${f[3]}</b></div>`).join('')}
    ${d.formaTotal?`<div class="form-c total"><small style="margin-top:0">Total</small><b>${d.formaTotal}</b></div>`:''}
  </div>`:''}
  ${(d.clientes||d.produtos||d.marcado)?`<div class="sum">
    ${d.clientes?`<span class="c"><span style="color:var(--ink-2)">${ic('users',17)}</span><span><b>${d.clientes}</b><small>clientes</small></span></span>`:''}
    ${d.produtos?`<span class="c"><span style="color:var(--ink-2)">${ic('box',17)}</span><span><b>${d.produtos}</b><small>produtos</small></span></span>`:''}
    ${d.marcado?`<span class="c"><span style="color:var(--ink-2)">${ic('receipt',17)}</span><span><b>${d.marcado}</b><small>marcado</small></span></span>`:''}
  </div>`:''}
  <div class="acts">
    <button class="act go" style="justify-content:center" data-acao="fechar-dia">${ic('check',19)}<b>Fechar o dia</b></button>
    <button class="act" style="justify-content:center" data-ir="semana">${ic('chart',17)}<b>Ver detalhes</b></button>
  </div>
</div>
${nav('rota')}`;}};

/* 6 — HISTÓRICO DA SEMANA ------------------------------------------------- */
T.semana={nome:'Histórico da semana',grupo:'Caderneta',render(){
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
  <div class="kpis">
    <div class="kpi"><span style="color:var(--lime)">${ic('route',20)}</span><span><b class="v">${DADOS.rota.kpiParadas}</b><span class="l">paradas</span></span></div>
    <div class="kpi"><span style="color:var(--lime)">${ic('check',20)}</span><span><b class="v">${DADOS.caderneta.entregues}</b><span class="l">entregues</span></span></div>
  </div>
  <!-- O fundo é a tela de trás DESBOTADA, não um enfeite: com parada de maquete
       aqui, o dono lia "João da Silva" por cima do dinheiro real dele. Fundo
       também é tela. -->
  <div class="stops">${listaParadas(false)}</div>
</div>
<div class="scrim"></div>
<div class="sheet" style="max-height:80%">
  <span class="handle"></span>
  <div style="display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:12px">
    <h2 style="margin:0;font-size:20px;font-weight:500">Histórico da semana</h2>
    <button class="round sm" style="position:absolute;right:0" data-ir="caderneta">${ic('close',15)}</button></div>
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
  const l=(n,h,nome,rua,bairro,tags,valor,cor)=>`
    <div class="stop">
      <span class="grip"></span>
      <span class="numwrap"><span class="num ${cor}">${n}</span><span class="hh ${cor}">${h}</span></span>
      <span class="who"><strong>${nome}</strong><span>${rua}</span><span>${bairro}</span>
        <span class="tags">${tags.map(t=>`<b class="tag ${t.startsWith('20L')?'blue':t==='Chip dia'?'lime':''}">${t}</b>`).join('')}</span></span>
      <span class="side"><span class="marc"><small>Marcado</small><b>R$ ${valor}</b></span></span></div>`;
  /* Os chips do dia moram AQUI (07/08). Antes ficavam na tela Rota, longe da
     lista que eles mudam — o dono trocava de dia e via a lista de hoje. Quem
     sabe quais dias existem é a ponte; sem ela — o desenho — a linha some. */
  const chips=Array.isArray(d.dias)&&d.dias.length?`<div class="chips centro">
    ${d.dias.map(x=>`<button class="chip${(d.diaSel||0)===x[0]?' on':''}" data-acao="montar-dia" data-dia="${x[0]}">${x[1]}</button>`).join('')}</div>`:'';
  const lista=d.linhas.length
    ? `<div class="stops" data-gestos="rota">${d.linhas.map(x=>l(...x)).join('')}</div>`
    : `<div class="vazio"><span class="ico">${ic('route',24)}</span><strong>${d.vazio}</strong></div>`;
  /* 🔴 O BOTÃO DE MONTAR NÃO ROLA (dono, 08/08: "montar rota não está sempre
     visível"). Ele nascia no PÉ da lista: com 52 clientes na tela isso é
     3.259 px abaixo da dobra — MEDIDO no g15 — e cada repinte devolvia o dedo
     pro topo, então na prática ele não existia. A lei já estava escrita nesta
     folha desde o rodapé da Rota ("quem rola é conteúdo; controle de operação
     em andamento, nunca"); faltava aplicá-la aqui. Mesma peça, `.tmx-dock`.
     Lado a lado e não empilhados: dois botões cheios comiam 22% da tela do
     motorista pra sempre. O que MONTA leva a largura maior (`wide`). */
  const pe=d.linhas.length?`<div class="acts pe-montagem" style="margin-top:0">
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
  </div>`:'';
  return `${status}
${hdr({voltar:'rota'})}
<div class="body${pe?' com-dock-1':''}">
  <h2 style="font-size:23px;font-weight:500;margin:4px 0 2px;letter-spacing:-.4px">${d.titulo}</h2>
  ${chips}
  ${miolo(d,'route','recarregar-montagem',5,`${lista}
  <div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('route',17)}</span><span><b>${d.somaParadas}</b><small>paradas</small></span></span>
    <span class="c"><span style="color:var(--blue-l)">${ic('box',17)}</span><span><b>${d.somaProdutos}</b><small>produtos</small></span></span>
    <span class="c"><span style="color:var(--lime)">${ic('cash',17)}</span><span><b>${d.somaValor}</b><small>valor marcado</small></span></span>
  </div>`)}
</div>
${pe?`<div class="tmx-dock">${pe}</div>`:''}${nav('rota')}`;}};

/* 9 — ROTAS SALVAS -------------------------------------------------------- */
T.salvas={nome:'Rotas salvas',grupo:'Rota',render(){
  const d=DADOS.salvas;
  const r=(nome,data,paradas,prod,valor,icone,tomLime,id)=>`
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
    ? d.lista.map(x=>r(x[0],x[1],x[2],x[3],x[4],x[5],x[6],x[7])).join('')
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

/* 0 — ENTRADA (abertura do app) ------------------------------------------ */
T.entrada={nome:'Entrada (abertura)',grupo:'Sistema',render(){
  // As hastes nascem com coordenadas provisórias: quem crava é `ajustarHastes`,
  // que MEDE o glifo do X depois da tela montada. Cravar aqui na mão faria a
  // haste e o glifo desencontrarem a cada mudança de fonte ou de tamanho.
  return `${status}
<div class="body flush" style="overflow:hidden">
  <div class="splash">
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
  </div>
</div>`;}};

/** Põe as duas hastes exatamente em cima das diagonais do glifo do X, e o
 *  clarão no cruzamento. Medido, nunca chutado — a haste é a MESMA forma que o
 *  glifo assume depois; 2px de erro aqui viram um pulo visível na troca. */
function ajustarHastes(camada){
  const splash=camada.querySelector('.svg-ok, .splash'); if(!splash) return;
  const em=splash.querySelector('.w em'); if(!em) return;
  const pos=(n,c)=>{let x=0,y=0;while(n&&n!==c){x+=n.offsetLeft;y+=n.offsetTop;n=n.offsetParent;}return{x,y};};
  const p=pos(em,splash);
  const cx=p.x+em.offsetWidth/2, cy=p.y+em.offsetHeight/2;
  const hw=em.offsetWidth*.34, hh=em.offsetHeight*.30;
  const põe=(sel,x1,y1,x2,y2)=>splash.querySelectorAll(sel).forEach(l=>{
    l.setAttribute('x1',x1.toFixed(1)); l.setAttribute('y1',y1.toFixed(1));
    l.setAttribute('x2',x2.toFixed(1)); l.setAttribute('y2',y2.toFixed(1));});
  põe('.haste-a', cx-hw, cy-hh, cx+hw, cy+hh);   // desce da esquerda pra direita
  põe('.haste-b', cx+hw, cy-hh, cx-hw, cy+hh);   // sobe da direita pra esquerda
  const fl=splash.querySelector('.splash-flash');
  if(fl){ fl.style.left=(cx-48)+'px'; fl.style.top=(cy-48)+'px'; fl.style.marginLeft='0'; }
}

/* 19 — SUB-TELAS DOS AJUSTES ---------------------------------------------- */
const telaAjuste=(titulo,corpo,rodape)=>`${status}
${hdr({voltar:'ajustes',semChat:1})}
<div class="body${rodape?' com-dock':''}">${titulo?`<h1 class="tela-tit">${titulo}</h1>`:''}${corpo}</div>
${rodape?`<div class="tmx-dock">${rodape}</div>`:''}${nav('ajustes')}`;

T.recarga={nome:'Ajustes · Recarga',grupo:'Ajustes',render(){
  const r=DADOS.recarga;
  const pac=(c,preco,selo,on,chave)=>`<button class="pacote ${on?'on':''}"${chave?` data-acao="pacote" data-pacote="${chave}"`:''}>${selo?`<span class="selo">${selo}</span>`:''}
    <b>${c}</b><small>créditos</small><span class="preco">R$ ${preco}</span></button>`;
  /* 🔴 A TELA DE DINHEIRO É A ÚLTIMA QUE PODE MENTIR. Ela nascia com o catálogo
     do desenho — R$ 49 / 129 / 239 / 449, "+8% grátis", "melhor preço" — e com
     um botão anunciando "Recarregar 300 créditos · R$ 129,00" que, sem pacote
     escolhido de verdade, não faz NADA. Preço inventado com botão em cima é o
     pior defeito que esta frente podia ter. */
  return telaAjuste('Recarga de créditos',`
    ${miolo(r,'card','recarregar-recarga',4,`
    <div class="creditos" style="margin-top:2px">${ic('card',17)}
      <span><b class="v">${r.saldo}</b> <small>créditos hoje</small></span>
      ${r.ritmo?`<span class="debita">${r.ritmo}</span>`:''}</div>
    <div class="grupo">Escolha o pacote</div>
    <div class="pacotes">
      ${r.pacotes.map(x=>pac(x[0],x[1],x[2],x[3],x[4])).join('')}
    </div>`)}
    <div class="grupo">Pagar com</div>
    <div class="pays" style="margin-top:0">
      <button class="pay sel"><span style="color:var(--blue-l)">${ic('pix',21)}</span>
        <span><b>Pix</b><small>cai na hora</small></span><i class="ok">${ic('check',15)}</i></button>
      <button class="pay"><span style="color:var(--ink-2)">${ic('card',21)}</span>
        <span><b>Cartão</b><small>até 3× sem juros</small></span></button>
    </div>
    <div class="banner pausa" style="margin-top:9px">${ic('alert',15)}
      <span>Crédito só é debitado quando a rota <b>inicia</b>. Conferir nunca debita.</span></div>`,
    r.cta?`<button class="act go full" style="justify-content:center" data-acao="recarregar">${ic('check',19)}<b>${r.cta}</b></button>`:'');
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
    ${secao('Quem está devendo',f.devedores.length?`<div class="cartao-lista" style="padding:0 11px">
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
    </div>`));
}};

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
    </div>
    <button class="act full perigo" style="margin-top:9px;justify-content:center"
      data-superficie="confirmar">${ic('trash',17)}<b>Apagar o histórico todo</b></button>`);
}};

T.consumo={nome:'Ajustes · Consumo e bônus',grupo:'Ajustes',render(){
  const l=(tipo,t,s,v)=>`<div class="ext-linha">
    <span class="m ${tipo}">${tipo==='mais'?'+':'−'}</span>
    <span><strong>${t}</strong><span>${s}</span></span>
    <b class="${tipo}">${v}</b></div>`;
  const c=DADOS.consumo;
  return telaAjuste('Consumo e bônus',`
    <div class="kpis" style="margin-top:2px">
      ${c.saldo?`<div class="kpi"><span style="color:var(--lime)">${ic('card',20)}</span><span><b class="v">${c.saldo}</b><span class="l">saldo</span></span></div>`:''}
      ${c.gastosHoje?`<div class="kpi"><span style="color:var(--ink-2)">${ic('chart',20)}</span><span><b class="v">${c.gastosHoje}</b><span class="l">gastos hoje</span></span></div>`:''}
      ${c.bonus?`<div class="kpi"><span style="color:var(--lime)">${ic('spark',20)}</span><span><b class="v">${c.bonus}</b><span class="l">de bônus</span></span></div>`:''}
    </div>
    <div class="grupo">Movimento</div>
    ${miolo(c,'sales','recarregar-consumo',4,`<div class="extrato">
      ${c.linhas.length?c.linhas.map(x=>l(x[0],x[1],x[2],x[3])).join(''):`<div class="vazio"><b>${c.vazio||'Sem movimento ainda'}</b></div>`}
    </div>`)}
    <div class="banner pausa" style="margin-top:9px">${ic('alert',15)}
      <span>Migração entre rotas é <b>grátis</b>: a mesma entrega não debita duas vezes.</span></div>`);
}};

/* 20 — ROTA RÁPIDA --------------------------------------------------------- */
T.rapida={nome:'Rota rápida',grupo:'Rota',render(){
  return `${status}
${hdr({voltar:'rota'})}
<div class="body">
  <label class="search" style="height:48px;margin-top:4px">${ic('search',18)}
    <input placeholder="Endereço, CEP, coordenada ou link" value="Rua 14 JP, 1682"></label>
  <div class="grupo">Achei estes</div>
  <div class="stops">
    <div class="stop on"><span class="grip"></span>
      <span class="numwrap"><span class="num">1</span><span class="hh">220 m</span></span>
      <span class="who"><strong>Rua 14 JP, 1682</strong><span>Jd. São Caetano · Rio Claro — SP</span>
        <span class="tags"><b class="tag lime">já é cliente</b><b class="tag">Larissa Ypê</b></span></span>
      <span class="side"><span class="pill blue">${ic('check',14)}Usar</span></span></div>
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num off">2</span><span class="hh off">1,4 km</span></span>
      <span class="who"><strong>Rua 14 JP, 168</strong><span>Centro · Rio Claro — SP</span>
        <span class="tags"><b class="tag">porta sem cadastro</b></span></span>
      <span class="side"><span class="pill mute">Usar</span></span></div>
  </div>
  <div class="grupo">Modo cadastro</div>
  <div class="campos">
    <label class="campo"><label>Nome de quem recebe</label><input></label>
  </div>
  <div class="acts">
    <button class="act go wide" style="justify-content:center" data-ir="rota">${ic('plus',19)}<b>Colocar na rota</b></button>
    <button class="act" style="justify-content:center" data-ir="rota">${ic('back',17)}<b>Voltar</b></button>
  </div>
</div>
${nav('rota')}`;}};

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
  <div class="acts" style="margin-top:12px">
    <button class="act go wide" style="justify-content:center" data-acao="salvar-produto">${ic('check',19)}<b>Salvar</b></button>
    <button class="act" style="justify-content:center" data-superficie="confirmar">${ic('box',17)}<b>Arquivar</b></button>
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

/* 23 — LEITURA DE ROTA (gravando o caminho) -------------------------------- */
T.leitura={nome:'Leitura de rota',grupo:'Sistema',render(){return `${status}
${hdr({voltar:'rota'})}
<div class="body com-dock">
  <div class="gravando">
    <span class="bola"></span>
    <span><b>Gravando</b><span>7 locais · 12,4 km percorridos</span></span>
    <span class="crono">00:38:12</span>
  </div>
  <div class="grupo">Locais registrados</div>
  <div class="stops">
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num lime">1</span><span class="hh lime">08:12</span></span>
      <span class="who"><strong>João da Silva</strong><span>R. das Palmeiras, 145 · local ±4 m</span>
        <span class="tags"><b class="tag lime">cliente existente</b><b class="tag blue">20L x2</b></span></span>
      <span class="side"><span class="pill lime">${ic('check',14)}Salvo</span></span></div>
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num lime">2</span><span class="hh lime">08:29</span></span>
      <span class="who"><strong>Porta sem cadastro</strong><span>Av. João Dias, 890 · local ±6 m</span>
        <span class="tags"><b class="tag" style="border-color:rgba(245,165,36,.55);color:var(--amber)">falta o nome</b></span></span>
      <span class="side"><span class="pill amber">${ic('edit',14)}Nomear</span></span></div>
    <div class="stop"><span class="grip"></span>
      <span class="numwrap"><span class="num lime">3</span><span class="hh lime">08:47</span></span>
      <span class="who"><strong>Maria Aparecida</strong><span>R. Sargento Silva Nunes, 72 · local ±3 m</span>
        <span class="tags"><b class="tag lime">cliente existente</b><b class="tag blue">20L x1</b></span></span>
      <span class="side"><span class="pill lime">${ic('check',14)}Salvo</span></span></div>
  </div>
</div>
<div class="tmx-dock">
  <div class="transmux">
    <span class="tmx-sat tmx-perigo"><button>${ic('trash',20)}</button><small>Cancelar</small></span>
    <span class="tmx-main"><button data-estado="pausar">${ic('gps',34)}</button><small>Checkpoint</small></span>
    <span class="tmx-sat tmx-info"><button>${ic('check',20)}</button><small>Finalizar</small></span>
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
  ${p('missao','Rota recebida da Central','Aceitar · Depois · Negar','alerta')}
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
${hdr({voltar:'clientes',semChat:1})}
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

  <div class="grupo">Onde é</div>
  <div class="campos">
    <label class="campo"><label>CEP</label><input value="${f.cep}" data-campo="cep"></label>
    <div class="tripla">
      <label class="campo"><label>Rua</label><input value="${f.rua}" data-campo="rua"></label>
      <label class="campo${f.numeroPendente?' erro':''}"><label>Número ${f.numeroPendente?'<span class="pend">· pendente</span>':''}</label><input placeholder="—" value="${f.numero}" data-campo="numero"></label>
      <label class="campo"><label>Bairro</label><input value="${f.bairro}" data-campo="bairro"></label>
    </div>
    <label class="campo"><label>Observações da porta</label>
      <textarea data-campo="observacoes">${f.observacoes}</textarea></label>
  </div>

  <div class="grupo">Dias de entrega</div>
  <div class="dias">
    ${ROT.map((r,i)=>dia(r,'',f.dias[i],i+1)).join('')}
  </div>

  <div class="grupo">O que leva</div>
  <div class="cartao-lista" style="padding:0 11px">
    ${f.produtos.map(p=>`<div class="item-linha"><span class="ava" style="width:32px;height:32px">${ic(p[0],16)}</span>
      <span><strong>${p[1]}</strong><span>${p[2]}</span></span>
      <span style="color:var(--ink-3)">${ic('chev',15)}</span></div>`).join('')}
  </div>
  <button class="act full" style="margin-top:7px;justify-content:center">${ic('plus',17)}<b>Novo produto / entrega</b></button>

  <div class="acts" style="margin-top:12px">
    <button class="act go wide" style="justify-content:center" data-acao="salvar-cliente">${ic('check',19)}<b>Salvar</b></button>
    <button class="act perigo" style="justify-content:center"
      data-superficie="confirmar">${ic('trash',17)}<b>Excluir</b></button>
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
      <button class="round sm" data-ir="rota">${ic('close',16)}</button></div>

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
      ? d.conversa.map(m=>`<div class="msg ${m[0]}">${m[1]}<small>${m[2]}</small></div>`).join('')
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
  /* Linha que ABRE um módulo (barra de 3, 07/08): Clientes/Produtos/Caderneta
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
    ${linha('sales','Consumo e bônus','','','ir-consumo')}
    ${a.painelCreditos===''?'':chave('calendar','Painel de créditos do dia','',a.painelCreditos,'painel-creditos')}
    ${linha('card','Recarga de créditos',a.creditosLinha,'','ir-recarga')}
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
  <div class="grupo">Caderneta</div>
  <div class="cartao-lista">
    ${linhaIr('note','Abrir caderneta','caderneta')}
  </div>
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
    <div class="linha-cfg" style="cursor:default"><span class="ico">${ic('gear',16)}</span>
      <span><strong>${a.versao}</strong>${a.versaoSub?`<span>${a.versaoSub}</span>`:''}</span><span></span></div>
  </div>`)}
</div>
${nav('ajustes')}`;}};

/* ==========================================================================
   MONTAGEM
   ========================================================================== */
const ORDEM=['entrada','rota','rotafoto','mapa','mapachegou','mapalista','gerenciador','montagem','conferencia',
             'venda','folha','folhanao','rapida','salvas','caderneta','semana','clientes','ficha','produtos',
             'fichaproduto','chat','ajustes','recarga','financeiro','avancado','sons','historico','consumo',
             'passeio','leitura','portoes'];
const GRUPOS=['Sistema','Rota','Caderneta','Cadastro','Ajustes'];
let atual='entrada';

/* Quanto tempo a camada que SAI ainda precisa ficar viva, por transição.
   Tirar antes da hora corta a animação no meio — o defeito clássico. */
const DUR={escalonado:200,desfoque:180,molinha:180,eixoz:320,eixox:300,conteudo:30,nenhuma:0};
/** Telas que TOMAM o aparelho inteiro — entram e saem por outro padrão. */
const TELA_CHEIA=['mapa','mapachegou'];

function pintarRail(){/* barra lateral do visualizador: não existe no aparelho */}

/** Marca e numera as peças do corpo — é o que dá a ORDEM de entrada. Teto de
 *  14 pra tela cheia não terminar de entrar depois do dedo já ter rolado. */
function numerarItens(tela){
  tela.querySelectorAll('.kpi,.bar,.stop,.cli,.prod,.week,.rowcard,.sum,.acts,.box,.prog,.forms,.searchrow,.chips')
      .forEach((el,i)=>{el.classList.add('anim-item');el.style.setProperty('--i',Math.min(i,14));});
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
   até lá) — pra ela o teto é `ENTRADA_COMUM`. A tela cheia do GPS tem a CENA
   DA COBRA: pra ela o teto é `CENA_CHEIA`. Um teto de 2,2 s aplicado a TODA
   tela seria reabrir o buraco do "nasce terminada" por 1,3 s de brinde.

   🔴 `CENA_CHEIA` É TETO, NÃO É A DURAÇÃO — e a diferença custou uma medição.
   A cobra dura 1,36 s de RELÓGIO DA ANIMAÇÃO; este número é de RELÓGIO DE
   PAREDE, e os dois não coincidem. MEDIDO no g15 (07/08): ao entrar na rota a
   thread trava ~490 ms subindo o mapa, então no instante em que a parede
   marcava 519 ms o relógio do véu marcava 33. Com o teto colado na duração
   (1,4 s) a marca caía com a animação ainda em ~950 ms e a ROTA era CORTADA
   no meio de se desenhar — o motorista via o traço sumir e o mapa pronto
   aparecer de estalo. A folga cobre a travada; quem termina a cena continua
   sendo a própria animação (todo `@keyframes` daqui é `both`, o estado final
   fica). O teto só existe pro caso de nada terminar. */
const CENA_CHEIA=2200;
const ENTRADA_COMUM=900;
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
  // medido ANTES de qualquer troca: no ramo comum a camada velha é destruída
  // (`innerHTML=''`) e depois disso não há o que perguntar.
  const rolagem=animar?{}:medirRolagem(antiga);
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
     herdam SEMPRE: são cenas com camada de saída no ar, e o caminho comum
     (`innerHTML=''`) cortaria o show no meio. */
  const entradaViva = antiga
    && (performance.now()-entradaEm) < (antiga.classList.contains('cena')?CENA_CHEIA:ENTRADA_COMUM);
  const herdando = !animar && antiga && antiga.classList.contains('entra')
    && (entradaViva || antiga.classList.contains('cheio') || antiga.classList.contains('abertura'));
  // A varredura de zumbi e o cancelamento do relógio são da TROCA de tela. No
  // repinte não: a camada que SAI ainda está no ar (na abertura ela é o show
  // inteiro — é o logo voando pro cabeçalho) e o relógio dela segue valendo.
  if(!herdando){
    camadas.slice(0,-1).forEach(c=>c.remove());
    clearTimeout(limpezaTimer);
  }
  const nova=document.createElement('div');
  nova.className='tela';
  nova.innerHTML=T[atual].render();
  // ITEM 9 — antes de numerar e de entrar em cena: o que o admin desligou não
  // chega a existir na camada. Numerar primeiro deixaria buraco na fila de
  // entrada (o `--i` das peças) e a animação sairia com degrau.
  podarDesligados(nova);
  numerarItens(nova);
  if(atual==='entrada') requestAnimationFrame(()=>ajustarHastes(nova));
  // Os dois gestos valem em TODA lista de paradas. A tela que os ENSINAVA saiu
  // (07/08, ordem do dono: fora as explicações); o gesto ficou e trocou de
  // endereço — quem liga não é mais o nome da tela, é a marca `data-gestos`.
  requestAnimationFrame(()=>ligarGestos(nova));
  // DIREÇÃO (eixo X): +1 = avançando, entra pela direita; -1 = voltando, entra
  // pela esquerda. Um "voltar" que entra pelo mesmo lado do "avançar" é mentira
  // de navegação — o dedo aprende o gesto errado.
  nova.style.setProperty('--dir', dir===-1?-1:1);
  if(antiga) antiga.style.setProperty('--dir', dir===-1?-1:1);

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
        const wO=origem.querySelector('.w'), wA=alvo.querySelector('.w');
        const pl=posNaCamada(origem,antiga);
        const po=posNaCamada(wO,antiga), pa=posNaCamada(wA,nova);
        const co={x:po.x+wO.offsetWidth/2, y:po.y+wO.offsetHeight/2};
        const ca={x:pa.x+wA.offsetWidth/2, y:pa.y+wA.offsetHeight/2};
        origem.style.transformOrigin=`${(co.x-pl.x).toFixed(1)}px ${(co.y-pl.y).toFixed(1)}px`;
        origem.style.setProperty('--dx',(ca.x-co.x).toFixed(1)+'px');
        origem.style.setProperty('--dy',(ca.y-co.y).toFixed(1)+'px');
        origem.style.setProperty('--esc',(wA.offsetWidth/wO.offsetWidth).toFixed(3));
      }
      espera=1000;
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
    nova.style.setProperty('--dir', antiga.style.getPropertyValue('--dir')||1);
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
    // tela cheia carrega a marca `cena` e vale `CENA_CHEIA` (a cobra fecha em
    // 1,36 s); qualquer outra vale `ENTRADA_COMUM`. É O MESMO NÚMERO que tira
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
      nova.getAnimations({subtree:true}).forEach(a=>{
        const n=a.animationName||a.transitionProperty||'?';
        const resta=antes.get(n)||0;
        if(resta<=0) return;
        antes.set(n,resta-1);
        try{ a.currentTime=t; }catch(_){}
      });
    }
  }else{
    app.innerHTML='';
    app.appendChild(nova);
    herdarRolagem(rolagem,nova);
  }
  pintarRail();
  // A abertura não fica na tela: ela ENTREGA o app. 3,4 s é a cena inteira
  // (rota + cometa + marca + brilho + batida) — o corte cai no fim da batida.
  clearTimeout(aberturaTimer);
  if(atual==='entrada') aberturaTimer=setTimeout(()=>ir('rota'),3400);
}
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

  missao:{tom:'info',ico:'bell',titulo:'A Central mandou uma rota',
    sub:'Zona Sul manhã · 6 paradas · 14,2 km. Começa a 3,4 km de você.',
    corpo:`<div class="pt-nums"><div><b>6</b><small>paradas</small></div>
      <div><b>14,2 km</b><small>percurso</small></div><div><b>~1h20</b><small>estimado</small></div></div>`,
    acoes:[['Negar','perigo'],['Depois',''],['Aceitar','principal']],classe:'tres'},

  creditos:{tom:'trava',ico:'card',titulo:'Créditos acabaram',
    sub:'Sem crédito a rota não inicia. As entregas de hoje continuam guardadas.',
    corpo:`<div class="pt-nums"><div><b>0</b><small>créditos</small></div>
      <div><b>12</b><small>a debitar</small></div><div><b>14</b><small>paradas</small></div></div>`,
    acoes:[['Fechar',''],['Recarregar','principal']]},

  update:{tom:'info',ico:'download',titulo:'Versão nova disponível',
    sub:'beta1.3.3 · 2,3 MB. Corrige o aviso de chegada e a caderneta de sábado.',
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
  w.innerHTML=`<div class="portao ${p.tom}">
    <span class="ico">${ic(p.ico,22)}</span>
    <h3>${p.titulo}</h3><span class="sub">${p.sub}</span>
    ${p.corpo?`<div class="corpo">${p.corpo}</div>`:''}
    <div class="acoes ${p.classe||(p.acoes.length===2?'duas':'')}">
      ${p.acoes.map(([t,c,marcado])=>{
        // ESCAPE ≠ AÇÃO. "Agora não", "Cancelar", "Fechar" são escapes: saem sem
        // resolver. O botão principal fecha porque RESOLVE. Portão obrigatório
        // não tem escape — sobra só a ação, e é isso que o prende ali.
        const escape = marcado!==undefined ? marcado : (c!=='principal' && c!=='azul');
        return `<button class="${c}" data-fechar="1"${escape?' data-escape="1"':''}>${t}</button>`;
      }).join('')}
    </div></div>`;
  camada.appendChild(w);
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
      const vizinho = dy<0 ? item.previousElementSibling : item.nextElementSibling;
      // troca quando passa de 60% da altura do vizinho — antes disso é tremor
      if(vizinho && vizinho.classList.contains('stop') && Math.abs(dy)>vizinho.offsetHeight*.6){
        const salto=vizinho.offsetHeight*(dy<0?-1:1);
        if(dy<0) lista.insertBefore(item,vizinho); else lista.insertBefore(vizinho,item);
        base+=salto; dy=dedoY-y0+rolou-base;
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
      <span class="acoes"><button data-nao="1">Não</button>
        <button class="principal" data-sim="1">Retirar</button></span></div>`;
    camada.appendChild(w);
    w.addEventListener('click',e=>{
      if(e.target.closest('[data-sim]')){
        item.style.transition='opacity .2s, transform .2s';
        item.style.opacity='0'; item.style.transform='translateX(-30px)';
        setTimeout(()=>{item.remove();renumerar();},210);
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
});
pintar(false);

/* aparelho: avisa a ponte que o app SUBIU — sem isto a cortina nativa nunca cai. */
try{
  var __ponte=window.HBXAndroid;
  if(__ponte&&__ponte.appReady){
    __ponte.appReady(document.documentElement.dataset.luz==='claro'?'light':'dark');
  }
}catch(_){/* no navegador não há ponte — o mock segue maquete */}
