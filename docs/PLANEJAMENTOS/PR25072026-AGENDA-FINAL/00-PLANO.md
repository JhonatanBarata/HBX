# PR25072026-AGENDA-FINAL — Lapidação final da Agenda Semanal

**Contexto:** Agenda V2 publicada 25/07 (`f4dd9b08`, APK v31) e DORMINDO (`agendaV2Ativa=false`
nas 9 empresas). Freio do geocode publicado (`c218bcea`) + backfill em prod. Este plano fecha os
buracos conhecidos ANTES de o dono ligar a flag na empresa 41 (André).

**Executor:** modelo menor. Ler ANTES: `docs/Rules/BACKEND.md`, `docs/Rules/FRONTEND.md`.
Nunca criar branch — trabalhar direto na `master`, commit local, publicar só quando o dono mandar.

## Ordem das sprints (a ordem IMPORTA)

| # | Sprint | Por quê nessa ordem |
|---|--------|---------------------|
| S1 | [Reordenação em lote](S1-REORDENACAO-EM-LOTE.md) | S2 (importar 95 paradas) dispara exatamente o caminho dos ~190 UPDATEs. Freio de banco vem ANTES da feature que pisa nele. Pool-storm já derrubou prod em 23/07. |
| S2 | [Importar sequência pronta](S2-IMPORTAR-SEQUENCIA.md) | O furo mais caro: sem ele, ordenar o sábado do André (95 paradas) é parada a parada. Backend já aceita `planoIds[]`; falta preview + botão no site. |
| S3 | [Conferência de divergência](S3-CONFERENCIA-DIVERGENCIA.md) | Terça da empresa 41: 16 planos × 17 paradas. O sistema acerta ao não corrigir sozinho, mas hoje não AVISA. Reusa o preview da S2. |
| S4 | [Aviso de horário](S4-AVISO-DE-HORARIO.md) | Janela + tempo de parada já gravados; falta somar e comparar. Vem DEPOIS de S2 porque ETA só presta com ordem real — aviso sobre ordem-lixo queima a confiança no aviso. |

**CORTADO (decisão): "versão publicada" de verdade.** Hoje é só contador e FICA assim.
Complexidade sem dor comprovada; só reabrir se cliente editar rota no meio da semana virar
reclamação real.

## Leis anti-erro-grave (lição do geocode, valem pras 4 sprints)

1. **Dado inventado NUNCA vira verdade.** No matching da S2: cliente ambíguo (2 planos do mesmo
   cliente no dia, sem local que desempate) = NÃO casa, vira pendência visível. Nunca chutar.
   É a mesma lei do pino: *pino errado é pior que pino vazio*.
2. **Fail-closed com sobra visível.** Parada que não casou não some: vai pro FIM mantendo ordem
   relativa atual + aparece listada no preview como "fora da sequência".
3. **Preview obrigatório antes de gravar** (mesmo padrão do "Organizar agora"). Nenhuma escrita
   de ordem sem o usuário ver o antes/depois.
4. **Tudo aditivo.** Nenhuma coluna/tabela removida, nenhuma migration destrutiva. S1–S4 não
   precisam de migration nenhuma. Rollback = `git revert` do commit da sprint.
5. **A flag continua sendo o disjuntor.** `agendaV2Ativa` NUNCA é ligada em empresa real pelo
   executor — ligar é ação manual do dono, por empresa, com prévia. Teste em empresa de TESTE
   local (localhost:3001, credenciais em `.test-login.local.md`).
6. **APK intocado.** As 4 sprints são site + backend. Nada em `EntregaShell/` — sem rebuild de
   APK, sem risco novo no aparelho.

## Gate de cada sprint (sem exceção)

- `cd backend && npm run build` verde (é o typecheck estrito — o publish roda o mesmo).
- `cd frontend && npm run build` verde quando tocar no site.
- Prova na tela descrita no arquivo da sprint, executada em localhost:3001 (Chrome), ANTES do
  commit. Publicar sem abrir = entregar quebrado (incidente 22/07).
- 1 commit por sprint, mensagem `feat(agenda): S{n} — {resumo}`.

## Pós-publish (quando o dono mandar publicar)

Seguir [TESTES-POS-IMPLANTACAO.md](TESTES-POS-IMPLANTACAO.md) na ordem — comandos prontos,
todos read-only em prod.

## Estado do incidente de geolocalização (referência, NÃO é escopo daqui)

O BUG está morto e publicado (`c218bcea`, conferido no dist do container): freio
`escolherCandidatoConfiavel` (candidato sem prova = sem pino), fallback centro-de-cidade morto,
`realimentarCoordenadaPorta` irriga LOCAL + PERFIL. Backfill em prod com backup + rollback
(`backfill-pinos-20260725191612.json`). Rescaldo operacional que NÃO é erro: 824 pendências
"GPS" honestas (113 na rota do André) que se auto-corrigem a cada entrega confirmada ≤60 m.
Pendente só o olho do dono em campo.
