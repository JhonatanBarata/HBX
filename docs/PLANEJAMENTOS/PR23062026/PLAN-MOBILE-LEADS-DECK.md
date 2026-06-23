# PLAN — Leads/Radar mobile (full mobile)

## ⚠️ REVISÃO v2 (20/06 — o dono reprovou a v1, esta manda)
A v1 (deck tomando a tela inteira) está ERRADA. Modelo correto (confirmado em mockup):
1. **Main mobile = LISTA vertical** de leads (rolável), bonita e proporcional à tela.
   Cada linha: avatar, nome, segmento · cidade, pills de sinal (`radar2-sig`), Fit, chevron.
2. **Tap na linha → abre um CARD NA FRENTE** (overlay CENTRAL pela central `.hbx-veil`,
   NÃO bottom-sheet) com os detalhes do negócio (= `renderLeadDetail`, já extraído).
3. **Dentro do card-overlay: swipe estilo TINDER** (arrasta ↔) entre os leads; setas + dots;
   passar do último → `router.push("/vendas")`. X fecha e volta pra lista.
4. **Fontes um pouco maiores e PROPORCIONAIS** (usar rem/clamp/%, não px fixo — escala com a tela).
   As atuais ficaram pequenas demais. Aumentar só "um pouquinho".
5. **DESKTOP 100% INTOCADO** (ordem dura do dono). Tudo atrás de `isMobile` / `@media (max-width:860px)`.
6. Remover a v1 (deck como main + classes que só ela usava) — sem legado.
7. **Bug do "Mais"/pele:** o seletor de pele dentro da folha "Mais" abre desalinhado/cortado
   (ver shell.tsx more-sheet + dropdown da PeleSwitch). Consertar alinhamento.
8. **Carrossel do site = SÓ MOBILE.** Home do desktop volta EXATAMENTE ao original (carrossel
   de palavras). As molduras de celular aparecem só em `@media (max-width)`. Reverter base
   `.scene-hero` (feito) e a troca de conteúdo no desktop.

> O resto do doc abaixo é histórico da v1 — seguir a REVISÃO v2.

---

# (histórico v1) — deck deslizável (full mobile, zero rolão)

> Frente: FRONTEND. Só mobile (`@media (max-width:860px)` + branch `useIsMobile()`).
> Desktop fica **byte a byte igual** (Regra de Ouro do `mobile.css`). 5 Leis valem:
> nada de cor/borda/sombra/fonte/radius solto — nasce em token/classe; passa no
> `check-pele.mjs`. Orquestrador (Opus) revisa o diff + verifica em runtime.

## Dor (diagnóstico real)
No mobile a tela vira a tabela `.radar2-main .tbl` rolando dentro de `.tbl-wrap`
(`min-width:560px`) → num 412px só aparece a coluna **Empresa**; Cidade/Contato/Puxar
ficam escondidos "atravessando pra direita". É o "tá feio" do dono. (Ver overrides
atuais em `screens.css` ~1439–1460 e `mobile.css` seção RADAR/LEADS ~564–623.)

## Norte do dono (literal)
- **Nada rola muito pra baixo.** Tela grande (Leads) vira **deck deslizável**: 1 card
  por vez, swipe com o dedo ↔, dots/progresso.
- **Tap no card abre o card do cliente** (detalhe) — não rola pra ver, ABRE.
- **Fim do deck (passou do último) → entra no `/vendas`** com handoff.
- Alta qualidade, premium, "me surpreenda". Full mobile, **sem perder nenhuma tela**.

## Escopo (1 worker — bloco coeso, mesmos arquivos)
Arquivos: `frontend/src/app/(app)/leads/page.client.tsx`,
`frontend/src/app/hbx-theme/mobile.css`, `frontend/src/app/hbx-theme/screens.css`
(classes novas do deck via token), e leitura de `kit.css` (drawer/veil) +
`components/hbx/shell.tsx`/`canal-icon.tsx`.

### 1. Render mobile separado por `useIsMobile()`
- O client já importa `useIsMobile`. Quando `isMobile`, renderizar a **vista deck**;
  senão, a tabela atual (desktop intacto). Igual o padrão do Bot (`bot-mobile-view`).
