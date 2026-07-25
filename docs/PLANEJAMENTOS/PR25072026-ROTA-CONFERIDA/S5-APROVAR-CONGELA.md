# S5 — Aprovar congela (a rota iniciada É a rota aprovada)

Pré-requisito: `01-CONTRATO-WORKER.md` + CONSTITUIÇÃO do APK. Depende de S4.
Arquivos: `EntregaShell/.../app.js` (principal), leitura de
`logistica-rota.service.ts` (NADA de mudança no backend salvo o item 3).

## O problema
`iniciarRota` re-planeja com o GPS atual como origem
(`logistica-rota.service.ts:193-199`) → a ordem que o usuário revisou pode
mudar CALADA no "Começar". O congelamento já existe de graça: `ordemManual`
pula o NN/2-opt e respeita a sequência ao pé da letra (linhas 85-92).

## O que fazer (APK)
1. Ao concluir a conferência (S4) — botão "Aprovar rota" — salvar a sequência
   aprovada (array de deliveryIds na ordem final) via mecanismo EXISTENTE
   `setRouteOrdemManual` (~usado em beginManagedRoute; investigar e reusar,
   inclusive persistência em cache local p/ sobreviver a fechar o app).
2. "Iniciar rota" passa a SEMPRE enviar essa sequência como `ordemManual`
   quando existe aprovação (os caminhos `startRoute`, `startPlannedRoute`,
   `resumeRouteOnDevice` — conferir cada um; startPlannedRoute já tem o desvio
   pra `/logistica/rota/iniciar` com ordemManual, generalizar).
3. **Drift de origem**: guardar a origem (lat/lng) usada no planejar aprovado;
   no Iniciar, se o GPS atual estiver a > 1 km dela (Haversine já existe no
   app — `distanceMeters`), popup: "Você está a X km do ponto de partida do
   planejamento. Manter a sequência aprovada ou recalcular?" — recalcular =
   replaneja + reabre conferência (S4); manter = inicia com ordemManual.
   Popup no padrão `state.confirmation` existente (ver "finish-route" ~L5872).
4. Flag: mesmo gate `rotaConferidaAtiva` da S4 (OFF → tudo como hoje).

## Explicitamente FORA
- Tabelas plan/version/snapshot — REJEITADAS no plano (00-PLANO.md, veredito).
- Mudanças no contrato do backend (ordemManual já cobre).

## Aceite
- Com flag ON: aprovar → iniciar reproduz a MESMA ordem (conferir manualmente
  no código o caminho de cada botão de iniciar; relatar a trilha).
- Com flag OFF: zero mudança de comportamento.
- Sem branch, sem commit, sem publish, sem teste ao vivo.
