# Modo Foco GAME — fluxo passo a passo (telas)

Sequência fixa. A ordem importa: **escolher o foco vem ANTES do tablado**.

## Fase 0 — Botão de entrada
- "Ativar modo foco" no topo do funil do `/vendas`, **desktop** (`!isMobile`), ao
  lado do toggle de modo (Meu funil / Buscar empresas).
- **Gate:** só aparece com `canAtendimento === true`.
- Pílula de fogo limpa (ícone raio + texto). **Sem** bolota/disco no ícone.

## Fase 1 — Ritual de comprometimento
Modal central (veil escuro). É um *commitment device* + carrega os avisos legais.
- Título "Comprometer com o foco".
- Avisos (3): consome do plano · pesquisa fora do foco é arquivada (recuperável) ·
  máximo 10 leads por missão.
- Botões: **Comprometer** (fogo) / **Agora não** (sai).

## Fase 2 — Escolher o foco ("Qual o seu foco?")  ← NÃO PULAR
- Pergunta **estado/cidade** (ou **usar localização**) + **1 segmento** (só UM — não
  aceita vários).
- **Visão final:** isso DIRIGE o Radar pra buscar empresas NOVAS desse segmento+cidade
  (entra no `LeadsClient`/Radar com filtro travado) → enche a coluna "Pesquisa".
- **v1 mínimo aceitável:** listar os combos `segmento · cidade` que já existem na
  carteira (com contagem) e deixar escolher 1 — já mata a mistureba. Mas a meta é o
  radar-fresh.
- Escolher 1 → vira a **missão ativa** → Fase 3.
- "Nova missão" (da Fase 4) volta pra cá; a missão anterior fica **parada** (vira aba).

## Fase 3 — Queima cinematográfica
As distrações (KPIs/cards do funil misturado) **queimam** e o tablado do foco
**brota**. Detalhe em `03-efeitos-cinematograficos.md`. Efeito pesado SÓ aqui (entrada)
e na saída — nunca a cada card movido.

## Fase 4 — Tablado de foco
- 4 colunas: **Pesquisa · Análise · Atendimento · Fechamento**, coloridas.
- **SÓ os leads do foco ativo** (filtro `segment === foco.segment && city ===
  foco.city`), **cortado em 10**. Contador "X / 10".
- Abas de missão no topo (máx 2): clicar troca o foco ativo (re-filtra, **sem** re-queima).
  "Nova missão" → Fase 2 (parka a atual).
- Legenda: "Só esta missão na tela. As outras ficam paradas, nunca misturadas."
- Cards de Atendimento do foco: badge "realce de foco" (só no inbox nosso).
- Rodapé: painel do **Robô prospector** (ver `05-robo-prospector.md`).

## Fase 5 — Sair do foco
- "Sair do foco" → o tablado **queima de volta** (cinzas assentando) → tela normal do
  `/vendas` reaparece. A missão fica **arquivada (recuperável)**.

## Regra de filtro (a alma, em código)
```
focusLeads = leads
  .filter(l => l.segment === foco.segment && l.city === foco.city)
  .slice(0, 10);
// agrupar focusLeads por coluna da jornada. NUNCA usar a lista completa.
```
Mapa lead→coluna (da jornada): `novo→Pesquisa`, `contato→Análise`,
`inbox|retorno|qualificado→Atendimento`, `encerrado|fechado→Fechamento`.
