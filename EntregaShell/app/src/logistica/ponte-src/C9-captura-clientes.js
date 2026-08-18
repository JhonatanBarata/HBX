
  /* ══════════════════════════════════════════════════════════════════════════
     "VOCÊ AINDA NÃO TEM CLIENTES" — as três portas (17/08/2026).

     A tela é do desenho (`T.semclientes`); aqui moram os VERBOS. Ordem do dono:
     *"no final, responder: Notamos que vc ainda não tem clientes, bora
     cadastrar? Manualmente X Suporte (vc envia a foto para nós, o cadastro é
     realizado em até 24 horas!) Opções: Whatsapp, Email, abrir camera"*.

     🔴 AS TRÊS PORTAS JÁ EXISTIAM NO APARELHO — nenhuma peça nativa nova.
     · a CÂMERA é um `<input type="file" accept="image/*" capture>`: o
       `onShowFileChooser` do `MainActivity` já monta o seletor com a câmera
       dentro (`criarIntentCamera`), e é o mesmo caminho do comprovante de
       entrega;
     · o WHATSAPP é `HBX.whatsapp(numero, texto)`, que o app já usa pra falar
       com cliente — e que fora do aparelho cai num `wa.me` no navegador;
     · o E-MAIL é um `mailto:`, que o `shouldOverrideUrlLoading` entrega ao
       Android por `ACTION_VIEW` como qualquer link de fora.

     🔴 O NÚMERO E O E-MAIL NÃO MORAM AQUI. Vêm do `GET /logistica/config`
     (`suporteWhatsapp`/`suporteEmail`, a mesma env que o financeiro lê). Cravar
     um telefone dentro do APK obrigaria uma publicação nova — e um APK velho na
     mão de um cliente continuaria mandando gente pro número antigo pra sempre.
     Sem os campos (backend velho), a porta simplesmente NÃO é oferecida: botão
     que não tem pra onde ir é o botão morto que esta casa já matou várias vezes.

     🔴 A FOTO ENCOLHE ANTES DE SAIR. Foto de celular hoje sai com 4–8 MB, e o
     corpo do backend para em 3 MB (`useBodyParser` do `main.ts`) — mandar a
     original seria um 413 na cara de quem acabou de instalar o app. O canvas
     reduz pra 1600 px e JPEG 0,7: a lista continua legível pra quem vai digitar
     e o corpo cai pra centenas de KB. E encolher no APARELHO também poupa o
     plano de dados dele, que é a rede que paga essa conta.
     ══════════════════════════════════════════════════════════════════════════ */

  /** o que o servidor disse sobre onde falar com a HBX (vazio = não oferece) */
  const suporteWhats = () => String((config && config.suporteWhatsapp) || '').replace(/\D/g, '');
  const suporteEmail = () => String((config && config.suporteEmail) || '').trim();

  /* O texto que vai pronto nas duas mensagens. Uma frase só, na voz de quem
     manda — quem recebe é a HBX, e ela precisa saber de qual empresa é a lista
     sem ter que perguntar de volta. */
  function textoDoPedido() {
    const empresa = String((config && config.empresaNome) || '').trim();
    return `Olá! Quero cadastrar meus clientes no HBX.${empresa ? ` Minha empresa é ${empresa}.` : ''}`
      + ' Vou mandar a foto da minha lista aqui.';
  }

  /* ------------------------------------------------------------------------
     A FOTO
     ------------------------------------------------------------------------ */
  /** 1600 px no maior lado, JPEG 0,7 — devolve `data:image/jpeg;base64,…` */
  function encolherFoto(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não consegui ler essa foto.'));
      leitor.onload = () => {
        const cru = String(leitor.result || '');
        /* PDF não passa por canvas — ele vai como veio. Quem manda a lista em
           PDF (a planilha exportada) não pode receber "não consegui ler". */
        if (!/^data:image\//i.test(cru)) return resolve(cru);
        const img = new Image();
        img.onerror = () => resolve(cru);   // não deu pra decodificar: manda cru
        img.onload = () => {
          try {
            const maior = Math.max(img.width, img.height) || 1;
            const escala = Math.min(1, 1600 / maior);
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * escala);
            c.height = Math.round(img.height * escala);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.7));
          } catch (_) { resolve(cru); }
        };
        img.src = cru;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  let mandandoFoto = false;

  async function mandarFoto(arquivo) {
    if (mandandoFoto || !arquivo) return;
    mandandoFoto = true;
    try {
      const dados = await encolherFoto(arquivo);
      await window.API.post('/logistica/cadastro-em-massa', {
        arquivo: dados,
        nome: String(arquivo.name || 'lista-de-clientes.jpg'),
      });
      /* O recibo troca a tela inteira (`enviado` no seam de `semclientes`).
         Quem mandou precisa VER que chegou, senão manda de novo achando que
         falhou — e a HBX recebe a mesma lista quatro vezes. */
      if (typeof window.usarDados === 'function') window.usarDados('semclientes', { enviado: 1 });
    } catch (e) {
      /* 🔴 FALHA AQUI NÃO PODE VIRAR "recebemos". A pessoa acabou de instalar o
         app: dizer que chegou e não ter chegado é a primeira mentira que ela
         ouve da HBX. O erro sai no portão (a superfície que a ponte usa pra
         tudo que precisa de resposta), com o texto que o tradutor do núcleo já
         devolve em português — e com a saída nomeada, porque portão sem saída é
         beco. */
      if (typeof window.portao === 'function') {
        try {
          window.portao({
            tom: 'red',
            ico: 'alert',
            titulo: 'Não consegui enviar a foto',
            sub: (e && e.message) || 'Tente de novo daqui a pouco.',
            acoes: [['Tentar de novo', 'principal', true]],
          });
        } catch (_) { /* sem superfície */ }
      }
    } finally {
      mandandoFoto = false;
    }
  }

  /* O seletor nasce e morre no toque: um `<input>` parado no DOM é uma peça que
     o `pintar()` teria que preservar a cada repinte, e a tela não é dele. */
  function abrirCamera() {
    const campo = document.createElement('input');
    campo.type = 'file';
    campo.accept = 'image/*,application/pdf';
    /* `capture` diz ao Android "prefira a câmera"; o seletor continua abrindo a
       galeria ao lado, e é isso que se quer — parte das listas já é um print
       que a pessoa tem salvo, não uma foto pra tirar agora. */
    campo.setAttribute('capture', 'environment');
    campo.style.display = 'none';
    campo.addEventListener('change', () => {
      const arquivo = campo.files && campo.files[0];
      try { campo.remove(); } catch (_) { /* já saiu */ }
      if (arquivo) mandarFoto(arquivo);
    });
    document.body.appendChild(campo);
    campo.click();
  }

  /* ------------------------------------------------------------------------
     OS DEDOS
     ------------------------------------------------------------------------ */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest && ev.target.closest('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao;

    if (acao === 'cadastro-foto') { ev.preventDefault(); abrirCamera(); return; }

    if (acao === 'cadastro-whats') {
      ev.preventDefault();
      const num = suporteWhats();
      if (!num) return;
      try { window.HBX.whatsapp(num, textoDoPedido()); } catch (_) { /* sem ponte */ }
      return;
    }

    if (acao === 'cadastro-email') {
      ev.preventDefault();
      const para = suporteEmail();
      if (!para) return;
      const assunto = 'Quero cadastrar meus clientes no HBX';
      const url = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}`
        + `&body=${encodeURIComponent(`${textoDoPedido()}\n\n(anexe aqui a foto da sua lista)`)}`;
      // `location.href` e não `window.open`: é a navegação de frame que o
      // `shouldOverrideUrlLoading` do WebView intercepta pra chamar o ACTION_VIEW.
      try { window.location.href = url; } catch (_) { /* sem app de e-mail */ }
    }
  });

  /* 🔴 PORTA SEM DESTINO NÃO APARECE. O backend velho não manda
     `suporteWhatsapp`/`suporteEmail`, e um botão que não tem pra onde ir é pior
     que a ausência dele — a pessoa toca, nada acontece, e conclui que o app está
     quebrado. Some a porta, não a tela: a foto (que não depende de config
     nenhuma) e o cadastro manual continuam lá. */
  function publicarPortasDeSuporte() {
    if (typeof window.usarDados !== 'function') return;
    /* 🔴 ENQUANTO A CONFIG NÃO CHEGOU, NÃO SE DECIDE NADA. Publicar 0 aqui
       apagaria as duas portas com base em ignorância — e como esta função era
       um `setTimeout` de 5 s, era exatamente isso que acontecia: a config
       chegava depois e as portas nunca voltavam. Medido na foto da tela, que
       saiu com "Tirar foto" sozinho ocupando a largura inteira.
       Quem chama isto agora é o mesmo ponto que já sabe que a config chegou
       (`publicarTutorial`), então "ainda não sei" simplesmente não escreve. */
    if (!config) return;
    window.usarDados('semclientes', {
      temWhats: suporteWhats() ? 1 : 0,
      temEmail: suporteEmail() ? 1 : 0,
    });
  }
