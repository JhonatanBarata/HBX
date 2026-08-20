# PR19082026 — ACESSO E MÓDULO: UMA VERDADE SÓ

> **Origem:** 19/08/2026, ~21h. O dono, no **próprio tenant** (`jbinformatica@…`, company **51**,
> ADMIN user 66), tocou o cartão de um lead no HBX Vendas (APK 2.0.1) e levou
> *"Este módulo não está liberado para você. Fale com o administrador da sua empresa"*.
> **Ele É o administrador.** Foi abrir para liberar e descobriu que **não existe onde ligar**.
>
> Medido no aparelho (g15, ADB) + logs do VPS + banco de produção. Nenhum número aqui é estimado.

---

## 0. O QUE FOI COMBINADO E NÃO FOI CUMPRIDO

`PR18082026-PORTA-TRANCADA-MODULO-403.md` (18/08) mapeou esta doença inteira, com 3 leis, 7 lotes e
12 furos. **Foi commitado como DOCUMENTO e nada mais** — `53ceab4e docs(planejamento):` é doc-only.

| Prova | Hoje |
|---|---|
| `grep -r tenantHidden` (schema + backend + front) | **0 ocorrências** — a LEI 1 não existe em código |
| `SELECT count(*) FROM "CompanyModule" WHERE enabled=false AND "masterEnabled"=true` | **16** (era 16 em 18/08 — **não caiu 1**) |
| Empresas atingidas | 5 HBX · 40 Vander · 46 Andrea · 49 will · 50 Brenda (**6 módulos**) · 52 Jhonatan (**4**) · 53 Elisangela (**nasceu 18/08 22:35 já trancada**) |
| `MODULE_ACCESS_DENIED` em `frontend/src` | **0** |

A régua do plano anterior era **16 → 0**. Está em **16**. E a company **53** entrou na lista *depois*
do plano ter sido escrito — a máquina que produz o defeito segue ligada e produzindo.

**Este plano não substitui o PR18082026.** Ele o incorpora e acrescenta o que o incidente de hoje
provou que faltava: o plano de ontem tratava do **403 mudo**; hoje o defeito é pior — **o 403 fala,
manda falar com o administrador, e o administrador não tem botão nenhum para apertar.**

---

## 1. AS TRÊS PERGUNTAS DO DONO, RESPONDIDAS COM ENDEREÇO

### 1.1 "Como que o adm remove acesso dele mesmo?"

Pela tela `/equipe` → editar a própria pessoa. O app **avisa e deixa**:

> `frontend/src/components/hbx/team-policy-editor.tsx:374`
> *"Você está editando o próprio acesso — cuidado para não se bloquear."*

E o que acontece depois **depende de qual metade do painel ele encostou** — as duas metades parecem a
mesma coisa e se comportam de forma oposta:

| Metade do painel | Onde grava | Vale pra ADMIN? |
|---|---|---|
| **Módulos** (os chips ON/OFF) | `UserTeamPolicy.modulesJson` (`modules.service.ts:2650`) | **NÃO.** `resolveCargoModuleAllowed` devolve `true` para admin-tier antes de olhar o JSON (`modules.service.ts:2005`) — o chip salva, mostra "✓ Política salva" e **não muda nada** |
| **Acessos da pessoa** (a matriz) | mesma linha, chave `access` | **SIM.** `hasTeamAccess` (`team-access-catalog.ts:1219`) não tem bypass de admin — **é por aqui que o dono se tranca de verdade** |

Ou seja: **um interruptor mentiroso ao lado de um interruptor letal, na mesma caixa, com o mesmo
desenho.** E a própria tela já sabe que parte dos itens não é aplicada no servidor
(`missingBackendEnforcement`, `team-access-catalog.ts:1202`) — mas mostra todos iguais.

### 1.2 "Ele entrou sem o acesso!"

Entrou porque **nada no caminho de entrada pergunta por acesso**:

- **Login/pareamento não checam módulo.** O `JwtStrategy` valida usuário, sessão e aparelho
  (`backend/src/auth/jwt.strategy.ts`); módulo só é olhado no `ModuleAccessGuard`, que corre
  **por endpoint**, lá dentro. A porta da rua não sabe que o andar está trancado.
