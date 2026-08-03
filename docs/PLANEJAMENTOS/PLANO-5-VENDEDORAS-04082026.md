# PLANO — 5 vendedoras no ar (escrito 03/08/2026, para executar em 04/08)

Quem pegar isto executa **sem re-decidir nada**. As decisões já foram tomadas pelo dono
e estão na seção 1. O que falta está na seção 3, em ordem, com o passo exato.

> **Contrato desta frente:** acionar o que o HBX já tem e ENSINAR o HBX a fazer o que a
> IA faria — nunca fazer por fora. **NUNCA mandar mensagem para lead sem perguntar ao
> dono no chat.** A fila de aprovação é a conversa com ele; **não construir fila de
> aprovação no sistema** (decisão dele, revisitar depois).

---

## 0. O QUE FALTOU — a dívida desta sessão

**As 5 campanhas NÃO foram montadas.** Foi prometido três vezes e não entregue; a
sessão gastou o tempo em análise e em consertos laterais (todos reais e publicados,
seção 2), mas o item que faz o disparo acontecer **não saiu**. É o item nº1 da seção 3.

Existe hoje **1 campanha só** na empresa 5: `cmr0pn32g00h332nrdsdxa2ij`, dono `6`
(Jhonatan), `paused`, com copy. Nenhuma campanha das vendedoras existe.

---

## 1. DECISÕES JÁ TOMADAS (não reabrir)

| tema | decisão do dono |
|---|---|
| Copy dos 25 primeiros contatos | **APROVADA** ("1ok") — textos na seção 4 |
| Roteiro de passagem pro gerente | **APROVADO** ("2ok") — texto na seção 4 |
| Nomes das 5 | Bianca · Maria Clara · Flávia · Letícia · Ana Júlia (ids 59–63) |
| Senhas | `{login}123` (ex.: `mariaclara` / `mariaclara123`) |
| DDD dos chips | **19** (a base é Rio Claro e região; 11 fica pra quando abrir SP) |
| Teto do …884 | **10/dia**, espalhados 08:00–18:00 |
| Teto de chip novo | **3/dia**, sobe +1 por conversa que responde, teto 10 |
| Comissão | 20% — **assunto congelado pelo dono**, tratar quando chegar lá |
| Fila de aprovação no sistema | **NÃO construir** |
| Persona | puxa o nome da **pessoa logada**, não o da empresa |

**Correção importante do dono (03/08), que invalida análise anterior:** o bloqueio do
…884 em 30/07 veio das **tentativas repetidas de conexão** do chip (a fábrica de
re-links), **não dos disparos**. Não usar aquele episódio como prova de que "disparo
bana chip". Não existe número documentado de "X mensagens = ban" — quem afirmar isso
precisa mostrar a fonte.

---

## 2. O QUE JÁ ESTÁ EM PRODUÇÃO (publicado e conferido)

| o quê | prova |
|---|---|
| Aviso de rota desfeita quando **admin === motorista** | 7 testes; revertendo o fix, 2 reprovam |
| Roteiro de passagem pro gerente (**mecanismo**, desarmado) | 10 testes; listas vazias = nada muda |
| Persona por pessoa (cada chip assina com o nome dela) | 6 testes; `assinaturaDaPessoa` |
| Sessão revogada não trava mais a tela | provado na tela: vai pro login com aviso |
| `/relatorios`: vendedora não vê "Liberar bot p/ todos"; lote não mente sucesso | provado na tela, logado como Bianca |
| **Teto por chip que se conquista** (3 → 10) + espaçamento 08:00–18:00 | 14 testes; …884 mede 60+ conversas com resposta |

**Nomes de exibição das 5 já preenchidos** no banco (estavam vazios; sem isso a persona
cairia de volta em "Jhonatan").

---

## 3. O QUE FALTA — em ordem

### 3.0 🔴 O QUE O PLANO NÃO SABIA (medido em 04/08, com código na mão)

O passo 3.1 original era **impossível de executar** por dois motivos, e o terceiro
muda o entendimento da frente inteira:

1. **Vendedora não configura disparo.** `assertCanManageProspecting`
   (`vendas-automation.service.ts`) recusa quem não é ADMIN/USERMASTER/master. As 5
   são `USER` no banco → entrar como elas e salvar dá **403**.
