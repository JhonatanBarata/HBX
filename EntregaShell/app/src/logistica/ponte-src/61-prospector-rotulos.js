  /* ------------------------------------------------------------------------
     7b-ter. A BRIGA POR ESPAÇO DOS RÓTULOS DO PROSPECTOR.

     Saiu de `60-prospector-nav.js` em 12/08, quando aquele arquivo passou do
     teto de 1000 linhas (ordem do dono, 10/08). O corte é numa fronteira limpa:
     tudo aqui é GEOMETRIA DE CHIP (medir, ordenar por prioridade, empurrar da
     borda, calar quem sobrepõe) e nada aqui sabe de mapa, de régua de viagem ou
     de fase. Quem chama é o `posicionarEmpresas`, no arquivo vizinho.

     A ordem dos arquivos costurados não importa pra isto funcionar: declaração
     de função IÇA no escopo da costura, e as constantes abaixo só são LIDAS
     quando alguém chama (muito depois de todos os arquivos terem sido avaliados).
     ------------------------------------------------------------------------ */

  /* ------------------------------------------------------------------------
     🔴 O RÓTULO NÃO PODE SUBIR EM CIMA DO VIZINHO (08/08, medido no print).

     O desenho do V4 tinha TRÊS empresas espalhadas na tela (30%, 61%, 78%). A
     rua real não é assim: as 8 empresas que o corredor achou em produção estão
     a 74 m umas das outras, e a 16,6 de zoom (`NAV_ZOOM`) 74 m são ~50 px.
     Chip de nome tem ~250 px. MEDIDO no primeiro print com dado de verdade: 4
     nomes empilhados, um por cima do outro, ILEGÍVEIS — e ilegível na tela de
     quem está dirigindo é pior que ausente, porque ainda ocupa o lugar.

     As duas alavancas já existiam na folha e ninguém escrevia nelas:
       · `--rx` — o empurrão que segura o chip dentro da tela na borda (o fio
         guia leva o empurrão INVERTIDO e continua apontando pro prédio);
       · `.mudo` — apaga SÓ o rótulo, o prédio fica aceso e clicável.
     Então isto é geometria de câmera, como o resto desta seção: nada de CSS
     novo, nada de tocar no desenho.

     A ORDEM DE PRIORIDADE é a mesma régua do servidor, mais o dedo na frente:
       1. quem o motorista ACABOU de tocar — o dedo ganha do algoritmo, senão
          encostar num prédio acenderia um nome que não aparece;
       2. a mais PERTO (é a régua do `ordenarParaAcender`, lá no backend);
       3. o CNPJ, pra empate não virar sorteio da ordem do DOM.
     ------------------------------------------------------------------------ */
  const ROTULO_CROMO = 34;     // padding + gap + ponto + borda do chip do nome
  const ROTULO_ALT = 26;       // altura do chip com folga
  const ROTULO_MARGEM = 8;     // respiro até a borda da tela
  const ROTULO_AR = 6;         // ar mínimo entre dois chips vizinhos
  /** quem o dedo tocou por último — prioridade 1 na hora de brigar por espaço */
  let empresaDoDedo = null;

  /* Largura do chip MEDIDA UMA VEZ por elemento e guardada nele.
     · `scrollWidth` do `.emp-nome` é imune à digitação (a animação mexe na
       largura VISÍVEL; o conteúdo continua inteiro por baixo do `overflow`) —
       medir o `offsetWidth` daria o nome pela metade no meio da cena.
     · Uma vez por elemento porque o repinte cria elementos NOVOS: medir a cada
       `move` do mapa seria layout síncrono 60 vezes por segundo. */
  function larguraDoRotulo(el) {
    if (el.__hbxRotuloW) return el.__hbxRotuloW;
    const nome = el.querySelector('.emp-nome');
    if (!nome) return 0;
    const w = nome.scrollWidth + ROTULO_CROMO;
    if (w > ROTULO_CROMO) el.__hbxRotuloW = w;
    return w;
  }

  function deconflitarRotulos(postos, largura) {
    // só briga por espaço quem MOSTRA rótulo: apagada e "passou" já são
    // opacidade 0 na folha, e marcá-las de `mudo` não mudaria nada na tela.
    const naFila = postos.filter((p) => p.el.classList.contains('on') && !p.el.classList.contains('passou'));
    postos.forEach((p) => {
      if (naFila.indexOf(p) !== -1) return;
      p.el.classList.remove('mudo');
      p.el.style.zIndex = '';
    });
    naFila.sort((a, b) => {
      const dedo = (p) => (String(p.el.dataset.empresa || '') === empresaDoDedo ? 0 : 1);
      if (dedo(a) !== dedo(b)) return dedo(a) - dedo(b);
      const dist = (Number(a.el.dataset.dist) || 0) - (Number(b.el.dataset.dist) || 0);
      if (dist) return dist;
      return String(a.el.dataset.empresa) < String(b.el.dataset.empresa) ? -1 : 1;
    });
    const ocupados = [];
    const bateEm = (a) => ocupados.some((o) => a.e < o.d + ROTULO_AR && a.d > o.e - ROTULO_AR
      && a.c < o.b + ROTULO_AR && a.b > o.c - ROTULO_AR);
    naFila.forEach((p, rank) => {
      const w = larguraDoRotulo(p.el);
      const meio = w / 2;
      // borda da tela primeiro: o empurrão MUDA a caixa, então tem que entrar
      // antes de perguntar se ela bate em alguém.
      let rx = 0;
      if (largura > 0) {
        if (p.x - meio < ROTULO_MARGEM) rx = ROTULO_MARGEM - (p.x - meio);
        else if (p.x + meio > largura - ROTULO_MARGEM) rx = largura - ROTULO_MARGEM - (p.x + meio);
      }
      const cx = p.x + rx;
      // o chip mora `56*esc + 8` ACIMA da âncora (a mesma conta do `bottom` da
      // folha) — a `.emp` tem altura 0, então a âncora é o pé do prédio.
      const cy = p.y - (56 * p.esc + 8) - ROTULO_ALT / 2;
      const caixa = { e: cx - meio, d: cx + meio, c: cy - ROTULO_ALT / 2, b: cy + ROTULO_ALT / 2 };
      const bate = bateEm(caixa);
      p.el.classList.toggle('mudo', bate);
      /* 🔴 O EMPILHAMENTO SEGUE A PRIORIDADE, e é isso que fecha o segundo
         defeito do print: os `.emp` são IRMÃOS no DOM, então quem vem depois
         pinta por cima — e a lista vem do servidor em ordem de distância, então
         o prédio da empresa mais LONGE tapava o nome da mais PERTO ("APARECIDO
         A███S DOS SANTOS", metade da razão social atrás de um telhado).
         Com z decrescendo por rank, o nome de quem tem prioridade fica acima de
         todo prédio que vier depois; e o contrário quase não existe, porque na
         câmera inclinada prédio mais perto é mais BAIXO na tela e nome mais
         longe é mais ALTO. O que sobra desse "quase" é o `ocupados` abaixo. */
      p.el.style.zIndex = bate ? '' : String(90 - rank);
      if (bate) return;
      ocupados.push(caixa);
      // O PRÉDIO DE QUEM JÁ FALOU TAMBÉM OCUPA LUGAR: ele tem z MAIOR que o dos
      // próximos da fila, então vai pintar por cima do rótulo deles. Quem vem
      // depois desvia — ou cala. (Os prédios de quem NÃO fala não entram: o
      // z-index levanta quem tem rótulo por cima deles, e prédio mudo tapado é
      // só profundidade.) Geometria do desenho: `.emp-obj` é `left:-30 top:-56
      // 60x64` escalado por `--esc` em cima da âncora.
      ocupados.push({
        e: p.x - 30 * p.esc, d: p.x + 30 * p.esc,
        c: p.y - 56 * p.esc, b: p.y + 8 * p.esc,
      });
      p.el.style.setProperty('--rx', `${rx.toFixed(1)}px`);
    });
  }