- **O OOBE nunca perguntou sobre esse módulo** (§1.3) e o app **pinta a tela primeiro e descobre
  depois** — no HBX Vendas o toque no lead chama `ir('conversas')`, a barra recusa e a ponte
  fabrica o erro na mão (`EntregaShell/app/src/vendas/ponte-src/50-conversas.js:342`).
- Medido hoje no g15: **zero requisições** saíram do aparelho no toque recusado (nginx
  `access.log`, 00:07–00:11 UTC). O bloqueio é do lado de cá, e a frase manda falar com quem já é
  ele mesmo.

### 1.3 "Não tenho como ativar esse módulo"

**Correto — não tem, e não é opinião: `conversas` não pertence a nenhuma categoria da tela do tenant.**

```
backend/src/modules/module-categories.ts:19-25
MODULE_CATEGORY_MAP = {
  radar:     ['webscraping'],
  vendas:    ['vendas'],
  whatsapp:  ['atendimento', 'bot'],   ← conversas NÃO está aqui
  logistica: ['logistica'],
  website:   ['website'],
}
```

A tela `/configuracoes → Módulos` (`frontend/src/app/(app)/configuracoes/page.client.tsx:504`) desenha
**5 interruptores** — os 5 da foto do dono, todos ON. `conversas`, `email`, `comex`, `concierge` e
`cadastro` **não têm interruptor em tela nenhuma do tenant**.

E quem desligou `conversas` **não foi a empresa**: foi a plataforma, no nascimento do tenant —
`seedConversasOptOutTx` grava `{ enabled: false }` em **toda empresa nova**
(`backend/src/master-provisioning/tenant-provisioning.pipeline.ts:152-163`), chamado pelas 3 portas de
nascimento (`auth.service.ts:685`, `companies.service.ts:553`).

**Resultado: um módulo que nasce OFF por decisão da plataforma, escrito na coluna do tenant, sem
interruptor no tenant — e cuja tela de erro manda o tenant resolver.** É um beco fechado dos dois lados.

### 1.4 E no /master a frase é FALSA

`frontend/src/app/(app)/master/janela-empresas.tsx:1281-1284` escreve o selo **"empresa desligou"**
sempre que `masterEnabled=true && enabled=false`. Para `conversas` isso é mentira em **100% dos casos
medidos**: as 16 linhas trancadas têm `masterEnabled=true` e **nenhuma** foi escrita pelo master — e as
de `conversas` foram escritas pelo *seed da própria HBX*.

Pior: o botão ao lado mostra **ON** (ele reflete o **teto**, `masterEnabled`), e clicar nele chama
`alternarModulo(key, !m.enabled)` → **desliga**. Para consertar de verdade é preciso **clicar OFF e
depois ON** (só o "ligar" força `enabled: true` — `modules.service.ts:4152-4155`). Foi exatamente essa
dança que o dono fez hoje às 21:23–21:25 (`CompanyModule.updatedAt` de company 51: `concierge`
00:23:54, `email` 00:23:58, `conversas` **00:25:46** UTC).

---

## 2. A DOENÇA EM UMA FRASE (a mesma de ontem, agora com o outro lado visível)

**Uma coluna (`CompanyModule.enabled`) tem QUATRO escritores com intenções diferentes e NENHUM dono de
tela responsável por ela.**

| Escritor | Intenção real | Tem tela pra desfazer? |
|---|---|---|
| `seedConversasOptOutTx` | decisão de **plataforma** ("nasce OFF") | **não** |
| OOBE / `/configuracoes` (categorias) | **gosto** do tenant | só para 6 das 12 chaves |
| Cobrança (7 × `updateMany`, PR18082026 §3) | **direito** comercial | não |
| `setCompanyModuleByMaster` | **teto** da HBX | sim, mas com o rótulo e o clique errados (§1.4) |

E o leitor final colapsa tudo em `masterEnabled && enabled` (`effectiveCompanyModuleEnabled`), então
**a causa morre antes de chegar na tela** — é por isso que a mesma linha de banco vira três frases
diferentes: *"empresa desligou"* (/master), *"fora do plano da empresa"* (/equipe),
*"não está liberado para você — fale com o administrador"* (APK).

---

## 3. AS LEIS (1-3 vêm do PR18082026 e continuam valendo; 4-7 são deste incidente)

