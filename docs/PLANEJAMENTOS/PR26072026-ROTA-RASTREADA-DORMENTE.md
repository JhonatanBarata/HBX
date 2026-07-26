# PR26072026 — ROTA RASTREADA DORMENTE (plano pra outro dia)

**Ordem do dono (26/07, literal):**
> "Logística Simples apenas para todo mundo. Rastreada existe, fica no backend ativando, e o front
> de empresas. Salve como um plano para outro dia, amanhã vou vender empresas de agua, esse rastreio
> apenas fará sentido em outros tipos de empresas (ou seja, manter a existencia quieta, mas na hora
> q ativar esse modo não vai ser o celular q vai mandar nisso, vai ser o administrador pelo pc)"

Esta ordem **REVERTE** a ordem anterior do mesmo dia ("todas vão ser rastreada". Alvo agora é o
oposto: todo mundo em Simples).

> ⚠️ **Para o worker do futuro:** a LEI DO DONO de 26/07 ("entregar LIGADO, flag OFF é o maior
> defeito") **NÃO se aplica aqui**. A própria lei abre a exceção — *"rollout gradual só se ELE
> pedir"* — e ele pediu, por escrito, que a Rastreada fique quieta. **Não "conserte" isto ligando a
> Rastreada pra todo mundo.**

---

## 1. Por que a Rastreada existe (e por que ela dorme)

São **dois produtos de logística**, não um com chavinha:

| | **Logística Simples** (`ESSENTIAL`) | **Logística Rastreada** (`TRACKED`) |
|---|---|---|
| O que o motorista faz | roda a rota, marca entrega | idem + sessão de GPS ao vivo obrigatória |
| Cobrança | 1 crédito por bloco iniciado de até 5 entregas únicas | 2 créditos **por entrega concluída** |
| Custo por 10 entregas | 2 créditos | 20 créditos (**10×**) |
| Se o GPS falhar | nada acontece | a entrega **não fecha** (`logistica-tracked-billing.service.ts:93-119`) |
| Quem é o dono da decisão | ninguém precisa decidir — é o default | administrador, no PC |

A Rastreada é **10× mais cara e mais frágil**. Ela só se justifica quando o rastreamento vira
**receita ou prova**, não conforto interno.

## 2. Para que tipo de cliente

**Água (o cliente de amanhã) = Simples.** Rota fixa, carteira conhecida, o cliente sabe que o galão
chega hoje, o motorista é o dono ou um funcionário de confiança, ticket baixo. Cobrar 10× por um
GPS que ninguém olha é **queimar margem** — o cliente não sente diferença e a conta de créditos
dobra sem explicação. Vender água com Rastreada ligada é a forma mais rápida de o cliente achar o
HBX caro.

**Onde a Rastreada faz sentido** (frota de terceiro / valor alto / prova):
- entrega terceirizada — motorista que não é da casa (o GPS é **fiscalização**, o cliente paga por confiança);
- carga de valor / farma / refrigerada — o rastro é **prova** em disputa e sinistro;
- SLA contratado com multa — o rastro é **defesa jurídica**;
- e-commerce / marketplace last-mile — o **destinatário final** exige acompanhar.

Regra de bolso pra venda: **"quem paga o rastreio é quem tem medo, ou quem cobra por ele."** Se o
dono da empresa não tem nem uma coisa nem outra, ele não compra Rastreada — ele reclama do preço.

## 3. 🔴 A pergunta que decide o preço (gancho comercial — decisão do dono)

> **Rastreio só se paga quando o CLIENTE FINAL enxerga.** Rastreio invisível é custo, não produto.

Do jeito que está hoje, o GPS **só sobe para o painel do admin da empresa**. Quem está em casa
esperando a água não vê nada. Isso deixa a Rastreada num lugar comercial ruim: **custa 10× e o único
benefício é vigiar o próprio funcionário** — uma empresa pequena não paga por isso, e uma grande
prefere ferramenta de frota dedicada.

A hora em que a Rastreada vira produto vendável é quando existir o **"sua água está chegando"**: link
público (ou WhatsApp) onde o cliente final acompanha o pino se mexer e recebe o ETA. Aí o argumento
de venda muda de *"eu vigio meu motorista"* (custo) para *"meu cliente me acha moderno e para de me
ligar perguntando onde está"* (receita, e o dono repassa no preço dele).

**Antes de investir 1 hora a mais na Rastreada, responder:**
1. O cliente final **vai ver** o rastreio? Se não → a Rastreada não sobe de preço, fica como
   fiscalização e o mercado dela é pequeno.
2. Se vai ver: entra no plano ou é **add-on cobrado à parte**? (o custo por entrega é real —
   2 créditos — então add-on é o desenho honesto.)
3. Quem responde pelo custo de crédito quando o GPS do motorista falha e a entrega não fecha?

Peças que já existem e encurtam esse caminho: o **aviso "estou chegando" a ~500 m** já está
implementado e é opt-in por empresa (`avisoChegandoEnabled` / `avisoChegandoTemplate`,
`logistica-config.service.ts`), e o **portal público por token opaco** (`/pedido/<token>`,
`pedidoPublicoToken`) já é o molde de link público sem vazar `companyId`. Ou seja: o "sua água está
chegando" **não começa do zero** — é casar essas duas peças com a sessão de tracking.

## 4. O que JÁ ESTÁ PRONTO no código (não refazer)

A Rastreada está **inteira e funcionando**, não é esqueleto:

- **3 gates, todos obrigatórios** — `effectiveRouteMode` (`logistica-config.service.ts`): flag
  global `HBX_LOGISTICA_TRACKING_ENABLED` + toggle do tenant `trackingAtivo` + preferência
  `modoRotaPadrao='TRACKED'`. Qualquer buraco cai em `ESSENTIAL`. Empresa nova nasce Simples pelo
  default do schema (`schema.prisma`: `trackingAtivo=false`, `modoRotaPadrao='ESSENTIAL'`).
- **Modo CONGELA na rota** — `LogisticaRoute.mode` é copiado no início e nunca mais muda; mudar a
  config não mexe em rota viva. Todo o código lê os dois modos sem `throw`.
- **Sessão de GPS + cobrança** — `logistica-tracking.service.ts`, `logistica-tracked-billing.service.ts`
  (2 créditos/entrega, reserva e devolução), `logistica-offline-tracked-billing.service.ts` +
  `logistica-offline-reservation-reconciler.service.ts` (cápsula offline e liberação do que não virou entrega).
- **Painel do admin no PC** — `frontend/src/app/(app)/logistica/config/page.client.tsx` (bloco
  "Modo das novas rotas"): toggle "Rastreamento permitido" + radio Essencial × Rastreada, visível
  **só para billing owner** (`billingOwner &&`), e o radio Rastreada fica `disabled` enquanto o
  toggle/flag global não estiverem ligados. **Este é o "administrador pelo PC" que o dono pediu — já existe.**
- **Backend fecha a porta pro celular** — `PATCH /logistica/config` é `@Admin()` + `RolesGuard`, e
  campos comerciais (Pix, módulos, cobrança…) exigem `isBillingOwnerActor`. O MODO da rota nem mora
  mais nesse endpoint: saiu pro `PATCH /logistica/config/modo-rota` em 26/07 (ver 5.3).

**Entregue em 26/07 junto com este plano:**
- APK: sumiu o modal "Modo das próximas rotas", a linha "Modo padrão" dos Ajustes e o handler que
  fazia `PATCH` do modo. **O celular não escolhe mais o modo comercial.**
- APK (2ª leva, mesma noite): saiu também a seção **"Operação"** dos Ajustes — as duas linhas
  só-leitura "Rastreamento: Disponível/Off" e "Modo da rota". Com a flag global ligada, a primeira
  dizia "Disponível" pra TODO entregador, anunciando um produto que a empresa dele não usa — o
  oposto de "manter a existência quieta". O cálculo `trackedAvailable` morreu junto;
  `routeTracked()` ficou (o hero da tela ainda diz em que modo a rota está rodando).
- Backend: desligar `trackingAtivo` agora **desarma** `modoRotaPadrao` junto (volta pra `ESSENTIAL`).
  Antes, `TRACKED` ficava armado no banco esperando alguém religar o toggle — foi assim que as
  companies 5 e 48 ficaram `TRACKED` em produção sem ninguém decidir isso.
- 3 testes de regressão em `logistica-config-route-modes.test.ts` travando "empresa nova nasce Simples".

## 5. O que FALTA pra ligar a Rastreada por empresa (quando for a hora)

Em ordem de custo:

1. **[baixo] Rótulo único.** O produto se chama "Logística Simples"/"Logística Rastreada" na boca do
   dono, mas a tela do admin ainda diz "Rota Essencial"/"Rota Rastreada" e o catálogo de créditos tem
   os nomes antigos. ⚠️ O catálogo (`credit-action-catalog.ts`) tem **outro dono** — combinar antes
   pra não escrever dois nomes diferentes pra mesma coisa.
2. **[baixo] Ligar por empresa = 2 cliques no PC.** Já funciona: toggle + radio em `/logistica/config`.
   Falta só uma linha de confirmação dizendo o **preço** ("2 créditos por entrega, ~10× a Simples")
   antes de gravar — hoje o admin liga sem ver a conta.
3. ~~**[médio] Fechar a porta dos fundos do celular por contrato, não por tela.**~~ **FEITO 26/07 —
   escolhida a saída (b), endpoint próprio.** `trackingAtivo` e `modoRotaPadrao` saíram do
   `UpdateLogisticaConfigDto` e viraram `PATCH /logistica/config/modo-rota`
   (`UpdateLogisticaRouteModeDto` + `LogisticaConfigService.updateRouteMode`, ainda ADMIN-only +
   billing owner). Por que (b) e não o gate por `User-Agent`: UA é string que o cliente escreve —
   forjável com um `curl`; endereço de endpoint + `whitelist`/`forbidNonWhitelisted` do
   ValidationPipe global é contrato de servidor. Resultado: **3 fechaduras** —
   (1) o payload do APK velho toma **400** no ValidationPipe antes de qualquer handler;
   (2) `updateConfig` recusa os dois campos com `ForbiddenException` (cinto-e-suspensório pra quem
   chamar o serviço direto); (3) a allowlist do `NativeApiClient.kt` casa segmentos EXATOS
   (`PATCH ["logistica","config"]`) — a rota nova tem 3 segmentos e **nenhum APK, novo ou velho,
   consegue chamá-la** pela ponte nativa. O painel do PC (`/logistica/config`) passou a bater no
   endereço novo e continua sendo o único caminho legítimo.
4. **[médio] Visão de master.** Hoje quem liga é o admin **da empresa**. Se a Rastreada virar item de
   plano/add-on vendido pelo HBX, quem deveria liberar é o **master** (`/master`), e o admin da
   empresa só escolheria dentro do que foi liberado. Isso é teto comercial, não existe hoje.
5. **[alto] O "sua água está chegando"** — a única coisa que transforma a Rastreada de custo em
   produto. Ver seção 3. Não começar por aqui sem responder as 3 perguntas.

## 6. Estado de produção em 26/07 (conferido ao vivo)

- `HBX_LOGISTICA_TRACKING_ENABLED=true` no container `hbx-backend` — a flag global **está LIGADA**.
- `LogisticaConfig`: 8 empresas. **Companies 5 (HBX) e 48 (jbinformatica1100)** com
  `trackingAtivo=true` + `modoRotaPadrao=TRACKED`. As outras 6 já em `ESSENTIAL`.
- Rotas ATIVAS: 1 `TRACKED` da company 5 (16/07, provavelmente esquecida aberta) e 5 `ESSENTIAL`
  (companies 41 e 48). O modo dessas rotas está congelado e **não muda** com o SQL abaixo.

**SQL de normalização (o dono roda — não foi executado):**

```sql
-- Todo mundo volta pra Logística Simples. Não toca em rota já iniciada
-- (LogisticaRoute.mode é congelado) nem em LogisticaEssentialCreditClaim.
UPDATE "LogisticaConfig"
   SET "trackingAtivo" = false,
       "modoRotaPadrao" = 'ESSENTIAL'
 WHERE "trackingAtivo" = true
    OR "modoRotaPadrao" <> 'ESSENTIAL';

-- conferência
SELECT "companyId", "trackingAtivo", "modoRotaPadrao" FROM "LogisticaConfig" ORDER BY 1;
```

Opcional (cinto e suspensório, **decisão do dono**): desligar também a flag global
`HBX_LOGISTICA_TRACKING_ENABLED=false` no `.env` da VPS. Efeito colateral: a rota `TRACKED` ATIVA da
company 5 deixa de aceitar sessão de rastreamento nova. Como ela é de 16/07 e está esquecida aberta,
o mais limpo é **encerrar aquela rota primeiro** e só então mexer na flag.

## 7. Linhas que ninguém cruza nesta frente

1. **Não apagar a Rastreada.** Ela dorme, não morre. Nada de deletar serviço, coluna ou modo.
2. **Não tocar em `LogisticaEssentialCreditClaim`** — histórico financeiro real de produção.
3. **Preço e catálogo de créditos têm outro dono** (`credit-action-catalog.ts`).
4. **Rota legada tem que ser lida nos dois modos, sempre sem `throw`.**
5. **O celular não decide modo comercial.** Se aparecer tela nova de modo no APK, está errado.