- KPIs no mobile: faixa compacta (não empurrar o deck pra baixo). Mantém os 4 números,
  mas enxutos (sem virar rolão).

### 2. Deck deslizável (estrela)
- 1 lead = 1 card grande, peek do próximo atrás (profundidade), leve tilt no drag.
- Gesto: `pointerdown/move/up` com `touch-action` isolando o swipe horizontal;
  setas ‹ › + dots como fallback acessível; progresso "n / total".
- Conteúdo do card reaproveita classes existentes: `radar2-fit`, `radar2-signals`/
  `radar2-sig--{hot|warn|danger}` (pills), `CanalIcon` (contato mascarado),
  `Av` (avatar). Ação primária **Puxar** (`send-to-vendas`) embutida; respeita
  `meterBlocked`/cota.
- **Swipe além do último → `router.push("/vendas")`** com transição branded
  (card de handoff "acabou a prateleira → seus leads viram negócios").

### 3. Tap → card do cliente (detalhe) em bottom sheet
- Tap no card (fora dos botões) abre o detalhe do lead numa **folha inferior**
  reaproveitando a central `.hbx-veil.to-bottom` + `.hbx-drawer-bottom` (já existe no
  `mobile.css`). Conteúdo = o mesmo do aside `.ctx` (hero, canais, kv, reason, signals,
  ação Puxar/Abrir em Vendas). NÃO recriar visual: usar classe central.
- No desktop o `.ctx` continua como aside lateral (intocado).

### 4. Carteira
- Mesma vista deck na aba "Minha carteira" (contato revelado, ação "Abrir" → Vendas).

### 5. Seleção em lote / medidor
- Manter acessível no mobile sem rolão: barra compacta (selecionados + Puxar
  selecionados + medidor de cota). Pode virar mini-barra fixa do deck. Sem hex solto.

## Travas (não furar)
- Desktop inalterado: toda regra de layout dentro de `@media (max-width:860px)` OU
  atrás de `isMobile`. Conferir que `document` desktop não muda.
- 5 Leis: classes novas (`.lead-deck`, `.lead-card`, etc.) em `screens.css`/`mobile.css`
  com **tokens**; nada de `#hex`/inline color. `npm run lint` (check-pele) tem que passar.
- Sem legado: a tabela mobile antiga (overrides em `mobile.css` RADAR/LEADS e
  `screens.css` ~1439) sai ou é substituída — não deixar duas vistas vivas.

## Checks
- `cd frontend && npm run lint` → `npm run build` antes de devolver.
- Orquestrador verifica em runtime no preview (390px) + screenshots.

## Fase 2 — Carrossel do site = mockups VIVOS em moldura (decisão do dono 20/06)
NÃO são screenshots PNG (envelhecem, pesam, pedem login). São **molduras de celular**
com a marcação real das telas + dados de amostra, estilizadas pelas MESMAS classes do
app (ficam idênticas ao produto e em sincronia automática). Arquivos: `page.client.tsx`
(landing) + `marketing.css`/`screens.css`. O mundo-site tem visual próprio (fora do
check-pele) — mas reutilizar as classes do app (que já usam token) mantém fidelidade.

- Transformar o `site-carousel` (hoje palavras Radar/Vendas/Atendimento/Recovery) num
  carrossel de **phone-frames**: cada slide = uma moldura de celular mostrando uma tela.
- Telas a mostrar (3, casando os módulos): **Leads (deck novo)**, **Vendas** (board),
  **Atendimento** (chat). Markup curado + dados de amostra, classes reais do app.
- Manter dots + auto-advance que já existem; legenda do módulo por slide.
- **Bônus obrigatório:** consertar o erro de lint PRÉ-EXISTENTE em `page.client.tsx:141`
  (`carouselIdxRef.current = carouselIdx` no render → mover pra `useEffect`), já que o
  arquivo será tocado. Deixar `npm run lint` 100% verde.
- Depende da Fase 1 (deck) estar com o visual fechado, pra a moldura do Leads refletir.
