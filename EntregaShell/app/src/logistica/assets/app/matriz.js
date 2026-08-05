"use strict";
/*
 * MATRIZ DA TELA (PR05082026, GO 05/08) — a caderneta é a matriz; toda lista
 * vira espelho dela. AQUI mora o que existe em 2+ telas: a linha canônica, o
 * vocabulário do dinheiro, o telegrama da conta, os chips de filtro e o gesto
 * de segurar-pra-apagar / arrastar-pelo-número. Tela NÃO escreve gesto nem
 * palavra de dinheiro — ela DECLARA dados e a matriz entrega o resto.
 *
 * Freio do plano: só entra o que JÁ vive em 2+ telas. Peça de tela única fica
 * na tela. Carrega DEPOIS do native.js (usa o H global) e ANTES do app.js.
 */
(function () {
  const H = window.HBX; // casca do native.js (escape/vibrate) — carrega antes

  // ---- vocabulário CRAVADO pelo dono (05/08) — fonte única das 4 palavras ---
  // Não existe "fiado/deve/devendo/Ficou Pendente" em tela. O dado do banco
  // (receiptMethod:'fiado') é contrato e NÃO muda — isto aqui é só a TELA.
  // O fiscal (check-matriz.mjs) compara este mapa com o do web: mudou um sem o
  // outro, VERMELHO no lint.
  const rotulos = {
    metodo: { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", fiado: "Marcou" },
    botoes: { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", marcar: "Marcar" },
    conta: { anterior: "Anterior", totalMarcado: "Total Marcado", venda: "Venda", total: "Total", marcado: "Marcado" },
    filtros: { todos: "Todos", pago: "Pagou", pendente: "Marcou" },
  };

  // ---- dinheiro em TELEGRAMA (Lei 8) ---------------------------------------
  // "R$ uma vez, no último valor" (correção literal do dono). Unitário sem R$.
  function num(v) {
    return Math.max(0, Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function rs(v) { return `R$${num(v)}`; }

  /**
   * A linha do produto no formato cravado (05/08):
   *   1 item  → "Galão 20 Litros 1×11,00 = R$11,00"  (coisa antes de conta)
   *   2+ itens → "Galão 6× · Água 2× = R$82,00"      (sem unitário — não cabe)
   *   sem financeiro/preço → "Galão 2×"              (número de dinheiro não se inventa)
   * Zero não é preço, é "não sei": unitário 0 com total > 0 sai por RATEIO
   * (freio pro aparelho falando com servidor velho). Zero com total zerado é
   * cortesia legítima e fica.
   */
  function itens(lista, opts) {
    if (!lista || !lista.length) return "";
    const financeiro = !!(opts && opts.financeiro);
    const total = opts && Number.isFinite(Number(opts.total)) ? Number(opts.total) : null;
    const qtdDe = x => Math.max(1, Number(x.qtd) || 1);
    const nomeDe = x => H.escape(x.nome || "item");
    if (!financeiro) return lista.map(x => `${nomeDe(x)} ${qtdDe(x)}×`).join(" · ");
    if (lista.length === 1) {
      const x = lista[0];
      const qtd = qtdDe(x);
      let unit = Number.isFinite(Number(x.valorUnit)) ? Number(x.valorUnit) : null;
      if ((unit === null || unit === 0) && total != null && total > 0) unit = total / qtd;
      if (unit === null) return `${nomeDe(x)} ${qtd}×`;
      return `<span class="mtz-nome">${nomeDe(x)}</span><b class="mtz-valor">${qtd}×${num(unit)} = ${rs(unit * qtd)}</b>`;
    }
    const nomes = lista.map(x => `${nomeDe(x)} ${qtdDe(x)}×`).join(" · ");
    let soma = total != null && total > 0 ? total : null;
    if (soma === null && lista.every(x => Number.isFinite(Number(x.valorUnit)) && Number(x.valorUnit) > 0)) {
      soma = lista.reduce((s, x) => s + Number(x.valorUnit) * qtdDe(x), 0);
    }
    return soma != null ? `${nomes} <b class="mtz-valor">= ${rs(soma)}</b>` : nomes;
  }

  // ---- a linha canônica -----------------------------------------------------
  /**
   * Todo card de lista é linha(): nº à esquerda (alça quando a ordem é do
   * usuário), título com o DESFECHO na ponta direita, sub-linhas de dinheiro
   * (Anterior / itens / Total Marcado), extras (Sumiu, obs) e nada fora disso.
   * O bloco do dinheiro segue a correção do dono (05/08): Anterior em cima,
   * venda no meio, Total Marcado embaixo — e valor que não soma não aparece.
   */
  function linha(d) {
    // O desfecho é COLUNA própria do grid do card (não mora na linha do
    // título): centralizado na altura, sempre na mesma ponta — ordem do dono
    // 05/08 ("centralize os pix e marcou").
    const desfecho = d.desfecho
      ? `<span class="mtz-desfecho${d.desfechoTom ? ` is-${d.desfechoTom}` : ""}">${H.escape(d.desfecho)}</span>`
      : "";
    const partes = [];
    if (Number(d.anterior) > 0) partes.push(`<small class="mtz-conta mtz-anterior">${rotulos.conta.anterior} ${rs(d.anterior)}</small>`);
    if (d.itensHtml) partes.push(`<small class="mtz-conta mtz-itens${d.itensUm ? " is-um" : ""}">${d.itensHtml}</small>`);
    if (Number(d.totalMarcado) > 0) partes.push(`<small class="mtz-conta mtz-total-marcado">${rotulos.conta.totalMarcado} ${rs(d.totalMarcado)}</small>`);
    if (d.extrasHtml) partes.push(d.extrasHtml);
    const alca = d.alca ? ` data-matriz-alca="${H.escape(d.alca)}"` : "";
    const apagar = d.apagar ? ` data-matriz-apagar="${H.escape(d.apagar)}" data-matriz-chave="${H.escape(d.chave || "")}"` : "";
    return `<article class="stop-card mtz-linha${d.classe || ""}"${d.attrs || ""}${apagar} role="button" tabindex="0"><div class="stop-top"><div class="order${d.feito ? " is-feito" : ""}"${alca}>${d.ordem}</div><div class="card-main"><div class="mtz-topo"><strong>${H.escape(d.titulo)}</strong></div>${partes.join("")}</div>${desfecho}${d.trailingHtml || ""}</div></article>`;
  }

  // ---- chips de filtro (Lei 7 — colunas iguais, contagem dentro) ------------
  function chips(lista, ativo, action, classe) {
    return `<div class="day-chips mtz-chips${classe ? ` ${classe}` : ""}">${lista.map(c =>
      `<button type="button" class="montagem-dia${ativo === c.valor ? " active" : ""}" data-action="${H.escape(action)}" data-filtro="${H.escape(c.valor)}" aria-pressed="${ativo === c.valor}"><strong>${H.escape(c.rotulo)}</strong><small>${Number(c.contagem) || 0}</small></button>`,
    ).join("")}</div>`;
  }

  // ---- gestos: segurar = excluir · arrastar = pelo número -------------------
  // UM registro por data-matriz-*. A tela declara os callbacks; a máquina
  // (950ms, vermelho progressivo, vibração, zona de exclusão da alça, guard do
  // clique fantasma) mora AQUI — é o que faz "o excluir vir junto" de graça.
  let hold = null;
  let cliqueFantasma = null;

  function desarmar() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold.el.classList.remove("is-hold-arming", "is-holding");
    hold = null;
  }

  function gestos(config) {
    const raiz = config.raiz;
    raiz.addEventListener("touchstart", event => {
      if (event.touches.length !== 1 || !config.podeGesto()) return;
      const toque = event.touches[0];
      // ARRASTE PELO NÚMERO: pega na hora, sem os 950ms do apagar — é o que
      // separa os dois gestos pro dedo, não só pro código.
      const alca = event.target.closest("[data-matriz-alca]");
      if (alca) {
        if (config.arrasto && config.arrasto.iniciar(alca.dataset.matrizAlca, toque)) {
          cliqueFantasma = alca.dataset.matrizAlca;
        }
        return; // zona de exclusão: dedo na alça NUNCA arma o excluir
      }
      const row = event.target.closest("[data-matriz-apagar]");
      if (!row) return;
      cliqueFantasma = null;
      hold = { id: row.dataset.matrizApagar, chave: row.dataset.matrizChave || "", el: row, x: toque.clientX, y: toque.clientY, triggered: false, timer: null };
      hold.el.classList.add("is-hold-arming");
      hold.timer = setTimeout(() => { hold.triggered = true; hold.el.classList.remove("is-hold-arming"); hold.el.classList.add("is-holding"); H.vibrate(45); }, 950);
    }, { passive: true });
    raiz.addEventListener("touchmove", event => {
      if (event.touches.length !== 1) return;
      const toque = event.touches[0];
      if (config.arrasto && config.arrasto.ativo()) { config.arrasto.mover(toque); return; }
      if (hold && (Math.abs(toque.clientX - hold.x) > 12 || Math.abs(toque.clientY - hold.y) > 12)) desarmar();
    }, { passive: true });
    raiz.addEventListener("touchend", () => {
      if (config.arrasto && config.arrasto.ativo()) { config.arrasto.soltar(false); return; }
      if (!hold) return;
      clearTimeout(hold.timer);
      const h = hold; hold = null;
      h.el.classList.remove("is-hold-arming", "is-holding");
      if (h.triggered) {
        // O guard vale pela CHAVE da linha (é ela que o clique carrega) — sem
        // isso soltar o dedo abria a tela por cima da confirmação de apagar.
        cliqueFantasma = h.chave || h.id;
        config.apagar(h.id, h.chave);
      }
    }, { passive: true });
    raiz.addEventListener("touchcancel", () => {
      desarmar();
      if (config.arrasto && config.arrasto.ativo()) config.arrasto.soltar(true);
    }, { passive: true });
    raiz.addEventListener("contextmenu", event => {
      if (event.target.closest("[data-matriz-apagar],[data-matriz-alca]")) event.preventDefault();
    });
  }

  /** O clique que nasce do gesto (arraste/hold) não é clique — consome 1×. */
  function consumirCliqueFantasma(chave) {
    if (cliqueFantasma && cliqueFantasma === chave) { cliqueFantasma = null; return true; }
    return false;
  }

  window.HBXMatriz = { rotulos, num, rs, itens, linha, chips, gestos, consumirCliqueFantasma };
})();
