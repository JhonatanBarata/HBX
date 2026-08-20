/* ==========================================================================
   SCRIPT DO MOCK — GERADO. NÃO EDITE.

   Fonte : docs/mockups/vendas2.0/vendas-2.0.html
   Gerador: node scripts/casca-injetar.js --app vendas

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
/* 🔴 OS DOIS VERBOS DE FALAR NASCEM AQUI (19/08) porque a ficha do lead os
   pede pelo NOME e ícone que não existe no dicionário vira quadrado vermelho
   na cara do vendedor (`ic()` desenha o erro em vez de esconder). `phone` é o
   fone clássico — nenhum outro glifo daqui diz "ligar"; `whats` é o balão com
   o fone dentro, e ele é DIFERENTE do `chat` de propósito: `chat` é a conversa
   dentro do app (o módulo Conversas), `whats` é sair do app e cair no WhatsApp
   do aparelho. Mesmo glifo pros dois faria a pessoa achar que os dois botões
   levam ao mesmo lugar — e um deles cobra chip da empresa e o outro não. */
phone:'<path d="M7.6 3.9l2.1 3.9-1.9 1.9a12.7 12.7 0 0 0 4.5 4.5l1.9-1.9 3.9 2.1v3.1c0 1-.8 1.8-1.8 1.7C9.5 18.6 5.4 14.5 4.8 5.7c-.1-1 .7-1.8 1.7-1.8h1.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
whats:'<path d="M4.4 19.6l1.2-3.6a7.9 7.9 0 1 1 3 2.9l-4.2.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.7 9.2c.3 2.6 2.5 4.8 5.1 5.1.5.1.9-.3.9-.8v-.7l-1.6-.8-.9.9a6 6 0 0 1-1.9-1.9l.9-.9-.8-1.6h-.7c-.5 0-.9.4-.9.9z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
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
mic:'<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
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
/* 🔴 O INTERRUPTOR DA TELA CHEIA (17/08 — ordem do dono, item 1: *"criar um
   ícone para desativar isso, logo acima do atalho do chat"*). São DOIS glifos e
   não um: o botão diz o que vai ACONTECER, não em que estado a tela está — com a
   tela cheia ligada ele mostra as setas voltando pra dentro ("me devolve o
   cabeçalho"), e desligada, as setas abrindo. Ícone que descreve o estado atual
   obriga o dedo a adivinhar o resto. */
mail:'<rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.8 7l8.2 6 8.2-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
shrink:'<path d="M9.6 4.8v4.8H4.8M14.4 19.2v-4.8h4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.4 4.4l5.2 5.2M19.6 19.6l-5.2-5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
expand:'<path d="M14.4 4.8h4.8v4.8M9.6 19.2H4.8v-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.2 4.8l-5.2 5.2M4.8 19.2l5.2-5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
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

const logo = `<div class="logo"><div class="w"><b>HB</b><em>X</em></div><small>VENDAS</small></div>`;

function hdr(o={}){
  /* 🔴 O BALÃO DO CABEÇALHO MORREU AQUI, e não por enfeite: em Vendas
     "Conversas" é MÓDULO — tem botão próprio na barra de baixo. Um balão em
     cima levando ao mesmo lugar é a mesma mentira do "dado em 2 cards" na forma
     de porta, e é exatamente o defeito que este cabeçalho já corrigiu uma vez
     (08/08: sino e balão iam os dois pro chat).

     A vaga que sobrou fica com o "+", e no app de Vendas ele é o RADAR: trazer
     empresa nova é o único "criar" que este app tem — não existe cadastro
     manual de lead na casca, e apontar o "+" pra uma tela que não existe é o
     botão morto que esta casa persegue desde 07/08. */
  /* 🔴 A AULA TEM QUE TER PORTA EM TODA TELA QUE TEM AULA. Tela de dentro
     (ficha, conversa) troca a lâmpada da esquerda pela VOLTA — e a aula ficaria
     escrita e inalcançável, que é o botão morto ao contrário.
     Regra, sem exceção escrita à mão: se a tela TEM aula e a esquerda virou
     Voltar, a lâmpada senta na vaga do "+". */
  const mais = (AULAS[atual] && o.voltar)
    ? `<button class="round" data-aula="1" aria-label="Como usar esta tela">${ic('bulb',18)}</button>`
    : `<button class="round" data-ir="radar" aria-label="Buscar empresas">${ic('plus',18)}</button>`;
  const dir = o.live
    ? `<div class="pill-live"><i></i>${o.live}</div>`
    : `<div style="display:flex;gap:7px">${mais}</div>`;
  /* 🔴 A VOLTA VEM MARCADA (`data-voltar`), NUNCA DEDUZIDA. O Voltar do Android
     procurava "o primeiro `data-ir` do cabeçalho" — e em TODA tela sem volta o
     primeiro é o "+". Resultado medido no outro app: na Rota, o Voltar do
     aparelho ABRIA "Cadastrar cliente". Voltar deduzido por posição anda pra
     frente na hora que alguém mexe na ordem dos ícones; marcado, só o botão de
     voltar responde. */
  const esq = o.voltar
    ? `<button class="round" data-voltar="1" data-ir="${o.voltar}" aria-label="Voltar">${ic('back',18)}</button>`
    : `<button class="round" data-aula="1" aria-label="Como usar esta tela">${ic('bulb',18)}</button>`;
  // 🔴 O LOGO NÃO ANDA. Os flancos entram EMBRULHADOS com a mesma largura
  // mínima: com 1 ou 2 ícones do lado, o HBX fica cravado no centro em toda
  // tela (medido: sem isto o logo passeava 143↔164 entre abas).
  return `<header class="hdr${o.flutua?' flutua':''}"><div class="hdr-row">
      <div class="hdr-flanco">${esq}</div>${logo}<div class="hdr-flanco dir">${dir}</div>
    </div></header>`;
}

/* ==========================================================================
   A BARRA — e ela é a ORDEM DE TUDO: dos botões, do arrastar e do que some.

   🔴 VENDAS NUNCA SOME. É a mesma lei que no app do motorista guardava a Rota:
   o servidor já barra, e esta linha é o cinto por cima do suspensório — app de
   vendas sem o funil não é app de vendas, e o vendedor ficaria numa tela sem
   saída.

   🔴 DESLIGADO SOME DE VERDADE — não é só o botão. Sai da barra, sai do
   arrastar (`arrastarModulo`), não abre por rota direta (`ir`) e os ATALHOS
   que levavam pra lá somem junto (`podarDesligados`). Botão que existe e não
   leva a lugar nenhum é pior que botão ausente.

   🔴 SEM FONTE, NADA SOME. `DADOS.barra.desligados` nasce VAZIO e só a ponte
   escreve, depois que o servidor responde. Rede caída NÃO pode esconder
   módulo — é a mesma lei do esqueleto: "vazio porque o servidor disse" e
   "vazio porque a rede caiu" são opostos, e aqui o padrão do silêncio é
   MOSTRAR TUDO.

   🔴 E ESTA BARRA TEM SEIS, NÃO TRÊS. A folha desenha a barra com
   `grid-auto-flow:column;grid-auto-columns:1fr` — ela reparte a largura pelo
   número de botões que existirem, então a barra encolhe sozinha quando o admin
   desliga um módulo e não há número de colunas cravado em lugar nenhum.

   A ORDEM É A DO DIA DE TRABALHO, não a do organograma: o funil primeiro
   (é onde a pessoa abre o app), o Radar que o enche, a Agenda do que fazer
   hoje, as Conversas, a carteira e por fim os Ajustes.
   ========================================================================== */
const NAV_ITENS=[['vendas','Vendas','sales'],['radar','Radar','target'],['agenda','Agenda','calendar'],
                 ['conversas','Conversas','chat'],['empresas','Empresas','store'],['ajustes','Ajustes','gear']];
