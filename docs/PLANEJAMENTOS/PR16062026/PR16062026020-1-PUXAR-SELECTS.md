# PR16062026020-1 — Puxar leads: trocar `datalist` por `<select>` (igual "Quantos")

> Bloco do PR16062026020 (telas da vendedora). **Frontend só.** Aplica: Sonnet.
> Contexto: o card "Puxar leads" hoje mistura caixa-de-texto com dropdown (`<input list=datalist>`).
> Cada campo se comporta diferente e, depois de escolher, a setinha não reabre as opções. Ordem do
> dono: **deixar TODOS os campos com a mesma UI, copiando o campo "Quantos" (um `<select>` nativo)**.

## Objetivo
No `frontend/src/components/hbx/puxar-leads-panel.tsx`, converter os campos **Tipo de cliente**,
**Cidade** e **Estado** de `datalist` para `<select className="select-dark">` — a mesma cara de
"Alcance" e "Quantos", que já são `<select>` e funcionam.

## Mudança exata
1. **Tipo de cliente** → `<select>` agrupado por categoria, usando `RADAR_SEGMENT_CATEGORIES` (já
   existe em `frontend/src/lib/radar-segments.ts`, com `{ label, segments[] }`):
   - 1ª opção vazia: `Escolha o tipo…` (value `""`).
   - Um `<optgroup label={cat.label}>` por categoria; dentro, `<option>` por segmento.
   - **Última opção `Outro (digitar)…`** com `value="__outro__"`. Ao selecionar `__outro__`, renderiza
     ABAIXO um `<input className="field-dark">` pra digitar o segmento livre, e é esse texto que vai
     no `puxar()`. (Estado novo: `outroMode: boolean` + `segmentLivre: string`; o `segment` efetivo =
     `outroMode ? segmentLivre.trim() : segmentSelecionado`.)
   - Remover o `<datalist id="puxar-segmentos">` e o `list=` do input antigo.
2. **Estado (UF)** → já é `<select>`; manter, mas **vem ANTES da Cidade** (ver ordem abaixo). 1ª opção
   `Todos` (value `""`).
3. **Cidade** → `<select className="select-dark">`:
   - Opções = `brazilCityOptionsForUf(uf)` (já importado); 1ª opção `Todas` (value `""`).
   - **`disabled` enquanto `uf === ""`**; placeholder visual via 1ª opção `Escolha o estado primeiro`
     quando sem UF. Trocar UF zera a cidade (já faz: `onChange` do UF chama `setCity("")`).
   - Remover `<datalist id="puxar-cidades">` e o `list=`.
4. **Ordem final dos campos** (esquerda→direita): **Tipo de cliente → Estado → Cidade → Alcance →
   Quantos → [botão Puxar]**. (Hoje Cidade vem antes de Estado; inverter.)
5. **Alcance** e **Quantos**: já são `<select>`; não mexer (só garantir a posição da ordem acima).

## Não fazer
- Não mexer no backend, no `POST /webscraping/radar/pull-to-vendas`, nem no shape do `puxar()`.
- Não tocar em `page.client.tsx` (é o Bloco 2).
- 5 Leis: só classes centrais (`filters`, `f`, `select-dark`, `field-dark`, `btn-teal`). Sem hex,
  sem `style=` visual, sem borda/cor própria (o `check-pele` reprova no lint).

## Critério de aceite
- Todo campo abre como `<select>` nativo e **reabre sempre** que clica (fim do bug da setinha).
- "Tipo de cliente" mostra os segmentos **agrupados por categoria** + opção "Outro (digitar)…".
- Escolher "Outro…" revela um campo de texto e o puxar usa o texto digitado.
- Cidade fica desabilitada até escolher o Estado; ordem = Tipo → Estado → Cidade → Alcance → Quantos.
- `cd frontend && npm run lint && npm run build` verdes.