2. **Só existia UMA campanha por empresa.** `latestCampaign` era
   `findFirst({ where: { companyId } })`, e os dois caminhos de escrita fazem
   *update-or-create* em cima dela. As 5 escreveriam na mesma linha: a última
   sobrescreveria as outras e todas disparariam pelo chip do dono.
3. **A campanha não é mais quem dispara.** `startProspectingForUser` e
   `resumeProspectingForUser` começam com `refuseAutomaticProspectingCreation()` —
   prospecção automática por campanha foi **aposentada em 25/07** por ordem do dono.
   Quem envia hoje é a **cadência por lead** (o "robozinho", `cadencia.service.ts`).
   A campanha sobreviveu como **DEPÓSITO DE TEXTO**: é de
   `VendasAutomationCampaign.filtersJson` que `reservarCopyDeAberturaAgendada` tira a
   variante de abertura de cada disparo agendado.

Então "montar as 5 campanhas" **não** é armar 5 motores — é dar a cada vendedora o
**bolo de texto dela**, e fazer o motor vivo respeitar de quem é o lead.

### 3.1 ✅ CAMPANHA POR PESSOA (feito em 04/08 — falta publicar)

Decisão do dono: **campanha por pessoa, mas só o dono configura** (as vendedoras não
mexem em disparo; o 5º muro fica de pé). O que mudou:

| onde | o quê |
|---|---|
| `vendas-automation.service.ts` | `latestCampaign(companyId, ownerUserId)` + `resolveCampaignOwnerId` — a campanha passa a ser achada pela DONA |
| idem | `GET /vendas/automation/prospecting/campanhas` — a lista da equipe, com quem ainda não tem campanha |
| idem | `buildAutomationUser` assina com `assinaturaDaPessoa` (era a persona da empresa) |
| `cadencia.service.ts` | o envio leva `senderUserId = insc.responsavelId` → **sai pelo chip de quem é o lead** |
| idem | `renderCorpoWhats` assina com o nome da dona do lead |
| `vendas.service.ts` | `reservarCopyDeAberturaAgendada(companyId, responsavelId)` → cada uma sorteia do bolo DELA |
| `bot-prospeccao-panel.tsx` | seletor **"Campanha de …"** na barra (só dono/gerente vê) |

Provas: 14 testes novos (`campanha-por-pessoa.test.ts` 11/11 + 3 em
`cadencia.service.test.ts`), typecheck limpo nos dois lados.

**Montar as 5 (depois do publish):**

```bash
docker exec hbx-backend node scripts/criar-campanhas-vendedoras.js --apply
```

Dry-run sem `--apply`. É idempotente (quem já tem campanha é pulada, nada é
sobrescrito) e nasce **pausada e sem triagem** — não dispara sozinha.

> ⚠️ **ORDEM OBRIGATÓRIA:** o script só pode rodar **depois** do publish do código
> acima. Com o código velho, seis campanhas na empresa 5 fariam o app pegar "a mais
> recente" — a tela do dono abriria a campanha de uma vendedora qualquer e a reserva
> de copy sortearia texto de outra pessoa.

⚠️ **A pré-mensagem não existe no motor vivo.** O "oi" curto do `preMessageVariants` é
do caminho de campanha (aposentado); a cadência manda a abertura direto. Ou seja: **as
25 chegam sem saudação nenhuma**. Decisão de copy pendente se isso incomodar.

⚠️ O sistema recusa textos com **>85% de semelhança** entre si. As 25 já foram medidas
contra a régua real (`coldTextSimilarity`): pior par **48,1%**, todas ≤176 caracteres,
sem link, sem prova social inventada.

### 3.2 ✅ Telefone no roteiro — RESOLVIDO (dono, 04/08)

> *"não, avisa o lead QUE O GERENTE VAI LIGAR, não é para fazer o interessado ligar"*

O número saiu de **todas** as mensagens. Texto novo na seção 4.

### 3.3 Chips (o dono compra e pareia — a IA não pareia chip)

- **DDD 19**, eSIM.
- Ativar **um por dia**, não os cinco de uma vez — registro em lote é o padrão que a
  Meta declara analisar no momento do cadastro.