- **LEI 1 — Preferência nunca tranca API.** Coluna `tenantHidden` (só esconde); `enabled` = direito
  comercial; `masterEnabled` = teto. *(PR18082026 §4)*
- **LEI 2 — Nenhuma negação é anônima.** `evaluateModuleAccess() → {allowed, scope, code, userMessage,
  remedy:{by, where, action}}`. *(PR18082026 §4)*
- **LEI 3 — Portão que torna erro mudo impossível.** *(PR18082026 §4)*
- **LEI 4 — CHAVE SEM TELA NÃO EXISTE.** Todo `SystemModule.companyAssignable=true` precisa aparecer em
  **exatamente uma** tela com dono declarado. Módulo governado pela plataforma (`conversas`) mostra
  quem desligou e **como pedir**; módulo do tenant mostra o interruptor. Portão: teste que compara o
  catálogo de módulos com a união (`MODULE_CATEGORY_MAP` ∪ tela-da-plataforma) e **reprova** quem
  sobrar. Hoje sobram **5**.
- **LEI 5 — NINGUÉM SE AUTO-TRANCA.** O servidor recusa `PATCH /team/policy/:id` que remova, do
  **próprio** ator, qualquer chave da lista `SELF_LOCKOUT_GUARDED` (entrar, /equipe, /configuracoes,
  módulos). Aviso em texto não é freio. Regra no **backend**, não na tela.
- **LEI 6 — TOGGLE MOSTRA O QUE ELE MUDA.** Botão que escreve `masterEnabled` não pode ser lido como
  estado efetivo. Três estados explícitos (`ON` · `teto ON, empresa OFF` · `teto OFF`) e o clique de
  reparo em **um** gesto ("Forçar ligado para esta empresa").
- **LEI 7 — QUEM ENTRA JÁ SABE.** Login e pareamento respondem o mapa de acesso junto com o crachá
  (`userMessage` + `remedy`), e a primeira tela do app diz o que está trancado **antes** do primeiro
  toque perdido.

---

## 4. LOTES

| # | Lote | Conteúdo | Salva quem | Dep. |
|---|---|---|---|---|
| **L0** | **Parar de produzir vítima** | `seedConversasOptOutTx` deixa de escrever `enabled=false`; passa a `tenantHidden=true` (ou a lista de opt-out da plataforma). Empresa nova **nunca mais** nasce com API trancada. | todo tenant novo (53 foi o último) | — |
| **L1** | Migration `tenantHidden` + backfill nominal | Exatamente o backfill do PR18082026 §5 (só `defaultEnabled=true` fora de plano; chave de plano **deleta a linha**, não liga) | as 7 empresas / 16 linhas | GO §5 |
| **L2** | `evaluateModuleAccess` + causa/remédio + log `warn` com `companyId` | LEI 2 | todos, inclusive APK velho | L1 |
| **L3** | **LEI 4** — inventário de chave órfã + tela da plataforma | as 5 chaves sem tela ganham lugar; portão `check-modulo-sem-tela.mjs` | o dono e todo admin | L2 |
| **L4** | **LEI 5** — guarda de auto-bloqueio no backend + separar "Módulos" (inerte p/ admin) de "Acessos" (letal) no painel | o dono | — |
| **L5** | **LEI 6** — /master: 3 estados, selo honesto ("HBX desligou" × "empresa desligou" × "plano não cobre") e reparo em 1 clique | o master (hoje faz OFF→ON às cegas) | L1 |
| **L6** | **LEI 7** — `userMessage` no `/mobile/devices/session` + primeira tela do app com o mapa | parque instalado | L2 |
| **L7** | Escopar os **7 `updateMany`** de cobrança a `PLAN_MANAGED_MODULE_KEYS` + teste de downgrade | **quem paga** | — |
| **L8** | Portões A/B/C/D do PR18082026 §4 no `gate.js` e no `deploy-vps.js` + `docs/Rules/PAGAMENTOS.md:14` reescrito | o futuro | L1–L7 |

> **L0 e L7 não dependem de decisão nenhuma e são os que sangram agora** — um cria vítima nova a cada
> cadastro, o outro tranca justamente quem paga.

---

## 5. DECISÕES QUE SÃO DO DONO (travam L1 e L3)

1. **`conversas` nasce ligado ou desligado?** Se a plataforma quer opt-out, ele vira `tenantHidden`
   (aparece, explica, pede) — nunca `enabled=false`.