/** O CSV que o admin gravou no desktop, virado em lista. Vazio = tudo ligado. */
function modulosDesligados(){
  return String((DADOS.barra&&DADOS.barra.desligados)||'')
    .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
}
function moduloDesligado(k){
  if(k==='vendas') return false;                     // a lei, de novo e aqui
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
  /* 🔴 A REGRA DO `abrir-chat` SAIU DAQUI EM 19/08, E A AUSÊNCIA É O CONSERTO.
     Ela veio copiada do app do MOTORISTA, onde o chat é um botão da coluna do
     mapa; em Vendas não existe `abrir-chat` em tela nenhuma, nem `chat` na
     régua da barra — era uma varredura que nunca casava com nada e, pior, a
     única chave "sem dono" que a varredura de botões mortos encontrava sem ser
     um botão morto de verdade. Guarda que grita à toa é guarda que se aprende a
     ignorar; regra que varre o nada é regra que ensina o leitor a procurar uma
     peça que não existe. Se um dia Vendas ganhar um atalho que não troca de
     tela, ele volta — com a peça junto. */
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
  /* O CSV dos módulos que o ADMIN desligou no desktop, do jeito que o servidor
     grava: minúsculo, separado por vírgula, sem "vendas".
     🔴 NASCE VAZIO E É ASSIM QUE TEM QUE SER: enquanto ninguém disser o
     contrário, a barra mostra os 6. Quem escreve aqui é a ponte, só depois de
     o servidor responder — falha de rede não apaga módulo. */
  barra:{ desligados:'' },

  /* ==== VENDAS — O FUNIL ================================================
     Três portas, três pares de bandeira, e cada bloco sobe e cai sozinho:
       carregando/semFonte              → GET /vendas/board (chips+lista+rodapé)
       placarCarregando/placarSemFonte  → GET /vendas/report?period=30d
       aviso                            → GET /vendas/pending-summary (blocked)
                                          ou board.radarSupply.full/paused —
                                          SÓ UM vence, senão a mesma frase
                                          aparece duas vezes.
     `blocos` espelha board.blocks e `contagem` espelha board.summary, chave por
     chave, sem renomear: campo renomeado é o que descola do servidor no dia
     seguinte. `etapa` é do DEDO. A busca NÃO tem porta no servidor — a ponte
     reescreve `blocos` filtrando o que já veio.
     🔴 Nome genérico de propósito: empresa inventada com nome e telefone, numa
     tela que termina em mensagem de WhatsApp, é a mentira mais cara que este
     app pode contar. A ponte zera tudo isto no boot. */
  vendas:{
    subtitulo:'Comece pelos atrasados.',
    periodo:'Últimos 30 dias',
    chamados:'48', respostas:'19', conversao:'21%',
    aviso:'Carteira cheia — o Radar parou de mandar empresa nova.', avisoTom:'alerta',
    busca:'', etapa:'today',
    contagem:{ overdue:3, today:5, scheduled:4, closed:2 },
    blocos:{
      overdue:[
        {id:'l1', ini:'E1', nome:'Empresa 1', local:'Cidade 1', fone:'(19) 90000-0001', etapa:'Retorno', etapaTom:'amber', selo:'', seloTom:'', toque:'há 6 d', tom:''},
        {id:'l2', ini:'E2', nome:'Empresa 2', local:'Cidade 2', fone:'(19) 90000-0002', etapa:'Em contato', etapaTom:'blue', selo:'3 toques', seloTom:'', toque:'há 4 d', tom:''},
        {id:'l3', ini:'E3', nome:'Empresa 3', local:'Cidade 3', fone:'', etapa:'Novo lead', etapaTom:'', selo:'sem telefone', seloTom:'red', toque:'há 9 d', tom:'red'},
      ],
      today:[
        {id:'l4', ini:'E4', nome:'Empresa 4', local:'Cidade 1', fone:'(19) 90000-0004', etapa:'Qualificado', etapaTom:'lime', selo:'empresa nova', seloTom:'lime', toque:'ontem', tom:'lime'},
        {id:'l5', ini:'E5', nome:'Empresa 5', local:'Cidade 2', fone:'(19) 90000-0005', etapa:'Em contato', etapaTom:'blue', selo:'', seloTom:'', toque:'há 2 d', tom:''},
        {id:'l6', ini:'E6', nome:'Empresa 6', local:'Cidade 4', fone:'(19) 90000-0006', etapa:'Novo lead', etapaTom:'', selo:'', seloTom:'', toque:'sem toque', tom:''},
        {id:'l7', ini:'E7', nome:'Empresa 7', local:'Cidade 5', fone:'(19) 90000-0007', etapa:'Retorno', etapaTom:'amber', selo:'', seloTom:'', toque:'hoje, 09:12', tom:''},
        {id:'l8', ini:'E8', nome:'Empresa 8', local:'Cidade 2', fone:'(19) 90000-0008', etapa:'Novo lead', etapaTom:'', selo:'', seloTom:'', toque:'sem toque', tom:''},
      ],
      scheduled:[], closed:[],
    },
    /* O vazio de CADA etapa fala a língua da etapa — "nada atrasado" é boa
       notícia, "nada pra hoje" é ordem de serviço. */
    vazios:{
      overdue:{titulo:'Nada atrasado', dica:'Você está em dia com os retornos.'},
      today:{titulo:'Nada pra hoje', dica:'Traga empresas novas pelo Radar.'},
      scheduled:{titulo:'Nenhum retorno marcado', dica:'O retorno se marca na ficha do lead.'},
      closed:{titulo:'Nada fechado ainda', dica:'Card ganho ou perdido aparece aqui.'},
    },
    /* `vagas` é STRING de propósito: 0 vagas é o número mais importante da
       linha, e o número 0 cairia na regra do "slot sem fonte some". O rodapé
       testa AUSÊNCIA (null/''), nunca verdade. */
    carteira:'14', vagas:'0', vagasRotulo:'carteira cheia', vagasAlerta:1,
  },

  /* ==== RADAR — BUSCAR EMPRESAS ==========================================
     🔴 TUDO AQUI É DESENHO E O APARELHO APAGA. A ponte zera `lista`,
     `contagem`, `saldo` e `corrida` no boot e só reescreve com o que o servidor
     respondeu.
     A contagem tem par PRÓPRIO (`contando`/`contagemSemFonte`) porque é outra
     porta: /radar/count no chão não pode apagar a colheita, nem o contrário.
     `corrida` é o retrato do run assíncrono traduzido em 4 palavras (o servidor
     fala queued/running/completed/failed/canceled). Objeto vazio = nunca
     buscou, que é a cena do CONVITE — e ela não pode ser confundida com "não
     achei nada". */
  radar:{
    segmento:'distribuidora de água', cidade:'Cidade 1', uf:'SP',
    quantidade:20, quantidades:[10,20,50],
    sugestoes:['distribuidora de água','oficina mecânica','pet shop','restaurante'],
    contagem:'86', contando:0, contagemSemFonte:0,
    saldo:'240', custoPuxar:'1 créd.',
    corrida:{ rodando:0, terminou:1, cancelada:0, falhou:0, pct:0, achados:'4', alvo:'20', etapa:'', mensagem:'' },
    /* Os quatro exemplos existem pra mostrar os TRÊS estados do botão de
       dinheiro no mesmo desenho: a puxar, já na carteira e puxando agora. */
    lista:[
      {id:'d1',ini:'E1',nome:'Empresa 1',onde:'Cidade 1 · 3,2 km',segmento:'Bebidas',zap:1,semSite:1,nota:'4,6 de nota'},
      {id:'d2',ini:'E2',nome:'Empresa 2',onde:'Cidade 1 · 5,8 km',segmento:'Bebidas',zap:1},
      {id:'d3',ini:'E3',nome:'Empresa 3',onde:'Cidade 1 · 7,1 km',segmento:'Bebidas',puxado:1},
      {id:'d4',ini:'E4',nome:'Empresa 4',onde:'Cidade 1 · 9,4 km',segmento:'Bebidas',semSite:1,puxando:1},
    ],
    comTelefone:'3', puxados:'1',
  },

  /* ==== AGENDA ===========================================================
     O que GET /atividades/agenda devolve, do jeito que a tela lê. A resposta
     traz counts + os três baldes numa ida só; a ponte espalha em `contas` e
     `listas` e NÃO refaz a chamada ao trocar o chip.
     `quando`/`dia`/`atraso` são TEXTO já formatado pela ponte a partir de
     `vencimento` (ISO) — formatar data na tela seria a segunda régua do mesmo
     fuso. `tipo` é o enum do servidor: ligacao|reuniao|visita|mensagem. */
  agenda:{
    subtitulo:'Terça, 19 de agosto',
    janela:'hoje',
    contas:{atrasadas:3,hoje:5,semana:4},
    listas:{
      atrasadas:[
        {id:'a-101',lead:'l1',nome:'Empresa 1',titulo:'Ligar pro comprador',tipo:'ligacao',dia:'Sexta · 15/08',quando:'15/08 · 09:00',atraso:'há 4 dias'},
        {id:'a-102',lead:'l2',nome:'Empresa 2',titulo:'Mandar a proposta',tipo:'mensagem',dia:'Segunda · 18/08',quando:'18/08 · 11:30',atraso:'há 1 dia'},
        {id:'a-103',lead:'l3',nome:'Empresa 3',titulo:'Confirmar a visita',tipo:'ligacao',dia:'Segunda · 18/08',quando:'18/08 · 16:00',atraso:'há 1 dia'},
      ],
      hoje:[
        {id:'a-201',lead:'l4',nome:'Empresa 4',titulo:'Retomar o orçamento',tipo:'ligacao',dia:'Hoje',quando:'09:30 · 15 min',atraso:''},
        {id:'a-202',lead:'l5',nome:'Empresa 5',titulo:'Levar amostra',tipo:'visita',dia:'Hoje',quando:'11:00 · 40 min',atraso:''},
        {id:'a-203',lead:'l6',nome:'Empresa 6',titulo:'Mandar tabela de preço',tipo:'mensagem',dia:'Hoje',quando:'dia inteiro',atraso:''},
        {id:'a-204',lead:'l7',nome:'Empresa 7',titulo:'Reunião com a compradora',tipo:'reuniao',dia:'Hoje',quando:'15:00 · 30 min',atraso:''},
        {id:'a-205',lead:'l8',nome:'Empresa 8',titulo:'Fechar o pedido',tipo:'ligacao',dia:'Hoje',quando:'17:30 · 10 min',atraso:''},
      ],
      semana:[
        {id:'a-301',lead:'l1',nome:'Empresa 1',titulo:'Apresentar o plano',tipo:'reuniao',dia:'Quarta · 20/08',quando:'10:00 · 45 min',atraso:''},
        {id:'a-302',lead:'l2',nome:'Empresa 2',titulo:'Passar na loja',tipo:'visita',dia:'Quarta · 20/08',quando:'14:00 · 30 min',atraso:''},
        {id:'a-303',lead:'l5',nome:'Empresa 5',titulo:'Retomar a proposta',tipo:'ligacao',dia:'Quinta · 21/08',quando:'09:00 · 15 min',atraso:''},
        {id:'a-304',lead:'l7',nome:'Empresa 7',titulo:'Mandar o contrato',tipo:'mensagem',dia:'Sexta · 22/08',quando:'dia inteiro',atraso:''},
      ],
    },
    /* Dois campos e não um: "escolhi remarcar" é um estado DENTRO de "estou
       concluindo esta". Vazio = nenhuma linha aberta. */
    concluindo:'', remarcando:'',
    /* `feitasHoje` exige ?incluirConcluidas=1 na chamada da ponte — sem esse
       parâmetro o servidor devolve só pendentes e o campo fica vazio, e a
       célula some sozinha em vez de mostrar um zero mentiroso. */
    feitasHoje:'4', proxima:'09:30',
  },

  /* ==== CONVERSA COM O LEAD ==============================================
     `chip.conectado` vem de GET /companies/me/whatsapp-status ({connected}) e
     `temWhats` é o telefone confirmado do lead. São os DOIS que acendem a
     posição "Empresa" — a tela não guarda a escolha, ela DERIVA a cada pintura,
     e por isso chip que cai no meio da conversa devolve a pílula pro celular
     sozinho. `canal` é só a preferência do dedo ('' = deixa a régua decidir).
     A mensagem é [lado, texto, hora, selo, id]:
       lado — 'minha' (outbound) | 'deles' (inbound)
       selo — '' | 'enviando' (PENDING) | 'entregue' (SENT/DELIVERED)
              | 'lida' (READ) | 'falhou' (FAILED)
       id   — o id no servidor; só o 'falhou' o usa (reenviar). */
  conversas:{
    volta:'vendas', lead:'l1',
    ini:'E1', nome:'Empresa 1', telefone:'(19) 90000-0001',
    etapa:'Em conversa', origem:'Radar · Cidade 1',
    temWhats:1, chip:{conectado:1},
    canal:'', enviando:0, vazio:'',
    conversa:[
      ['minha','Bom dia! Aqui é a HBX. Vocês entregam galão nesta região?','09:12','lida','m1'],
      ['deles','Bom dia. Entregamos sim, só no centro.','09:31','','m2'],
      ['minha','Perfeito. Posso te mostrar como fica em 5 minutos?','09:34','entregue','m3'],
      ['deles','Pode mandar depois das 14h.','10:02','','m4'],
      ['minha','Combinado, te chamo às 14h.','10:03','enviando','m5'],
    ],
  },
  /* O SEGUNDO ESTADO, o que o dono mandou desenhar junto: chip da empresa no
     chão E lead sem WhatsApp confirmado. A pílula abre em "Meu WhatsApp" com a
     "Empresa" apagada, e o fio vazio é o vazio que o SERVIDOR disse — nada a
     ver com rede caída, que tem cena própria dentro do miolo. */
  conversassemchip:{
    volta:'vendas', lead:'l2',
    ini:'E2', nome:'Empresa 2', telefone:'(19) 90000-0002',
    etapa:'Sem contato', origem:'Radar · Cidade 2',
    temWhats:0, chip:{conectado:0},
    canal:'', enviando:0, vazio:'Nenhuma mensagem ainda',
    conversa:[],
  },

  /* ==== A FICHA DO LEAD =================================================
     GET /vendas/lead/:id/card — a MESMA porta que a conversa já lê, então
     esta tela não custou endpoint novo nem linha na allowlist do APK.

     🔴 `fone` É O CRU E `fones[].rot` É O BONITO, e a separação é o que faz o
     discador receber "5519990000001" enquanto a tela mostra "(19) 99000-0001".
     Misturar os dois é como um número formatado chega no `tel:` e o Android
     abre o teclado com parênteses dentro.
     🔴 `linha` e `historia` são LISTAS DE PARES, não objetos: quem preenche é a
     ponte, e o que não veio do servidor simplesmente não entra na lista — a
     Lei do IF aplicada à FONTE, e não ao desenho. */
  leadficha:{
    volta:'vendas', id:'l1',
    ini:'E1', nome:'Empresa 1', tom:'',
    etapa:'Em contato', etapaTom:'blue', selo:'', seloTom:'',
    onde:'Cidade 1 · SP', segmento:'Bebidas',
    fone:'5519900000001', email:'contato@empresa1.com.br',
    fones:[
      {cru:'5519900000001', rot:'(19) 90000-0001', sub:'principal · toque para abrir no WhatsApp'},
      {cru:'5519300000000', rot:'(19) 3000-0000', sub:'toque para abrir no WhatsApp'},
    ],
    emails:['contato@empresa1.com.br'],
    cnpj:'00.000.000/0001-01', razaoSocial:'EMPRESA 1 COMERCIO LTDA',
    situacao:'Ativa', responsavel:'Pessoa 1', nota:'4,6 · 128 avaliações', site:'empresa1.com.br',
    endereco:'Rua 1, 100', recado:'Pediu pra chamar depois das 14h.',
    linha:[['Etapa','Em contato'],['Tentativas','3'],['Último toque','há 4 d'],['Retorno marcado','21/08 · 09:00']],
    historia:[
      ['há 4 d','Mensagem enviada','Primeira abordagem pelo WhatsApp da empresa.'],
      ['há 9 d','Empresa puxada do Radar',''],
    ],
  },

  /* ==== EMPRESAS — A CARTEIRA ============================================
     GET /nucleo/empresas. `ufs` é da PONTE: a API não devolve faceta de UF, e
     27 siglas chutadas na casca seriam filtro prometendo base que não existe —
     sem `ufs`, a fileira de chips simplesmente não nasce. */
  empresas:{
    subtitulo:'a base PJ da sua empresa',
    busca:'', ufSel:'',
    ufs:['MG','PR','SP'],
    lista:[
      {id:'e1',ini:'E1',nome:'Empresa 1',cnpj:'00.000.000/0001-01',cidade:'Cidade 1',uf:'SP',cliente:1,lead:0,fornecedor:0,contatos:3,origem:''},
      {id:'e2',ini:'E2',nome:'Empresa 2',cnpj:'00.000.000/0001-02',cidade:'Cidade 2',uf:'SP',cliente:0,lead:1,fornecedor:0,contatos:1,origem:'radar'},
      {id:'e3',ini:'E3',nome:'Empresa 3',cnpj:'',cidade:'Cidade 3',uf:'SP',cliente:0,lead:1,fornecedor:0,contatos:0,origem:'radar'},
      {id:'e4',ini:'E4',nome:'Empresa 4',cnpj:'00.000.000/0001-04',cidade:'Cidade 4',uf:'SP',cliente:1,lead:0,fornecedor:1,contatos:2,origem:''},
      {id:'e5',ini:'E5',nome:'Empresa 5',cnpj:'00.000.000/0001-05',cidade:'Cidade 5',uf:'SP',cliente:0,lead:0,fornecedor:1,contatos:1,origem:'manual'},
      {id:'e6',ini:'E6',nome:'Empresa 6',cnpj:'00.000.000/0001-06',cidade:'',uf:'',cliente:0,lead:1,fornecedor:0,contatos:0,origem:'radar'},
      {id:'e7',ini:'E7',nome:'Empresa 7',cnpj:'00.000.000/0001-07',cidade:'Cidade 6',uf:'MG',cliente:1,lead:0,fornecedor:0,contatos:4,origem:''},
      {id:'e8',ini:'E8',nome:'Empresa 8',cnpj:'00.000.000/0001-08',cidade:'Cidade 7',uf:'PR',cliente:0,lead:1,fornecedor:0,contatos:1,origem:'radar'},
    ],
    /* `total` e `totalPaginas` são do SERVIDOR (total/totalPages) — nunca
       `lista.length`. Somar a página na mão é como a lista paginada mente
       ("128" com 30 na mão). */
    total:'128', pagina:1, totalPaginas:5, carregandoMais:0,
  },
  /* FICHA DA EMPRESA — READ-ONLY: não há PATCH desta conta no controller do
     núcleo, então a ficha não tem campo nem Salvar. `leadId` é o que liga esta
     empresa ao funil (a conversa é por LEAD, não por conta); vazio = a empresa
     ainda não é lead, e o verbo da tela vira "Mandar pra Vendas". `volta`
     guarda a porta de entrada — quem abriu a ficha de dentro de Conversas não
     pode cair na lista de Empresas ao voltar. */
  empresaficha:{
    volta:'empresas',
    id:'e1', ini:'E1', nome:'Empresa 1',
    cnpj:'00.000.000/0001-01', documento:'',
    cidade:'Cidade 1', uf:'SP',
    endereco:'Rua 1', numero:'1450', cep:'13100-000',
    /* `pino` é COPY curta feita pela ponte a partir de lat/lng — a ficha não
       desenha mapa (o app de Vendas não tem tela de mapa, e botão que abre o
       nada é o botão morto que esta casa já matou três vezes). */
    pino:'coordenada confirmada',
    telefone:'(19) 3000-0000', email:'contato@empresa1.com.br',
    origem:'radar', desde:'03/2026',
    cliente:1, lead:0, fornecedor:0,
    leadId:'', mandando:0,
    contatos:[
      {id:'p1',ini:'P1',nome:'Pessoa 1',sub:'Compras · (19) 90000-0001',principal:1,podeFalar:1},
      {id:'p2',ini:'P2',nome:'Pessoa 2',sub:'Financeiro · sem WhatsApp',principal:0,podeFalar:0},
      {id:'p3',ini:'P3',nome:'Pessoa 3',sub:'Sócio · (19) 90000-0011',principal:0,podeFalar:1},
    ],
  },

  /* ==== AJUSTES (o índice) ===============================================
     `zapLigado` nasce 1 no desenho e vale null no aparelho até o servidor
     falar — null é "não sei", e não sei NÃO PINTA SELO. `admin` é a audiência
     de cobrança do servidor (master ou dono com canViewBilling), não um papel
     inventado na tela. */
  ajustes:{
    admin:1,
    perfilNome:'Vendedor 1', perfilSub:'vendedor@suaempresa.com.br',
    creditosLinha:'240 leads', creditosSub:'',
    zapLigado:1, zapNumero:'(11) 90000-1200',
    modulosLinha:'5 de 6',
    sons:1,
    versao:'Versão beta1.0.0 (1)', versaoSub:'toque para procurar atualização', versaoTag:'',
  },
  /* MEU PERFIL (GET /profile). Nenhum campo é editável no celular, então nenhum
     é obrigatório: cada linha some sozinha se o servidor não mandar.
     `aparelho` é o único que NÃO vem do /profile — é o pareamento, que a ponte
     conhece de casa. */
  perfil:{
    nome:'Vendedor 1', papel:'Vendedor', email:'vendedor@suaempresa.com.br',
    telefone:'(11) 90000-1200', empresa:'Sua Empresa', cidade:'Cidade 1',
    aparelho:'Moto G15 · pareado em 12/08',
  },
  /* WHATSAPP DA EMPRESA (GET /companies/me/whatsapp-status → {connected,
     displayNumber, status}). `conectado` é 1 ou 0 e mais nada; AUSENTE cai no
     mesmo desfecho da rede no chão. `conferido` é hora de relógio — quem sabe a
     hora é a ponte, nunca o desenho. */
  whatsapp:{
    conectado:1, numero:'(11) 90000-1200',
    estado:'conectado agora', conferido:'conferido às 9:41',
  },
  /* MÓDULOS LIBERADOS (GET /modules/me). Linha = [ícone, nome, motivo/resumo,
     ligado]. `ligado` é o `accessible` do servidor; o motivo é a tradução do par
     companyEnabled/userAllowed numa frase que diz COM QUEM falar. O desenho
     mostra de propósito uma linha desligada: é a cena que o cliente 46 viveu em
     18/08 sem nunca ver escrito o porquê. */
  modulos:{
    lista:[
      ['sales','Vendas','o funil, os leads e as tentativas',1],
      ['target','Radar','buscar empresas novas',1],
      ['calendar','Agenda','o que fazer hoje',1],
      ['chat','Conversas','falar pelo WhatsApp da empresa',1],
      ['store','Empresas','a base de CNPJ',1],
      ['route','Logística','a empresa não liberou este módulo',0],
    ],
  },
  /* CRÉDITOS (GET /credits/me). 🔴 `cobranca` É O INTERRUPTOR DO DINHEIRO e
     precisa valer 1 EXATAMENTE: qualquer outra coisa (ausente, 0, '') cai na
     face neutra do vendedor, sem R$, sem pacote e sem botão de recarga — a Lei
     do Vendedor do backend (getMeForSellerAudience), obedecida também quando a
     ponte falha. `saldo` serve às duas faces (é `balance` pro dono e
     `leadsDisponiveis` pro vendedor: 1 crédito = 1 lead). `vence` sai de
     lots[].expiresAt e só existe com cobrança.
     Pacote = [créditos, preço, selo, marcado, chave, detalhe] — o catálogo REAL
     de fábrica, porque desenho de tela de dinheiro que inventa preço ensina o
     preço errado a quem desenha depois. */
  creditos:{
    cobranca:1,
    saldo:'240', vence:'60 vencem em 12/09',
    pacotes:[['100','97,00','',0,'starter','R$ 0,97 por crédito · vale 90 dias'],
             ['300','247,00','Mais vendido',1,'growth','R$ 0,82 por crédito · vale 90 dias'],
             ['800','597,00','',0,'scale','R$ 0,75 por crédito · vale 90 dias']],
    cta:'Recarregar 300 créditos · R$ 247,00',
  },
  /* O TUTOR. `carregando` é "não sei ainda" e NUNCA esconde capítulo (§
     `tutorCondicao`); `admin` é a mesma audiência de cobrança do índice, e é ela
     que decide se o capítulo de créditos existe pra esta pessoa. */
  tutorial:{
    carregando:0, obrigatorioVisto:0,
    admin:1,
  },
  /* "VOCÊ AINDA NÃO TEM EMPRESAS" — o desfecho da demonstração. Tudo aqui é
     COPY do desenho: a tela não vem do servidor e a ponte não escreve NADA nela.
     🔴 Os campos do herói de suporte (`selo`, `suporteTitulo`, `suporteTexto`,
     `aceita`) e os do recibo (`enviado`, `okTitulo`, `okTexto`) saíram com as
     três portas mortas em 19/08 — ver a nota inteira em `T.semclientes`. Copy
     de peça que não existe é o que faz o próximo leitor procurar a peça. */
  semclientes:{
    titulo:'Agora é a sua vez',
    sub:'As empresas que você viu eram exemplo. Vamos colocar as suas?',
    manualTitulo:'Prefiro buscar no Radar',
    manualSub:'Descreva quem você quer e o Radar traz as empresas',
  },
  /* A ABERTURA NÃO TEM SEÇÃO DE DADO, e isso é de propósito: o `casca-conferir`
     mede mock e app PIXEL A PIXEL, então o que o desenho mostrar o aparelho
     mostra igual; e a abertura é a única tela que a ponte não repinta (cena com
     relógio), então o `apagarDemonstracao` nunca alcançaria. Sem porta, a linha
     sai do DESENHO — não é escondida no aparelho. */
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
   (Cliente 1, Cliente 2). São 60 ms na bancada, mas numa rede
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
/* 🔴 CAIR NÃO É UMA CENA SÓ — E ATÉ 19/08 ERA (a lição de 18/08, cliente 46).
   O aviso de fonte tinha UMA cara ("Não consegui carregar · Sem resposta do
   servidor agora") e UM verbo ("Tentar de novo"). Só que o servidor recusa por
   motivos OPOSTOS, e o verbo certo de um é o erro do outro:

     rede/5xx  → espere e tente de novo. O botão RESOLVE.
     módulo    → a empresa não liberou. O botão é bater na mesma porta trancada
                 — foi assim que um cliente novo levou 39 respostas 403 em 65
                 segundos e concluiu que o aplicativo estava quebrado. Aqui não
                 há "Tentar de novo": há a VERDADE (quem libera é o
                 administrador, no computador) e a porta que mostra o que está
                 liberado.
     sessão    → o crachá venceu. Recarregar devolve o mesmo 401; quem resolve é
                 o caminho de sessão que o app já tem (`sair`, com confirmação).

   Quem escolhe a cara é o `quedaMotivo` que a ponte escreve no seam
   (`fonteCaiu(secao, erro)`); no DESENHO ele não existe, então o mock continua
   mostrando a face de rede byte a byte igual ao que sempre mostrou. */
const QUEDAS={
  modulo:{ico:'lock',titulo:'Módulo não liberado',
    sub:'Sua empresa não liberou esta parte do app. Quem libera é o administrador, no computador — não é falha do aparelho.',
    verbo:`<button class="ghost" data-ir="modulos">${ic('layers',15)} Ver o que está liberado</button>`},
  sessao:{ico:'lock',titulo:'Sua sessão expirou',
    sub:'O aparelho precisa ser pareado de novo para voltar a falar com o servidor.',
    verbo:`<button class="ghost" data-acao="sair">${ic('logout',15)} Parear de novo</button>`},
};
const semFonte=(glifo,acao,motivo)=>{
  const q=QUEDAS[motivo];
  return `<div class="vazio">
  <span class="ico">${ic(q?q.ico:glifo,24)}</span>
  <strong>${q?q.titulo:'Não consegui carregar'}</strong>
  <span>${q?q.sub:'Sem resposta do servidor agora.'}</span>
  ${q?q.verbo:`<button class="ghost" data-acao="${acao}">${ic('refresh',15)} Tentar de novo</button>`}</div>`;
};
/* 🔴 A MESMA ESCADA, COM AS BANDEIRAS NA MÃO. Uma tela pode ter DUAS fontes de
   rede independentes — a de Créditos tem: `/credits/me` traz saldo e pacotes,
   `/logistica/creditos/extrato` traz o movimento. Com um par único de bandeiras
   por SEÇÃO, a queda de uma porta apagaria o bloco da outra: extrato no chão
   levaria junto a recarga, que é o que a pessoa veio fazer. Aqui cada bloco
   sobe, cai e se recupera sozinho, com o seu próprio "Tentar de novo". */
const mioloDe=(carregando,sem,glifo,acao,linhas,conteudo,motivo)=>
  carregando ? esqLista(linhas) : sem ? semFonte(glifo,acao,motivo) : conteudo;
/** O miolo de uma tela de lista: esqueleto → aviso → o conteúdo de verdade.
    O 7º argumento do `mioloDe` sai daqui de graça: `quedaMotivo` é da SEÇÃO,
    então toda tela que já usa `miolo(d,…)` ganhou a distinção sem uma linha.

    🔴 PORTA TRANCADA SE ANUNCIA UMA VEZ POR TELA. Duas telas deste app têm
    bloco SECUNDÁRIO com bandeiras próprias (o placar do Funil e a contagem do
    Radar), e eles caem junto com o principal quando o motivo é o módulo — é o
    MESMO 403, no mesmo gate do mesmo controller. Repetir o cartão "Módulo não
    liberado" duas vezes na mesma rolagem transforma a frase em paisagem: quem
    lê duas vezes a mesma coisa para de ler. Por isso o chamador daqueles dois
    blocos testa `quedaMotivo` e simplesmente NÃO desenha. Com o motivo vazio
    (rede caída) nada muda: os dois blocos continuam caindo e se recuperando
    sozinhos, cada um com o seu "Tentar de novo", que é a lei que os criou. */
const miolo=(d,glifo,acao,linhas,conteudo)=>
  mioloDe(d.carregando,d.semFonte,glifo,acao,linhas,conteudo,d.quedaMotivo);

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
        <small>VENDAS</small>
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

/* 1 — VENDAS: O FUNIL (a tela que abre o app) -----------------------------
   Ela responde UMA pergunta: "o que eu faço agora?". Por isso a ordem é
   placar (o período), aviso (o que está te travando), etapa (onde estou) e a
   FILA de empresas — nada de gráfico, nada de menu.

   TRÊS FONTES, TRÊS BANDEIRAS. O placar vem de /vendas/report?period=30d, o
   funil de /vendas/board e o aviso de /vendas/pending-summary. Cada bloco sobe
   e cai sozinho: relatório no chão não pode apagar a fila de hoje, que é o
   trabalho da pessoa.

   AS ETAPAS SÃO AS DO SERVIDOR, não um funil inventado: o board devolve
   blocks.overdue | today | scheduled | closed e summary com a contagem de cada
   um. O status do lead (novo/contato/retorno/qualificado/encerrado) é o SELO
   dentro do card, nunca uma segunda lista — dado em dois lugares é bug de
   produto.

   O VAZIO DA ETAPA NÃO É O VAZIO DA REDE. Sem cards, a tela diz qual etapa
   está vazia e oferece o Radar; sem resposta, quem aparece é o "Não consegui
   carregar" do miolo, com o Tentar de novo. */
T.vendas={nome:'Vendas · o funil',grupo:'Vendas',render(){
  const v=DADOS.vendas||{};
  const ETAPAS=[['overdue','Atrasados'],['today','Hoje'],['scheduled','Agendados'],['closed','Fechados']];
  const sel=v.etapa||'today';
  // Número sem fonte não vira cartão com rótulo órfão — some inteiro.
  const kpi=(glifo,cor,val,rot)=>val?`<div class="kpi"><span style="color:${cor}">${ic(glifo,20)}</span>
      <span><b class="v">${val}</b><span class="l">${rot}</span></span></div>`:'';
  const placar=[kpi('target','var(--ink-2)',v.chamados,'chamados'),
                kpi('chat','var(--blue-l)',v.respostas,'responderam'),
                kpi('chart','var(--lime)',v.conversao,'conversão')].join('');
  /* O card é a EMPRESA: quem é, onde fica, por onde falo, em que pé está e
     quando foi o último toque. O gancho nasce do dado — sem id a linha sai
     inerte.

     🔴 DUAS INTENÇÕES, DOIS ALVOS (19/08). O corpo do cartão abre a FICHA
     (quem toca num lead muitas vezes quer o CNPJ, o endereço, o histórico); o
     balão verde abre a CONVERSA em um toque, pra quem já sabe o que quer. Foi
     assim que a ficha entrou sem cobrar um toque a mais de quem só queria
     falar — o erro que a mudança de destino cometeria se o balão não existisse.
     Sem telefone não há balão: sobra a seta, que é a promessa honesta de "aqui
     dentro tem mais". */
  const card=c=>`<div class="cli"${c.id?` data-acao="abrir-lead" data-lead="${c.id}"`:''}>
      <span class="ava ${c.tom||''}">${c.ini||''}</span>
      <span><strong>${c.nome||''}</strong>
        <span>${[c.local,c.fone].filter(Boolean).join(' · ')}</span>
        <span class="tags">${c.etapa?`<b class="tag ${c.etapaTom||''}">${c.etapa}</b>`:''}${c.selo?`<b class="tag ${c.seloTom||''}">${c.selo}</b>`:''}</span></span>
      <span class="rgt">${c.toque?`<small>${c.toque}</small>`:''}
        ${c.id&&c.fone
          ?`<button class="zap-atalho" data-acao="abrir-conversa" data-lead="${c.id}" aria-label="Abrir a conversa">${ic('whats',17)}</button>`
          :`<span class="seta">${ic('chev',15)}</span>`}</span></div>`;
  const lista=Array.isArray((v.blocos||{})[sel])?v.blocos[sel]:[];
  const vazio=(v.vazios||{})[sel]||{};
  const corpo=lista.length
    ?`<div class="lista-card">${lista.map(card).join('')}</div>`
    :`<div class="vazio"><span class="ico">${ic('store',24)}</span>
      <strong>${vazio.titulo||'Nada nesta etapa'}</strong>
      ${vazio.dica?`<span>${vazio.dica}</span>`:''}
      <button class="ghost" data-ir="radar">${ic('search',15)} Buscar empresas</button></div>`;
  // A contagem mora NO CHIP porque ela É o funil. Ausente (null) some; zero
  // vindo do servidor continua zero na tela — é fato, não falta de fonte.
  const chips=`<div class="chips">${ETAPAS.map(([k,rot])=>{
      const n=(v.contagem||{})[k];
      return `<button class="chip${sel===k?' on':''}" data-acao="etapa-funil" data-etapa="${k}">${rot}${n==null?'':` · ${n}`}</button>`;
    }).join('')}</div>`;
  /* O rodapé NÃO repete o funil: ele diz o tamanho da carteira e quanto ainda
     cabe (radarSupply). É a resposta de "por que parou de chegar empresa
     nova" — e por isso o zero aqui é o número mais importante da linha, e vem
     do teste explícito de ausência, nunca do "se for verdadeiro". */
  const temVagas=v.vagas!=null&&v.vagas!=='';
  const rodape=`<div class="sum">
      ${v.carteira?`<span class="c"><span style="color:var(--lime)">${ic('users',17)}</span><span><b>${v.carteira}</b><small>na carteira</small></span></span>`:''}
      ${temVagas?`<span class="c"><span style="color:${v.vagasAlerta?'var(--amber)':'var(--ink-2)'}">${ic(v.vagasAlerta?'alert':'plus',17)}</span><span><b>${v.vagas}</b><small${v.vagasAlerta?' style="color:var(--amber)"':''}>${v.vagasRotulo||'vagas na carteira'}</small></span></span>`:''}
    </div>`;
  return `${status}
${hdr()}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('sales',30)}</span>
    <span><h2>Vendas</h2>${v.subtitulo?`<p>${v.subtitulo}</p>`:''}</span></div>

  ${v.periodo?`<div class="grupo">${v.periodo}</div>`:''}
  ${v.quedaMotivo?'':mioloDe(v.placarCarregando,v.placarSemFonte,'chart','recarregar-placar',1,
    placar?`<div class="kpis" style="margin-top:0">${placar}</div>`:'')}

  ${v.aviso?`<div class="banner ${v.avisoTom==='pausa'?'pausa':'alerta'}">${ic('alert',15)}
    <span>${v.aviso}</span></div>`:''}

  <div class="searchrow">
    <label class="search">${ic('search',17)}<input placeholder="Buscar empresa, cidade ou telefone" data-campo="busca-lead" value="${v.busca||''}"></label>
  </div>

  ${miolo(v,'sales','recarregar-funil',6,`${chips}
  ${corpo}
  ${rodape}`)}
</div>
${nav('vendas')}`;}};

/* 2 — RADAR: BUSCAR EMPRESAS ----------------------------------------------
   🔴 ESTA É A ÚNICA TELA DO APP ONDE O DEDO VIRA DINHEIRO. Buscar é grátis,
   contar é grátis, olhar é grátis — só o PUXAR cobra crédito, porque é ele que
   traz o contato pra carteira. Então o custo não mora numa nota de rodapé: QUANDO
   O SERVIDOR DIZ QUANTO É, o número vai NO BOTÃO ("Puxar · …"), repetido no
   banner âmbar que só nasce quando existem botões de puxar na tela, e o saldo
   fica à vista em cima. Preço que aparece depois do toque é preço escondido.
   🔴 E hoje o servidor NÃO diz (19/08 — ver a nota do `custo`, logo abaixo):
   nenhuma porta que este app alcança informa o custo por card. Então o botão
   sai mudo e o banner cai pra "Puxar cobra crédito". Esta nota já dizia
   `"Puxar · 1 créd."` como se fosse fato do desenho, e nota que crava preço é
   por onde o preço volta — o próximo a ler acha que só precisa reescrever a
   linha. O lugar do número existe; quem o preenche é o servidor, ou ninguém.

   🔴 O PUXAR É UM BOTÃO DE VERDADE, com data-acao e data-lead. A ponte põe
   disabled + a classe .aguarde NO MESMO QUADRO do toque, e o repinte que vier
   depois encontra l.puxando ligado e continua desabilitado. Duplo toque aqui é
   cobrança dupla: em toda a casa isso é um bug de UI, aqui é dinheiro do dono.

   🔴 TRÊS VAZIOS DIFERENTES, TRÊS CENAS — e nunca a mesma tela mudando:
     1. nunca buscou      → convite ("Descreva quem você quer")
     2. a corrida RODANDO → "Ainda estou procurando" + progresso, e o cabeçalho
        vira pulso. A busca é ASSÍNCRONA: roda no servidor, a pessoa pode sair
        da tela. Dizer isso é o que impede o toque repetido.
     3. terminou e não achou nada → "Nenhuma empresa com esse pedido"
   E o quarto, que é de outra família: a REDE no chão, que é o semFonte do
   miolo — "vazio porque o servidor disse" e "vazio porque a rede caiu" são
   opostos.

   🔴 A CONTAGEM É GRÁTIS E TEM PORTÃO PRÓPRIO. Ela é a resposta a "vale a pena
   gastar?" ANTES de gastar, e cai sozinha sem levar o resto da tela junto. */
T.radar={nome:'Radar · buscar empresas',grupo:'Radar',render(){
  const d=DADOS.radar||{};
  const c=d.corrida||{};
  const rodando=!!c.rodando;
  const lista=Array.isArray(d.lista)?d.lista:[];
  const sugestoes=Array.isArray(d.sugestoes)?d.sugestoes:[];
  const quantidades=(Array.isArray(d.quantidades)&&d.quantidades.length)?d.quantidades:[10,20,50];
  /* O rótulo do preço nasce UMA vez e é usado nos três lugares que falam de
     dinheiro (o KPI, o banner e cada botão). Preço escrito em três lugares
     diferentes é a receita de os três discordarem no dia que ele mudar.

     🔴 E ELE NÃO TEM MAIS PADRÃO (19/08). Aqui estava `d.custoPuxar||'1 créd.'`:
     no DESENHO o `||` nunca corria (o mock traz `custoPuxar:'1 créd.'` como
     demonstração), mas no APARELHO o `apagarDemonstracao` zera o campo e o
     fallback virava a única fonte — o app anunciava "Puxar · 1 créd." em cada
     botão de cobrança sem o servidor ter dito preço nenhum. Preço cravado no
     desenho é preço errado ensinado ao vendedor no dia em que a empresa dela
     pagar outro valor. Sem fonte, o botão diz só o VERBO; o que ele cobra
     continua escrito em voz alta no aviso âmbar. */
  const custo=d.custoPuxar||'';

  /* O PEDIDO — três campos e nada mais. É "distribuidora de água, tal cidade,
     SP" em campos, não uma gaveta de 20 filtros: quem vende descreve o cliente
     em uma frase, e o resto (porte, situação, CNAE) o servidor resolve pelo
     mapa de segmento. Sem select: esta casca não tem um, e select nativo no
     WebView é outro app dentro do app. */
  const pedido=`<div class="campos" style="margin-top:9px">
    <label class="campo"><label>O que você procura</label>
      <input data-campo="radar-segmento" enterkeyhint="search" autocomplete="off"
        placeholder="distribuidora de água" value="${d.segmento||''}"></label>
    <div class="dupla">
      <label class="campo"><label>Cidade</label>
        <input data-campo="radar-cidade" autocomplete="off" placeholder="cidade" value="${d.cidade||''}"></label>
      <label class="campo"><label>UF</label>
        <input data-campo="radar-uf" autocomplete="off" placeholder="SP" value="${d.uf||''}"></label>
    </div>
  </div>`;

  /* Os chips são o que a EMPRESA já disse que vende (preference-suggestions).
     Sem fonte, nenhum chip — e o campo continua servindo sozinho. Chip inventado
     aqui mandaria a vendedora caçar um segmento que o motor não conhece. */
  const chipsSugestao=sugestoes.length?`<div class="chips">
    ${sugestoes.map(s=>`<button class="chip${d.segmento===s?' on':''}" data-acao="radar-sugestao" data-segmento="${s}">${s}</button>`).join('')}
  </div>`:'';

  /* QUANTAS TRAZER é o tamanho da corrida (quantity, 1–100 no servidor), não o
     tamanho da conta: a busca não cobra. Fica aqui porque é a única decisão do
     pedido que muda quanto tempo a corrida leva. */
  const quanto=`<div class="grupo">Quantas trazer</div>
  <div class="modos fino" style="margin-top:0">
    ${quantidades.map(q=>`<button class="modo${String(d.quantidade)===String(q)?' on':''}" data-acao="radar-quantidade" data-quantidade="${q}"><b>${q}</b></button>`).join('')}
  </div>`;

  const contagemCorpo=d.contagem
    ?`<div class="banner pausa">${ic('search',15)}
      <span><b>${d.contagem}</b> empresas batem com esse pedido. Contar é <b>grátis</b>.</span>
      <button data-acao="radar-contar">Contar de novo</button></div>`
    :`<div class="banner pausa">${ic('search',15)}
      <span>Veja <b>quantas existem</b> antes de buscar — a contagem não gasta crédito.</span>
      <button data-acao="radar-contar">Contar</button></div>`;
  const contagem=d.quedaMotivo?'':mioloDe(d.contando,d.contagemSemFonte,'search','radar-contar',1,contagemCorpo);

  /* SALDO E PREÇO, LADO A LADO. Cada um some sozinho se a fonte não veio —
     número de dinheiro sem fonte é a pior invenção que esta tela poderia fazer,
     porque é por ele que a pessoa decide puxar. */
  const kpiSaldo=d.saldo?`<div class="kpi"><span style="color:var(--lime)">${ic('card',20)}</span>
      <span><b class="v">${d.saldo}</b><span class="l">créditos seus</span></span></div>`:'';
  const kpiCusto=d.custoPuxar?`<div class="kpi"><span style="color:var(--amber)">${ic('cash',20)}</span>
      <span><b class="v">${d.custoPuxar}</b><span class="l">por empresa puxada</span></span></div>`:'';
  const dinheiro=(kpiSaldo||kpiCusto)?`<div class="kpis">${kpiSaldo}${kpiCusto}</div>`:'';

  /* A CENA DA CORRIDA — e ela NÃO é o vazio da lista. A corrida vive no
     servidor (queued/running/completed/failed/canceled): a tela conta em que pé
     ela está, oferece o Parar, e diz em voz alta que dá pra sair — sem isso a
     pessoa toca em Buscar de novo e nasce a segunda corrida. */
  const cena=rodando
    ?`<div class="prog">
      <span class="prog-l"><span>${c.etapa||'Procurando empresas…'}</span><span><b>${c.achados||0}</b> de ${c.alvo||0}</span></span>
      <span class="prog-b"><i style="width:${c.pct||0}%"></i></span></div>
    <div class="banner pausa">${ic('clock',15)}
      <span>A busca roda no servidor. Pode <b>sair desta tela</b> — quando voltar, ela continua daqui.</span>
      <button data-acao="radar-cancelar">Parar</button></div>`
    :c.falhou
    ?`<div class="banner alerta">${ic('alert',16)}
      <span>${c.mensagem||'A busca não terminou.'}</span>
      <button data-acao="radar-buscar">Tentar de novo</button></div>`
    :c.cancelada
    ?`<div class="banner pausa">${ic('close',15)}
      <span>Busca parada por você.${lista.length?' O que já tinha chegado está aqui embaixo.':' Nada chegou a tempo.'}</span>
      <button data-acao="radar-buscar">Buscar de novo</button></div>`
    :'';

  /* Os selos são SINAL DE VENDA, não enfeite: "tem WhatsApp" é por onde a
     conversa começa e "sem site" é a dor que se vende. Cada um só existe com o
     campo do servidor por trás. */
  const rotulo=(l)=>{
    const t=[];
    if(l.segmento) t.push(`<b class="tag blue">${l.segmento}</b>`);
    if(l.zap) t.push('<b class="tag lime">tem WhatsApp</b>');
    if(l.semSite) t.push('<b class="tag amber">sem site</b>');
    if(l.nota) t.push(`<b class="tag">${l.nota}</b>`);
    return t.join('');
  };
  /* A LINHA NÃO É UM BOTÃO — o botão é o Puxar, e ele é o único verbo daqui.
     Cartão clicável com um botão de cobrança dentro é o toque que erra o alvo e
     debita: um alvo, uma consequência. Três estados e três formas:
     já puxado (selo, sem botão) · puxando (desabilitado, respirando) · a puxar
     (o botão do verbo, com o preço junto SÓ se o servidor tiver dito qual é —
     `custo` nasce vazio e o `· ${custo}` some inteiro; ver a nota do `custo`). */
  const linha=(l)=>{
    const tags=rotulo(l);
    const verbo=l.puxado
      ?`<span class="pill lime">${ic('check',13)}na carteira</span>`
      :l.puxando
      ?`<button type="button" class="ghost aguarde" data-acao="puxar-lead" data-lead="${l.id}" disabled aria-busy="true">${ic('cash',14)} Puxando…</button>`
      :`<button type="button" class="ghost" data-acao="puxar-lead" data-lead="${l.id}"${custo?` data-custo="${custo}"`:''}>${ic('cash',14)} Puxar${custo?` · ${custo}`:''}</button>`;
    return `<div class="cli">
      <span class="ava${l.puxado?' lime':''}">${l.ini||''}</span>
      <span><strong>${l.nome||''}</strong><span>${l.onde||''}</span>
        ${tags?`<span class="tags">${tags}</span>`:''}</span>
      <span class="rgt">${verbo}</span></div>`;
  };

  const corpo=lista.length
    ?`<div class="lista-card">${lista.map(linha).join('')}</div>`
    :rodando
    ?`<div class="vazio"><span class="ico">${ic('search',24)}</span>
      <strong>Ainda estou procurando</strong>
      <span>As primeiras empresas aparecem aqui assim que chegarem.</span></div>`
    :c.terminou
    ?`<div class="vazio"><span class="ico">${ic('store',24)}</span>
      <strong>Nenhuma empresa com esse pedido</strong>
      <span>Tente a cidade vizinha ou um termo mais largo. Buscar de novo não gasta crédito.</span>
      <button class="ghost" data-acao="radar-buscar">${ic('refresh',15)} Buscar de novo</button></div>`
    :`<div class="vazio"><span class="ico">${ic('target',24)}</span>
      <strong>Descreva quem você quer</strong>
      <span>O que ela vende, a cidade e a UF. Contar e buscar são grátis — só o Puxar cobra.</span></div>`;

  /* O aviso do preço nasce e morre COM os botões de puxar: sem lista, não há
     cobrança possível e o âmbar seria alarme sobre nada.
     🔴 A FRASE FUNCIONA COM E SEM O NÚMERO — e é por isso que o botão pode
     ficar mudo lá em cima. "Puxar cobra crédito" é verdade sempre; "Puxar cobra
     1 créd." só é verdade se o servidor disser 1. O que a pessoa precisa saber
     ANTES de tocar (que aquele toque é o único que gasta) continua na tela. */
  const aviso=lista.length?`<div class="banner alerta">${ic('cash',15)}
    <span><b>Puxar cobra ${custo||'crédito'}</b> por empresa e traz o contato pra sua carteira. Um toque, uma cobrança.</span></div>`:'';

  const sum=lista.length?`<div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('store',17)}</span><span><b>${lista.length}</b><small>na tela</small></span></span>
    ${d.comTelefone?`<span class="c"><span style="color:var(--blue-l)">${ic('chat',17)}</span><span><b>${d.comTelefone}</b><small>com telefone</small></span></span>`:''}
    ${d.puxados?`<span class="c"><span style="color:var(--amber)">${ic('cash',17)}</span><span><b>${d.puxados}</b><small>puxadas hoje</small></span></span>`:''}
  </div>`:'';

  /* O PÉ É O VERBO DO DIA, e ele troca de traje com a corrida: rodando, o botão
     grande vira o recibo do que já está acontecendo (desabilitado, respirando) e
     o Parar aparece do lado — nunca os dois verdes disputando o dedo. */
  const pe=`<div class="tmx-dock"><div class="acts" style="margin-top:0">
    ${rodando
      ?`<button type="button" class="act" style="justify-content:center" data-acao="radar-cancelar">${ic('close',18)}<b>Parar</b></button>
      <button type="button" class="act go wide ocupado" style="justify-content:center" disabled aria-busy="true">${ic('search',19)}<b>Buscando…</b></button>`
      :`<button type="button" class="act go full" style="justify-content:center" data-acao="radar-buscar">${ic('search',19)}<b>Buscar empresas</b><small>· buscar não gasta crédito</small></button>`}
  </div></div>`;

  return `${status}
${hdr(rodando?{live:'buscando…'}:{})}
<div class="body com-dock-1">
  <div class="screen-head"><span style="color:var(--lime)">${ic('target',30)}</span>
    <span><h2>Buscar empresas</h2><p>Descreva quem você quer. Só o Puxar gasta crédito.</p></span></div>
  ${pedido}
  ${chipsSugestao}
  ${quanto}
  ${contagem}
  ${dinheiro}
  ${cena}
  ${lista.length?'<div class="grupo">Empresas encontradas</div>':''}
  ${aviso}
  ${miolo(d,'store','radar-recarregar',6,corpo)}
  ${sum}
</div>
${pe}
${nav('radar')}`;}};

/* 3 — AGENDA DO VENDEDOR --------------------------------------------------
   Fonte: GET /atividades/agenda. Concluir: POST /atividades/:id/concluir.

   O QUE ESTA TELA É: a fila de compromissos com UM verbo — fechar. Não é um
   calendário (não há grade de horas, não há mês): é a lista do que está em
   atraso, do que é hoje e do que vem na semana, na ordem do relógio.

   A JANELA É FILTRO DE OLHO, NÃO IDA AO SERVIDOR. Medido no service: o
   listForUser IGNORA o parâmetro janela — ele sempre devolve os três baldes e
   o counts junto, numa resposta só. Trocar de chip aqui NÃO pede rede. Chip que
   dispara fetch numa rede ruim vira esqueleto piscando três vezes pela mesma
   resposta que já está na mão.

   O ATRASO GRITA EM DOIS LUGARES, E NENHUM PINTA A TELA DE VERMELHO:
   (1) a faixa âmbar do topo, que aparece SÓ quando a pessoa está olhando outra
       janela — atrasado que ninguém vê não existe, e dentro da própria aba de
       atrasadas a faixa seria a legenda do óbvio;
   (2) o selo âmbar e o ícone âmbar da linha, que são do DADO (a.atraso), não da
       aba: se um atrasado vazar pro balde de hoje, ele chega marcado sozinho.
   Vermelho fica reservado pro destrutivo, como no resto da pele.

   O RESULTADO É O SEGUNDO TOQUE, E O SEGUNDO TOQUE JÁ CONCLUI. O backend pede
   "atendeu? sim/não/remarcar" e o enum é exatamente esse. Atendeu e Não atendeu
   FECHAM na hora; só Remarcar tem um degrau a mais, porque remarcar sem data é
   só adiar a pergunta.

   VAZIO TEM TRÊS COPYS PORQUE SÃO TRÊS FATOS DIFERENTES, e nenhum se parece com
   o "não consegui carregar" do miolo, que é o oposto dos três. */
T.agenda={nome:'Agenda',grupo:'Vendas',render(){
  const d=DADOS.agenda;
  const JANELAS=[['atrasadas','Atrasadas'],['hoje','Hoje'],['semana','Semana']];
  const j=JANELAS.some(x=>x[0]===d.janela)?d.janela:'hoje';
  /* O dicionário de ícones não tem TELEFONE. O microfone é o mais próximo de
     "falar com alguém" e não mente sobre o gesto; quando o dicionário ganhar um
     glifo de fone, troca-se aqui — o mapa é um lugar só. */
  const GLIFO={ligacao:'mic',reuniao:'users',visita:'map',mensagem:'chat'};
  const TIPO={ligacao:'Ligação',reuniao:'Reunião',visita:'Visita',mensagem:'Mensagem'};
  /* Os três valores canônicos do ConcluirAtividadeDto, sem inventar um quarto:
     texto livre o servidor aceita, mas o engajamento só lê sim/nao/remarcar. */
  const RESULTADOS=[['sim','Atendeu'],['nao','Não atendeu'],['remarcar','Remarcar']];
  const QUANDO=[[1,'Amanhã'],[3,'Em 3 dias'],[7,'Semana que vem']];
  const VAZIO={
    atrasadas:['check','Nada atrasado','Você não deixou ninguém esperando.'],
    hoje:['calendar','Nada marcado pra hoje','Marque a próxima conversa e ela aparece aqui.'],
    semana:['calendar','A semana está livre','Nada marcado até o fim da semana.'],
  };
  const conta=k=>(d.contas&&d.contas[k])||0;
  const lista=(d.listas&&d.listas[j])||[];
  /* O tom de alerta do ícone da linha: os mesmos três tokens da regra do ícone
     lima, só que na família âmbar. Enquanto a pele não tiver a variante âmbar
     desta peça, mora aqui — token, nunca hex. */
  const AMBAR=' style="background:var(--amber-bg);border-color:var(--amber-line);color:var(--amber)"';

  const painel=a=>`<div class="motivos">
      ${RESULTADOS.map(r=>`<button class="motivo${r[0]==='remarcar'&&d.remarcando===a.id?' on':''}" data-acao="${r[0]==='remarcar'?'atividade-remarcar':'concluir-atividade'}" data-atividade="${a.id}" data-resultado="${r[0]}"><span class="bola"></span>${r[1]}</button>`).join('')}
    </div>
    ${d.remarcando===a.id?`<div class="chips">
      ${QUANDO.map(q=>`<button class="chip" data-acao="concluir-atividade" data-resultado="remarcar" data-atividade="${a.id}" data-dias="${q[0]}">${ic('calendar',12)} ${q[1]}</button>`).join('')}
    </div>`:''}`;

  /* A linha carrega o cabeçalho do DIA embutido: quem sabe onde o dia troca é
     quem ordenou, e uma segunda lista só pra separar dia seria a mesma
     informação em dois lugares. */
  const linha=(a,cab)=>`
    ${cab?`<div class="grupo">${cab}</div>`:''}
    <div class="rowcard" data-acao="abrir-lead" data-lead="${a.lead}">
      <span class="ico"${a.atraso?AMBAR:''}>${ic(GLIFO[a.tipo]||'note',20)}</span>
      <span><strong>${a.titulo}</strong>${a.nome?`<span>${a.nome}</span>`:''}
        <span class="meta"><i>${ic('clock',12)} ${a.quando}</i><i>${TIPO[a.tipo]||'Tarefa'}</i>${a.atraso?`<b class="tag amber">${a.atraso}</b>`:''}</span></span>
      <span class="mini-acts">
        <span class="mini" data-acao="abrir-concluir" data-atividade="${a.id}">
          <span class="c">${ic(d.concluindo===a.id?'close':'check',19)}</span>${d.concluindo===a.id?'Fechar':'Concluir'}</span></span>
    </div>
    ${d.concluindo===a.id?painel(a):''}`;

  let ultimoDia='';
  const corpo=lista.length
    ? lista.map(a=>linha(a,a.dia&&a.dia!==ultimoDia?(ultimoDia=a.dia):'')).join('')
    : `<div class="vazio"><span class="ico">${ic(VAZIO[j][0],24)}</span>
        <strong>${VAZIO[j][1]}</strong><span>${VAZIO[j][2]}</span></div>`;

  const nAtraso=conta('atrasadas');
  const grito=(j!=='atrasadas'&&nAtraso)?`<div class="banner alerta">${ic('alert',15)}
    <span><b>${nAtraso}</b> ${nAtraso>1?'tarefas atrasadas':'tarefa atrasada'} esperando você.</span>
    <button data-acao="janela-agenda" data-janela="atrasadas">Ver</button></div>`:'';

  /* Número sem fonte não vira célula com rótulo órfão — some inteiro. E nenhum
     dos dois repete o que os chips já contam: aqui é o que JÁ FOI FEITO e a
     hora da PRÓXIMA, que são outras duas perguntas. */
  const cel=(glifo,cor,v,rot)=>v?`<span class="c"><span style="color:${cor}">${ic(glifo,17)}</span><span><b>${v}</b><small>${rot}</small></span></span>`:'';
  const rodape=[cel('check','var(--lime)',d.feitasHoje,'concluídas hoje'),
                cel('clock','var(--blue-l)',d.proxima,'próxima')].join('');

  return `${status}
${hdr()}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('calendar',30)}</span>
    <span><h2>Agenda</h2>${d.subtitulo?`<p>${d.subtitulo}</p>`:''}</span></div>
  <div class="chips">
    ${JANELAS.map(x=>`<button class="chip${j===x[0]?' on':''}" data-acao="janela-agenda" data-janela="${x[0]}">${x[1]}${conta(x[0])?` · ${conta(x[0])}`:''}</button>`).join('')}
  </div>
  ${grito}
  ${miolo(d,'calendar','recarregar-agenda',6,corpo)}
  ${rodape?`<div class="sum">${rodape}</div>`:''}
  <button class="act full" style="margin-top:9px;justify-content:center" data-acao="nova-atividade">
    ${ic('plus',17)}<b>Nova tarefa</b></button>
</div>
${nav('agenda')}`;}};

/* 4 — CONVERSA COM O LEAD -------------------------------------------------
   🔴 O PEDIDO LITERAL DO DONO: "garantir que seja fácil a escolha entre
   whatsapp da empresa ou whatsapp do celular. (não explicar, 1 botão)".
   Então é UMA pílula de duas posições — Empresa | Meu WhatsApp — e NENHUMA
   frase em volta. O RÓTULO é a explicação; legenda embaixo do rótulo seria a
   mesma informação em dois lugares, que é o bug que esta casa persegue.

   🔴 O ESTADO DO BOTÃO É A EXPLICAÇÃO. "Empresa" só nasce ACESA quando o chip
   da empresa está conectado E o destinatário tem WhatsApp confirmado. Fora
   disso ela nasce APAGADA (a mesma peça apagada do seletor de modos) e a pílula
   abre em "Meu WhatsApp" — sem modal, sem aviso. Botão apagado já diz "por aqui
   não dá"; um pop-up dizendo o mesmo é a confirmação decorativa que esta casa
   já matou três vezes.

   🔴 A POSIÇÃO É DERIVADA, NUNCA GUARDADA. As duas bandeiras vêm do servidor a
   cada pintura. Chip que cai no meio da conversa devolve a pílula pro celular
   sozinho; se a escolha ficasse gravada, o dedo continuaria mandando pelo lado
   morto e a mensagem sumiria calada.

   🔴 O QUE NÃO NASCE AQUI: envio em lote, "mandar pra todos", template
   repetido, fila automática. Esta tela manda UMA mensagem, escrita por uma
   pessoa, para UM lead. Em 17/08 esta casa viu 126 mensagens idênticas num
   minuto atravessarem o gate inteiro e custarem um chip banido — a régua é
   ROBÔ × GENTE, e aqui só existe gente. */
/* O corpo é GERADOR: a galeria precisa mostrar os DOIS estados da pílula lado a
   lado, e duas cópias do mesmo corpo divergem no primeiro ajuste. */
function corpoDaConversa(d){
  /* Sem chip conectado, ou sem WhatsApp confirmado do outro lado, "Empresa"
     não é uma escolha que exista — e escolha que não existe não fica acesa. */
  const podeEmpresa=!!(d.chip&&d.chip.conectado)&&!!d.temWhats;
  const temAlvo=!!d.telefone;
  const canal=podeEmpresa?(d.canal==='celular'?'celular':'empresa'):'celular';
  /* 🔴 O FIO TEM QUE CHEGAR ANTES DO CAMPO DE ESCREVER. Responder uma conversa
     que ainda não foi vista é o caminho mais curto pra mandar de novo o que o
     lead já respondeu — e mensagem repetida é o que queima chip. Enquanto o
     esqueleto está na tela (ou o aviso de rede caída), o campo não nasce: o
     "Tentar de novo" do próprio miolo é o verbo da hora. O lado CELULAR não
     depende do fio (o intent nativo abre com a rede no chão), e por isso ele
     continua de pé. */
  const fioPronto=!d.carregando&&!d.semFonte;
  /* 🔴 A LINHA DE CLIENTE MORA DENTRO DO CARTÃO, SEMPRE. `.cli` nasceu
     transparente e com borda embaixo — ela é UMA LINHA de uma lista, não um
     bloco solto. Fora do `.lista-card` ela perde a superfície e sobra um risco
     no meio da página; e a medida do contraste passa a ser contra o fundo da
     PÁGINA, não contra o cartão (foi assim que este cabeçalho apareceu no
     medidor de WCAG com o nome e o telefone abaixo do piso, enquanto a mesma
     peça na lista de Empresas passava). Cartão de um item só continua sendo
     cartão: o `>*:last-child` da folha já tira a borda órfã de baixo. */
  const cabeca=`<div class="lista-card"><button type="button" class="cli" data-acao="abrir-ficha-lead">
    <span class="ava lime">${d.ini}</span>
    <span><strong>${d.nome}</strong><span>${d.telefone||'sem telefone'}</span>
      <span class="tags">${d.etapa?`<b class="tag lime">${d.etapa}</b>`:''}${d.origem?`<b class="tag">${d.origem}</b>`:''}</span></span>
    <span class="rgt"><span style="color:var(--ink-3)">${ic('chev',15)}</span></span></button></div>`;
  /* Lead sem telefone nenhum não tem os DOIS lados — e pílula inteira apagada é
     enfeite. Ela some, e o pé vira a porta que resolve a falta. */
  const pilula=temAlvo?`<div class="modos" style="margin-top:9px">
    <button class="modo${canal==='empresa'?' on':''}${podeEmpresa?'':' vaga'}"${podeEmpresa?' data-acao="canal-conversa" data-canal="empresa"':' disabled'}><b>Empresa</b></button>
    <button class="modo${canal==='celular'?' on':''}" data-acao="canal-conversa" data-canal="celular"><b>Meu WhatsApp</b></button>
  </div>`:'';
  /* O selo da bolha é o status que o servidor devolve em cada mensagem
     (PENDING / SENT / DELIVERED / READ / FAILED), traduzido em UMA palavra. A
     que falhou é a única que ganha verbo: reenviar é um toque de gente numa
     mensagem só — o oposto da fila. */
  const SELO={enviando:'enviando',entregue:'entregue',lida:'lida'};
  const bolha=m=>{
    const st=m[3]||'';
    const pe=st==='falhou'
      ?`<small>${m[2]} · <span style="color:var(--red)">não saiu</span></small>`
      :`<small>${m[2]}${SELO[st]?' · '+SELO[st]:''}</small>`;
    const denovo=(st==='falhou'&&m[4])
      ?`<button class="ghost" style="margin-top:6px" data-acao="reenviar-mensagem" data-msg="${m[4]}">${ic('refresh',13)} Tentar de novo</button>`
      :'';
    return `<div class="msg ${m[0]}">${m[1]}${denovo}${pe}</div>`;
  };
  const fio=Array.isArray(d.conversa)?d.conversa:[];
  const pe=!temAlvo
    ?`<div class="banner alerta" style="margin-top:12px">${ic('alert',15)}<span>Sem telefone</span>
      <button data-acao="abrir-ficha-lead">Abrir ficha</button></div>`
    :canal==='empresa'
      ?(!fioPronto?'':`<label class="escrever">${ic('chat',16)}
        <input placeholder="Escrever mensagem" data-campo="conversa-texto"${d.enviando?' disabled':''}>
        <button class="enviar${d.enviando?' ocupado':''}" data-acao="enviar-conversa"${d.enviando?' disabled aria-busy="true"':''}>${ic('nav',15)}</button></label>`)
      /* 🔴 ESTE BOTÃO TAMBÉM CUSTA — e por isso ele reage ao dedo como o
         "enviar" do lado da empresa. Ele abre o WhatsApp E carimba a tentativa
         no servidor; enquanto isso não volta, ele fica travado e DIZ que está
         trabalhando. Sem esta metade a tela não mudava um pixel depois do
         toque (medido: 3 toques = 3 intents + 3 carimbos), e três carimbos de
         contato no mesmo lead é a conta que decide se a vendedora manda de
         novo pro mesmo contato frio. */
      :`<button class="act go full${d.enviando?' ocupado':''}" style="margin-top:12px;justify-content:center" data-acao="abrir-whats-pessoal"${d.enviando?' disabled aria-busy="true"':''}>${ic('chat',17)}<b>${d.enviando?'Abrindo…':'Abrir no meu WhatsApp'}</b></button>`;
  /* Conversa vazia porque o servidor disse vazio tem CENA PRÓPRIA — o esqueleto
     e o "não consegui carregar" são do miolo, e os três nunca se misturam. */
  return `${cabeca}
  ${pilula}
  <div class="conversa">
    ${miolo(d,'chat','recarregar-conversas',4, fio.length
      ? fio.map(bolha).join('')
      : (d.vazio?`<div class="vazio"><span class="ico">${ic('chat',24)}</span><strong>${d.vazio}</strong></div>`:''))}
  </div>
  ${pe}`;
}
T.conversas={nome:'Conversa com o lead',grupo:'Conversas',render(){return `${status}
${hdr({voltar:DADOS.conversas.volta||'vendas'})}
<div class="body chat-corpo">
  ${corpoDaConversa(DADOS.conversas)}
</div>
${nav('conversas')}`;}};

/* A MESMA TELA COM A "EMPRESA" APAGADA — o segundo estado que o dono mandou
   desenhar. É a mesma função de corpo com outra seção de DADOS: a galeria
   mostra os dois lados sem que exista uma segunda tela pra manter. */
T.conversassemchip={nome:'Conversa · Empresa apagada',grupo:'Conversas',render(){return `${status}
${hdr({voltar:DADOS.conversassemchip.volta||'vendas'})}
<div class="body chat-corpo">
  ${corpoDaConversa(DADOS.conversassemchip)}
</div>
${nav('conversas')}`;}};

/* 4b — A FICHA DO LEAD (19/08, ordem do dono: *"eu quero ver detalhes do lead
   que puxei ao clicar nele, eu clico nele abre conversas, como assim?"* e
   *"cadê as opções de já abrir o e-mail do celular, telefone já ligar,
   WhatsApp já abrir o WhatsApp"*).

   🔴 O QUE ESTAVA ERRADO, E ERAM DUAS COISAS. (1) O toque no cartão do funil
   pulava DIRETO pra conversa: o app tinha 17 telas e nenhuma mostrava o LEAD.
   (2) O que se chamava "ficha" era um popup de LEITURA — quatro telefones e
   dois e-mails escritos como texto, sem um único botão (foto do g15, 19/08).
   O vendedor lia o número na tela e digitava no discador na mão, na rua.

   🔴 O QUE O MERCADO FAZ, E É UM SÓ. Contatos do Android/iOS, HubSpot,
   Pipedrive, Zoho e Kommo abrem o REGISTRO ao tocar na lista, e embaixo do
   nome vem a fileira de canais (ligar · mensagem · e-mail · rota). O dado de
   contato NUNCA é texto morto: é o alvo. A conversa é UMA das ações, não o
   destino do toque — porque quem toca num lead às vezes quer o CNPJ, o e-mail,
   o endereço ou o histórico, e não mandar mensagem.

   🔴 E POR ISSO A LISTA GANHOU ATALHO PRÓPRIO. Empurrar todo mundo por mais um
   toque pra falar seria trocar um defeito por outro: no cartão do funil o
   balão verde abre a conversa em UM toque (quem já sabe o que quer), e o resto
   do cartão abre esta ficha (quem precisa saber). Duas intenções, dois alvos.

   🔴 ZERO DADO INVENTADO: tudo aqui sai de `GET /vendas/lead/:id/card`, que a
   allowlist do APK já deixava passar (a conversa lê a mesma porta). Nenhuma
   linha nasce sem fonte — a Lei do IF vale campo a campo, e é ela que faz esta
   tela encolher sozinha num lead cru do Radar e crescer num lead enriquecido. */
T.leadficha={nome:'Ficha do lead',grupo:'Vendas',render(){
  const d=DADOS.leadficha;
  const fones=Array.isArray(d.fones)?d.fones:[];
  const emails=Array.isArray(d.emails)?d.emails:[];
  const linha=Array.isArray(d.linha)?d.linha:[];
  const historia=Array.isArray(d.historia)?d.historia:[];

  /* Os quatro canais. Cada um só existe com o fato por trás (Lei do IF): sem
     telefone não há "Ligar" nem "WhatsApp", sem e-mail não há "E-mail". Botão
     desenhado que não faz nada é pior que botão ausente — a pessoa toca, nada
     acontece, e conclui que o aplicativo está quebrado. */
  const canais=[
    d.id?`<button class="acao-rapida" data-acao="lead-conversar"><i>${ic('chat',19)}</i><b>Conversa</b></button>`:'',
    d.fone?`<button class="acao-rapida zap" data-acao="lead-zap"><i>${ic('whats',19)}</i><b>WhatsApp</b></button>`:'',
    d.fone?`<button class="acao-rapida liga" data-acao="lead-ligar"><i>${ic('phone',19)}</i><b>Ligar</b></button>`:'',
    d.email?`<button class="acao-rapida" data-acao="lead-email"><i>${ic('mail',19)}</i><b>E-mail</b></button>`:'',
  ].filter(Boolean).join('');

  /* Uma linha de contato: o corpo inteiro é a ação ÓBVIA do canal e os verbos
     extras moram à direita. `dado` é o que viaja pro discador/WhatsApp — o
     bonito é pra ler, o cru é pra agir, e misturar os dois é o que faz um
     "(19) 9…" chegar formatado no `tel:`. */
  const linhaFone=(f,i)=>`<div class="linha-toque" data-acao="lead-zap" data-fone="${f.cru}">
    <i>${ic('phone',15)}</i>
    <span class="txt"><strong>${f.rot}</strong><span>${f.sub||'toque para abrir no WhatsApp'}</span></span>
    <span class="verbos">
      <button class="zap" data-acao="lead-zap" data-fone="${f.cru}" aria-label="WhatsApp">${ic('whats',16)}</button>
      <button data-acao="lead-ligar" data-fone="${f.cru}" aria-label="Ligar">${ic('phone',16)}</button>
      <button data-acao="lead-copiar" data-copia="${f.rot}" aria-label="Copiar">${ic('copy',16)}</button>
    </span></div>`;
  const linhaEmail=(e)=>`<div class="linha-toque" data-acao="lead-email" data-email="${e}">
    <i>${ic('mail',15)}</i>
    <span class="txt"><strong>${e}</strong><span>toque para escrever</span></span>
    <span class="verbos">
      <button data-acao="lead-copiar" data-copia="${e}" aria-label="Copiar">${ic('copy',16)}</button>
    </span></div>`;

  const falar=(fones.length||emails.length)
    ?`<div class="box">${fones.map(linhaFone).join('')}${emails.map(linhaEmail).join('')}</div>`
    :`<div class="box"><div class="box-t">Sem telefone e sem e-mail</div>
      <div class="box-s">O servidor não devolveu nenhum contato desta empresa — por aqui não há como falar com ela.</div></div>`;

  /* Leitura pura: rótulo à esquerda, valor à direita. É a MESMA peça da ficha
     de empresa (`.rowline`) — peça nova pra dizer a mesma coisa é como duas
     telas passam a mostrar o mesmo dado de dois jeitos. */
  const par=(rot,val,copia)=>val?`<div class="rowline"><span class="rot">${rot}</span>
    ${copia?`<button class="copiavel" data-acao="lead-copiar" data-copia="${val}">${val}${ic('copy',13)}</button>`
           :`<b>${val}</b>`}</div>`:'';

  /* O site é LINHA DE TOQUE e não par de leitura: ele abre no navegador do
     aparelho, e é o que o vendedor olha antes de ligar (preço, foto, se a loja
     ainda existe). Sem site a linha some — nunca "não informado". */
  const quem=[par('CNPJ',d.cnpj,1),par('Razão social',d.razaoSocial),par('Situação',d.situacao),
              par('Responsável',d.responsavel),par('Segmento',d.segmento),par('Nota',d.nota),
              d.site?`<div class="linha-toque" data-acao="lead-site"><i>${ic('search',15)}</i>
                <span class="txt"><strong>${d.site}</strong><span>toque para abrir o site</span></span>
                <span class="verbos"><button data-acao="lead-copiar" data-copia="${d.site}" aria-label="Copiar">${ic('copy',16)}</button></span></div>`:''
             ].filter(Boolean).join('');

  const onde=d.endereco||d.onde
    ?`<div class="box">
      ${d.endereco?`<div class="linha-toque" data-acao="lead-mapa"><i>${ic('map',15)}</i>
        <span class="txt"><strong>${d.endereco}</strong><span>${d.onde||'toque para ver no mapa'}</span></span>
        <span class="verbos"><button data-acao="lead-mapa" aria-label="Mapa">${ic('nav',16)}</button></span></div>`
       :`<div class="rowline"><span class="rot">Cidade</span><b>${d.onde}</b></div>`}
    </div>`:'';

  const corpo=`<div class="lista-card">
    <div class="cli">
      <span class="ava${d.tom?` ${d.tom}`:''}">${d.ini}</span>
      <span><strong>${d.nome}</strong><span>${d.onde||'sem cidade'}</span>
        <span class="tags">${d.etapa?`<b class="tag${d.etapaTom?` ${d.etapaTom}`:''}">${d.etapa}</b>`:''}
          ${d.selo?`<b class="tag${d.seloTom?` ${d.seloTom}`:''}">${d.selo}</b>`:''}</span></span>
    </div>
  </div>

  <div class="acoes-rapidas">${canais}</div>
  ${d.fone?'':`<div class="banner alerta">${ic('alert',15)}
    <span>Sem telefone: esta empresa não vira conversa. O Radar às vezes acha o número depois.</span></div>`}

  <div class="grupo">Falar</div>
  ${falar}

  ${quem?`<div class="grupo">Quem é</div><div class="box dados">${quem}</div>`:''}

  ${onde?`<div class="grupo">Onde é</div>${onde}`:''}

  ${linha.length?`<div class="grupo">Como está</div>
    <div class="box dados">${linha.map(l=>par(l[0],l[1])).join('')}</div>`:''}

  ${d.recado?`<div class="grupo">Recado</div>
    <div class="box"><div class="box-s">${d.recado}</div></div>`:''}

  ${historia.length?`<div class="grupo">O que já aconteceu</div>
    <div class="box">${historia.map(h=>`<div class="rowline"><span class="rot">${h[1]}</span><b>${h[0]}</b></div>
      ${h[2]?`<div class="box-s">${h[2]}</div>`:''}`).join('')}</div>`:''}`;

  return `${status}
${hdr({voltar:d.volta||'vendas'})}
<div class="body">
  ${miolo(d,'store','recarregar-leadficha',6,corpo)}
</div>
${nav('vendas')}`;}};

/* 5 — EMPRESAS (a carteira) -----------------------------------------------
   Fonte: GET /nucleo/empresas?query=&uf=&page=&pageSize= — READ-ONLY,
   company-scoped, e o serviço devolve {page,pageSize,total,totalPages,items[]}.

   TRÊS DECISÕES QUE VALE ESCREVER:

   1. O botão de sliders ao lado da busca NÃO veio junto. No molde ele é
      decorativo: nenhum data-acao, nenhum destino. Aqui os chips de UF JÁ são o
      filtro, então copiá-lo seria plantar o botão morto que esta casa já matou
      três vezes.

   2. VAZIO DO SERVIDOR × VAZIO DA REDE são DUAS CENAS. O miolo cuida da rede;
      o vazio de verdade é desenhado aqui, e ainda se parte em dois: filtro que
      não casou (a saída é LIMPAR) e carteira realmente vazia (a saída é o
      RADAR, que é quem enche isto).

   3. PAGINAÇÃO HONESTA. A porta pagina de verdade, então a tela nunca finge que
      mostrou tudo: o "Carregar mais" só nasce enquanto há página seguinte, e o
      rodapé separa o TOTAL do servidor do que está NA TELA. Um número só ali
      seria a mentira clássica de lista paginada.

   O rodapé inteiro some enquanto carrega ou quando a fonte caiu: somatório é
   dado, e dado sem fonte não vira zero na cara de ninguém. */
T.empresas={nome:'Empresas',grupo:'Empresas',render(){
  const d=DADOS.empresas;
  /* Os chips de UF nascem do que a ponte publicou. Sem fonte, o bloco inteiro
     some — 27 siglas inventadas seriam filtro prometendo base que não existe. A
     UF SELECIONADA entra mesmo fora da lista, senão o filtro ativo ficaria sem
     botão pra soltar. */
  const ufs=Array.isArray(d.ufs)?d.ufs.slice():[];
  if(d.ufSel&&ufs.indexOf(d.ufSel)<0) ufs.push(d.ufSel);
  ufs.sort();
  const filtrando=!!(String(d.busca||'').trim()||d.ufSel);
  const lista=Array.isArray(d.lista)?d.lista:[];
  const pagina=Number(d.pagina||1), totalPaginas=Number(d.totalPaginas||1);

  /* A segunda linha é composta AQUI, não na ponte: quando falta CNPJ e falta
     cidade, quem sabe dizer isso em voz alta é a tela. Linha vazia embaixo do
     nome parece defeito de renderização. */
  const sub=(e)=>{
    const p=[];
    if(e.cnpj) p.push(e.cnpj);
    const onde=[e.cidade,e.uf].filter(Boolean).join(' · ');
    if(onde) p.push(onde);
    return p.join(' · ')||'sem CNPJ e sem cidade';
  };
  const papeis=(e)=>`${e.cliente?'<b class="tag lime">Cliente</b>':''}${e.lead?'<b class="tag blue">Lead</b>':''}${e.fornecedor?'<b class="tag">Fornecedor</b>':''}`;
  const emp=(e)=>`<div class="cli" data-acao="abrir-empresa" data-empresa="${e.id}">
    <span class="ava ${e.cliente?'lime':''}">${e.ini}</span>
    <span><strong>${e.nome}</strong><span>${sub(e)}</span>
      <span class="tags">${papeis(e)}${e.contatos?`<b class="tag">${e.contatos} ${e.contatos>1?'pessoas':'pessoa'}</b>`:''}${e.origem?`<b class="tag">${e.origem}</b>`:''}</span></span>
    <span class="rgt"><span style="color:var(--ink-3)">${ic('chev',15)}</span></span></div>`;

  const vazioFiltro=`<div class="vazio">
    <span class="ico">${ic('search',24)}</span>
    <strong>Nada com este filtro</strong>
    <span>O servidor respondeu — nenhuma empresa da carteira bate com o que está marcado.</span>
    <button class="ghost" data-acao="empresas-limpar">${ic('close',15)} Limpar filtro</button></div>`;
  const vazioCarteira=`<div class="vazio">
    <span class="ico">${ic('store',24)}</span>
    <strong>Carteira vazia</strong>
    <span>Nenhuma empresa aqui ainda. Quem enche esta lista é o Radar.</span>
    <button class="ghost" data-ir="radar">${ic('target',15)} Abrir o Radar</button></div>`;

  const conteudo=lista.length
    ?`<div class="lista-card">${lista.map(emp).join('')}</div>
    ${pagina<totalPaginas?`<button class="act full" style="margin-top:7px;justify-content:center" data-acao="empresas-mais">
      ${ic('download',17)}<b>${d.carregandoMais?'Carregando…':'Carregar mais'}</b></button>`:''}`
    :(filtrando?vazioFiltro:vazioCarteira);

  return `${status}
${hdr()}
<div class="body">
  <div class="screen-head"><span style="color:var(--lime)">${ic('store',30)}</span>
    <span><h2>Empresas</h2>${d.subtitulo?`<p>${d.subtitulo}</p>`:''}</span></div>
  <div class="searchrow">
    <label class="search">${ic('search',17)}<input placeholder="Nome, cidade ou CNPJ" data-campo="busca-empresa" value="${d.busca}"></label></div>
  ${ufs.length?`<div class="chips">
    <button class="chip${d.ufSel?'':' on'}" data-acao="empresa-uf" data-uf="">Todas</button>
    ${ufs.map(u=>`<button class="chip${d.ufSel===u?' on':''}" data-acao="empresa-uf" data-uf="${u}">${u}</button>`).join('')}</div>`:''}
  ${miolo(d,'store','recarregar-empresas',7,conteudo)}
  ${d.carregando||d.semFonte?'':`<div class="sum">
    <span class="c"><span style="color:var(--lime)">${ic('store',17)}</span><span><b>${d.total}</b><small>${filtrando?'no filtro':'na carteira'}</small></span></span>
    <span class="c"><span style="color:var(--blue-l)">${ic('list',17)}</span><span><b>${lista.length}</b><small>nesta tela</small></span></span>
  </div>`}
</div>
${nav('empresas')}`;}};

/* 6 — FICHA DA EMPRESA ----------------------------------------------------
   Fonte: GET /nucleo/empresas/:id. Campo que a porta não devolve não tem linha
   na tela.

   🔴 A FICHA EXISTE PRA FALAR COM A EMPRESA. Lista sem destino é botão morto
   com passo extra, então a porta pra Conversas é o centro desta tela — e ela
   tem TRÊS desfechos, não um:
     · já é lead (a ponte publicou leadId) → abre a conversa direto;
     · não é lead mas TEM por onde falar → "Mandar pra Vendas", que cria o lead
       e aí sim abre a conversa;
     · não tem telefone nem WhatsApp em nenhuma pessoa → NENHUM botão, e uma
       faixa dizendo por quê. Botão verde que abre conversa sem número é a
       promessa que esta casa já pagou caro pra não fazer.

   🔴 TELA READ-ONLY, ENTÃO NADA DE CAMPO EDITÁVEL. O controller do núcleo é
   leitura pura. Desenhar input e Salvar aqui seria forma de escrita sem porta
   que aceite. */
T.empresaficha={nome:'Ficha da empresa',grupo:'Empresas',render(){
  const e=DADOS.empresaficha;
  const contatos=Array.isArray(e.contatos)?e.contatos:[];
  /* Quem tem por onde falar: o telefone da conta OU alguma pessoa com WhatsApp.
     DERIVADO, nunca uma bandeira que a ponte liga na mão — bandeira paralela ao
     dado é como as duas passam a discordar. */
  const temFone=!!(e.telefone||contatos.some(c=>c.podeFalar));
  const onde=[e.cidade,e.uf].filter(Boolean).join(' · ');
  const rua=[e.endereco,e.numero].filter(Boolean).join(', ');

  /* Linha de leitura. Sem valor a linha SOME — menos nas três que são
     identidade (CNPJ, telefone, e-mail): ali a AUSÊNCIA é a informação que o
     vendedor precisa antes de tentar ligar, então ela se escreve apagada. */
  const dado=(rot,val,contaAusencia)=>(val||contaAusencia)
    ?`<div class="rowline"><span style="color:var(--ink-2)">${rot}</span>
      ${val?`<b style="color:var(--ink)">${val}</b>`:'<b style="color:var(--ink-3)">não informado</b>'}</div>`
    :'';

  const papeis=`${e.cliente?'<b class="tag lime">Cliente</b>':''}${e.lead?'<b class="tag blue">Lead</b>':''}${e.fornecedor?'<b class="tag">Fornecedor</b>':''}`;

  const falar=e.leadId
    ?`<button class="act go full" style="margin-top:7px;justify-content:center"
        data-acao="abrir-conversa-empresa" data-lead="${e.leadId}">${ic('chat',19)}<b>Falar no WhatsApp</b></button>`
    :temFone
      ?`<button class="act full" style="margin-top:7px;justify-content:center"
          data-acao="mandar-para-vendas" data-empresa="${e.id}">${ic('sales',17)}<b>${e.mandando?'Mandando…':'Mandar pra Vendas'}</b></button>
        <div class="banner pausa" style="margin-top:7px">${ic('alert',15)}
          <span>Ainda não é um lead. Mandar pra Vendas abre a conversa e o funil.</span></div>`
      :`<div class="banner alerta" style="margin-top:7px">${ic('alert',15)}
          <span>Sem telefone e sem WhatsApp em nenhuma pessoa — não há por onde falar com esta empresa.</span></div>`;

  const pessoas=contatos.length
    ?`<div class="cartao-lista" style="padding:0 11px">
      ${contatos.map(c=>`<div class="item-linha"${c.podeFalar?` data-acao="falar-contato" data-contato="${c.id}"`:''}>
        <span class="ava" style="width:32px;height:32px">${c.ini}</span>
        <span><strong>${c.nome}</strong><span>${c.sub}</span>
          ${c.principal?'<span class="tags"><b class="tag lime">principal</b></span>':''}</span>
        <span style="color:var(--ink-3)">${ic(c.podeFalar?'chat':'chev',15)}</span></div>`).join('')}
    </div>`
    :`<div class="box"><div class="box-t">Nenhuma pessoa cadastrada</div>
      <div class="box-s">O servidor respondeu: esta empresa ainda não tem contato nenhum.</div></div>`;

  const corpo=`<div class="lista-card">
    <div class="cli">
      <span class="ava lime">${e.ini}</span>
      <span><strong>${e.nome}</strong><span>${onde||'sem cidade'}</span>
        ${papeis?`<span class="tags">${papeis}</span>`:''}</span>
      <span class="rgt"></span></div>
  </div>

  <div class="grupo">Quem é</div>
  <div class="box">
    ${dado('CNPJ',e.cnpj,1)}
    ${dado('Documento',e.documento)}
    ${dado('Origem',e.origem)}
    ${dado('Na carteira desde',e.desde)}
  </div>

  <div class="grupo">Onde é</div>
  <div class="box">
    ${dado('Endereço',rua)}
    ${dado('Cidade',onde)}
    ${dado('CEP',e.cep)}
    ${e.pino?`<div class="rowline"><span style="color:var(--ink-2)">Local</span>
      <b style="color:var(--lime)">${e.pino}</b></div>`:''}
  </div>

  <div class="grupo">Falar</div>
  <div class="box">
    ${dado('Telefone',e.telefone,1)}
    ${dado('E-mail',e.email,1)}
  </div>
  ${falar}

  <div class="grupo">Pessoas${contatos.length?` · ${contatos.length}`:''}</div>
  ${pessoas}`;

  return `${status}
${hdr({voltar:e.volta||'empresas'})}
<div class="body">
  ${miolo(e,'store','recarregar-empresa',6,corpo)}
</div>
${nav('empresas')}`;}};

/* 7 — "VOCÊ AINDA NÃO TEM EMPRESAS" — a tela de estreia de quem instala com a
   carteira vazia. A saída daqui é o RADAR, que é quem enche a carteira deste app.

   🔴 O HERÓI "A GENTE CADASTRA PRA VOCÊ" SAIU DAQUI EM 19/08, E NÃO FOI FALTA DE
   VONTADE — foi a lei da casa aplicada a ela mesma. A peça veio copiada do app
   do motorista, onde ela FUNCIONA (`C9-captura-clientes.js`), e chegou aqui com
   os três botões (`cadastro-foto`, `cadastro-whats`, `cadastro-email`) sem dono
   em ponte nenhuma: TRÊS DE TRÊS mortos, na primeira tela que um cliente novo
   vê. Medido em 19/08 varrendo o `data-acao` do mock contra o `ponte.js`.

   E ligá-los aqui era impossível hoje, não difícil — as três portas do motorista
   dependem de coisas que este flavor não alcança:
     · a foto vai em `POST /logistica/cadastro-em-massa`, e o `/logistica/*` é
       `@ModuleAccess('logistica')` no backend — um tenant só-Vendas leva 403;
     · o número e o e-mail do suporte vêm do `GET /logistica/config`
       (`suporteWhatsapp`/`suporteEmail`), que é a mesma porta gateada;
     · e NENHUM dos dois caminhos está na allowlist do Kotlin deste app
       (`NativeApiClient.vendasEndpoint`) — caminho fora dela morre DENTRO do
       aparelho, com o backend 100% verde.
   Cravar o telefone no APK seria pior ainda: um aparelho velho na mão de um
   cliente continuaria mandando gente pro número antigo para sempre (a lição já
   escrita no `C9`).

   🔴 ENTÃO SOME A PORTA, NÃO A TELA — é a regra que este código já tinha
   escrito. Botão desenhado que não faz nada é pior que botão ausente: a pessoa
   toca, nada acontece, e conclui que o aplicativo está quebrado. Fica de pé o
   que FUNCIONA: o convite e o caminho do Radar.

   A receita pra ela voltar, inteira, são três linhas em três arquivos:
   `POST /vendas/cadastro-em-massa` + os contatos de suporte numa resposta que
   este app já lê (`/profile` serve), a allowlist do Kotlin no MESMO commit, e o
   `C9-captura-clientes.js` copiado com o caminho trocado. */
T.semclientes={nome:'Você ainda não tem empresas',grupo:'Sistema',render(){
  const c=DADOS.semclientes;
  return `${status}
${hdr({voltar:'vendas'})}
<div class="body">
  <h1 class="cap-tit">${c.titulo}</h1>
  <p class="cap-sub">${c.sub}</p>

  <button class="cap-manual" style="margin-top:16px" data-ir="radar">
    <span class="ico">${ic('target',17)}</span>
    <span><strong>${c.manualTitulo}</strong><span>${c.manualSub}</span></span>
    <span style="color:var(--ink-3)">${ic('chev',15)}</span>
  </button>
</div>`;
}};

/* 8 — PORTÕES (catálogo navegável) ----------------------------------------
   Os oito portões do motorista falavam de rota, carga e endereço de entrega —
   nada disso existe aqui. Os seis que ficaram são os que o app de VENDAS
   realmente encontra, e o primeiro deles é a cura do incidente de 18/08. */
T.portoes={nome:'Portões e bloqueios',grupo:'Sistema',render(){
  const p=(chave,nome,quando,tom)=>`
    <div class="rowcard">
      <span class="ico ${tom==='trava'?'':'lime'}" style="${tom==='trava'?'background:var(--danger-ico-bg);color:var(--danger-ico)':''}">
        ${ic(tom==='trava'?'lock':'alert',18)}</span>
      <span><strong>${nome}</strong><span>${quando}</span></span>
      <button class="ghost" data-portao="${chave}">ver</button></div>`;
  /* 🔴 A TELA PRECISA DIZER QUE É AULA, E ATÉ 19/08 NÃO DIZIA. Ela abre em
     `hdr()` e cai direto nos grupos: quem chega aqui pelo Ajustes vê sete
     linhas com cara de LISTA DE PROBLEMAS DA MINHA CONTA, e o "ver" abre um
     diálogo idêntico ao que o servidor levanta pra valer. Foi por essa fresta
     que o preço por card sobreviveu no `PORTOES.creditos` — um exemplo vestido
     de dado real não é lido como exemplo. O `.screen-head` é a mesma peça das
     outras cinco telas (funil, radar, agenda, empresas, perfil) e é onde a tela
     assume o que é, ANTES do primeiro "ver". Enquanto a frase estiver aqui em
     cima, nenhum destes diálogos precisa fingir que traz número de ninguém. */
  return `${status}
${hdr()}
<div class="body">
  <div class="screen-head"><span style="color:var(--ink-2)">${ic('lock',30)}</span>
    <span><h2>Portões e bloqueios</h2><p>Exemplos: é assim que cada aviso aparece. Nada aqui é a sua conta.</p></span></div>
  <div class="grupo">Antes de falar com a empresa</div>
  ${p('modulo','Módulo desligado','a empresa não liberou — o app não é quem barra','trava')}
  ${p('semzap','WhatsApp da empresa fora do ar','a mensagem fica esperando e ninguém lê','alerta')}
  ${p('ddd','Telefone sem DDD','sem DDD o WhatsApp não abre','alerta')}
  <div class="grupo">Antes de gastar crédito</div>
  ${p('creditos','Créditos acabaram','sem crédito o Radar não entrega empresa nova','trava')}
  ${p('valores','Valores bloqueados','quem vê preço é o responsável da empresa','alerta')}
  <div class="grupo">Aplicativo</div>
  ${p('update','Versão nova disponível','tem "Agora não"','alerta')}
  ${p('updateObrig','Atualização obrigatória','não fecha — o app não fala mais com o servidor','trava')}
</div>
${nav('ajustes')}`;}};

/* ==========================================================================
   AJUSTES — A PORTA DE TUDO NO APP DE VENDAS

   🔴 O QUE SAIU DO AJUSTES DO MOTORISTA, E POR QUÊ. Rotas salvas, Clientes,
   Produtos, Fechamento do dia, Financeiro, Avançado (as 6 chaves de cobrança),
   Sons por evento e o Prospector — nada disso tem porta neste app: não existe
   rota, não existe carga, não existe caixa do dia e não existe DTO pra gravar
   chave nenhuma. Chave sem porta é o botão que promete e devolve 400. Preferi 4
   linhas vivas a 9 mortas.

   🔴 O QUE ENTROU, CADA UMA COM DESTINO PRÓPRIO: Meu perfil (/profile),
   Créditos (/credits/me), WhatsApp da empresa (/companies/me/whatsapp-status),
   Módulos liberados (/modules/me), Tutorial, e a SAÍDA.

   🔴 O ÍNDICE TEM DUAS METADES, E ISSO É DE PROPÓSITO. O que vem do SERVIDOR
   (Conta, Créditos, Empresa) mora DENTRO do miolo — esqueleto na 1ª carga,
   aviso com "Tentar de novo" quando a fonte cai. O que é do APARELHO (Tutorial,
   sons, tema, versão e o SAIR) fica FORA. Pôr o Sair dentro do miolo prende a
   pessoa dentro do app justamente no caso em que ela mais precisa sair: rede no
   chão, token velho, empresa errada. A porta de saída não pode depender da rede
   que está quebrada.

   🔴 "Desvincular este aparelho" NÃO É UMA SEGUNDA LINHA. É o mesmo logout do
   Sair — dois nomes pro mesmo verbo é a lei "mostra num lugar, edita num lugar"
   quebrada. Virou a linha de baixo do próprio Sair.
   ========================================================================== */
T.ajustes={nome:'Ajustes',grupo:'Ajustes',render(){const a=DADOS.ajustes;
  const linha=(icone,titulo,sub,dir,acao)=>`<button class="linha-cfg"${acao?` data-acao="${acao}"`:''}><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span style="display:flex;align-items:center;gap:7px">${dir||''}<span style="color:var(--ink-3)">${ic('chev',15)}</span></span></button>`;
  /* Linha que ABRE outra tela. data-ir de propósito — é a mesma marca que o
     podarDesligados varre. Nenhuma destas chaves é nome de módulo, então a poda
     passa reto por elas: a régua continua sendo a marca, não uma exceção
     escrita à mão. */
  const linhaIr=(icone,titulo,sub,dir,ir)=>`<button class="linha-cfg" data-ir="${ir}"><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span style="display:flex;align-items:center;gap:7px">${dir||''}<span style="color:var(--ink-3)">${ic('chev',15)}</span></span></button>`;
  const chave=(icone,titulo,sub,on,acao)=>`<button class="linha-cfg" data-acao="${acao}"><span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span class="chave ${on?'on':''}"><i></i></span></button>`;
  /* 🔴 O SELO DO WHATSAPP TEM TRÊS ESTADOS, E O TERCEIRO É O SILÊNCIO. Ligado é
     lima, desligado é âmbar — e enquanto ninguém disser, NENHUM DOS DOIS. Pintar
     "conectado" por omissão faz a pessoa escrever a mensagem e descobrir depois
     que nada saiu; pintar "desconectado" por omissão manda ela incomodar o
     administrador por um problema que não existe. Os dois erros são caros, e o
     honesto é não ter selo. */
  const selo=a.zapLigado==null?''
    :a.zapLigado?`<span class="tag lime">conectado</span>`:`<span class="tag amber">desconectado</span>`;
  return `${status}
${hdr()}
<div class="body">
  ${miolo(a,'gear','recarregar-ajustes',5,`
  <div class="grupo" style="margin-top:2px">Conta</div>
  <div class="cartao-lista">
    ${linhaIr('users',a.perfilNome||'Meu perfil',a.perfilSub,'','perfil')}
  </div>
  ${/* 🔴 LEI DO VENDEDOR (o servidor manda, não a tela): pra quem não é
        audiência de cobrança o /credits/me responde SÓ leadsDisponiveis — sem
        saldo em reais, sem pacote, sem preço. O admin aqui é esse mesmo fato
        traduzido pela ponte. Ele decide só a linha do ÍNDICE; quem decide o que
        a tela de Créditos mostra é o cobranca de lá, porque a tela pode ser
        aberta por rota direta e a régua do dinheiro não pode morar em dois
        lugares. */''}
  ${a.admin?`<div class="grupo">Administração</div>
  <div class="cartao-lista">
    ${linhaIr('card','Créditos',a.creditosSub,a.creditosLinha?`<b>${a.creditosLinha}</b>`:'','creditos')}
  </div>`:''}
  <div class="grupo">Empresa</div>
  <div class="cartao-lista">
    ${linhaIr('chat','WhatsApp da empresa',a.zapNumero,selo,'whatsapp')}
    ${linhaIr('layers','Módulos liberados','',a.modulosLinha?`<b>${a.modulosLinha}</b>`:'','modulos')}
  </div>`)}
  <div class="grupo">Aprender</div>
  <div class="cartao-lista">
    ${linhaIr('bulb','Tutorial','','','tutorial')}
    ${linhaIr('lock','Portões e bloqueios','','','portoes')}
  </div>
  ${/* 🔴 CHAVE COM VALOR DESCONHECIDO NÃO ENTRA NA TELA. A pessoa lê uma chave
        LIGADA (que é só o exemplo do desenho), toca pra desligar e acha que
        desligou — quando não havia configuração carregada nenhuma. Nem ligada
        nem desligada é o estado honesto de uma chave que ainda não chegou. O
        tema não precisa de guarda: quem sabe a luz é o próprio documento. */''}
  <div class="grupo">Som e tela</div>
  <div class="cartao-lista">
    ${a.sons==null?'':chave('volume','Sons e avisos','',a.sons,'chave-sons')}
    ${chave('moon','Tema escuro','',
            document.documentElement.dataset.luz!=='claro','chave-tema')}
  </div>
  ${/* 🔴 A LINHA DA VERSÃO É A PORTA MANUAL DA ATUALIZAÇÃO, e ela não é enfeite:
        o aviso automático é pop-up, some no primeiro repinte e avisa uma vez por
        versão — quem o perdeu ficava preso na versão velha sem nada pra tocar.
        Aviso automático é conveniência; a porta manual é a garantia. */''}
  <div class="grupo">Aplicativo</div>
  <div class="cartao-lista">
    ${a.versao?linha('download',a.versao,a.versaoSub,
        a.versaoTag?`<span class="tag blue">${a.versaoTag}</span>`:'','buscar-update'):''}
    ${linha('logout','Sair','desvincula este aparelho','','sair')}
  </div>
</div>
${nav('ajustes')}`;}};

/* MEU PERFIL — quem eu sou, e onde isso se muda.

   🔴 TELA DE LEITURA, NÃO DE EDIÇÃO. Nome e e-mail se gravam pelo /profile do
   computador, e o app não tem porta pra isso; então aqui não há campo, não há
   Salvar e não há seta. São linhas de item justamente porque item NÃO é botão:
   a peça já diz com o corpo que não se toca nela.

   🔴 O PAPEL APARECE UMA VEZ SÓ, no cabeçalho. Papel no cabeçalho E numa linha
   embaixo é o mesmo dado em dois cartões — bug de produto por lei desta casa.

   🔴 SEÇÃO SEM DADO SOME COM O TÍTULO JUNTO: título de pé sobre caixa vazia é o
   separador órfão de novo. */
T.perfil={nome:'Ajustes · Meu perfil',grupo:'Ajustes',render(){const p=DADOS.perfil;
  const li=(icone,rot,val)=>val?`<div class="item-linha"><span class="ava">${ic(icone,16)}</span>
    <span><strong>${rot}</strong></span>
    <b style="font-size:12.5px;color:var(--ink-2)">${val}</b></div>`:'';
  const secao=(titulo,corpo)=>corpo?`<div class="grupo">${titulo}</div>
  <div class="cartao-lista" style="padding:0 11px">${corpo}</div>`:'';
  return telaAjuste('',miolo(p,'users','recarregar-perfil',5,`
    <div class="screen-head"><span style="color:var(--lime)">${ic('users',30)}</span>
      <span><h2>${p.nome||'Sem nome'}</h2>${p.papel?`<p>${p.papel}</p>`:''}</span></div>
    ${secao('Como te encontram',[li('mail','E-mail',p.email),li('chat','Telefone',p.telefone)].join(''))}
    ${secao('Onde você trabalha',[li('store','Empresa',p.empresa),li('gps','Cidade',p.cidade)].join(''))}
    ${secao('Este aparelho',li('target','Pareado',p.aparelho))}
    <div class="banner pausa">${ic('lock',15)}
      <span>Nome, e-mail e papel são gravados no <b>computador</b>, pelo administrador da sua empresa.</span></div>`));
}};

/* WHATSAPP DA EMPRESA — o número por onde a sua mensagem sai.

   🔴 ESTA TELA EXISTE PORQUE O SILÊNCIO DELA CUSTA VENDA. Sem chip conectado a
   mensagem que o vendedor escreve fica pendente e ninguém lê — e o app, sem
   esta tela, não tinha uma palavra sobre isso. Pergunta que não se responde em
   algum lugar vira "o app não funciona".

   🔴 "NÃO SEI" ENTRA NO MESMO BALDE DE "A REDE CAIU". Um estado ausente pintado
   como desconectado manda a pessoa cobrar o administrador por um problema que
   talvez não exista, e pintado como conectado faz ela escrever pro cliente no
   vazio. Só o aviso honesto — com o Tentar de novo — não escolhe o erro pela
   pessoa.

   🔴 O "ATUALIZAR" NÃO TEM SETA. Ele não leva a lugar nenhum: refaz a pergunta
   ao servidor. Seta ali seria a promessa de uma tela que não existe. */
T.whatsapp={nome:'Ajustes · WhatsApp da empresa',grupo:'Ajustes',render(){const z=DADOS.whatsapp;
  const on=z.conectado===1;
  return telaAjuste('WhatsApp da empresa',
    mioloDe(z.carregando,z.semFonte||z.conectado==null,'chat','recarregar-whatsapp',4,`
    <div class="rowcard" style="margin-top:2px">
      <span class="ico${on?' lime':''}">${ic('chat',18)}</span>
      <span><strong>${z.numero||'Nenhum número conectado'}</strong>${z.estado?`<span>${z.estado}</span>`:''}</span>
      <span class="rgt"><span class="pill ${on?'lime':'amber'}">${ic(on?'check':'alert',14)}${on?'no ar':'fora'}</span></span></div>
    ${on?`<div class="banner pausa">${ic('alert',15)}
      <span>Suas mensagens saem por este número. O cliente vê <b>o número da empresa</b>, nunca o seu.</span></div>`
       :`<div class="banner alerta">${ic('alert',15)}
      <span>Sem WhatsApp conectado <b>nenhuma mensagem sai</b> — o que você escrever fica esperando. Quem conecta é o administrador, no computador.</span></div>`}
    <div class="grupo">Conferir agora</div>
    <div class="cartao-lista">
      <button class="linha-cfg" data-acao="recarregar-whatsapp"><span class="ico">${ic('refresh',16)}</span>
        <span><strong>Atualizar o estado</strong>${z.conferido?`<span>${z.conferido}</span>`:''}</span>
        <span></span></button>
    </div>`,z.quedaMotivo));
}};

/* MÓDULOS LIBERADOS — a cura da porta trancada em silêncio.

   🔴 ESTA TELA NASCEU DE UM INCIDENTE MEDIDO (18/08): um cliente pareou o app e
   levou 39 respostas 403 MODULE_ACCESS_DENIED em 65 segundos, porque o módulo
   estava desligado desde o cadastro — e o 403 era MUDO na tela. A pessoa toca,
   toca, toca e conclui que o aplicativo está quebrado. Aqui a mesma verdade
   fica escrita, de graça, num lugar que ela consegue achar: o que está ligado,
   o que não está, e QUEM liga.

   🔴 LEITURA PURA. Chave que liga módulo é do administrador no desktop (a porta
   é de admin e nem responde ao celular); desenhar interruptor aqui seria
   prometer o que o servidor recusa.

   🔴 O MOTIVO VIAJA NO DADO, não numa régua desta tela. "A empresa não liberou"
   e "seu usuário não tem permissão" são coisas diferentes e mandam a pessoa
   falar com gente diferente; quem sabe qual é são o companyEnabled e o
   userAllowed do /modules/me, traduzidos pela ponte numa frase só. */
T.modulos={nome:'Ajustes · Módulos liberados',grupo:'Ajustes',render(){const m=DADOS.modulos;
  const lin=(icone,nome,sub,on)=>`<div class="item-linha"><span class="ava${on?' lime':''}">${ic(icone,16)}</span>
    <span><strong>${nome}</strong>${sub?`<span>${sub}</span>`:''}</span>
    <span class="tag${on?' lime':''}">${on?'ligado':'desligado'}</span></div>`;
  const lista=Array.isArray(m.lista)?m.lista:[];
  return telaAjuste('Módulos liberados',miolo(m,'layers','recarregar-modulos',5,`
    ${/* Lista vazia aqui é o servidor DIZENDO que não há módulo — cena própria,
          com a saída nomeada. A rede caída já foi resolvida um palmo acima,
          pelo miolo, e as duas nunca dividem a mesma tela. */''}
    ${lista.length?`<div class="cartao-lista" style="padding:0 11px;margin-top:2px">
      ${lista.map(x=>lin(x[0],x[1],x[2],x[3])).join('')}
    </div>`:`<div class="vazio">
      <span class="ico">${ic('layers',24)}</span>
      <strong>Nenhum módulo liberado</strong>
      <span>Fale com o administrador da sua empresa.</span></div>`}
    <div class="banner pausa">${ic('lock',15)}
      <span>Quem liga e desliga módulo é o <b>administrador</b>, no computador. Módulo desligado some da barra de baixo — <b>não é falha do aparelho</b>.</span></div>`));
}};

/* CRÉDITOS — a mesma tela do motorista, com a régua do dinheiro invertida.

   🔴 QUEM DECIDE SE APARECE DINHEIRO É O SERVIDOR, E A OMISSÃO É "NÃO". O
   /credits/me tem DUAS respostas: pra audiência de cobrança vem saldo, lotes e
   pacotes; pro VENDEDOR vem só leadsDisponiveis — sem R$, sem pacote, sem
   preço, e isso é lei de backend, não preferência de tela. Aqui o interruptor
   precisa valer 1 EXATAMENTE pra o dinheiro nascer: ausente, indefinido, zerado
   pelo apagarDemonstracao — tudo cai na face neutra. Se um dia a ponte errar,
   ela erra pro lado de esconder preço, nunca pro lado de mostrar.

   🔴 O EXTRATO DO MOTORISTA NÃO VEIO JUNTO. Em Vendas não existe rota que
   itemize consumo, e inventar uma pra encher a tela é o desenho mostrando linha
   que o app não sabe preencher.

   🔴 A REGRA DE DÉBITO MUDOU DE VERBO. No motorista o crédito saía quando a
   ROTA INICIAVA; aqui sai quando o lead é MANDADO do Radar pra Vendas. Contar e
   buscar são grátis, e o banner diz isso porque é exatamente a dúvida que faz o
   vendedor não usar o Radar. */
T.creditos={nome:'Ajustes · Créditos',grupo:'Ajustes',render(){const c=DADOS.creditos;
  const dinheiro=c.cobranca===1;
  const pac=(qtd,preco,selo,on,chave,det)=>`<button class="pacote ${on?'on':''}"${chave?` data-acao="pacote" data-pacote="${chave}"`:''}>
    <span class="qt"><b>${qtd}</b><small>créditos</small></span>
    <span class="det">${selo?`<span class="selo">${selo}</span>`:''}${det?`<small>${det}</small>`:''}</span>
    <span class="preco">R$ ${preco}</span></button>`;
  const pacotes=dinheiro&&Array.isArray(c.pacotes)?c.pacotes:[];
  return telaAjuste('Créditos',`
    ${miolo(c,'card','recarregar-creditos',4,`
    ${c.saldo?`<div class="saldo">
      <span class="ico">${ic('card',20)}</span>
      <span><span class="n"><b>${c.saldo}</b><small>${dinheiro?'créditos':'leads disponíveis'}</small></span>
        ${dinheiro&&c.vence?`<span class="vence">${c.vence}</span>`:''}</span>
    </div>`:''}
    ${/* 🔴 "1 crédito = 1 lead" ERA UM PREÇO DISFARÇADO DE DEFINIÇÃO, e saiu em
          19/08 com os outros. Parecia inofensivo porque não tem R$, mas é a MESMA
          afirmação que saiu do botão "Puxar" e do portão de créditos: quanto cada
          card custa. E este app não sabe — o catálogo de preço de ação é do
          /master, o `send-to-vendas` não devolve o debitado, e é por isso que a
          ponte anota que o custo por card poderia ser 3, 7 ou 12. Pro VENDEDOR a
          frase já era redundante: o saldo dele vem do servidor como
          `leadsDisponiveis` e a tela o rotula "leads disponíveis" — a conversão
          já foi feita por quem sabe fazê-la. Pro ADMIN, que lê "créditos" e
          compra pacote em reais, ela era o número inventado com a cara mais
          confiável do app: uma regra de três.
          O que fica é a metade que é verdade sempre, e é a dúvida que faz o
          vendedor não usar o Radar: QUAL toque cobra. */''}
    <div class="banner pausa">${ic('alert',15)}
      <span>Só debita quando você <b>manda o lead do Radar pra Vendas</b>: buscar e contar é grátis.</span></div>
    ${pacotes.length?`<div class="grupo">Escolha o pacote</div>
    <div class="pacotes">
      ${pacotes.map(x=>pac(x[0],x[1],x[2],x[3],x[4],x[5])).join('')}
    </div>
    <div class="nota">${ic('lock',13)}
      <span>Pagamento no cartão, pelo Mercado Pago. A HBX não guarda o número do seu cartão.</span></div>`:''}
    ${/* A face neutra não termina em silêncio: sem esta linha o vendedor vê o
          saldo baixando e não sabe a quem pedir mais. */''}
    ${dinheiro?'':`<div class="nota">${ic('lock',13)}
      <span>Quem compra crédito é o responsável da empresa, no computador.</span></div>`}`)}`,
    dinheiro&&c.cta?`<button class="act go full" style="justify-content:center" data-acao="recarregar">${ic('check',19)}<b>${c.cta}</b></button>`:'');
}};

/* TUTORIAL — a porta única de aprender.

   🔴 O CATÁLOGO CONTINUA NASCENDO DO MOTOR (capitulosDoCatalogo), nunca de uma
   lista escrita nesta tela: a régua de "este capítulo existe pra esta pessoa"
   tem um dono só, senão a tela e o tour discordam no primeiro ajuste — linha
   bonita abrindo capítulo sem passo.

   🔴 E ELA PERGUNTA ANTES DE CHAMAR. Sem a pergunta, um catálogo ausente mataria
   a tela inteira com um ReferenceError e o índice teria um botão que abre o
   nada. Com ela, o pior caso é a tela nascer só com a dica da lâmpada — que é
   conteúdo verdadeiro, e não some quando o catálogo chegar. */
T.tutorial={nome:'Tutorial',grupo:'Ajustes',render(){
  const cs=(typeof capitulosDoCatalogo==='function'?capitulosDoCatalogo():[])||[];
  const feito=id=>typeof tutorFeito==='function'&&tutorFeito(id);
  const linha=(icone,titulo,dir,acao)=>`<button class="linha-cfg" data-acao="${acao}">
    <span class="ico">${ic(icone,16)}</span>
    <span><strong>${titulo}</strong></span>
    <span style="display:flex;align-items:center;gap:7px">${dir||''}<span style="color:var(--ink-3)">${ic('chev',15)}</span></span></button>`;
  return telaAjuste('Tutorial',`
    ${cs.length?`<div class="grupo" style="margin-top:2px">Passo a passo</div>
    <div class="cartao-lista">
      ${cs.map(([id,c])=>linha(c.ico||'bulb',c.titulo,
          feito(id)?`<span style="color:var(--lime)">${ic('check',15)}</span>`:'','tutor-'+id)).join('')}
    </div>`:''}
    <div class="tut-dica">${ic('bulb',17)}
      <span><b>A lâmpada ensina cada tela.</b> Em qualquer tela do app, o botão
      da lâmpada lá em cima explica o que tem nela.</span></div>`);
}};

/* ==========================================================================
   MONTAGEM
   ========================================================================== */
const ORDEM=['entrada','saida','vendas','leadficha','agenda','conversas','conversassemchip','radar',
             'empresas','empresaficha','ajustes','perfil','whatsapp','modulos','creditos',
             'tutorial','semclientes','portoes'];
const GRUPOS=['Sistema','Vendas','Radar','Conversas','Empresas','Ajustes'];
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
/* 🔴 A LISTA NASCE VAZIA NO APP DE VENDAS, E ISSO É A RESPOSTA CERTA — não um
   descuido. Tela cheia aqui era do MAPA: o 2D e o dirigir tomavam o aparelho
   inteiro porque mapa que começa debaixo de uma faixa opaca é mapa com menos
   mapa. Vendas não dirige, não tem palco de mapa e nenhuma tela dele ganha
   nada em perder o cabeçalho e a barra.
   A pergunta fica de pé (e a lista, e a função) porque a coreografia de entrar
   e sair da tela cheia é da CAMADA, em `pintar` — apagar a pergunta obrigaria a
   reescrever os três ramos de lá pra devolver a mesma resposta. Uma lista vazia
   responde "nenhuma" com uma linha, e no dia em que Vendas ganhar uma tela que
   tome o aparelho, é ESTA linha que muda. */
const TELA_CHEIA=[];
function noCheio(k){ return TELA_CHEIA.includes(k); }

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
/* 🔴 O TETO DA CENA ERA UM NÚMERO E VIROU UMA PERGUNTA — `CENA_CHEIA` MORREU
   (17/08). O que existia aqui: um relógio de parede (2200 → 1200 → e hoje seria
   ~3940) fazendo TRÊS trabalhos ao mesmo tempo — tirar a marca `cena` da camada,
   dizer até quando o repinte herda a entrada, e (§ `entrarNaDescida`, na ponte)
   servir de maestro pra descida da câmera. Um número com três donos é um número
   que erra pra dois deles.

   E com a FILA ele erraria pra todos: a cena deixou de ter duração fechada. Cada
   fase acaba quando o MAPA avisa — `escurece` espera o tile (a ponte dá até 3,8 s
   pra isso), `ruas` acaba na última onda, `descida` no fim do `easeTo` —, então
   qualquer número que a casca cravasse aqui seria curto num aparelho lento. Curto
   significa: repinte no meio da cena perde a herança, as animações da fase
   recomeçam do zero e a tela PISCA. É o defeito de 08/08 voltando por dentro.

   O que responde no lugar dele é a própria fila: `cenaNoAr()` enquanto a cena que
   a casca abriu não fechou, `emCena()` enquanto existe fase na raiz. Quem garante
   que isso TERMINA são os dois relógios que já existem (o `FASE_TETO` da ponte e o
   `CENA_SOCORRO` daqui), e não um terceiro.

   `ENTRADA_COMUM` fica, e a lei dele é a mesma de sempre: "o relógio herdado vale
   exatamente enquanto a entrada roda". Uma tela comum entra em ~740 ms (o eixo X
   fecha em 150 ms e as linhas escalonadas seguem até lá) — 900 é essa conta com a
   folga da travada de thread. Um teto grande aplicado a TODA tela seria reabrir o
   buraco do "nasce terminada" de brinde. */
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
/* 🔴 A ÚNICA ANIMAÇÃO DA CENA QUE É DA CAMADA, E NÃO DA FASE (17/08). Ela é a
   fase 1 vista de fora: a camada fundindo na cor do mapa. Toca uma vez, no
   começo, e é por isso que ela precisa ficar de fora do relógio de FASE lá
   embaixo — carimbada com o tempo da fase 3 ela voltaria a 71% de opacidade no
   meio da descida. Uma linha em vez de um `Set` porque é UMA, e um `Set` de um
   item promete uma família que não existe. */
const CENA_DA_CAMADA='mvCenaEnche';
/* ==========================================================================
   🔴 A FILA DA CENA DE MONTAR — QUATRO FASES, UMA MARCA, DOIS DONOS (17/08,
   ordem do dono: *"FAÇA UM ROTEIRO, LEVE SEU TEMPO"*).

   A marca é `<html data-cena>` e os valores andam nesta ordem:
     escurece → ruas → descida → pronto   (ausente = não há cena nenhuma)

   POR QUE NA RAIZ: a camada é trocada a cada repinte do seam (1×/s dirigindo).
   Marca de fase em camada morre no meio da cena — foi o que matou a primeira
   versão disto. A classe `cena` continua na camada porque ela responde outra
   pergunta ("esta camada está em cena", o escopo dos seletores).

   🔴 A DIVISÃO DE TRABALHO, e ela é de UMA linha da ponte: `if (emCena())
   faseDaCena('escurece')` (§ `50-cena-ruas.js:204`). Ou seja:
     · A CASCA ABRE A PORTA — põe a classe `cena` na camada que entra. É esse o
       sinal de "há véu nesta tela, pode encenar".
     · A PONTE ESCREVE AS FASES — todas as quatro, porque só ela sabe quando o
       tile chegou, quando a última onda partiu (`mundoVoltou`) e quando o `easeTo`
       terminou. E ela também RECUSA: cena já no ar, mapa sem estilo, movimento
       desligado — nesses casos não sai marca nenhuma, e a lei da ponte é "ausência
       de marca = cromo normal". Por isso a casca NÃO escreve `escurece` quando
       existe ponte: forçar a marca seria vestir uma cena que o dono do assunto
       acabou de recusar, e a tela ficaria escura à espera de um mapa que ninguém
       vai desenhar.
     · A CASCA VESTE E FECHA — lê a marca (é dela que sai o relógio de fase do
       repinte) e tira a classe quando a fila acaba.

   SEM PONTE (o mock aberto no navegador) quem anda com a fila é o relógio daqui,
   com a tabela do contrato — é o que mantém o desenho demonstrável sem uma linha
   de código escrita só pra ele. Nesse caso não existe câmera, logo não existe fase
   `descida`: a fila é `escurece → ruas → pronto`.

   E COM PONTE SOBRA UM SOCORRO SÓ: `CENA_SOCORRO`, que não é o teto das fases (a
   ponte tem os dela, com números de tile e de onda que a casca não conhece) — é o
   prazo de SILÊNCIO. Se a ponte não disser NADA por 7 s, a casca tira a classe e
   devolve a tela honesta. Cromo preso invisível é pior que cena nenhuma.
   ========================================================================== */
const FILA=['escurece','ruas','descida','pronto'];
/* a tabela do contrato, usada só quando a casca é a guia (mock sem ponte):
   420 de véu + o que as ruas levam (1,06 s medido + folga) + os 420 do cromo. */
/* 🔴 `pronto` 420 → 1100 (17/08). A última fase deixou de ser um gesto só: o
   cromo entra em FILA (rodapé 0→380, topo 380→760, redondas 760→1040, § a regra
   de `[data-cena="pronto"]`), porque o dono cobrou *"dê um tempo de um transition
   acabar para entrar em outro"*. Este número é o que mantém a marca na raiz até o
   último gesto fechar — fechando aos 420 o topo e as redondas eram ARRANCADAS no
   meio (medido no g15: `plano-topo` em 0 e `gps-vel` em 0 no quadro do fecho, as
   duas pulando pro valor final). Os 60 ms de sobra são o padrão da casa. */
const CENA_TETO={escurece:420,ruas:1200,descida:1900,pronto:1100};
/* 🔴 7 s É PRAZO DE SILÊNCIO, NÃO DURAÇÃO DE CENA — e o número tem que ser MAIOR
   que o pior teto da ponte, senão o socorro da casca vira o caminho normal (a lei
   que o próprio `50-cena-ruas.js` escreve no `FASE_TETO`). O pior deles é o da
   fase `ruas`: 5,2 s. 7 s passa de folga por cima disso e ainda é menos da metade
   do tempo que o motorista levaria pra achar que o app morreu. */
const CENA_SOCORRO=7000;
let cenaTimer=null, cenaTeto=null, cenaFase='', cenaEm=0, cenaRota=FILA, cenaGuia='';
/* 🔴 ESCREVER A MARCA É APAGAR QUANDO ELA É VAZIA. `dataset.cena=''` deixa o
   atributo NO AR, e a regra que esconde o cromo pergunta por `[data-cena]` sem
   valor (§ folha, as três primeiras fases): a tela ficaria sem rodapé pra sempre.
   Toda escrita da marca passa por aqui pra esse buraco não ter duas chances. */
function cenaMarcar(f){
  if(f) document.documentElement.dataset.cena=f;
  else delete document.documentElement.dataset.cena;
}
/* 🔴 SÃO DUAS PERGUNTAS E ELAS NÃO SÃO A MESMA — o vão entre uma e outra é real e
   dura de `pintar` até o transplante do mapa:
   · `cenaNoAr()` — a CASCA abriu uma cena (pôs a classe e escolheu a guia). É
     verdade desde o primeiro quadro, ANTES de existir fase nenhuma. É esta que
     manda no repinte: sem ela, um fix do GPS caindo nesse vão não herdaria a
     classe `cena`, a classe é o sinal que a ponte espera pra anunciar, e a cena
     inteira morreria calada antes de começar.
   · `emCena()` — existe FASE na raiz. É a que manda no relógio de fase do
     carimbo: sem fase não há animação de fase pra continuar. */
const cenaNoAr=()=>!!cenaGuia;
const emCena=()=>!!cenaFase;
/* a sonda das provas e do dono no console: a fase, a idade dela e o roteiro desta
   cena. O atributo da raiz já é público e não mente; isto conta o que ele não sabe
   — HÁ QUANTO TEMPO a fase está no ar (o número que uma prova de ritmo mede) e se
   esta cena tem descida. */
window.__cena=()=>({fase:cenaFase, desde:cenaFase?Math.round(performance.now()-cenaEm):0,
  guia:cenaGuia, rota:cenaRota.slice(), teto:CENA_TETO});
/* Lei 7 — quem pediu menos movimento não recebe fila nenhuma. Sem isto a folha
   apagava as animações (o `@media` da Lei 7 é `!important`) mas o RELÓGIO
   continuava: o cromo ficaria escondido 3,5 s por causa de uma cena que ninguém
   ia ver, e a tela pareceria quebrada. Então a fila nasce direto em `pronto`. */
const semMovimento=()=>{
  try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; }
};
/** a fila anda PRA FRENTE e uma fase por vez — o relógio da casca escreve por aqui */
function cenaIr(fase){
  if(FILA.indexOf(fase)<0) return;
  if(cenaFase && FILA.indexOf(fase)<=FILA.indexOf(cenaFase)) return;
  cenaMarcar(fase);
  cenaVestir();
}
/* 🔴 QUEM É A PRÓXIMA FASE DEPENDE DE HAVER CÂMERA (lei 5 da fila: *"pouso no 2D
   não tem fase 3"*). Sem ponte não existe `easeTo` nenhum, então a guia da casca
   nunca passa por `descida` — 1,9 s de tela parada esperando um movimento que
   ninguém vai fazer é o contrário do que o dono pediu.
   A ORDEM continua sendo a da FILA inteira: se a ponte anunciar `descida`, isso é
   pra frente e vale (senão o monotônico leria como fila voltando). E se ela
   anunciar uma fase que o roteiro pulou, a conta segue de pé — `descida` acha o 3
   na FILA e a próxima é `pronto`. O `||'pronto'` é o fim de linha obrigatório:
   fila sem última fase é cromo preso invisível. */