- **Dados móveis** alternando, não os cinco no mesmo Wi-Fi.
- Um Android só dá conta: guarda vários eSIM (ativa 1 por vez, só pra receber o SMS) e
  roda 5 WhatsApp por caminhos oficiais — 2 no WhatsApp, 2 no Business, mais um perfil
  de trabalho (Island/Shelter) ou Secure Folder. **Nunca GB/FM WhatsApp** (app
  modificado é o único caminho com ban documentado).
- **Cada chip conecta UMA vez e fica.** Parear/desparear em série foi a causa real do
  bloqueio de 30/07.
- Manter as 5 linhas ativas na operadora mesmo sem uso (linha reciclada = conta perdida).

### 3.4 Fotos

Plano completo em `PLANO-FOTOS-VENDEDORAS.md`. Resumo: **são duas fotos.** A do HBX
(`User.avatarUrl`, porta pronta `PATCH /profile/avatar`) e a do WhatsApp (perfil do
chip, entra pelo aparelho na mesma sentada do pareamento). O HBX **não** empurra foto
pro WhatsApp.

### 3.5 ⬜ Encaminhamento interno — PEDIDO DO DONO, NÃO CONSTRUÍDO

Ele pediu: quando o lead demonstra interesse, a vendedora encaminha **dentro do HBX**
— *"Oi Jhonatan, cliente X está interessado"* no módulo **Conversas** (chat
empresarial), levando junto o contato do cliente pra ele puxar o lead.

**Nada disso foi construído.** Levantamento feito: o módulo Conversas existe; a comissão
hoje segue `assignedUserId` (`hbx-commission-sync.service.ts:842, 924, 1027`), então
puxar o lead transfere a comissão junto — mas **o dono congelou o assunto comissão**,
então construir só o encaminhamento e não mexer em dinheiro sem ordem dele.

---

## 4. A COPY APROVADA

### Roteiro de passagem pro gerente (aprovado; telefone removido em 04/08)

**Mensagem 1:**
> fico muito feliz que tenha interesse, vc não vai se arrepender! daqui pra frente meu gerente vai entrar em contato, o nome dele é Jhonatan — ele vai te ligar

*(a versão anterior mandava o lead ligar pro 19 997024884 — que é o número do chip do
próprio dono. Ordem dele em 04/08: quem liga é o gerente.)*

**Mensagem 2** (sai sozinha ~8s depois, pela fila durável):
> se tiver alguma dúvida, qualquer coisa só chamar!

### As 25 mensagens de primeiro contato

**1 · Bianca — entrega / rota**
1. Vi que vocês entregam água aqui na região. A gente montou um sistema que organiza a rota do entregador e avisa o cliente. Faz sentido pra vocês ou já usam alguma coisa?
2. Trabalho com um sistema que monta a rota das entregas do dia sozinho, na ordem certa. Separei algumas distribuidoras pra mostrar sem custo. Vocês controlam a entrega como hoje?
3. Uma dúvida rápida: o entregador de vocês sai com a lista no papel? A gente resolve isso pelo celular dele, e dá pra testar de graça antes.
4. Ajudo distribuidoras a saber onde o entregador está e quanto falta pra fechar o dia. Tô abrindo algumas vagas de teste por aqui. Interessa dar uma olhada?
5. O que mais escuto de distribuidora é entrega que se perde no meio do dia. Montamos algo bem simples pra isso, roda no celular. Como vocês fazem hoje?

**2 · Maria Clara — pedido pelo WhatsApp**
1. Vocês atendem pedido pelo WhatsApp? Tenho um sistema que anota sozinho e já joga na rota do dia. Escolhi algumas distribuidoras da região pra testar sem pagar nada.
2. Deve tocar bastante o WhatsApp de vocês, né? A gente junta esses pedidos num lugar só, sem perder nenhum. Posso te contar como funciona?
3. Tô falando com algumas distribuidoras que vendem só pelo WhatsApp. O sistema anota o pedido e o endereço sem ninguém digitar. Teriam interesse em experimentar?
4. Pergunta simples: quantos pedidos somem por dia porque ninguém viu a mensagem a tempo? É isso que a gente resolve, e o teste não custa nada.
5. Trabalho com distribuidoras de água e gás organizando o atendimento do WhatsApp. Separei algumas da região pra liberar o teste. Vocês topam dar uma olhada?

