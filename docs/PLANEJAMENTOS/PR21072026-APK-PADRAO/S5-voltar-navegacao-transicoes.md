# S5 — Voltar do Android completo + overlay nunca abre seco + setas no padrão

**Leis 9/10:** nada abre/fecha seco; o botão Voltar do Android SEMPRE faz a coisa óbvia
(fecha popup → volta passo → vai pra Rota → sai). Wizard navega por setas circulares
(`center-arrow`), nunca botão de texto solto.

## Evidências

1. **Overlays sem animação de entrada**: no `render()` (~430-432), `confirmationOverlay()` e
   `dddPromptOverlay()` são renderizados FORA de `overlay-host` — as animações `modal-in/out`
   só disparam dentro de `.overlay-host.is-opening/.is-closing` (app.css ~245-256). Ou seja:
   confirmação e DDD ABREM SECO hoje (violação da Lei 9). `nextStopOverlay` idem (tem
   backdrop próprio, avaliar se a entrada já é suave).
2. **handleBack** (montado na 4ª leva do PR18072026): cobre popup/confirm/passos do
   manage-day/`state.selected`. De lá pra cá nasceram: wizard da Leitura (`leitura-parada`
   com sub-passos + `leitura-finalizar`), `dayOrderStep` home/choose/manual/saved, editor de
   rota salva (rme), `edit-product` center-modal, `dddPrompt`, trava de créditos. Cada um
   precisa de resposta certa no Voltar.
3. **Setas**: wizard Leitura/Manual já usa `center-arrow` ‹›. Auditar botões "Voltar" de
   texto dentro de popups centrais que deveriam ser seta (padrão: wizard = setas; popup de
   1 decisão = botões nomeados; sheet = fechar no X/fundo).
4. **PROVADO AO VIVO (21/07): três saídas diferentes na mesma família de popup central** —
   "Montar Rota" não tem X nem Voltar (só toque fora), "Rotas Salvas" tem botão "Voltar" de
   texto, editor de rota salva tem X no canto + seta ‹ Fechar. **Padronizar:** todo popup
   central ganha X no canto; quem é PASSO de fluxo ganha também a seta ‹ (com rótulo);
   quem é folha (sheet) fecha no X + toque no fundo. Referência visual = editor de rota
   salva. Ver `01-ACHADOS-AO-VIVO.md`.

## Tarefas

1. Envolver `confirmationOverlay`/`dddPromptOverlay` no mesmo mecanismo `overlay-host`
   is-opening/is-closing usado por modal/sheet (registrar no fluxo de `state.openingOverlay`/
   `closingOverlay` ou dar um host próprio com a mesma classe). Fechar também anima.
2. Mapa completo do Voltar: montar tabela estado-aberto × ação-do-back esperada e conferir
   no `handleBack` real; preencher os buracos (ordem de prioridade: confirmation > dddPrompt >
   nextStop (cancela contagem) > modal/sheet aberto > passo interno de wizard > tela ≠ rota >
   rota = sair). Provar no aparelho com `adb shell input keyevent 4` em CADA contexto.
3. Auditoria de setas/voltar textual nos popups centrais; converter pro padrão da moldura
   (sem inventar layout novo — copiar o wizard da Leitura).
4. Transições de tela: conferir que TODA troca de screen passa `motion` (forward/back) — grep
   `navigateTo(`/`activate(` sem motion.

## NÃO fazer

- NÃO mexer no swipe lateral entre módulos (native.js) nem no nav-water.
- NÃO adicionar animação nova além das existentes (overlay-in/out, modal-in/out, sheet-in/out).
- NÃO deixar o Voltar fechar o app com rota ATIVA sem passar pela tela Rota.

## Checks

- `node --check app.js`; vídeo/screenshot ADB: confirmação abrindo suave, DDD abrindo suave;
  sequência de Voltar: wizard passo 3 → 2 → 1 → fecha wizard → Rota → (2º back) sai.

**Pronto quando:** tabela do Voltar 100% verde no aparelho + zero overlay seco, commit local
`fix(apk): S5 voltar+transicoes`.