function cenaProxima(f){
  let k=FILA.indexOf(f)+1;
  while(FILA[k] && cenaRota.indexOf(FILA[k])<0) k+=1;
  return FILA[k]||'pronto';
}
/* A cena ABRE aqui, e quem abre é sempre a casca (a classe `cena` é o sinal que a
   ponte espera, § `50-cena-ruas.js:204`). O que muda é a GUIA:
   · com ponte, ela anuncia as quatro fases e a casca só arma o prazo de silêncio —
     inclusive o caso em que a ponte RECUSA a cena: aí não vem marca nenhuma, o
     socorro tira a classe e a tela é a de sempre, que é a lei dela;
   · sem ponte, o relógio daqui é a guia, com a tabela do contrato e sem `descida`.
   Cena NOVA recomeça a fila: o monotônico vale DENTRO de uma cena, não entre duas. */
function cenaAbrir(){
  clearTimeout(cenaTimer); clearTimeout(cenaTeto);
  cenaFase='';
  cenaGuia = window.HBXCena ? 'ponte' : 'casca';
  cenaRota = cenaGuia==='ponte' ? FILA : FILA.filter(f=>f!=='descida');
  if(cenaGuia==='ponte'){ cenaMarcar(''); cenaSocorro(); return; }
  cenaMarcar(semMovimento()?'pronto':'escurece');
  cenaVestir();
}
/* o prazo de SILÊNCIO da ponte: passou e não veio fase nenhuma nova, a casca
   devolve a tela honesta (tira a classe, apaga a marca). Ele se rearma a cada
   anúncio, então o que ele mede é silêncio — nunca a duração da cena. */
