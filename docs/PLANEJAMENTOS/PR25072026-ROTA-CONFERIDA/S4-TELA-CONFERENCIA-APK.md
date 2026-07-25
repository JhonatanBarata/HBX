# S4 — Tela de pausa + resolver sem perder o cálculo (APK)

Pré-requisito: `01-CONTRATO-WORKER.md` + **CONSTITUIÇÃO do APK**
(`docs/PLANEJAMENTOS/PR21072026-APK-PADRAO/` — 10 Leis + catálogo; consultar
ANTES de desenhar). Depende de S2 (conectores) e S3 (endpoint conferir).
Arquivo alvo: `EntregaShell/app/src/logistica/assets/app/app.js`.

## Flag de rollout
- Nova coluna `rotaConferidaAtiva Boolean @default(false)` em `LogisticaConfig`
  — MESMO padrão da `agendaV2Ativa` (ver `logistica-agenda.service.ts` e a
  migration correspondente; migration ADITIVA, conferir estado de drift do
  schema antes: se `prisma migrate diff` acusar drift pré-existente, PARAR e
  reportar em vez de criar migration por cima).
- Flag OFF → comportamento atual intacto, byte a byte.

## Fluxo (flag ON)
1. Nos caminhos que hoje terminam em "Rota planejada/recalculada"
   (`startRoute` planOnly e `beginManagedRoute` dayMode "plan" — ver ~L5017 e
   ~L5104), após o planejar chamar `POST /logistica/rota/conferir` e abrir a
   **tela de conferência** em vez do toast seco.
2. Tela (1 tela, sem scroll horizontal, molduras do catálogo):
   - Topo: `18 paradas · 15 prontas · 2 corrigir · 1 aviso · 47 km · fim ~15:40`
     + selo do motor (S1).
   - Lista na ORDEM da rota com os conectores da S2; cada parada com o
     semáforo (tokens de estado existentes — mesmo vocabulário visual dos chips
     End/Dia de `clientPendingKeys`); vermelha mostra o(s) motivo(s) em
     linguagem humana (mapa `motivo → frase curta`, ex.: `pino_compartilhado` →
     "Mesmo pino de outro cliente").
3. **Resolver por cima (sem perder o cálculo):** tocar numa parada
   amarela/vermelha abre mini-ficha modal (reusar componentes existentes de
   cliente/local — investigar o que o app JÁ tem de edição com mapa e REUSAR;
   Lei do catálogo):
   - Ajustar o pino no mapa (se já existe componente de pino) ·
   - "Usar meu GPS daqui" ·
   - Corrigir endereço (campos atuais do cadastro) ·
   - Tirar desta rota (remove dos deliveryIds e replaneja) ·
   - "Deixar como pendência" (toque consciente — Lei 7).
   Salvou correção → re-chama conferir (cache OSRM 10min torna barato) e
   atualiza a tela; se a ORDEM mudou, aviso claro: "Fulano passou da parada 3
   para a 8."
4. **Vermelho NUNCA bloqueia** (decisão do dono): botão "Continuar mesmo assim"
   sempre presente; cada vermelha não resolvida exige 1 toque individual de
   ciência (checkbox por parada na própria lista — NUNCA "ignorar todas").
5. Sair da tela sem concluir → nada quebra: a rota planejada fica como hoje
   (rotaOrdem já gravado pelo planejar); a conferência é re-aberta ao voltar.

## Guard-rails
- Excluir = manter pressionado (lei do dono) — se houver remoção na lista.
- Zero som novo; zero texto inventado além do especificado (lei ui-copy).
- NENHUMA chamada de billing; conferir é dry-run (Lei 3).
- `handleBack` da tela segue a Lei do APK (voltar fecha modal antes de sair).

## Aceite
- Flag OFF → diff de comportamento = zero (conferir nem é chamado).
- Backend: `npm run build` + testes da flag (config service).
- Relatório: descrição da tela + fluxo de cada ação da mini-ficha + o que foi
  REUSADO do catálogo (obrigatório listar).
