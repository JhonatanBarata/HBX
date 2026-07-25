# S4 — Aviso de conflito de horário

**Dor:** "a parada 37 chega ~10h35, mas este cliente recebe até 10h" — o aviso que o dono
desenhou e ainda não existe. Janela (`janelaInicio/janelaFim/janelaTipo`) e tempo de parada
(`tempoParadaMin`) JÁ estão gravados em `LogisticaRotaModeloParada`. Falta somar e comparar.
Vem DEPOIS da S2 de propósito: ETA só presta com a ordem real importada.

## Cálculo (v1 simples e honesto — sem rotear)

No service da agenda, função pura `calcularEtas(paradas, horaSaida, tempoDeslocamentoMin)`:

```
eta[0] = horaSaida + deslocamento
eta[i] = eta[i-1] + tempoParada[i-1] + deslocamento
```

- `horaSaida`: da config do dia se existir; senão default 08:00 (constante nomeada).
- `tempoDeslocamentoMin`: v1 = constante única por empresa (default 5 min). **NÃO** calcular
  distância/OSRM nessa sprint — é chute honesto e DECLARADO na tela ("estimativa simples").
- `tempoParadaMin` ausente → default 10 min (constante nomeada).
- Conflito: `eta > janelaFim` → `CONFLITO`; `eta` dentro dos últimos 15 min da janela →
  `APERTADO`. `janelaTipo=PREFERENCIAL` rebaixa CONFLITO→APERTADO (janela rígida é a que
  bloqueia de verdade).
- Parada sem janela = sem aviso (não inventar janela).

## Backend

- Incluir no retorno do `GET logistica/agenda/dias/:dia` (campo novo por parada:
  `eta: "10:35" | null`, `alertaJanela: "CONFLITO" | "APERTADO" | null`). Campo NOVO no DTO —
  aditivo, APK atual ignora sem quebrar.
- Função pura separada e testável (sem tocar em banco) — colocar perto dos helpers no fim do
  service ou em `logistica-agenda.util.ts` novo.
- Teste de unidade seguindo o padrão da casa (`node --test` sobre `dist/`):
  `backend/src/logistica/logistica-agenda-eta.test.ts` cobrindo: cadeia de soma, janela
  rígida × preferencial, sem janela, virada de hora, `tempoParadaMin` null.

## Front — aba Agenda

- Na linha da parada: hora estimada discreta + badge `CONFLITO` (token danger) / `APERTADO`
  (token warning). Tooltip/linha curta: "Chega ~10h35 · recebe até 10h".
- No cabeçalho do dia: contagem "N conflitos de horário" SÓ se N>0 (mesmo padrão do badge S3).
- Aviso INFORMA, nunca bloqueia: nada de impedir salvar/importar por causa de conflito.

## O que NÃO fazer

- NÃO usar OSRM/distância nessa sprint (fica pra v2 se o cliente pedir precisão).
- NÃO bloquear nenhuma ação por conflito.
- NÃO mostrar o aviso no APK ainda (site primeiro; APK exigiria rebuild — fora de escopo).

## Prova (gate da sprint)

1. `npm run build` + teste de unidade novo verde:
   `cd backend && npm run build && node --test dist/logistica/logistica-agenda-eta.test.js`.
2. Local: dia com 3 paradas, 2ª com janela até um horário que o ETA estoura → badge CONFLITO
   na parada certa e contagem no cabeçalho.
3. Reordenar o dia (S1/S2) → ETAs recalculam na resposta seguinte, sem cache velho.
4. Paradas sem janela → nenhum badge, ETA aparece normal.
