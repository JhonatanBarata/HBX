  /* ========================================================================
     L6c — O VÍNCULO CLIENTE × PRODUTO (12/08, ordem do dono: *"não quero
     somente visualizar produtos… a ficha precisa voltar a permitir administrar
     o vínculo entre aquele cliente e aquele produto"*).

     🔴 O DEFEITO, MEDIDO NA FONTE: a ficha do app novo LIA
     `GET /logistica/cliente-produtos` e desenhava a linha com o chevron — o
     símbolo universal de "abre" — e NENHUM `data-acao`. O "Novo produto /
     entrega" era um botão sem verbo. O CRUD inteiro já existia no servidor
     (POST/PATCH/DELETE `/logistica/cliente-produtos`) e as três portas já
     estavam na allowlist do Kotlin (`NativeApiClient.kt`): é o PADRÃO DA FUSÃO
     de novo — capacidade viva, chamador cortado.

     🔴 E ISTO NÃO É A FICHA DO PRODUTO. `T.fichaproduto` mexe no CATÁLOGO
     (`/logistica/produtos/:id`) — o preço de TODO mundo. Aqui se mexe no que
     ESTE cliente leva: quantidade padrão, preço combinado só com ele, em qual
     porta, e se o vínculo continua gerando entrega. Confundir as duas é mudar o
     preço da empresa inteira achando que se acertou o de uma pessoa.

     PAUSAR ≠ REMOVER, e o servidor faz a mesma distinção:
       · a chave "Entra nas próximas rotas" → PATCH `ativo:false` (o vínculo
         fica, para de gerar);
       · o botão vermelho → DELETE (o vínculo morre; entregas JÁ geradas ficam
         intactas — está escrito no próprio endpoint).
     ======================================================================== */
  let vinculo = null;        // { id, item, novo, rascunho, ativo, produtoId, localId, salvando }
  const CATALOGO = new Map();

  /** o catálogo da empresa, uma vez por sessão de tela (some se a porta cair) */
  async function carregarCatalogoDoVinculo() {
    if (CATALOGO.size) return;
    let r;
    try { r = await window.API.get('/logistica/produtos'); } catch (_) { return; }
    (Array.isArray(r) ? r : []).forEach((p) => {
      if (p && p.ativo !== false) CATALOGO.set(String(p.id), p);
    });
  }

  /** o vínculo da ficha aberta, pelo id da linha tocada */
  const vinculoDaFicha = (id) => (ficha && Array.isArray(ficha.produtos)
    ? ficha.produtos.find((v) => String(v.id) === String(id)) || null : null);

  function publicarVinculo() {
    const v = vinculo;
    if (!v || typeof window.usarDados !== 'function') return;
    const it = v.item || {};
    const p = it.produto || CATALOGO.get(String(v.produtoId)) || null;
    const nomeProduto = p ? String(p.nome || p.name || '') : '';
    const c = ficha ? (ficha.detalhe || ficha.item || {}) : {};
    /* Os locais do CLIENTE — a porta do vínculo. Só vira pergunta pra quem tem
       mais de uma: com um endereço só a resposta é óbvia, e fileira de uma
       opção é enfeite. */
    const locais = (ficha && ficha.detalhe && Array.isArray(ficha.detalhe.locais) ? ficha.detalhe.locais : [])
      .map((l) => [String(l.id), esc(l.apelido || l.endereco || 'Endereço'), esc([l.bairro, l.cidade].filter(Boolean).join(' • '))]);
    /* ⚰️ 24/08 — a chave da EMPRESA (`precoPorClienteAtivo`) morreu no
       contrato, e por ordem do dono o preço por cliente é FIXO: o campo
       aparece SEMPRE, inclusive em vínculo novo (vazio = preço do catálogo;
       0,00 é valor legítimo). Sem seam `precoPorCliente` — campo sem leitor
       no desenho é armadilha, e o desenho agora renderiza incondicional. */
    window.usarDados('fichavinculo', {
      volta: 'ficha',
      novo: v.novo ? 1 : 0,
      cliente: esc(c.name || c.nome || ''),
      produto: esc(nomeProduto),
      ico: 'box',
      produtoId: String(v.produtoId || ''),
      // a lista só existe enquanto não há produto escolhido (ver o mock)
      catalogo: nomeProduto ? [] : [...CATALOGO.values()].map((x) => [
        String(x.id), esc(x.nome || x.name || 'Produto'), 'box',
        typeof x.precoCatalogo === 'number' ? dinheiro(x.precoCatalogo) : '',
      ]),
      qtd: v.rascunho.qtd,
      preco: v.rascunho.preco,
      precoDica: 'Vazio = usa o preço do catálogo',
      locais,
      localId: String(v.localId || ''),
      ativo: v.ativo ? 1 : 0,
      // Remover só existe pra vínculo que EXISTE: num rascunho não há o que apagar.
      podeRemover: v.novo ? 0 : 1,
      salvando: v.salvando ? 1 : 0,
    });
  }

  /** toque na linha do produto da ficha */
  function abrirVinculo(id) {
    const it = vinculoDaFicha(id);
    if (!it) return;
    vinculo = {
      id: String(it.id), item: it, novo: false, salvando: false,
      produtoId: String((it.produto && it.produto.id) || it.productId || ''),
      localId: it.localId ? String(it.localId) : '',
      ativo: it.ativo !== false,
      rascunho: {
        qtd: String(Number(it.qtdPadrao) || 1),
        preco: typeof it.precoAcordado === 'number' ? it.precoAcordado.toFixed(2).replace('.', ',') : '',
      },
    };
    publicarVinculo();
    window.ir('fichavinculo');
    // o catálogo entra depois: editando, o produto não troca — ele só serve pro
    // caso NOVO, e a tela não pode esperar rede pra abrir.
    void carregarCatalogoDoVinculo();
  }

  /** o "+ Novo produto / entrega" da ficha */
  async function novoVinculo() {
    if (!ficha) return;
    vinculo = {
      id: '', item: null, novo: true, salvando: false,
      produtoId: '', localId: '', ativo: true,
      rascunho: { qtd: '1', preco: '' },
    };
    publicarVinculo();
    window.ir('fichavinculo');
    await carregarCatalogoDoVinculo();
    if (!CATALOGO.size) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Sem produto no catálogo',
        sub: 'Cadastre o produto em Ajustes › Produtos antes de vincular a um cliente.',
        acoes: [['Fechar', '']],
      });
    }
    publicarVinculo();
  }

  /* O que o dedo digitou vive no DOM e MORRE no repinte — a mesma lei da ficha
     do cliente. Toda troca de chave/porta guarda os dois campos antes de
     republicar, senão escolher o local apagaria a quantidade recém-escrita. */
  function guardarRascunhoDoVinculo() {
    if (!vinculo) return;
    const qtd = naCamada('[data-campo="vinculo-qtd"]');
    const preco = naCamada('[data-campo="vinculo-preco"]');
    if (qtd) vinculo.rascunho.qtd = String(qtd.value || '');
    if (preco) vinculo.rascunho.preco = String(preco.value || '');
  }

  function escolherProdutoDoVinculo(id) {
    if (!vinculo || !id) return;
    guardarRascunhoDoVinculo();
    vinculo.produtoId = String(id);
    publicarVinculo();
  }

  function escolherLocalDoVinculo(id) {
    if (!vinculo) return;
    guardarRascunhoDoVinculo();
    // 2º toque no local aceso DESLIGA: sem porta o vínculo usa o endereço do
    // perfil, que é o que o legado sempre foi (o servidor aceita localId nulo).
    vinculo.localId = String(vinculo.localId || '') === String(id) ? '' : String(id);
    publicarVinculo();
  }

  function virarChaveDoVinculo() {
    if (!vinculo) return;
    guardarRascunhoDoVinculo();
    vinculo.ativo = !vinculo.ativo;
    publicarVinculo();
  }

  /** grava: POST quando é novo, PATCH quando existe. Só o que mudou no PATCH. */
  async function salvarVinculo() {
    const v = vinculo;
    if (!v || v.salvando || !ficha) return;
    guardarRascunhoDoVinculo();
    const qtd = Math.trunc(Number(String(v.rascunho.qtd || '').replace(/\D/g, '')));
    if (!Number.isFinite(qtd) || qtd < 1) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Quantidade inválida',
        sub: 'Informe quantas unidades saem por entrega (1 ou mais).', acoes: [['Fechar', '']],
      });
    }
    if (v.novo && !v.produtoId) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Falta o produto',
        sub: 'Escolha na lista qual produto este cliente leva.', acoes: [['Fechar', '']],
      });
    }
    /* Preço VAZIO é uma escolha: "use o preço do catálogo". Por isso ele vira
       `null` explícito no PATCH em vez de sumir do corpo — sem isso não haveria
       como DESFAZER um preço combinado, só como trocá-lo por outro. */
    const preco = dinheiroParaNumero(v.rascunho.preco);
    v.salvando = true;
    publicarVinculo();
    try {
      if (v.novo) {
        await window.API.post('/logistica/cliente-produtos', {
          customerProfileId: String(ficha.id),
          productId: Number(v.produtoId),
          qtdPadrao: qtd,
          ativo: !!v.ativo,
          ...(preco != null ? { precoAcordado: preco } : {}),
          ...(v.localId ? { localId: v.localId } : {}),
        });
      } else {
        const it = v.item || {};
        const corpo = {};
        if (qtd !== (Number(it.qtdPadrao) || 0)) corpo.qtdPadrao = qtd;
        const precoAntes = typeof it.precoAcordado === 'number' ? it.precoAcordado : null;
        if (preco !== precoAntes) corpo.precoAcordado = preco;
        if (!!v.ativo !== (it.ativo !== false)) corpo.ativo = !!v.ativo;
        const localAntes = it.localId ? String(it.localId) : '';
        if (String(v.localId || '') !== localAntes) corpo.localId = v.localId || null;
        if (!Object.keys(corpo).length) {
          v.salvando = false;
          publicarVinculo();
          return window.portao({
            tom: 'info', ico: 'check', titulo: 'Nada mudou',
            sub: 'Este produto já está assim pra este cliente.', acoes: [['Fechar', '']],
          });
        }
        await window.API.patch(`/logistica/cliente-produtos/${encodeURIComponent(v.id)}`, corpo);
      }
    } catch (e) {
      v.salvando = false;
      publicarVinculo();
      return avisoErro(e);
    }
    vinculo = null;
    // A ficha se relê inteira: quem decidiu o que valeu foi o servidor, e a
    // lista de produtos dela é justamente o que acabou de mudar.
    await recarregarProdutosDaFicha();
    window.ir('ficha');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Produto do cliente salvo',
      sub: 'Vale das próximas entregas em diante.', acoes: [['Fechar', 'principal', true]],
    });
  }

  /** o botão vermelho — REMOVE o vínculo (não a entrega já gerada) */
  function removerVinculo() {
    const v = vinculo;
    if (!v || v.novo || typeof window.portao !== 'function') return;
    const it = v.item || {};
    const nome = String((it.produto && it.produto.nome) || 'este produto');
    window.portao({
      tom: 'alerta', ico: 'trash', titulo: 'Tirar do cliente?',
      // A frase diz o que NÃO acontece: é a dúvida óbvia de quem aperta.
      sub: `${nome} para de entrar nas próximas rotas deste cliente. As entregas já feitas continuam no histórico.`,
      acoes: [['Deixar pra lá', '', true], ['Tirar', 'principal']],
      acaoPrincipal: 'remover-vinculo-agora',
      classe: 'duas',
    });
  }

  async function removerVinculoAgora() {
    const v = vinculo;
    if (!v || v.novo) return;
    try { await window.API.del(`/logistica/cliente-produtos/${encodeURIComponent(v.id)}`); }
    catch (e) { return avisoErro(e); }
    vinculo = null;
    await recarregarProdutosDaFicha();
    window.ir('ficha');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Produto retirado',
      sub: 'Ele não entra mais nas próximas rotas deste cliente.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

  /** relê SÓ os produtos da ficha aberta — o resto dela não mudou */
  async function recarregarProdutosDaFicha() {
    if (!ficha) return;
    let r;
    try { r = await window.API.get(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(ficha.id)}`); }
    catch (_) { return; }
    if (!ficha) return;
    ficha.produtos = Array.isArray(r) ? r : [];
    encherFicha();
  }
