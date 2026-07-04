# GATEWAY-WA — Sprint 1: Telemetria do disjuntor + /health de frota

## Por quê ($)
O disjuntor é o freio que matou a máquina de ban, mas ele trabalha às cegas para todo mundo:
as 4 tentativas e a abertura do circuito são só `logger.warn` no journal do VPS. Quando o
circuito abre, o chip do cliente fica mudo até alguém reclamar. Visibilidade aqui é o seguro
mais barato do sistema — detecta padrão de ban ANTES do ban.

## Contexto verificado
- `whatsapp.baileys.service.ts:493-515` — tentativas e abertura do circuito só logam.
- Tabela `Instance` do motor guarda apenas o ÚLTIMO estado (`connectionStatus`,
  `disconnectionAt`, `disconnectionReasonCode`, `disconnectionObject`).
- O backend JÁ tem reconciler ao vivo (`whatsapp-modal.service.ts` PR4-F3) e
  `getCompanyLiveHealth` — o painel de status por empresa NÃO é o gap. O gap é HISTÓRICO e FROTA.

## Entrega
1. **Motor**: tabela `ConnectionEvent` no `webwhats_prod` (migração Prisma do Webwhats):
   `instanceName`, `event` (`open` | `close` | `reconnect_attempt` | `circuit_open` | `suspended_duplicate`),
   `statusCode`, `attempt`, `createdAt`. Gravar nos pontos que hoje só logam
   (connection.update do Baileys + número-único do boot). Best-effort: falha de INSERT
   NUNCA pode afetar o fluxo de conexão (try/catch engolindo, log warn).
2. **Motor**: endpoint `GET /health/fleet` (apikey): por instância — estado vivo do socket
   (mesma fonte do `connectionState`), circuito aberto?, tentativas atuais, últimos N eventos.
3. **Backend**: serviço fino que consome `/health/fleet` com cache curto (10–30s) e expõe
   endpoint admin/owner. Integrar onde o dono decidir exibir (Ops Control / HBX Owner) —
   entregar o endpoint pronto + card simples; refinamento visual fica fora deste sprint.
4. **Retenção**: purge de `ConnectionEvent` > 30 dias (job simples no motor).

## Fora de escopo
- Qualquer mudança na LÓGICA de reconexão (disjuntor intocável).
- Alertas ativos (WhatsApp/e-mail pro dono) — só depois que o dado existir.

## Critérios de aceite
- Derrubar a rede de um número DESCARTÁVEL: painel/endpoint mostra `reconnect_attempt` 1..4,
  depois `circuit_open`, sem nenhuma intervenção no motor.
- `cd Webwhats && npm run typecheck` verde; boot local ok; INSERT falhando (simular tabela
  ausente) não impede conexão.
- Nenhuma alteração de comportamento em `connectToWhatsapp`/`connectionUpdate` além dos INSERTs.

## Riscos
- Migração no banco do motor roda no VPS via deploy padrão — conferir que `db:deploy` do
  Webwhats está no fluxo do publish antes de mergear (se não estiver, avisar o dono, não inventar).