**3 · Flávia — fiado / quem pagou**
1. Vocês controlam no caderno quem tá devendo? Tenho um sistema que mostra isso na hora, cliente por cliente. Separei algumas distribuidoras pra liberar o teste.
2. O que mais dói em distribuidora é saber quem pagou e quem ficou devendo. Isso fica numa tela só aqui. Faz sentido eu te explicar?
3. Tem um jeito de acabar com a planilha de fiado: o entregador marca no celular e você vê na hora. Vocês usam planilha hoje?
4. Fechar o caixa do dia leva quanto tempo aí? Com a gente sai num toque, e dá pra experimentar antes sem custo nenhum.
5. Ajudo distribuidoras a parar de perder dinheiro com venda fiado esquecida. É bem prático de usar. Queria saber como vocês controlam isso hoje.

**4 · Letícia — cliente que sumiu**
1. Vocês conseguem saber qual cliente parou de comprar? A gente avisa antes de você perder ele. Tô liberando teste pra algumas distribuidoras daqui.
2. Cliente que some é o que mais custa em distribuidora. Nosso sistema mostra quem tá atrasado no galão e chama sozinho. Vocês acompanham isso hoje?
3. Uma pergunta: vocês sabem quem não pede há duas semanas? Isso aqui entrega pronto, e dá pra experimentar de graça.
4. Escolhi algumas distribuidoras da região pra mostrar uma coisa: o sistema lembra o cliente de pedir de novo, no dia certo. Interessa ver?
5. Trabalho ajudando distribuidora a segurar cliente que ia sumir. Nada complicado, roda no celular mesmo. Como vocês fazem essa parte hoje?

**5 · Ana Júlia — organizar tudo**
1. A gente organiza venda, entrega e atendimento da distribuidora num sistema só. Separei algumas empresas daqui pra liberar sem custo. Vocês olhariam?
2. Tô com algumas vagas de teste pra distribuidoras da região. É um sistema que junta pedido, rota e cobrança no mesmo lugar. Faz sentido pra vocês?
3. Vocês usam algum sistema hoje ou é tudo no caderno e no WhatsApp mesmo? Pergunto porque é exatamente essa bagunça que a gente arruma.
4. Ajudo distribuidoras de água e gás a tirar o dia a dia do papel. É simples e o teste não custa nada. Posso te explicar em duas linhas?
5. Queria entender como vocês tocam a distribuidora hoje. Trabalho com um sistema feito pra esse ramo e liberei teste pra algumas empresas daqui.

---

## 5. ARMADILHAS MEDIDAS HOJE (não repetir)

- **🔴 Publish de outra sessão varre a árvore.** Aconteceu **3×** em 03/08: trabalho não
  commitado foi para o master e para produção sem revisão. **Commitar em lote pequeno,
  imediatamente**, e `git add` por arquivo — nunca `-A`. Antes de qualquer
  `git checkout`, conferir se o arquivo já foi varrido pra dentro do HEAD.
- **🔴 30 testes vermelhos** em `vendas-automation.service.test.ts` e
  `agenda-disparo.service.test.ts` — **pré-existentes**, provado: com o
  `wa-cold-contact-gate` restaurado à versão anterior e o módulo novo removido, o build
  limpo dá **as mesmas 30 falhas**. Incluem `processDueJob`, que é o caminho que **manda
  o primeiro contato**. **Precisam de dono antes do disparo.**
- **Build quebrado deixa `dist` mentindo.** Um `tsc` que falha no meio deixa artefato
  velho; medir teste em cima disso dá conclusão errada. `rm -rf dist` antes de medir.
- **A extensão do Chrome enxerga um navegador só.** Com 5 contas em 5 perfis, confirmar
  em qual está logado antes de agir (`/profile/current-user`).
- **Não afirmar número de ban sem fonte.** Já custou uma bronca justa.

---

## 6. AMBIENTE

- Produção: `https://www.hbxsystem.com.br` · API `https://api.hbxsystem.com.br` (sem `/api`).
- Empresa **5** ("HBX"). Dono: user **6**, `jhonatan@hbxsystem.com.br`.
- Vendedoras: **59** Bianca · **60** Maria Clara · **61** Flávia · **62** Letícia · **63** Ana Júlia.
- Único chip vivo: `company-5-user-6` = **5519997024884**. Os outros dois estão `disconnected`.
- Acesso ao VPS autorizado sempre (ler e injetar): `node scripts/vps-run.js "<comando>"`.
