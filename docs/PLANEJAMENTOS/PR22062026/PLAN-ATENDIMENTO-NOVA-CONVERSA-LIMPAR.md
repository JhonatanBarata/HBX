# PLAN — Atendimento: +Nova (entrada de número) + Limpar (faxina das bugadas)

> Domínio: `/CLAUDE.md` + [docs/Rules/WHATSAPP.md](../../Rules/WHATSAPP.md) e [FRONTEND.md](../../Rules/FRONTEND.md).
> Nasceu do incidente 22/06 (Gabriele/company 5): +Nova deixou abrir conversa pra **fixo** (Klima Cold
> +55 51 3726-3309, sem WhatsApp) e pro **mesmo contato em dois formatos**; o envio morreu em "Bad Request"
> e a conversa-fantasma ficou na lista sem o Limpar conseguir tirar (tem 1 msg FAILED → não é "vazia").

## Decisões travadas (ordem do dono 22/06 — não reabrir)
- **O 9º dígito NÃO é lei.** Número sem o 9 é legítimo (regiões sem nono dígito; ex.: o da Gabriele,
  `555180338382`). **Proibido forçar/injetar o 9.** Quem manda no formato real é o WhatsApp (JID canônico).
- **+Nova melhora a ENTRADA:** máscara com `( )` pro DDD sozinho e **`+55` entra automático** se a pessoa
  não digitar. Só isso de formatação — sem inventar dígito.
- **Limpar é faxina da casa, NÃO é comando do WhatsApp.** Apaga local (banco). Tem que pegar também as
  **bugadas/inválidas** (conversa que só tem mensagem FAILED / nunca enviou nada), não só as 100% vazias.

## Item A — +Nova: entrada amigável + não criar conversa morta

### A1. Front — máscara do telefone (UX)
- Âncora: `novaForm`/`setNovaForm` ([page.client.tsx:588](../../../frontend/src/app/(app)/atendimento/page.client.tsx))
  e o POST `/inbox/conversations/start` ([:922](../../../frontend/src/app/(app)/atendimento/page.client.tsx)).
- Input formata enquanto digita: `+55 (DD) NNNN-NNNN` ou `+55 (DD) NNNNN-NNNN` conforme a quantidade de
  dígitos (NÃO assume 9 — usa o que foi digitado). Se o usuário não começar com `55`/`+55`, **prefixa `+55`
  na exibição**, sem apagar o que ele digitou.
- Placeholder vira `+55 (  )  ____-____`. Tokens/classe central de máscara (Lei do Design System; nada de
  estilo solto).
- Mantém envio do número **só com dígitos** pro backend (o backend já normaliza).

### A0. PROVADO 22/06 (ao vivo, motor da Gabriele company-5-user-33)
`POST /chat/whatsappNumbers/{inst}` (onWhatsApp) é a FONTE DA VERDADE: mandando o número COM ou SEM o 9,
o motor devolve o MESMO `jid` canônico — sempre **sem** o 9 extra pros números do Sul. Ex.: `5551993572856`
(com 9, não existe) e `555193572856` (sem 9) → ambos `555193572856@s.whatsapp.net exists:true`. Fixo
(`555137263309`) → `exists:false`. **Logo o conserto NÃO é "achar/remover a inserção do 9" (o Explore não achou
inserção no nosso código — o 9 vem da fonte/scraping/Google, ou de quem digitou); é CANONICALIZAR via onWhatsApp
antes de criar/enviar.** Já apliquei à mão na base da Gabriele: conversas 1337/1338/1333/1334 corrigidas pro JID
canônico; teste de envio ao número corrigido = `PENDING`→`DELIVERY_ACK` (entregue). Klima (fixo) sem WhatsApp.

### A2. Back — checar existência no WhatsApp e usar o JID canônico (mata fixo/fantasma SEM forçar 9)
- Âncora: `startConversation` ([inbox.service.ts:4216](../../../backend/src/inbox/inbox.service.ts)) +
  `normalizeManualConversationContact` ([:1869](../../../backend/src/inbox/inbox.service.ts)) — hoje só valida
  formato e monta `remoteJid` cru dos dígitos digitados; **não pergunta ao motor**.
