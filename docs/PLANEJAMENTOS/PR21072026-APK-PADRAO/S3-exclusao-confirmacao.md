# S3 — Segurar-pra-excluir em TUDO que remove + app-confirm nas ações de peso

**Lei 1 (cobrada 2× pelo dono em 21/07):** excluir NUNCA é lixeira/botão — é manter
pressionado no próprio item, com vermelho progressivo + vibração. Exclusão de peso ainda
confirma via `state.confirmation`.

## O que JÁ existe (padrão de referência)

7 holds no `app.js` (~3800-3930), todos idênticos: `is-hold-arming` no touchstart → 950ms
`is-holding` + `H.vibrate(45)` → ação no touchend; cancela em touchmove >12px/touchcancel;
`ignored...ClickId` engole o clique fantasma. CSS pronto (`client-hold-fill`, card com
`position:relative; overflow:hidden`).

## Tarefas

1. **Inventário completo de remoção**: varrer o app.js por toda ação que REMOVE/ARQUIVA/
   CANCELA algo visível em lista ou ficha (grep: `delete-`, `remove`, `remover`, `arquivar`,
   `excluir`, `cancel`, `data-action="…"` destrutivos + os endpoints DELETE do
   `mobile-contract`). Montar tabela: item × gesto atual × conforme/violação.
   Candidatos conhecidos a conferir: vínculo produto-cliente na ficha (botão −?), telefones/
   endereços extras do cliente, entrega avulsa criada errada, item do rascunho da entrega
   (stepper até 0 é o padrão aceito — stepper NÃO é exclusão, não converter), "Limpar o dia"
   (satélite no transmux — é ação de peso com popup, ok), cancelar leitura, cancelar rota.
2. Converter TODA violação pro gesto hold (copiar um dos 7 existentes, nunca reinventar
   timing/threshold). Card ganha `position:relative; overflow:hidden` se faltar.
3. **Confirmação de peso**: destrutivo IRREVERSÍVEL ou de área grande (excluir cliente,
   excluir rota salva, limpar dia, cancelar rota, encerrar rota) TEM que passar por
   `state.confirmation` com `danger:true` e frase curta do que acontece. Destrutivo pequeno
   e refazível (tirar produto do rascunho, tirar parada do rascunho da rota salva) NÃO
   confirma — o hold já é a fricção. Auditar que cada caso está no lado certo.
4. Grep final de segurança: nenhum `icon("trash"` em render (o path `trash` pode até sobrar
   no dicionário de ícones, mas NENHUM uso), nenhum botão com rótulo Excluir/Apagar/Remover
   em item de lista.

## NÃO fazer

- NÃO mudar timings (950ms/12px/45ms) — são os aprovados.
- NÃO adicionar hold em coisa que NÃO remove (hold é sinônimo de tirar; usar pra outra ação
  confundiria o gesto).
- NÃO converter o stepper −/+ da entrega em hold.

## Checks

- `node --check app.js`; no aparelho: segurar cada tipo de item (cliente, produto, parada,
  parada da rota salva, item da rota salva, rota salva, vínculo) → vermelho enche, vibra,
  solta = remove; arrastar >12px cancela; toque curto continua fazendo a ação normal.

**Pronto quando:** tabela do inventário 100% conforme + grep de lixeira zerado, commit local
`fix(apk): S3 exclusao padrao unico`.
