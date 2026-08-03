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

### 3.1 🔴 MONTAR AS 5 CAMPANHAS (é o que destrava tudo)

Uma campanha **por vendedora**, porque é `campaign.createdByUserId` que define de qual
chip a mensagem sai e qual nome assina.

Para cada uma das 5 (ids 59–63):

1. Entrar como ela (`{login}` / `{login}123`) em `https://www.hbxsystem.com.br`.
2. `/automacao` → **Prospecção** → **Disparo frio**.
3. Colar as **5 mensagens dela** (seção 4) em "Primeiro contato (frio)".
4. Colar o **roteiro** em "Passar pro gerente" e "E logo depois" (seção 4).
5. Segmento/região: **DDD 19** (Rio Claro e região).
6. Deixar **pausada**.

⚠️ O campo `preMessageVariants` manda um "oi" curto ANTES — por isso **nenhuma das 25
cumprimenta de novo**. Não adicionar saudação.

⚠️ O sistema recusa textos com **>85% de semelhança** entre si. As 25 já foram medidas
contra a régua real (`coldTextSimilarity`): pior par **48,1%**, todas ≤176 caracteres,
sem link, sem prova social inventada.

### 3.2 Resolver a colisão do telefone no roteiro

O roteiro diz *"o telefone dele é 19 997024884"* — que é **o próprio número do único
chip vivo hoje** (`company-5-user-6`). Campanha que dispare desse chip **não pode**
mandar o lead ligar pra ele mesmo.

- Campanhas das vendedoras (chip próprio): texto **como está**.
- Campanha que saia do …884: trocar a frase para *"meu gerente já vai te chamar por
  aqui"*, sem número. **Pendente de confirmação do dono.**

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

### Roteiro de passagem pro gerente (aprovado)

**Mensagem 1:**
> fico muito feliz que tenha interesse, vc não vai se arrepender! daqui pra frente meu gerente vai entrar em contato, o telefone dele é 19 997024884, nome dele é Jhonatan

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
