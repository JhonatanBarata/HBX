# PLAN — Verificação da cadeia Radar → Preferência do vendedor → Push/Pop-up → Card enriquecido

> **Tipo:** VERIFICAÇÃO (auditoria de "prova de vida"), **não** implementação.
> Só vira fix depois que a verificação apontar qual elo está morto. Não alargar escopo sem o dono.
> Aberto em 21/06/2026, no teste do dono como vendedor (empresa "gabrielo", chip conectado).

## Por que esse plano existe (o gatilho)
Achamos um bug em que o vendedor **não conseguia puxar card nenhum** da vitrine
(`send-to-vendas` → 404), porque `assertRadarLeadVisibleForUser` exigia que o card **já**
estivesse atribuído ao vendedor. Os fluxos automáticos contornavam isso passando um
**`importAsAdmin` fake** — ou seja, o caminho do vendedor real nunca rodou, mas "parecia vivo".

**A preocupação do dono (correta):** se um elo crítico estava em *teatro* (código presente,
elo morto, mascarado por um atalho de admin), então **a cadeia que combinamos** —
"o sistema lê a preferência do vendedor → dispara aviso push → manda card enriquecido →
mostra pop-up chamativo" — **pode estar igual: viva na aparência, sem o elo real.**
Essa cadeia *só faz sentido se o backend estiver lendo a preferência do vendedor de verdade.*

## Cadeia esperada (o que combinamos que acontece)
1. Vendedor registra **preferência** (segmento / canal / região / standing order).
2. Backend **lê essa preferência do vendedor** (não a da empresa, não a do admin).
3. Quando entra card novo que **casa** com a preferência → o sistema **seleciona/distribui** pra ele.
4. Dispara **aviso push** + **pop-up chamativo** no sistema.
5. O card chega **enriquecido** (não mascarado/cru) e o vendedor **consegue puxar** (já corrigido em 21/06).

## Verificar elo por elo (prova de vida, não "existe o código")
Critério geral: **provar que roda com um USER VENDEDOR real** (não admin, não importAsAdmin),
**lendo a preferência DO VENDEDOR** (id do vendedor), e **produzindo efeito observável**.

### Elo A — Leitura da preferência do vendedor
- Pontos de entrada: `getPreferenceSuggestionsForUser`, `resolveRadarPreferenceSegments`,
  `getRadarSellerStandingOrder` / `saveRadarSellerStandingOrder`,
  `getTeamPolicyRequiredRadarChannels`, `applyTeamPolicyRadarFilters`
  (em `backend/src/webscraping/radar/**`).
- **Provar:** a preferência é resolvida pelo `userId` do vendedor (e não cai em default/empresa
  quando o user é seller). Conferir o que acontece quando o vendedor NÃO setou preferência
  (silencia? usa ramo da empresa? — decidir se é o esperado).

### Elo B — Match + seleção/distribuição automática
- Pontos: `RadarAutoDistributionRule` (`getRadarAutoDistributionRuleForUser`,
  `saveRadarAutoDistributionRuleForUser`, `runRadarAutoDistributionForUser`),
  `distributeRadarLeadsToVendedoresForUser`, e os usos de `importRadarLeadToVendasForUser`
  com **`importAsAdmin`** (`radar-core-delivery.mixin.ts` ~2010; `radar-core-distribution.mixin.ts`
  ~907/1503; `radar-vendas-sync.service.ts` ~201).
- **Provar:** a distribuição entrega o card **atribuído ao vendedor certo** (assignedUserId = vendedor)
  e que o uso de `importAsAdmin` é só mecanismo interno — não está **mascarando** uma regra de
  acesso que, pro vendedor, falharia (foi exatamente o sintoma do bug do Puxar).
- **Quem dispara?** Confirmar se existe gatilho automático real (cron/worker/Night Factory) chamando
  esse fluxo, ou se hoje só roda sob ação manual. Sem gatilho = cadeia parada na origem.

### Elo C — Aviso push + pop-up chamativo
- **Localizar o mecanismo** (ainda não mapeado): há `MasterNotice` / `MasterNoticeAck`
  (`ensureMasterNoticeTables`) — verificar se é esse o canal do "aviso", ou se há web-push /
  notificação in-app / toast/modal no front.
- Front: procurar componente de pop-up/toast/modal de "card novo" (provável em `frontend/src/app/(app)/leads/**`
  ou shell/layout) e **o que ele consome** (qual endpoint/polling).
- **Provar:** com card que casa a preferência, o vendedor **recebe** o aviso e o pop-up **aparece**
  de fato (não só existe o componente). Conferir se o gatilho do pop-up depende de algum dado que,
  pro vendedor, vem vazio (ex.: `leadIntelligence`/selos — herpes conhecido: front /vendas não lia
  `leadIntelligence`, corrigido 20/06; checar se o mesmo padrão afeta o pop-up do radar).

### Elo D — Card chega enriquecido
- Pontos: `ensureRadarRowsEnriched`, `canUseRadarSmartLeadFields`, `buildRadarLeadPublic`
  (campos smart só quando `includeSmartFields`), `buildCompactVendasEnrichmentJson`.
- **Provar:** o card entregue/notificado ao vendedor traz os campos enriquecidos (pitch, dor,
  score, canais) — e não a versão mascarada da vitrine.

## Resultado esperado da verificação
Para cada elo: **VIVO** (com a prova) ou **MORTO/TEATRO** (com o ponto exato da quebra).
Cada elo morto vira um item de fix **separado** (não consertar dentro deste plano).
Conexão direta: o Puxar (corrigido 21/06) é o **Elo final**; sem ele os Elos B–D não tinham saída.

## Fora de escopo agora
Não implementar push/distribuição nova. Não refatorar preferências. Só **auditar e reportar**.
Quando virar tarefa de teste do dono, traduzir pro `testar.md` em linguagem leiga.