2. **`logistica` entra em plano comercial?** (herdada do PR18082026 §7 — segue sem resposta e sem ela
   `enabled` da logística não tem dono).
3. **Quem religa o que a plataforma desligou:** o próprio admin no `/configuracoes`, ou só a HBX pelo
   `/master`? A LEI 4 exige que **uma** das duas telas assuma — hoje nenhuma assume.
4. **Backfill das 16 linhas:** aplicar agora (as 7 empresas voltam a ter API) ou empresa por empresa?

---

## 6. RÉGUA DE PRONTO

1. `SELECT count(*) FROM "CompanyModule" WHERE enabled=false AND "masterEnabled"=true` → **16 → 0**;
2. chaves `companyAssignable` sem tela → **5 → 0** (portão da LEI 4 reprova regressão);
3. `PATCH /team/policy/<eu-mesmo>` removendo chave de entrada → **400 com motivo**, hoje **200**;
4. empresa nova criada em bancada → **nenhuma** linha `enabled=false` no nascimento;
5. 403 de módulo respondido ao APK e ao web **com `cause` + `remedy.where`** → hoje `0` no front;
6. no `/master`, o par (selo, botão) descreve o mesmo estado — teste de tela que reprova
   "empresa desligou" quando o escritor foi a HBX.

---

---

## 7. APOSENTAR O "VC — ALTERADOR DE VOZ" (ordem do dono, 19/08)

Sai do catálogo. Medido antes de propor:

| Fato | Valor |
|---|---|
| Linhas em produção | **1** (company 5, a própria HBX) — nenhum cliente |
| `defaultEnabled` | `false` — nasce desligado desde sempre |
| Mecanismo de aposentadoria | **já existe**: `retiredModuleKeys` (`bootstrap/structural-defaults.json:189`) apaga `CompanyModule` + `SystemModule` no boot (`modules.service.ts:1846`) |
| Raio de alcance | **4 arquivos**: entrada JSON (`:157-164`), categoria `structural` (`modules.service.ts:1668`), popover do Atendimento (`atendimento/page.client.tsx:812,1615`), lib `frontend/src/lib/voice-fx.ts` |

**Lote (L9):** remover a entrada do JSON, acrescentar `"vc"` em `retiredModuleKeys`, apagar
`voice-fx.ts` e o popover, tirar a linha de categoria. Sem migration — a rotina de boot faz a limpeza.
O `/master` cai de **17 para 16** linhas.

---

# PARTE II — UMA LÍNGUA SÓ

## 8. A PROVA: MESMA EMPRESA, MESMO INSTANTE, TRÊS LÍNGUAS

As três fotos do dono são a **mesma company 52** vista por três telas:

| Chave no banco | `/master` (17 linhas) | `/equipe` (12 chips) | `/configurações` (5 chaves) |
|---|---|---|---|
| `webscraping` | **Radar Digital** | **Radar** | **Radar de empresas** |
| `cadastro` | **Cadastros** | **Clientes** | — |
| `vendas` | Vendas | Vendas | **Vendas e Agenda** |
| `atendimento` + `bot` | 2 linhas separadas | 2 chips separados | 1 só: **WhatsApp e IA** |
| `conversas` | Conversas | Conversas | **não existe** |
| `empresas`,`contatos`,`produtos` | 3 linhas | — | — |
| `concierge`,`comex`,`email` | 3 linhas | 2 chips | — |
| `vc` | 1 linha | — | — |

**Três contagens diferentes do mesmo catálogo: 17 · 12 · 5.** E o apelido não mora no catálogo — está
**escrito na mão dentro de um componente de tela**:

```
frontend/src/components/hbx/team-policy-editor.tsx:120-125
if (k === "webscraping") return "Radar";
if (k === "cadastro")    return "Clientes";
```

Três telas, três divisões, três vocabulários de estado (todas dizem só **ON/OFF**, para três coisas
que **não são a mesma coisa**). É por isso que a mesma linha de banco vira três frases contraditórias.

---

## 9. COMO O MERCADO ORGANIZA ISSO

A literatura de SaaS é convergente: **não são camadas de opinião, são camadas com donos diferentes.**