function cenaSocorro(){
  clearTimeout(cenaTeto);
  cenaTeto=setTimeout(()=>{ if(cenaFase!=='pronto') fecharCena(); },CENA_SOCORRO);
}
/* 🔴 A CASCA LÊ A MARCA, NÃO ESPERA SER CHAMADA. A ponte escreve o atributo
   direto (é o contrato), e a casca precisa saber a HORA de cada virada — é dela
   que sai o relógio herdado do repinte (`cenaEm`, lá embaixo) e o teto da fase
   seguinte. Um observador de atributo resolve os dois caminhos com um código só:
   escrita da ponte e escrita do teto entram pela mesma porta.
   `cenaIr` chama isto na mão logo depois de escrever pra o acerto ser SÍNCRONO
   (o observador só chega na microtarefa, e um repinte no mesmo tique leria a fase
   velha); a segunda passada não faz nada, porque a primeira já igualou. */
function cenaVestir(){
  const f=document.documentElement.dataset.cena||'';
  if(f===cenaFase) return;
  const i=FILA.indexOf(f), j=FILA.indexOf(cenaFase);
  /* Duas escritas se recusam aqui, e a marca volta pro que vale (o relógio da fase
     atual segue de pé):
     · FASE QUE NÃO EXISTE (`i<0`) — erro de digitação na ponte não pode virar tela
       travada.
     · FILA VOLTANDO (`i<=j`) — reencenar fase é o pisca que a fila veio matar. E é
       o que impede o socorro da casca de brigar com um anúncio atrasado da ponte:
       empurrada até `pronto`, a `descida` que chegar depois não desfaz mais nada. */
  if(f && (i<0 || i<=j)){ cenaMarcar(cenaFase); return; }
  cenaFase=f; cenaEm=performance.now();
  clearTimeout(cenaTeto);
  if(!f){ fecharCena(); return; }
  // a última fase não empurra ninguém: ela ENCERRA a cena quando o cromo assenta.
  if(f==='pronto'){ clearTimeout(cenaTimer); cenaTimer=setTimeout(fecharCena,CENA_TETO.pronto); return; }
  // com ponte o relógio mede SILÊNCIO; sem ela, ele é a guia e empurra a fase.
  if(cenaGuia==='ponte'){ cenaSocorro(); return; }
  cenaTeto=setTimeout(()=>cenaIr(cenaProxima(f)),CENA_TETO[f]);
}
try{
  new MutationObserver(cenaVestir)
    .observe(document.documentElement,{attributes:true,attributeFilter:['data-cena']});
}catch(_){}
/* 🔴 FECHAR É APAGAR A MARCA (§ `cenaMarcar`), NÃO ESVAZIAR. E `cenaFase` cai
   ANTES do atributo pra o observador ver "nada mudou" e não voltar aqui — fechar é
   idempotente por construção, não por sorte. */
