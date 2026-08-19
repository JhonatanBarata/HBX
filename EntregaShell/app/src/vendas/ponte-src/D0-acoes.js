
  /* ==========================================================================
     O DESPACHANTE — o último arquivo da costura, e o único que fecha o IIFE.

     Ele não sabe o que nenhum botão faz: só sabe ENCONTRAR o dono. Os módulos
     registram o que é deles (`registrarAcoes` / `registrarCampos` /
     `registrarTelas`, definidos no `00-nucleo.js`) e este arquivo consome os três
     cofres no fim. É por isso que um módulo novo NÃO precisa editar este
     arquivo: dois agentes escrevendo no mesmo mapa de ações assam estado pela
     metade, e o defeito sai como "o botão não faz nada".

     🔴 ELE ESCUTA NA SUBIDA, DEPOIS DO MOCK. O roteador do mock foi registrado
     primeiro (o `mock.js` carrega antes) e roda antes deste — quando o dedo bate
     num `data-ir`, a tela JÁ trocou quando chegamos aqui. É essa ordem que faz o
     `anunciarTela` (10-portao-fontes) enxergar a tela nova, e é ela que deixa o
     `data-acao` de um botão de portão correr DEPOIS do `data-fechar` que o
     fecha.
     ========================================================================== */

  /* 🔴 O DE DENTRO VENCE — e `closest()` já resolve isso de graça: ele sobe do
     nó tocado e devolve o PRIMEIRO ancestral que casa, ou seja, o mais próximo
     do dedo. Um botão `[data-acao="puxar-lead"]` dentro de uma linha
     `[data-acao="abrir-lead"]` responde "puxar", que é o que o dedo quis.

     🔴 E A NAVEGAÇÃO DO MOCK TAMBÉM DISPUTA ESSA CORRIDA. Os dois roteadores são
     independentes: o mock não interrompe o evento, então um `[data-ir]`
     ANINHADO dentro de um `[data-acao]` faria as DUAS coisas no mesmo toque —
     trocar de tela e disparar a ação da linha que ficou pra trás. Quem estiver
     mais perto do dedo manda; `contains` responde isso sem contar nós.
     (Botão de portão é a exceção legítima e continua funcionando: `data-fechar`
     não é rota — o portão fecha E a ação corre, que é o contrato do
     `acaoPrincipal` da casca.) */
  const ROTAS_DO_MOCK = '[data-ir], [data-nav], [data-tela], [data-aula]';

  document.addEventListener('click', (e) => {
    const alvo = e.target && e.target.closest ? e.target.closest('[data-acao]') : null;
    if (!alvo || !temPonte()) return;
    const rota = e.target.closest(ROTAS_DO_MOCK);
    if (rota && rota !== alvo && alvo.contains(rota)) return;

    const chave = String((alvo.dataset && alvo.dataset.acao) || '');
    if (!chave) return;

    /* 🔴 O TUTOR TEM DONO, E NÃO É ESTE ARQUIVO. `tutor-comecar` e `tutor-<id>`
       são tratados pelo próprio mock (ele abre o capítulo com a espera que cobre
       a saída do portão). Sem esta linha, o aviso de "ação sem dono" lá embaixo
       gritaria a cada toque no catálogo do Tutorial — e guarda que grita à toa é
       guarda que se aprende a ignorar. */
    if (chave.indexOf('tutor-') === 0) return;
    /* 🔴 `chave-tema` TAMBÉM É DO MOCK. Ele chama `trocarLuz`, que esta ponte
       embrulhou (00-nucleo §1) pra falar com o native. Tratar aqui viraria a luz
       uma SEGUNDA vez no mesmo clique — medido no g15 do app do motorista:
       escuro→claro→escuro, e a chave "Tema escuro" parecia morta. */
    if (chave === 'chave-tema') return;

    const fn = ACOES[chave];
    if (!fn) {
      /* Ação desenhada na casca e sem dono na ponte É UM BOTÃO MORTO — e botão
         morto neste app já custou três diagnósticos errados. O grito nomeia a
         chave que falta, que é exatamente o que o próximo módulo precisa
         registrar. Ele fica no console (não na tela): quem lê console é quem
         está construindo, e quem está usando não tem culpa do que falta. */
      try { console.warn(`[ponte/vendas] ação sem dono: "${chave}" — registre-a com registrarAcoes({...}) no módulo dela.`); } catch (_) {}
      return;
    }
    /* O NÓ TOCADO viaja junto: é dele que sai o `data-lead`/`data-empresa` do
       toque, e é NELE que o "aguarde" (disabled + .aguarde) entra no MESMO
       quadro do dedo, antes de qualquer resposta de rede. */
    try { fn(alvo, e); } catch (erro) {
      // Handler que estoura não pode derrubar o resto do app: a tela continua
      // de pé e a pessoa vê a frase da casa, não um travamento mudo.
      try { console.error(`[ponte/vendas] ação "${chave}" estourou:`, erro); } catch (_) {}
      avisoErro(erro);
    }
  });

  /* ------------------------------------------------------------------------
     OS CAMPOS. Mesmo desenho, outro evento.

     🔴 TECLA NÃO PODE VIRAR PEDIDO. Cada escrita no seam remonta a camada
     inteira (`pintar`), e cada letra vira uma requisição se ninguém segurar:
     digitar "distribuidora de água" seriam 21 idas ao servidor e 21 repintes na
     tela de quem está com o dedo no vidro. Por isso o registro aceita
     `{ espera, ao }` — o módulo diz quanto tempo o dedo precisa parar.
     O caret sobrevive ao repinte porque a casca mede e devolve o foco
     (`medirFoco`/`herdarFoco`), inclusive a posição do cursor.

     `aoEnter` existe para os campos que a casca marcou com `enterkeyhint`
     ("search" no Radar): a tecla de confirmar do teclado do Android é um botão
     de verdade na cara da pessoa, e ignorá-la é deixá-la tocando numa tecla que
     não faz nada.
     ------------------------------------------------------------------------ */
  const relogiosDeCampo = Object.create(null);

  const donoDoCampo = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-campo]') : null;
    if (!el || !temPonte()) return null;
    const nome = String((el.dataset && el.dataset.campo) || '');
    if (!nome) return null;
    const reg = CAMPOS[nome];
    if (!reg) return null;                   // campo do desenho sem dono ainda: silêncio
    return { el, nome, reg: typeof reg === 'function' ? { ao: reg } : reg };
  };

  document.addEventListener('input', (e) => {
    const achado = donoDoCampo(e);
    if (!achado || typeof achado.reg.ao !== 'function') return;
    const valor = typeof achado.el.value === 'string' ? achado.el.value : '';
    const espera = Number(achado.reg.espera) || 0;
    clearTimeout(relogiosDeCampo[achado.nome]);
    if (!espera) return void achado.reg.ao(valor, achado.el);
    relogiosDeCampo[achado.nome] = setTimeout(() => achado.reg.ao(valor, achado.el), espera);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const achado = donoDoCampo(e);
    if (!achado || typeof achado.reg.aoEnter !== 'function') return;
    // O relógio do debounce morre aqui: quem apertou Enter não quer esperar mais
    // 180 ms pela mesma busca, e deixá-lo vivo dispararia a segunda chamada.
    clearTimeout(relogiosDeCampo[achado.nome]);
    const valor = typeof achado.el.value === 'string' ? achado.el.value : '';
    /* Fecha o teclado antes de agir: o resultado que a busca traz nasce ATRÁS do
       teclado se ele ficar aberto, e a pessoa acha que nada aconteceu. */
    try { achado.el.blur(); } catch (_) {}
    achado.reg.aoEnter(valor, achado.el);
  });
})();