| Camada | Pergunta que responde | Quem escreve | Muda quando |
|---|---|---|---|
| **Catálogo** (product/feature registry) | "o que existe?" | produto | lança/aposenta funcionalidade |
| **Direito / entitlement** | "esta EMPRESA comprou?" | contrato e cobrança | assina, troca de plano, vence |
| **Permissão / RBAC** | "esta PESSOA pode?" | admin da empresa | contrata/demite/promove |
| **Preferência / visibilidade** | "queremos ver isto?" | a própria empresa | gosto, a qualquer hora |
| *(Feature flag)* | "já liberamos o código?" | engenharia | rollout — **nunca** vira venda |

O erro clássico — e é exatamente o nosso — é **um sistema só servindo duas dessas camadas**:
*"o erro arquitetural mais comum em produtos SaaS é construir um sistema único que serve feature
flags e entitlements ao mesmo tempo"*. E a divisão canônica é: **entitlements são da CONTA
(o que a empresa comprou); permissões são do USUÁRIO (o que a pessoa faz)** — nunca a mesma coluna.

O padrão de tela que os grandes usam é o mesmo desenho, com três nomes:
**Microsoft 365** (SKU → licença por pessoa → função de admin), **Google Workspace** (serviço ON/OFF
por unidade organizacional, separado das funções de administrador), **Salesforce** (licença da org →
permission set da pessoa), **Atlassian** (*product access* = quem tem assento, separado de
*permission scheme* = o que faz lá dentro). Em todos: **a venda mora numa tela, a pessoa mora em
outra, e as duas usam o mesmo nome para a mesma coisa.**

Do lado da linguagem, a prática é **vocabulário controlado** (governança de design system): uma lista
definitiva que documenta como cada produto, funcionalidade e serviço é chamado — *"Settings" ou
"Preferences"?* — construída escolhendo **um termo preferido** e listando os **variantes proibidos**,
com a regra dura de **evitar homônimo** (a mesma palavra significando duas coisas). É literalmente o
remédio para "Radar Digital / Radar / Radar de empresas".

