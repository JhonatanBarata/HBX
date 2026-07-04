# Arq. nº11 — Ingestão Externa de Leads — Sprint 3: costuras genéricas (multi-canal)

Data do plano: 01/07/2026 · Depende de: Sprints 1-2 · Regra de ouro: **só entra em produção junto com o 2º canal (Sprint 4)** — generalização sem segundo inquilino é custo sem retorno.

## Contexto
Hoje tudo é Meta-specific: tabela `MetaLeadConnection`, constante `PROVIDER`, mapeamento de campos
hardcoded, intake acoplado. O segundo canal (CTWA no Sprint 4; depois Google Lead Form e formulário do
Website-Kit) duplicaria o módulo inteiro. Os serviços de `integrations/` (cifra de segredo, ledger)
JÁ são genéricos — só a conexão e a entrega ficaram presas ao Meta.

## Desenho-alvo (3 andares)
Canais → **adapter fino por canal** → **núcleo de ingestão** (evento bruto + worker + reconciliação +
conexão genérica) → **entrega única** no CRM. Radar converge NA ENTREGA, não no núcleo — Radar é motor
de produção (busca/enriquece/qualidade/quota), não canal de webhook; forçá-lo pelo ledger seria encaixe errado.

## Escopo IN
1. **Tipo `NormalizedLead`**: name/phone/email/city/state/segment + sourceProvider, externalId,
   campaign metadata, connectionKey. Todo canal termina neste formato.
2. **`LeadDeliveryService.deliver(lead, policy)`** (módulo novo `backend/src/lead-intake/` ou dentro de
   vendas): resolve responsável (fixo da conexão → admin; round-robin fica atrás de config), chama
   `createOrUpdateLead` com sourceType certo, carimba origem/temperatura num write, timeline com metadata,
   sync inbox + notificação (código do Sprint 2 MOVE pra cá). `intakeAdvertisingLead` vira casca fina.
   **Radar**: `importWebscrapingLeadsForUser` passa a chamar o MESMO `deliver` no final — os gates de
   qualidade/quota continuam upstream como política do canal Radar (decisão modelada: lead pago pula gate,
   lead garimpado não).
3. **`IngestionConnection` genérica**: `provider`, `externalAccountId` (`@@unique([provider, externalAccountId])`),
   `displayName`, `credentialCiphertext/Preview`, `configJson` (responsável default, temperatura, score),
   `status`, saúde (`lastEventAt/lastLeadAt/lastError/consecutiveFailures`), `webhookSubscribedAt`.
   Migration copia `MetaLeadConnection` → `IngestionConnection` (provider `meta_lead_ads`; ciphertext copia
   como está — mesma chave do `IntegrationSecretsService`). Código lê a nova; tabela velha fica 1 release
   como rollback barato e morre depois.
4. **Interface `ChannelAdapter`**: `verifyRequest(req)`, `extractEvents(body)`,
   `complement(event, connection)` (ex.: fetch na Graph), `normalize(...) → NormalizedLead`.
   Adapter Meta reimplementado sobre a interface SEM mudança de comportamento.

## Escopo OUT
Canal novo de verdade (Sprint 4) · OAuth/embedded signup do Meta (fica no backlog — mata a fricção do
token colado à mão, mas exige app review; avaliar quando houver escala de clientes configurando sozinhos).

## Riscos e guardrails
- Regressão no fluxo Meta é o risco nº1: os testes dos Sprints 1-2 têm que passar IDÊNTICOS após o refactor.
- Migração de dados de conexão: rodar cópia + leitura dupla em staging local antes do VPS.
- Não mexer em regra de negócio do Radar — só o ponto final de entrega muda de função chamada.

## Checks
`cd backend && npm run typecheck` estrito + suíte completa dos módulos tocados + diff de comportamento
zero no import do Radar (mesmos cards criados num cenário de teste fixo).

## Critérios de aceite
1. Fluxo Meta 100% verde nos testes pré-existentes, agora passando por adapter + delivery.
2. Import do Radar cria exatamente os mesmos cards de antes (política upstream intacta).
3. Escrever um adapter fake de teste ("canal X") exige só 1 arquivo + 1 linha de registro.