function fecharCena(){
  clearTimeout(cenaTimer); clearTimeout(cenaTeto);
  cenaFase=''; cenaGuia='';
  cenaMarcar('');
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
  /* 🔴 NA CENA, QUEM DIZ SE A ENTRADA ESTÁ VIVA É A FILA — não um relógio à parte
     (17/08). Aqui havia UM número (`CENA_CHEIA`) fazendo o papel de "quanto tempo
     a cena dura", e ele era um palpite: a fila real acaba quando o mapa avisa, e
     isso é 3,7 s num aparelho bom e mais num ruim. Palpite curto = a herança
     morre no meio da cena e a camada nova nasce sem papel (o pisca de 08/08);
     palpite longo = o relógio herdado carimba animação que já acabou.
     `cenaNoAr()` é a verdade: enquanto a cena que a casca abriu não fechou, existe
     cena pra continuar. O teto continua existindo, só que ele agora é o da FILA —
     um dono, não dois. E é `cenaNoAr()` e não `emCena()` de propósito: no vão
     entre abrir a cena e a ponte anunciar a 1ª fase não há fase nenhuma, e perder
     a herança ali é perder a classe que a ponte espera pra anunciar. */
  const entradaViva = antiga
    && (antiga.classList.contains('cena')
      ? cenaNoAr()
      : (performance.now()-entradaEm) < ENTRADA_COMUM);
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
  // `:not(.fechando)` — portão que já está SAINDO fica pra trás e morre com a
  // camada; carregá-lo reencenava a saída e ele voltava inteiro (ver `fechar`).
  const portaoVivo = (!animar && antiga) ? antiga.querySelector('.portao-wrap:not(.fechando)') : null;
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
    antiga.classList.remove('entra','cheio','voltando','cena','so-cromo','modo-troca','troca-sobe','troca-desce');
    nova.classList.add('entra');
    antiga.classList.add('sai');
    /* 🔴 A TROCA 2D⇄3D SAIU DAQUI COM O MAPA (o `trocaDeModo`, as marcas
       `modo-troca`/`troca-sobe`/`troca-desce` e o `so-cromo`). Ela existia
       porque as duas telas de mapa dividiam UM palco de maplibre e a camada que
       saía ficava com o palco vazio, pintando o chão escuro por cima do mapa
       vivo. Vendas não tem mapa, não tem palco compartilhado e não tem as duas
       telas: coreografia sem as peças que ela coordena é código que só sobrevive
       pra confundir quem lê. A tela cheia continua de pé como PERGUNTA
       (`noCheio`), e hoje a resposta é sempre não. */
    // TELA CHEIA: vale saindo de QUALQUER tela, e o gesto inverte na volta.
    const entrandoNoCheio=noCheio(atual);
    const saindoDoCheio=noCheio(anterior);
    let espera=DUR[tr]+40;
    if(entrandoNoCheio || saindoDoCheio){
      nova.classList.add('cheio'); antiga.classList.add('cheio');
      if(saindoDoCheio && !entrandoNoCheio){ nova.classList.add('voltando'); antiga.classList.add('voltando'); }
      espera=580;
    }
    /* A CENA só existe ENTRANDO na tela cheia. Aqui ela ABRE a fila (§ `cenaAbrir`)
       e quem a fecha é a última fase, nunca este ponto — o relógio de cada fase
       mora na fila, que é a única que sabe em qual delas a cena está.
       🔴 580 → 460 NA CENA (17/08). A camada que sai não tem mais show nenhum
       durante a fila (`:root[data-cena] .tela.sai.cheio{animation:none}`): ela só
       espera a cor cobri-la, e a cor fecha aos 420 ms (`--cena-escurece`). Segurar
       a montagem com 52 linhas viva por mais 120 ms atrás de uma cortina opaca era
       trabalho de quadro pago à toa no g15 — e ainda atrasava a cena das ruas, que
       na ponte só começa quando NÃO existe `.tela.sai` (§ `50-cena-ruas.js:119`).
       Os 40 ms de sobra são o padrão da casa. */
    if(entrandoNoCheio){
      nova.classList.add('cena');
      cenaAbrir();
      espera=460;
    }
    app.appendChild(nova);
    // ABERTURA: mede o percurso do logo DEPOIS de a camada nova estar no ar —
    // antes disso o cabeçalho ainda não tem posição, e a conta sai errada.
    if(anterior==='entrada'){
      nova.classList.add('abertura'); antiga.classList.add('abertura');
      const alvo=nova.querySelector('.logo'), origem=antiga.querySelector('.splash-logo');
      if(alvo&&origem){
        // Quem tem que encaixar é a LINHA "HBX" (.w), não a caixa em volta: a
        // caixa da abertura carrega o "VENDAS" embaixo e o recorte do
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
    // DEPOIS de o portão voltar, nunca antes: campo
    // de portão (o "Nome" do Espaço) mora DENTRO do `.portao-wrap`, e
    // enquanto ele não é re-encaixado o campo não existe na camada nova pra
    // ser reencontrado.
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
    // continuar, e carimbar vira só estrago.
    /* 🔴 NA CENA O RELÓGIO É DA FASE, NÃO DA CAMADA (17/08) — e sem isto a fila
       não sobreviveria ao primeiro repinte. As animações da cena não partem mais
       junto com a camada: elas partem quando a FASE começa (`escurece` no instante
       da entrada, mas `ruas` só quando o tile chega e `pronto` segundos depois).
       Carimbar nelas o tempo de vida da CAMADA jogaria cada uma direto pro fim —
       é o mesmo defeito de 07/08 ("as 17 animações nasciam TERMINADAS"), só que
       por outro caminho: dirigindo, o seam repinta 1×/s, então um fix do GPS
       caindo dentro da cena entregaria o cromo já pousado.
       `cenaEm` é o começo da fase que está no ar (§ `cenaVestir`); a ÚNICA
       animação da camada em cena que não é da fase é a entrada dela mesma
       (`mvCenaEnche`, que toca uma vez, no começo) — essa continua no relógio da
       camada, senão ela reencena a 71% de opacidade no meio da fase seguinte.
       🔴 E NA CENA O TETO NÃO É NÚMERO: é a fila estar no ar (§ a lápide do
       `CENA_CHEIA`). Carimbar fase VELHA não estraga nada — todo `@keyframes`
       desta folha declara só o `from`, então relógio grande num gesto curto para
       exatamente no estado que a fase quer. Número curto, sim, estraga: ele faz o
       repinte recomeçar a fase do zero, e recomeçar é o pisca. */
    const t=performance.now()-entradaEm;
    const naCena=nova.classList.contains('cena') && emCena();
    const tf=performance.now()-cenaEm;
    const dentro=nova.classList.contains('cena') ? cenaNoAr() : t<ENTRADA_COMUM;
    if(nova.getAnimations && dentro){
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
        try{ a.currentTime=(naCena && n!==CENA_DA_CAMADA)?tf:t; }catch(_){}
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
  /* 🔴 SAIR DE CENA NO MEIO ENCERRA A FILA — e o teste é o DOM, não a intenção.
     A marca da fase mora na RAIZ e sobrevive à troca de camada: sem esta linha,
     quem cancela (ou toca Panorâmica) durante a cena deixava a fase pendurada no
     `<html>` com o relógio ainda empurrando fases de uma cena que já saiu da tela.
     Marca sem cena é exatamente o "cromo preso invisível" que a lei 4 da fila
     proíbe. Fica DEPOIS dos três ramos porque os três podem matar a camada em
     cena: a troca de tela (que remove a marca `cena` da que sai), o repinte que
     não herda (`innerHTML=''`) e o herdeiro que não recebeu a marca. Perguntar ao
     documento cobre os três com uma linha — enumerar os casos cobriria dois. */
  if(cenaNoAr() && !document.querySelector('#app .tela.cena')) fecharCena();
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
    if(dt>=ABERTURA_TETO || (dt>=ABERTURA_PISO && aberturaOk)){ aberturaSaiu=true; ir('vendas'); return; }
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
   murada, sem arrastar e sem aba pra voltar. Devolve pro funil, que nunca
   fecha. Quem chama é a ponte, logo depois de escrever a config na barra. */
function resgatarModuloDesligado(){
  const camadas=document.querySelectorAll('#app .tela');
  const viva=camadas.length?camadas[camadas.length-1]:null;
  const barra=viva?viva.querySelector('.nav'):null;
  if(barra && !barra.querySelector('button.on')) ir('vendas');
}

/* ==========================================================================
   AVISOS — o cartão não "aparece", ele CHEGA. Um por vez: aviso empilhado é
   ruído, e quem está dirigindo lê UM.
   ========================================================================== */
const AVISOS={
  recado:{ico:'chat', cls:'', titulo:'Empresa 3 respondeu', sub:'Toque pra abrir a conversa'},
  /* 🔴 O "1 crédito debitado" SAIU DAQUI TAMBÉM (19/08), e não é preciosismo.
     Hoje ninguém alcança este cartão no aparelho — quem dispara é a barra
     `#avdisparo`, que mora no `.doc-top` e o injetor arranca —, mas `avisar` é
     função de topo do `mock.js`, logo é `window.avisar`: no dia em que a ponte
     resolver anunciar o lead puxado, ela chama por CHAVE (é o caminho mais
     curto) e o recibo passa a jurar "1 crédito" sem nunca ter perguntado quanto
     foi. O `send-to-vendas` não devolve o debitado — é o mesmo buraco que tirou
     o preço do botão "Puxar". Recibo é a peça em que número inventado dói mais:
     ele tem cara de extrato. Sobra o fato que o toast existe pra dar — o lead
     chegou. Quando a porta devolver o valor, quem o escreve é a ponte, passando
     um objeto (como o `portao` já faz), não este catálogo de demonstração. */
  ok:{ico:'check', cls:'ok', titulo:'Lead na carteira', sub:'Empresa 4 · já está no seu funil'},
  falta:{ico:'alert', cls:'alerta', titulo:'Carteira cheia', sub:'O Radar parou de mandar empresa nova'},
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
  if(!wrap||wrap.__saindo) return;   // 2º toque no "Sim" não reinicia a saída
  wrap.__saindo=true;
  /* 🔴 QUEM ESTÁ SAINDO NÃO ATRAVESSA REPINTE (17/08 — MEDIDO no g15, APK 342,
     gravação do cancelamento com o conserto já dentro).
     O portão atravessa o repinte de propósito (§ `portaoVivo` no `pintar`) —
     essa é a cura de 09/08 pro diálogo que morria calado. Mas ela não separava
     um portão VIVO de um portão que já está indo embora: no cancelamento, o
     `fechar` marca a saída e agenda a retirada pra 210 ms, e o repinte que cai
     nesse vão MOVE o nó pra camada nova. Mover é re-inserir, e re-inserir
     REENCENA todo `@keyframes` do nó: a saída recomeçava do zero, ou seja, o
     diálogo VOLTAVA a opacidade 1 depois de já ter sumido.
     Medido: o "Tem certeza que deseja cancelar?" reaparecendo inteiro aos
     10,28 s — 870 ms DEPOIS do "Sim" —, por cima do rodapé que já dizia
     "Cancelando…", e sumindo de novo aos 10,54 s. Um fantasma de 250 ms no meio
     da transição, que é exatamente o "sem sequência" que este lote existe pra
     matar.
     A marca é no WRAP (o `.saindo` do `fechar` vai na CAIXA) porque quem o
     `pintar` procura é o wrap. Vale pras cinco superfícies do `fechar` de uma
     vez — portão, erro, confirmação, "você chegou" e o pop-up do chat. */
  wrap.classList.add('fechando');
  const peca=wrap.firstElementChild;
  if(peca) peca.classList.add('saindo');
  // 🔴 `mvScrimSai`, NUNCA `mvScrim reverse` — ver a nota do keyframe: nome
  // reaproveitado não cria animação nova e o véu sumia num quadro só.
  wrap.style.animation='mvScrimSai 200ms ease-in both';
  setTimeout(()=>wrap.remove(),210);
}
function erro(){
  const camada=document.querySelector('#app .tela'); if(!camada) return;
  camada.querySelector('.erro-wrap')?.remove();
  const w=document.createElement('div');
  w.className='erro-wrap';
  w.innerHTML=`<div class="erro">
    <span class="ico">${ic('alert',22)}</span>
    <strong>Não deu pra mandar a mensagem</strong>
    <span class="sub">Sem internet agora. O que você escreveu fica guardado.</span>
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
  /* 🔴 O PORTÃO QUE FALTAVA NO DIA 18/08. Um cliente pareou o app e levou 39
     respostas 403 MODULE_ACCESS_DENIED em 65 segundos porque o módulo estava
     desligado desde o cadastro — e o 403 era MUDO na tela: ele tocava, tocava,
     e concluía que o aplicativo estava quebrado. Recusa sem frase é o defeito;
     a frase é a cura, e ela diz COM QUEM falar, porque não é o aparelho. */
  modulo:{tom:'trava',ico:'lock',titulo:'Este módulo está desligado',
    sub:'A sua empresa não liberou esta parte do app. Quem liga é o administrador, no computador — não é falha do aparelho.',
    acoes:[['Ver o que está liberado','principal']]},

  semzap:{tom:'alerta',ico:'chat',titulo:'WhatsApp da empresa fora do ar',
    sub:'Sem o número conectado nenhuma mensagem sai — o que você escrever fica esperando. Você ainda pode falar pelo seu próprio WhatsApp.',
    acoes:[['Entendi',''],['Ver o estado','principal']]},

  ddd:{tom:'alerta',ico:'chat',titulo:'Falta o DDD',
    sub:'O número desta empresa está sem DDD. Sem ele o WhatsApp não abre.',
    corpo:`<div class="pt-campo"><input value="19"><span class="resto">90000-0001</span></div>`,
    acoes:[['Deixar assim',''],['Salvar','principal']]},

  /* 🔴 O PREÇO SOBREVIVEU AQUI, E ESTE ERA O ÚLTIMO ESCONDERIJO (19/08). Este
     `corpo` trazia três números cravados — "0 créditos · 1 por empresa · 14 na
     carteira" — e o do meio era exatamente o preço por card que saiu do botão
     "Puxar" na mesma semana, pelo motivo que continua valendo: NENHUMA porta
     que este app alcança informa o custo por card (`send-to-vendas` não devolve
     o debitado; o catálogo de preço é do /master). Só que o catálogo não é uma
     folha de rascunho: a tela `T.portoes` é alcançável de verdade
     (Ajustes › Aprender › "Portões e bloqueios"), e o "ver" abre ESTE diálogo,
     pixel a pixel igual ao portão que o servidor levanta pra valer. Quem lê "0
     créditos · 14 na carteira" numa caixa vermelha chamada "Créditos acabaram"
     não tem como saber que é exemplo — lê como o próprio saldo, e sai
     recarregando (ou parando de puxar) por causa de um número que ninguém mediu.
     Ilustração que veste a roupa do dado real não é ilustração, é mentira.

     O portão de VERDADE já sabe fazer isto certo: `travaDeCreditoDoRadar`
     (ponte, 30-radar.js) monta o `corpo` na hora e SÓ quando conhece o saldo —
     sem fonte, `corpo:''`. Então o catálogo passa a mostrar a mesma cara que a
     pessoa vê quando o número não veio: título, motivo e a saída. O que ela
     precisa aprender aqui é RECONHECER a trava, e isso o título e o tom já
     ensinam; o número nunca foi a lição.

     🔴 E o "Recarregar" saiu junto. Ele era o único botão deste catálogo que
     prometia um verbo de DINHEIRO, e neste app ele não existe: quem compra
     crédito é o responsável da empresa, no computador (é o que o portão
     `valores` e a face neutra de `T.creditos` já dizem). Botão que promete
     compra e não tem porta é o mesmo defeito do preço inventado, com outra
     roupa. A régua deste catálogo é COPIAR o portão que a ponte levanta, não
     desenhar um mais bonito: lá são `acoes: [['Fechar','']]`, e aqui também. */
  creditos:{tom:'trava',ico:'card',titulo:'Créditos acabaram',
    sub:'Sem crédito o Radar não manda empresa nova. Buscar e contar continuam de graça.',
    acoes:[['Fechar','']]},

  // Portão só informativo: o único botão É a saída, mesmo com cara de ação.
  // Por isso o escape vem MARCADO, não deduzido da cor — cor é aparência.
  valores:{tom:'info',ico:'lock',titulo:'Valores bloqueados',
    sub:'Quem vê preço e compra crédito é o responsável da empresa, no computador. Aqui o funil aparece em quantidade.',
    acoes:[['Entendi','principal',true]]},

  update:{tom:'info',ico:'download',titulo:'Versão nova disponível',
    sub:'beta1.0.1 · 2,3 MB. Corrige o aviso de resposta e a busca por cidade.',
    acoes:[['Agora não',''],['Atualizar','azul']]},

  updateObrig:{tom:'trava',ico:'download',titulo:'Atualização obrigatória',
    sub:'Esta versão não fala mais com o servidor. Atualize pra continuar.',
    acoes:[['Atualizar agora','principal']],semFechar:1},
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
  /* Cada tela ensina o que ELA tem. Alvo que aponta pra peça de outra tela é
     aula viva apontando pro vazio — o filtro do `abrirAula` come o passo e
     escreve um aviso no console que ninguém lê. */
  vendas:[
    ['.kpis','Seu placar','Quantas empresas você chamou, quantas responderam e quanto virou venda.'],
    ['.chips','Onde cada empresa está','Atrasados, hoje, agendados e fechados. Comece pelos atrasados.'],
    ['.cli','Cada cartão é uma empresa','Toque pra abrir a ficha dela. O balão verde vai direto pra conversa.'],
    ['.sum','Quanto ainda cabe','Carteira cheia é o Radar parando de mandar empresa nova.'],
  ],
  radar:[
    ['.campos','Diga quem você quer','O que ela vende, a cidade e a UF. Uma frase, não um formulário.'],
    ['[data-acao="radar-contar"]','Conte antes de gastar','Contar é grátis e diz quantas existem.'],
    /* 🔴 "e o preço está escrito no botão" virou MENTIRA em 19/08 e saiu. O
       botão "Puxar" só carrega o preço quando o servidor informa um (`custo`);
       sem fonte ele diz só o verbo. Aula que aponta pra um número que pode não
       estar ali é a lâmpada ensinando a procurar o que não existe — e a aula é
       o fiscal do desenho, não o remendo dele. */
    ['.tmx-dock','Buscar não cobra','Buscar e contar não gastam nada. Só o Puxar gasta crédito.'],
  ],
  /* A ficha ensina os CANAIS, que é o que ela trouxe de novo: cada um sai do
     app e cai no aplicativo do aparelho (WhatsApp, discador, e-mail, mapa). */
  leadficha:[
    ['.acoes-rapidas','Fale por onde quiser','WhatsApp, ligação e e-mail abrem no aplicativo do seu celular.'],
    ['.linha-toque','Cada contato é um botão','Toque no número pra chamar no WhatsApp; do lado, ligar e copiar.'],
  ],
  agenda:[
    ['.chips','Atrasado, hoje, semana','Três listas, uma resposta: o que fazer agora.'],
    ['.rowcard','Cada linha é um compromisso','Toque no cartão pra abrir a empresa.'],
    ['.mini','Fechar a tarefa','Atendeu, não atendeu ou remarcar. Dois toques e acabou.'],
  ],
  conversas:[
    ['.modos','Por onde a mensagem sai','"Empresa" usa o WhatsApp da sua empresa. Apagado quer dizer que por ali não dá.'],
    /* `opcional` porque a peça é do ESTADO: o campo de escrever só existe do
       lado "Empresa" e com o fio na mão. Sem a marca o console gritaria toda vez
       que a pílula estivesse no celular — guarda que grita à toa é guarda que se
       aprende a ignorar. */
    {alvo:'.escrever,[data-acao="abrir-whats-pessoal"]',titulo:'Falar agora',
     texto:'Uma mensagem, escrita por você, pra uma empresa.',opcional:1},
  ],
  empresas:[
    ['.search','Achar na carteira','Nome, cidade ou CNPJ.'],
    ['.cli','A ficha da empresa','Toque pra ver quem é, onde é e por onde falar.'],
  ],
  ajustes:[
    ['.cartao-lista','Seus ajustes','Perfil, créditos, WhatsApp da empresa e o que está liberado.'],
    ['.nav','Os seus módulos','Vendas é onde o dia acontece; o resto entra e sai conforme a empresa liberar.'],
  ],
  creditos:[
    ['.saldo','Quanto você tem','Seu saldo, e o aviso quando algum crédito está perto de vencer.'],
    ['.pacotes','Escolha o pacote','O preço por crédito diz qual sai mais barato.'],
    ['.tmx-dock','Recarregar','O botão do pé mostra o pacote escolhido e o valor. O pagamento é no cartão.'],
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
  /* Os três do OBRIGATÓRIO. Nenhum `fazer` mira dinheiro (o Puxar debita
     crédito) nem dado de verdade (mandar mensagem fala com gente): tutorial que
     gasta ou dispara é tutorial que o cliente paga pra ver. */
  funil:{titulo:'O funil do dia',ico:'sales',tela:'vendas',passos:[
    {alvo:'.chips',titulo:'Onde cada empresa está',
     texto:'Atrasados, hoje, agendados e fechados. Comece pelos atrasados.'},
    {alvo:'.cli',titulo:'Cada cartão é uma empresa',
     texto:'Toque pra abrir a ficha, ver o telefone e o que já foi tentado.'},
    {alvo:'.sum',titulo:'O tamanho da carteira',
     texto:'Quando ela enche, o Radar para de mandar empresa nova.'},
  ]},
  /* 🔴 PASSO `fazer` APONTA PRO BOTÃO, NUNCA PRA BARRA QUE O CONTÉM. Com a
     barra inteira como alvo o dedo não sabe ONDE tocar, e tocar o botão ERRADO
     satisfaz o passo — o tour segue pro seguinte, que espera outra tela, acha o
     alvo no vazio e o capítulo inteiro cai. */
  radar:{titulo:'Trazer empresa nova',ico:'target',passos:[
    {tela:'vendas',alvo:'[data-nav="radar"]',tipo:'fazer',
     titulo:'O Radar',texto:'É ele que enche a sua carteira. Toque em Radar.'},
    {tela:'radar',alvo:'.campos',
     titulo:'Diga quem você quer',texto:'O que ela vende, a cidade e a UF.'},
    {tela:'radar',alvo:'[data-acao="radar-contar"]',
     titulo:'Contar é grátis',texto:'Veja quantas existem antes de gastar qualquer coisa.'},
    /* 🔴 ESTE PASSO ANUNCIAVA O PREÇO, E ELE ESTÁ NO TUTORIAL OBRIGATÓRIO
       (19/08) — ou seja, era o número de dinheiro MAIS LIDO do app inteiro:
       todo vendedor novo passa por aqui antes de trabalhar. Dizia "1 crédito por
       empresa, e o preço fica escrito no próprio botão", e as duas metades
       morreram no mesmo dia: o custo por card não vem de porta nenhuma que este
       app alcance (então "1" era chute), e o botão "Puxar" só escreve o preço
       quando o servidor manda um — sem fonte ele diz só o verbo. Tutorial que
       ensina preço errado é pior que tutorial que não fala de preço: a pessoa
       decide gastar (ou não) por ele, e depois a fatura discorda dela.
       O que sobra é o que é VERDADE sempre e é a dúvida que trava o vendedor:
       qual dos toques é o que cobra. */
    {tela:'radar',alvo:'',
     titulo:'Só o Puxar cobra',texto:'Buscar e contar são de graça. O crédito sai no toque do Puxar, e ele traz o contato pra sua carteira.'},
  ]},
  conversa:{titulo:'Falar pelo WhatsApp',ico:'chat',tela:'conversas',passos:[
    {alvo:'.modos',titulo:'Dois jeitos de falar',
     texto:'"Empresa" sai pelo WhatsApp da sua empresa; "Meu WhatsApp" abre no seu aparelho.'},
    {alvo:'.escrever,[data-acao="abrir-whats-pessoal"]',titulo:'Uma de cada vez',
     texto:'Uma mensagem, escrita por você, pra uma empresa. Aqui não existe disparo em lote.'},
  ]},
  /* Os do AVANÇADO que REAPROVEITAM a aula da tela — `aula` em vez de `passos`.
     Copy nova não se inventa: a que está lá já foi lida e aprovada. */
  agenda:{titulo:'A agenda do dia',ico:'calendar',aula:'agenda',tela:'agenda'},
  empresas:{titulo:'A carteira de empresas',ico:'store',aula:'empresas',tela:'empresas'},
  creditos:{titulo:'Créditos e recarga',ico:'card',aula:'creditos',tela:'creditos',se:d=>!!d.admin},
};
/** A fila do obrigatório, na ordem em que o vendedor precisa aprender. */
const OBRIGATORIO=['funil','radar','conversa'];
/** A ordem do catálogo de Ajustes › "Aprenda a usar". */
const CATALOGO=['funil','radar','conversa','agenda','empresas','creditos'];

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
/* 🔴 NENHUM PASSO PEDE O DEDO NUMA TELA QUE COBRA. No app do motorista a
   régua era a rota viva (os botões moviam entrega e dinheiro de verdade);
   aqui o único toque que vira dinheiro é o Puxar do Radar, e ele nunca é
   alvo de `fazer` — mas a régua fica escrita mesmo assim, porque lição que
   cobra o preço do erro de quem está aprendendo é a mesma doença com outro
   nome. Tela de dinheiro só se MOSTRA. */
const tourSoMostrar=()=>atual==='radar';

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
  alvoEl:null,esperandoDedo:false,volta:null,dicaTimer:null,remedir:[],
  /* Quantas vezes ESTE passo já pediu paciência (tela carregando, alvo fora da
     dobra). Mora aqui, no estado que sobrevive ao repinte, e não numa variável
     do `tourRepintar` — que nasce de novo a cada quadro e nunca contaria nada. */
  tentativa:0,tentativaDe:-1};
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
/** O passo saiu do ar (alvo sumiu, tela murada): TIRA ele do roteiro e segue.
 *  🔴 ANTES ELE SÓ ANDAVA O ÍNDICE — e o contador virava mentira (dono, 17/08).
 *  Medido no g15: o capítulo "Montar e iniciar a rota" abre em "1 de 5", os dois
 *  passos do meio caem (dia sem chip, lista ainda vazia) e a tela seguinte diz
 *  "4 de 5" — a barra de progresso pula 20%→80% num toque. Pior no "Recados da
 *  Central": sem recado pendente o capítulo ABRE direto em "2 de 2", começando
 *  pelo fim. O total é a promessa que a barra faz; passo que não vai ser mostrado
 *  não entra na promessa. Sai da lista e a conta volta a ser honesta. */
function tourPular(motivo,p){
  console.warn('[HBX 2.0] tutor —',motivo,':',(p&&p.alvo)||'(sem alvo)','· capítulo',TOUR.id);
  if(TOUR.i<TOUR.passos.length) TOUR.passos.splice(TOUR.i,1); else TOUR.i++;
  TOUR.tentativa=0; TOUR.tentativaDe=-1;
  tourRepintar();
}
/* 🔴 ALVO ABAIXO DA DOBRA É ALVO QUE EXISTE — só está fora do olho. `alvoNaTela`
   trata "não encosta na camada" como ausente, e isso é certo pro prédio que a
   CÂMERA do mapa levou embora (não há rolagem que traga de volta). Mas numa tela
   ROLÁVEL a peça está a um scroll de distância: o passo do "Confirmar" da folha e
   o do extrato dos créditos moram no pé da rolagem e sumiam calados do roteiro.
   Quem sabe distinguir os dois casos não é o seletor — é tentar rolar e MEDIR se
   algo andou. Andou: remede. Não andou: é o prédio, e aí o passo cai como antes. */
function tourRolarAte(el){
  const pais=[]; let n=el.parentElement;
  while(n&&n!==document.body){
    const ov=getComputedStyle(n).overflowY;
    if((ov==='auto'||ov==='scroll')&&n.scrollHeight>n.clientHeight+4) pais.push(n);
    n=n.parentElement;
  }
  if(!pais.length) return false;
  const antes=pais.map(p=>p.scrollTop);
  try{ el.scrollIntoView({block:'center',inline:'nearest'}); }catch(_){ return false; }
  return pais.some((p,i)=>Math.abs(p.scrollTop-antes[i])>1);
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
  if(atual!=='vendas') ir('vendas');
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
  // Contador de paciência é POR PASSO: mudou o passo, zera.
  if(TOUR.tentativaDe!==TOUR.i){ TOUR.tentativaDe=TOUR.i; TOUR.tentativa=0; }
  const alvo=acharAlvo(camada,p.alvo);
  /* 🔴 "AINDA NÃO CHEGOU" NÃO É "NÃO EXISTE" (dono, 17/08 — "travado, bugado").
     A jornada navega e o `pintar()` remonta o tour NO MESMO QUADRO da troca de
     tela — antes de o seam trazer o dado. Medido no g15: o capítulo "Onde moram
     os clientes" morria no passo 3 porque `.cli` ainda não existia quando o tour
     mediu, e a lista aparecia ~400 ms depois, com a lição já encerrada. Mesma
     morte em `.recado` (Chat) e `.stop` (Montagem). É a lei da casa outra vez —
     vazio porque o servidor disse vazio ≠ vazio porque não chegou —, e o preço
     da pressa aqui é a lição inteira. Duas esperas curtas antes de desistir; o
     passo que realmente não existe cai igual, só que ~1 s depois. */
  if(p.alvo&&!alvo){
    if(TOUR.tentativa<2){
      TOUR.tentativa++;
      TOUR.remedir.push(setTimeout(tourRepintar,TOUR.tentativa===1?320:820));
      return;
    }
    return tourPular('sumiu da tela',p);
  }
  // Fora do olho, mas rolável: traz pra tela e remede (ver `tourRolarAte`).
  if(alvo&&!alvoNaTela(camada,alvo)&&TOUR.tentativa<3&&tourRolarAte(alvo)){
    TOUR.tentativa=3;
    TOUR.remedir.push(setTimeout(tourRepintar,300));
    return;
  }
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
    /* 🔴 O FURO NÃO PODE VAZAR A CAMADA (dono, 17/08 — "essa feiura"). O respiro
       de 6px em volta do alvo é cego: peça que já encosta nas bordas (o dock do
       pé, a fileira de ações — 410px de largura numa camada de 432) empurrava o
       anel para `left:-6` e `right:438`, e o que aparecia na tela era um
       retângulo de lima com os DOIS lados cortados. Lê como quadro quebrado,
       não como destaque. O anel é a fronteira do holofote, e fronteira aberta
       não fecha nada. MEDIDO nos passos "Salvar ou começar" e "Recarregar". */
    const M=3;
    let t=topo-6, l=esq-6, lg=larg+12, at=alt+12;
    if(l<M){ lg+=l-M; l=M; }
    if(t<M){ at+=t-M; t=M; }
    lg=Math.max(12,Math.min(lg,c.width-l-M));
    at=Math.max(12,Math.min(at,c.height-t-M));
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
    /* 16px, não 14: o anel agora tem 2px de borda e o balão vinha encostar a
       7px dele — dois retângulos de lima quase colados leem como uma peça só. */
    const cabeAbaixo=t+at+16+cxAlt<c.height;
    cx.style.top=preso(cabeAbaixo?t+at+16:t-16-cxAlt)+'px';
    cx.style.bottom='auto';
  }

  const ultimo=TOUR.i===TOUR.passos.length-1;
  const pct=Math.round(((TOUR.i+1)/TOUR.passos.length)*100);
  if(!TOUR.obrig) cx.classList.add('com-x');
  cx.innerHTML=`<span class="aula-prog"><i style="width:${pct}%"></i></span>
    ${TOUR.obrig?'':`<button class="fechar" data-aula-sair="1" data-escape="1" aria-label="Fechar">${ic('close',15)}</button>`}
    <b>${p.titulo}</b><span class="txt">${p.texto}</span>
    <div class="pe"><span class="conta">${TOUR.i+1} de ${TOUR.passos.length}</span>
      <span style="display:flex;gap:8px;align-items:center">
        ${tipo==='fazer'
          ? '<span class="dedo"><i></i>Toque no destaque</span>'
          : `<button class="principal" data-aula-prox="1"${ultimo?' data-escape="1"':''}>${ultimo?'Entendi':'Próximo'}</button>`}
      </span></div>`;
  medir();
  /* 🔴 A TELA AINDA ESTÁ ENTRANDO QUANDO O TOUR MEDE. A camada nasce com a
     cascata de entrada (`--i` por peça), então a régua tirada no primeiro
     quadro pega o alvo NO MEIO do próprio deslize. Duas remedidas cobrem a
     entrada comum (~740 ms) e o furo transiciona sozinho até o lugar — quem
     olha vê o destaque assentar, nunca pular. */
  TOUR.remedir.push(setTimeout(medir,140),setTimeout(medir,520));
  /* 2,2 s parado no `fazer` e o anel pulsa. Dica, não bronca — e 4 s era tempo
     demais pra quem já está lendo "Toque no destaque" no rodapé: a frase chega
     primeiro, o anel só confirma onde. */
  if(tipo==='fazer') TOUR.dicaTimer=setTimeout(()=>furo.classList.add('dica'),2200);

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
    <strong>Encerrar este lead?</strong>
    <span class="sub">Empresa 6 · sai do funil e some da carteira</span>
    <span class="acoes"><button data-fechar="1">Não</button>
      <button class="principal" data-fechar="1">Encerrar</button></span>
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
  const av=e.target.closest('#aventrada [data-av]');
  if(av){
    document.documentElement.dataset.av=av.dataset.av;
    document.querySelectorAll('#aventrada button').forEach(b=>b.classList.toggle('on',b===av));
    avisar('recado');
    return;
  }
  const disp=e.target.closest('#avdisparo [data-avisar]');
  if(disp){ avisar(disp.dataset.avisar); return; }
  const SUPERFICIES={erro,confirmar};
  const sup=e.target.closest('[data-superficie]');
  if(sup){ (SUPERFICIES[sup.dataset.superficie]||erro)(); return; }
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
