# PR04082026 — MODO CADERNETA (Loghbx / vertical água)

GO do dono 04/08/2026. Cliente-motivo: **André (company 41)** — mas o modo é produto da vertical
(degrau 1 do funil: caderneta → mapa se constrói sozinho → rota destrava). Domínio: APK
(`EntregaShell/`), ler `hbxapk.md` antes de tocar.

## 1. Contexto e prova (medido em prod 04/08)

| Empresa 41 | Número |
|---|---|
| Clientes | 251 |
| Pino provado (`gps_entrega`) | 4 |
| Pino geocode (empilhado — incidente pino compartilhado 25/07) | 130 |
| Sem pino | 117 |
| Entregas canceladas | 610 (+236 limpas hoje) |
| Entregas concluídas | 4 |
| Clientes com produto/recorrência | 244 |

Diagnóstico: ele **abandonou a ROTA, não o app** — a rota mandava pro lugar errado porque o mapa
não existia. Rastro nginx 04/08 21:02: ele estava DENTRO do app buscando clientes e **salvando
cadastro sozinho** (6 PATCHes na ficha "Larissa Ypê"). `cobrancaSimples=true` → ele já usa a
`deliverySimpleSheet` ("Entregue e pagou"/"Entregue, ficou devendo") — a caderneta JÁ é a tela dele.

Já feito em prod 04/08 (fora deste plano): 4 toggles WhatsApp da 41 desligados
(aviso/chegando/cobrança/resumo) + 236 entregas presas canceladas (conta limpa).

## 2. Decisões CRAVADAS pelo dono (04/08)

1. **MESMAS TELAS do fluxo GPS** — nenhuma tela nova. A folha de chegada existente (3 níveis por
   config) é a folha da venda; o cliente se familiariza e "depois é só o GPS".
2. **Ativação em Ajustes do APK**, padrão Modo Passeio (`settings-row`+`module-switch`, admin).
   Default OFF na plataforma; **empresa 41 entra LIGADA** (lei entregar-ligado).
3. **GPS TRANCADO enquanto a base não está pronta**: com o modo ON, "Iniciar rota" tranca e no
   lugar aparece o medidor. Libera **por dia da semana** quando **todos os clientes daquele dia**
   têm pino provado; **/master ganha liberação manual** (cliente sumido não tranca o GPS pra sempre).
4. **Registrar venda NUNCA debita crédito** — débito continua exclusivo do "Iniciar rota" (lei
   existente: quem debita é o Confirmar rota).
5. **Zero WhatsApp neste fluxo além dos toggles** (na 41 está tudo OFF).

## 3. Desenho

- **Chave**: `LogisticaConfig.modoCaderneta Boolean @default(false)` — migration aditiva.
- **Tela Rota com o modo ON** (mesma tela): lista dos clientes do DIA (roster da agenda —
  `planOccursOn`/`totalClientesDia` já existem) como stop-cards normais; **topo = medidor
  "Mapa: X de N"** (X = clientes do dia com `geoFonte` em `GEOFONTES_PROVADAS`); rodapé = card
  Fechamento do dia. A palavra "pino" é PROIBIDA em tela (Lei 8) — o medidor fala "Mapa".
- **Toque no cliente** (lista do dia OU tela Clientes) → **"Vendeu"** → a MESMA folha de chegada
  por config (41 = simples) → confirmar → `POST /logistica/caderneta/vender`.
- **Endpoint vender**: transacional, cria a Entrega de hoje já entregue + confirma REUSANDO as
  funções do confirmar existente (cobrança, comprovante, `realimentarCoordenada*`). GPS do
  aparelho vai junto (lat/lng/accuracy) **calado**; ≤60m → pino de ouro (máquina existente).
  Sem débito. Sem aviso "você não está no local" (não há parada/rota).
- **Número da casa**: campo opcional na própria folha SÓ quando o cadastro não tem `numero`;
  pulável — **a venda nunca trava em cadastro**.
- **Fechamento**: `GET /logistica/caderneta/fechamento?date=` → total do dia + quebra por forma
  (dinheiro/pix/cartão/fiado), lendo `receiptMethod`/charges do dia. Card na tela do dia.
  Mensal/quem-deve: reusa o financeiro existente (se faltar moradia no APK, vira fase 2 declarada).
- **Liberação do GPS**: selo "Mapa pronto ✓" no dia completo → botão "Iniciar rota" volta
  (e aí o fluxo GPS é o de sempre, mesmas telas). /master: liberação manual por empresa.

## 4. Fatias

- **K0** — chave + migration + toggle em Ajustes (dormente na plataforma).
- **K1** — tela do dia (roster + stop-cards) + medidor + tranca do Iniciar.
- **K2** — "Vendeu" → folha → endpoint vender (GPS calado + cobrança) + número opcional.
- **K3** — fechamento do dia (card + formas).
- **K4** — liberação ("Mapa pronto" por dia + manual no /master) + ligar a 41.

## 5. Execução (regras da casa — hbxapk.md §1 e §6)

- Backend PRIMEIRO (`npm run publish`), depois app.js + **allowlist `NativeApiClient.kt`** +
  rebuild — os TRÊS ou nada.
- Commitar ANTES de publicar (publish destrói árvore suja). Stage cirúrgico (tree quente do dono).
- Teste no g15 com **empresa de teste** (dado real do André não é cobaia); prova final = aviso de
  atualização aparecendo SOZINHO no aparelho (1×/versionCode) e a tela exposta pro dono olhar.
- Reconciliador: efeitos opt-in, guard de reentrância no confirmar (padrão `accept-confirmation`);
  tela/estado novo entra no `handleBack`; tokens de `app.css`, zero hex.

## 6. O que NÃO fazer

Não re-geocodar a base (foi o veneno original) · não exigir cadastro pra vender · não puxar o
André pro tenant do dono · não prometer "chegou → abre sozinho" agora (moradia: fase pós-pinos,
o geofence nativo já existe na rota).

## 7. Régua de sucesso

André registra vendas por 1 semana; medidor sobe visível; primeiro dia da semana atinge "Mapa
pronto"; a primeira rota nova dele roda só com pino de ouro — primeira experiência de GPS
pós-trauma é boa por construção.
