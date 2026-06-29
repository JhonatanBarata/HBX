# Modo Foco GAME — backend, pendências e aceite

## Front × backend

### Front-first (v1 — sem backend novo)
- Botão de entrada (gate Atendimento, desktop).
- Ritual de comprometimento (avisos de plano/descarte/10).
- **Setup "Qual o seu foco?"** (1 segmento + 1 cidade). v1 mínimo: combos existentes da
  carteira; meta: dirigir o Radar.
- Queima cinematográfica (entrada) + cinzas (saída).
- Tablado de 4 etapas **filtrado pelo foco**, **cortado em 10**.
- Missões em **estado local** do componente (máx 2, single-active, parked).
- Robô = abre o disparador que já existe (sem auto-config ainda).

### Backend (depois — ordem sugerida)
1. **Radar-na-entrada**: travar `LeadsClient`/Radar no `segmento+cidade` do foco e puxar
   empresas NOVAS → enche a coluna "Pesquisa". (Reusar endpoints do Radar; sem rota
   nova se der.)
2. **Persistência de missões + arquivamento recuperável**: missão = `{segment, city,
   leadIds}`; sair/trocar arquiva; "recuperar ao sair" lista as missões arquivadas.
3. **Medição de consumo de plano + guardrail**: contar consumo da pesquisa do foco;
   **cache X horas / não recobrar** o mesmo `segmento+cidade` na janela.
4. **Robô v2** (auto-config + auto-prospector) — herdando disjuntor/backoff (ver
   `05-robo-prospector.md`).

## Regras duras (repetindo as que mais doem)
- **Filtrar SEMPRE pelo foco** (segment+city). Nunca "todos os leads → 4 colunas".
- **Teto de 10** real (`slice(0,10)` + contador "X / 10").
- **Setup vem antes do tablado.** "Nova missão" volta pro setup.
- **Desktop only.** Mobile (`VendasModoFoco` do dono) intocado.
- **Custom props de cor em `:root`** (botão fora do overlay enxerga).
- **Lint+typecheck VERDES.** Não restartar `:3001`.
- **WhatsApp**: realce só no inbox nosso, nunca no chip.

## Aceite
- `/vendas` desktop: "Ativar modo foco" → ritual → **escolher 1 foco** → queima →
  tablado **só com aquele segmento+cidade**, **≤10**, "X / 10" certo.
- **Zero mistureba**: nenhum card de outro segmento/cidade na tela do foco.
- "Nova missão" **viva**: abre o setup, parka a anterior (vira aba), troca sem misturar.
- Queima **lenta, aleatória, sobreposta**; sair queima de volta e volta a tela normal.
- Missão arquivada é **recuperável** ao sair (quando o backend de persistência existir).
- `npm run lint` + `tsc --noEmit` verdes; mobile do dono sem regressão.
- Verificação visual em Chrome `localhost:3001` (não no preview Claude).
