# Achados ao vivo no moto g15 (21/07, APK build 14:19 = tree atual)

Varredura dirigida por ADB: Rota, Clientes, Produtos, Ajustes, Financeiro, Montar Rota,
Rotas Salvas, editor de rota salva, form Novo cliente com teclado. Evidência de tela, não
leitura de código.

## ✅ O que JÁ está no padrão (não mexer, é a referência)

- **Long-press excluir**: 1400ms no card de cliente → `.app-confirm` "Excluir cliente?" com
  ícone + danger. Gesto e confirmação corretos.
- **Voltar do Android** fecha o popup de confirmação e o modal de cadastro. Correto nesses casos.
- **Teclado**: focar campo encolhe o modal pra área visível, esconde a nav, rola o campo pro
  centro. Tecla Enter aparece como **→|** (next).
- **Enter encadeia**: Nome → Telefone → CPF → CEP, com máscara automática do telefone
  ((11) 98888-7777) e teclado numérico nos campos numéricos.
- **CEP automático**: 13500-380 preencheu Avenida 5 / Zona Central / Rio Claro / SP.
- **Editor de rota salva** (feature de hoje) = **PADRÃO DE REFERÊNCIA**: centerModal com X,
  resumo verde "3 parada(s)", cards numerados com ▲▼, "+ Adicionar cliente", dica de gesto
  ("toque para mudar o que recebe · segure para tirar") e setas circulares rotuladas
  ‹ Fechar / › Salvar. É essa cara que o resto do app tem que ter.
- Produtos e Clientes usam o mesmo card (avatar + texto + chevron). Consistente.

## ❌ Furos confirmados (viram tarefa)

1. **CTA some com o teclado** — no form "Novo cliente", com o teclado aberto o botão
   "Salvar cliente" fica fora da tela. Só 3 forms têm sticky (`new-oneoff`, `leitura-novo`,
   `edit-product`); os outros 8 não. → **S2**
2. **Aviso do CEP é texto solto** — "CEP não encontrado. Preencha o endereço." aparece como
   linha cinza crua, colada no label "Bairro" de baixo, sem moldura. Pior: o aviso de
   SUCESSO ("Endereço preenchido. Informe o número.") tem **exatamente a mesma cara cinza**
   do erro. → **S4**
3. **62 seletores CSS repetidos** em app.css: `.content` (3×), `.sheet`/`.sheet-wrap` (3×),
   `.stop-card` (3×), `.lrt-endereco-compare` (3×), `*` (2×), `.app-confirm-wrap` (2×).
   **`.btn-danger` está definido 2× com cores diferentes** (#b62f2f na 1ª, `var(--danger)` na
   2ª — a 2ª vence, a 1ª é código morto). É a máquina do "conserto e volta". → **S1**
4. **3 vermelhos**: `--danger` #c43838, `.btn-danger` #b62f2f (morto), `.toast.error` #a92e2e.
   → S1 consolida em `--danger`.
5. **2 componentes de switch**: `.toggle` (38×22, Ajustes) e `.module-switch` (46×27, "salvar
   como minha rota"). Mesma função, tamanhos e cores diferentes. → **S1** unifica em `.toggle`.
6. **1 azul solto** #0865df (ícone "Minha ordem") sem token. → S1 vira `--info`.
7. **Popup central sem padrão de fechar**: "Montar Rota" não tem X nem Voltar (só toque fora);
   "Rotas Salvas" tem botão "Voltar" de texto; editor de rota salva tem X + seta ‹ Fechar.
   Três saídas diferentes na mesma família de popup. → **S5**
8. **FAB "+" cobre o último card** da lista (chip de pendência fica atrás dele). → S1.
9. **Marca "» HBX" descentralizada** no topbar: o grid é `1fr auto 1fr` mas a toolbar da
   direita (4 controles + bolinha) é bem maior que o spacer da esquerda, empurrando a marca.
   → S1.

## 📌 Decisões do dono (21/07, via pergunta direta)

- **VERDE — dois, com papel escrito.** Limão `--brand` #78c900 = identidade/seleção (marca,
  nav ativa, avatar, chips, badges). Esmeralda #38e95e→#07a93f vira **token novo `--cta`** =
  ação principal (botão play/transmux, CTA "Iniciar Leitura", `.rp2-cta`, seta ›avançar).
  Nenhum outro lugar usa esmeralda. Vira Lei 2b.
- **PENDÊNCIA — vermelho só para End e Dia.** Falta de endereço ou de dia de entrega trava a
  entrega → card pintado (borda + avatar vermelho) + chip vermelho. **Tel e Dup viram chip
  neutro** (cinza/`--muted`) e **não pintam o card**. Vale na lista de Clientes e onde mais o
  `clientPendingKeys` pintar.

## Estado do aparelho / dados (pro E2E)

- Empresa com **213 clientes** (Rio Claro) e **5 produtos**; 9 rotas salvas, várias de teste
  ("Rota 21/07", "Rota blabla", "Andre teste", "QA Rota 2107 P1/P2/P3").
- **Financeiro: Ativar ON · Cobrança simples OFF · Na hora OFF · Mensal ON · Fiado ON ·
  Preço por cliente ON.** ⚠️ Pro E2E é preciso **ligar "Na hora"** (senão não existe
  "pagou em dinheiro") — e manter Cobrança simples OFF, porque o roteiro do dono pede a
  folha COMPLETA (editar quantidade de galões + comprovante).
- "Avisar chegada 20 m" ligado → **conferir/desligar antes do E2E** (evita zap de verdade).
- Sem rota ativa hoje (botão play verde).
