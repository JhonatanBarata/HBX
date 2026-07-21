# S1 — Menu "Montar Rota" com 4 opções + Por dia vertical + Rota Manual com wizard

**Dono deste arquivo:** 1 subagente. Arquivos que VOCÊ pode editar:
`EntregaShell/app/src/logistica/assets/app/app.js` e
`EntregaShell/app/src/main/assets/app/app.css`. **Mais nenhum.**

## Regras de convivência (há OUTRO agente trabalhando no app agora)
- **NÃO rodar teste, build, `npm run *`, gradle, ADB.** Só editar código.
- **NÃO rodar git** (nada de add/commit/stash/checkout/revert). O tree tem edições de
  terceiros — se algo em volta parecer estranho, **deixe como está**.
- Edite por `Edit` cirúrgico. Nunca reescreva o arquivo inteiro.

## Constituição (obrigatória)
Leia `C:\Users\Jhonatan\.claude\projects\C--Users-Jhonatan-Desktop-App\memory\androidapk.md`
ANTES de escrever a primeira linha. As 10 Leis valem: molduras (Lei 3), tokens sem hex
novo (Lei 2), transições (Lei 9), `handleBack` (Lei 10), estados de carregando/vazio
(Lei 7), copy mínima (Lei 8), excluir = segurar (Lei 1).

---

## S1.1 — Menu Play com 4 opções

`dayHomeModal()` (app.js ~2490) hoje tem 2 botões. Passa a ter 4, **nesta ordem**:

1. **Rotas Salvas** — ação `day-entry-saved` (já existe) · glifo ☆ · sub = contagem atual.
2. **Por dia** — ação `day-entry-pordia` (já existe) · icon `route`.
3. **Criar Rota Manual** — ação NOVA `day-entry-manual` → abre o wizard do S1.3.
4. **Iniciar Leitura de Rota** — ação NOVA `day-entry-leitura` → dispara o mesmo fluxo
   do `leitura-iniciar` de hoje (app.js ~3591) e fecha o menu.

- Manter a moldura `.day-home` (cartão central, Lei 3). 4 botões têm que caber **sem
  scroll** no moto g15 — ajuste o grid/padding em `app.css` por token; se apertar,
  reduza o `<span>` descritivo, nunca invente texto novo (Lei 8).
- **Tirar os 2 botões da tela Rota**: em `leituraBanner()` (app.js ~1670), o bloco
  `.lrt-start-actions` (que hoje mostra "Iniciar Leitura de Rota" + "Criar rota manual")
  **sai**. O banner de sessão ATIVA (`state.leitura` existente) permanece — só o estado
  "sem sessão" deixa de renderizar botões.
- `openDayManager` já entra em `dayOrderStep = "home"`: nada a mudar lá.

## S1.2 — "Por dia" na VERTICAL, com quantidade por dia

Hoje: `.rp2-days` renderiza seg→dom como chips horizontais (app.js ~2266, dentro do
render de `state.modal === "manage-day"`).

Vira **lista vertical**, uma linha por dia (use `row-card`/`settings-row` — componente que
já existe, não crie moldura nova):
`[ Seg ]  ……  12 clientes` — multi-seleção **mantida** (tocar liga/desliga, `aria-pressed`,
estado ativo pelo token `--brand`, Lei 2b).

Fonte da contagem: **`/logistica/dia-preview?date=…`**, o MESMO endpoint que a prévia já
consome em `refreshDayPreview` (app.js ~918). Ao abrir o menu, dispare as chamadas dos dias
de `workDays()` em paralelo e guarde em `state.dayCounts = { [isoDay]: n }`.
- Cache por sessão do modal (não refazer a cada render/toque).
- Enquanto carrega: skeleton/`loading()` na contagem, **não** trave o toque no dia (Lei 7).
- Falhou uma: aquela linha fica sem número (não mostrar erro por dia, não quebrar a lista).
- Dia com 0 cliente: mostrar "0" e deixar selecionável (o dono decide).

O resto do fluxo (busca, prévia, "Próximo ›", ordem, "Gerar agora") **não muda**.

## S1.3 — "Criar Rota Manual" vira wizard PRÓPRIO

Problema de hoje: `leitura-iniciar-manual` (app.js ~3602) abre uma sessão `MANUAL` e a
tela Rota passa a exibir a faixa "Rota manual em andamento" — com o rótulo errado
**"Cancelar leitura"** (`leituraBanner`, app.js ~1676). Não é isso: o dono quer uma
**tela dele, um passo a passo do Manual**, sem nada na frente da tela Rota.

Vira wizard em **cartão central** via `centerModal()` (componente pronto, setas ‹›), com
3 passos. **Reuse as telas que já existem** — é reempacotamento, não tela nova:

1. **Paradas** — busca de cliente + adicionar (o mesmo picker de
   `leitura-adicionar-cliente` e os itens da parada). Lista das paradas já
   adicionadas com a ordem; **excluir parada = SEGURAR** (o hold `rme-parada` já existe,
   Lei 1). Vazio = `empty()` (Lei 7).
2. **Ordem** — revisar/reordenar com ▲▼ grandes (copie o mecanismo de
   `dayOrderManualModal`, app.js ~2509). Desabilitar ▲ no topo e ▼ no fim.
3. **Nome e salvar** — reusa o passo de nome/salvar de `leitura-finalizar`
   (`prepareLeituraNome`, app.js ~1658) e o mesmo POST de finalizar.

- **Backend: ZERO endpoint novo.** Continua a sessão `MANUAL` e os endpoints atuais
  (`/logistica/leitura/iniciar`, `/parada`, `/finalizar`, `/cancelar`).
- **Copy**: em modo MANUAL a palavra "leitura" **não pode aparecer**. "Cancelar leitura"
  → "Cancelar rota manual". Confira todos os rótulos do caminho MANUAL.
- **Carregando**: cada passo com seu estado (Lei 7) — o dono reclamou de "mal feito"; abrir
  seco ou piscar sem loading conta como falha desta sprint.
- **Transições** (Lei 9): usar `leitura-step-enter/exit` que já existe.
- **`handleBack`** (Lei 10, app.js ~4295): passo 3→2→1; no passo 1, se já houver parada
  registrada, pedir confirmação via `state.confirmation` (`danger`) antes de cancelar a
  sessão; sem parada, fecha direto. Espelhe isso no botão Voltar da UI.
- A sessão MANUAL **não** deve mais renderizar faixa por cima da tela Rota. Se houver
  sessão MANUAL aberta e o dono voltar ao Play, reabrir o wizard no passo de paradas.

## Definição de pronto
Código escrito e coerente; `app.css` sem hex novo (só token); nenhum `style="` novo que
não seja valor dinâmico; nenhuma ação nova fora do `handleBack`. **Não teste, não builde,
não commite** — só relate o que mudou (arquivo + função + o porquê) e o que ficou em dúvida.