**Fontes:**
[The Entitlements Layer (Schematic)](https://schematichq.com/blog/the-entitlements-layer-how-saas-products-control-customer-access) ·
[Entitlement Management System for SaaS](https://schematichq.com/blog/entitlement-management-system) ·
[Rethinking SaaS Entitlement Management with Feature Flags (QCon SF)](https://qconsf.com/presentation/oct2023/rethinking-saas-entitlement-management-feature-flags) ·
[Developer's guide to SaaS multi-tenant architecture (WorkOS)](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) ·
[Designing design systems: names, terms and definitions (Adobe)](https://adobe.design/stories/design-for-scale/designing-design-systems-a-framework-for-names-terms-and-definitions) ·
[Naming tokens in design systems (EightShapes)](https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676) ·
[Guide to content strategy for design systems](https://www.designsystems.com/guide-to-content-strategy-in-design-systems/)

---

## 10. A GRADE DA HBX — UMA PERGUNTA POR TELA

| Tela | Pergunta única | Camada | Vocabulário de estado |
|---|---|---|---|
| `/master` | **"a HBX vendeu para esta empresa?"** | direito (teto) | **Contratado · Fora do plano · Bloqueado pela HBX** |
| `/equipe` | **"quem, aqui dentro, usa?"** | permissão | **Liberado · Bloqueado · Fora do plano da empresa** |
| `/configurações` | **"o que queremos ver na tela?"** | preferência | **Aparecendo · Escondido** |

Regras que caem daí, e que fecham o buraco da Parte I:
1. `/configurações` **nunca** nega API (LEI 1) — logo pode listar **todas** as áreas sem risco.
2. `/equipe` **não repete** o que a empresa comprou: mostra "fora do plano" como **estado morto**, sem
   interruptor (e sem chip mentiroso para ADMIN — §1.1).
3. `/master` é a **única** tela com poder de conceder; e diz **quem** desligou, nunca "empresa
   desligou" no que a HBX escreveu (LEI 6).

---

## 11. O DICIONÁRIO ÚNICO (fonte: o catálogo, não a tela)

Cada chave passa a ter **1 nome público · 1 área · 1 descrição de uma linha · 1 tela dona**. Proposta
(os nomes finais são decisão do dono, §13):

| Área (a MESMA divisão nas 3 telas) | Chaves | Nome público proposto |
|---|---|---|
| **Radar** | `webscraping` | Radar |
| **Vendas** | `vendas` | Vendas |
| **WhatsApp e IA** | `atendimento`, `conversas`, `bot`, `concierge` | Atendimento · Conversas · Bot IA · Concierge IA |
| **Logística** | `logistica` | Logística |
| **Cadastros** | `cadastro`, `empresas`, `contatos`, `produtos` | Clientes · Empresas · Contatos · Produtos |
| **Site e E-mail** | `website`, `email` | Website · E-mail |
| **Comex** | `comex` | Comex |
| **Administração** *(eixo de cargo, não de venda)* | `financeiro`, `gerencial` | Financeiro · Gerencial |

**As 5 regras da língua:**
1. **Um termo, um significado.** Sinônimo em tela (`Radar Digital`/`Radar`/`Radar de empresas`) é
   **bug**, não estilo.
2. **Nome não nasce em componente.** `moduleLabel()` morre; o nome público vem do catálogo, servido
   pelo `/modules/me` junto com `area` e `descricao`.
3. **A divisão é uma só.** As áreas acima valem para `/master`, `/equipe` e `/configurações` — a foto 3
   deixa de ser um agrupamento próprio e passa a ser a **mesma** grade, só que com menos poder.
4. **Nome público é palavra do negócio**, jargão interno (`webscraping`, `cadastro`) nunca aparece.
5. **Cada camada fala o estado dela** (§10) — "ON/OFF" some das três telas.

**Portão `check-dicionario.mjs`** (padrão `check-pele.mjs`): reprova (i) chave `companyAssignable`
sem `area`/nome público, (ii) string de nome de módulo escrita à mão em `frontend/src` ou
`EntregaShell/`, (iii) área que existe numa tela e não existe na outra. Nasce em zero e só desce.

---

## 12. LOTES DA PARTE II

| # | Lote | Conteúdo | Dep. |
|---|---|---|---|
| **N0** | **Dicionário** | `area` + `publicName` + `shortDescription` no catálogo (`structural-defaults.json` + `SystemModule`), servidos no `/modules/me` | — |
| **N1** | **Matar os apelidos** | `moduleLabel()` fora; as 3 telas leem o dicionário | N0 |
| **N2** | **Mesma divisão** | `/configurações` passa a desenhar as áreas do dicionário (deixa de ter mapa próprio); `MODULE_CATEGORY_MAP` vira **derivado** da área, não uma segunda verdade | N0, L3 |
| **N3** | **Vocabulário de estado** | os 3 pares de rótulos do §10 substituem ON/OFF nas 3 telas | N0, L5 |
| **N4** | **Portão** `check-dicionario.mjs` no `gate.js` e no `deploy-vps.js` | congela o resultado | N1–N3 |
| **N5** | **Glossário escrito** | `docs/Rules/` ganha a página do vocabulário (termo preferido × variantes proibidas) — é o que o próximo agente lê antes de inventar o quarto nome | N0 |

> **N2 é o lote que mata a raiz da Parte I:** hoje `MODULE_CATEGORY_MAP` é uma **segunda** verdade
> sobre quais módulos existem — e foi ela que deixou `conversas`, `email`, `comex` e `concierge` sem
> interruptor em tela nenhuma.

---

## 13. DECISÕES DO DONO (Parte II)

1. **`cadastro` chama-se "Cadastros" ou "Clientes"?** (hoje é os dois, em duas telas).
2. **`cadastro` + `empresas` + `contatos` + `produtos` são 4 módulos ou 1 área "Cadastros" com 4
   telas?** São 4 chaves vendáveis hoje; a foto 3 já não mostra nenhuma delas.
3. **`conversas` fica separado de `atendimento`** ou os dois viram um módulo só "WhatsApp"?
   (é a mesma infra de mensageria — a descrição do catálogo já diz isso).
4. **Nomes finais da grade do §11** — o dicionário só congela depois desta lista.

---

*Medido em 19/08/2026 no g15 (ADB, APK 2.0.1 build 20), no `access.log` do VPS e no `hbx_prod`
(catálogo de 22 chaves, 17 `companyAssignable`). O tenant 51 foi consertado à mão pelo dono às 21:25 —
a mecânica que o quebrou continua de pé.*