- Antes de criar a conversa: `checkWhatsappNumbers(companyId, [digits])`
  ([webwhats-bridge.service.ts:679](../../../backend/src/messaging/webwhats-bridge.service.ts)) na sessão do
  vendedor. Resultado:
  - **Tem WhatsApp** → usar o **JID canônico que o motor devolve** como `contact`/`remoteJid` (resolve
    com/sem-9 automaticamente, sem regra nossa) e criar/abrir a conversa.
  - **Não tem WhatsApp** (fixo, número errado) → **recusar** com `BadRequestException` clara:
    *"Esse número não tem WhatsApp — confira o DDD/celular."* Não cria conversa.
  - **Motor fora do ar / resposta ambígua** → **degradar com elegância**: cria como hoje (não trava o
    atendimento por instabilidade do motor) e marca `metadata.whatsappUnverified=true` pra UI sinalizar.
- Efeito: some o fixo, some a conversa-fantasma, e o "split com/sem 9" desaparece porque passamos a gravar
  **um** contato — o JID canônico — em vez do que foi digitado.

## Item B — Limpar: pegar também as bugadas (não só as vazias)

- Âncora: `clearEmptyConversations` ([inbox.service.ts:4326](../../../backend/src/inbox/inbox.service.ts)) +
  botão `limparBusy` ([page.client.tsx:594](../../../frontend/src/app/(app)/atendimento/page.client.tsx)).
- Hoje a candidata é `messages: { none: {} }` (zero msg). **Estender** o conjunto pra incluir conversa
  **sem nenhuma mensagem “real”**, ou seja: não tem nenhum INBOUND e nenhum OUTBOUND `SENT/DELIVERED/READ`
  — só sobra FAILED/never-sent (a fantasma do +Nova que não saiu nada).
  - Critério seguro: conversa onde **toda** mensagem é OUTBOUND com status em `(FAILED)` **e** não há nenhuma
    INBOUND — nada de verdade aconteceu ali. (Não apagar conversa com qualquer msg recebida ou entregue.)
- Mantém tudo que já existe: respeita o **escopo visível** do usuário, ignora grupos e já-deletadas, roda em
  `$transaction`, solta FK de `atendimentoAppointment`, e **não dispara nada pro WhatsApp**
  (`whatsappCommandSent:false`). Só muda o `where` das candidatas + a guarda dupla no delete.
- Texto do log/UX: deixar explícito "faxina local — nada enviado/apagado no WhatsApp do cliente".

## Como o dono testa (vai pro testar.md quando estiver pronto)
- Entre no Atendimento → clique **+Nova** → comece a digitar o número → tem que aparecer sozinho o **+55** e
  o **( )** do DDD, e ele formatar bonitinho enquanto digita.
- No +Nova, ponha um **telefone fixo** (sem WhatsApp) → tem que **avisar que o número não tem WhatsApp** e
  **não criar** a conversa.
- No +Nova, ponha um celular **sem o 9** que tenha WhatsApp → tem que **criar normal** (não pode reclamar de
  dígito faltando).
- Crie uma conversa no +Nova que **não envie nada** (ou que dê erro no envio) → clique **Limpar** → essa
  conversa **some** da lista. (Conversas com mensagem recebida/entregue **continuam** lá.)

## Riscos / guardrails
- **Sem forçar 9 em lugar nenhum** — se aparecer regra de “adiciona 9”, está errado.
- Limpar **nunca** toca o WhatsApp do cliente — é só banco; não apagar conversa com histórico real.
- Checagem de existência **degrada** se o motor cair (não travar o +Nova por isso).
- Checks por bloco: front `cd frontend && npm run lint && npm run build`; back
  `cd backend && npm run prisma:validate && npm run build` + `node --test` dos arquivos tocados
  (`inbox.service.test.ts`).
- Não publicar sozinho (deploy live = ordem do dono). `inbox.service.ts` está com WIP do dono — combinar antes
  de editar.
