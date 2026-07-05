# 03 — Colar imagem (Ctrl+V) + arrastar arquivo no composer do /atendimento

## Diagnóstico
`grep -r "onPaste\|clipboardData" frontend/src` = ZERO. Colar print (gesto nº1 do WhatsApp
Web) não existe. O upload JÁ está pronto: `sendAttachment(file, kind)` em
`frontend/src/app/(app)/atendimento/page.client.tsx:1230` (usado pelo input de arquivo na
:1277 via `attachKindFromMime(file.type)`).

## Fazer (tudo em page.client.tsx do atendimento)

### 1. Ctrl+V no composer
`onPaste` no textarea/área do composer: se `e.clipboardData.files.length > 0` →
`preventDefault()` e pra cada file → **preview de confirmação antes de enviar** (ver §3).
Texto colado normal segue o fluxo padrão (não interceptar quando não há file).

### 2. Drag & drop na área da conversa
`onDragOver`/`onDrop` no painel da conversa aberta: soltar arquivo(s) → mesmo fluxo do §1.
Overlay visual "Solte para enviar" enquanto arrasta (estado React + classe CSS).

### 3. Preview de confirmação (anti-cagada)
Colar/arrastar NÃO envia direto: mostra um cartão compacto acima do composer (miniatura se
imagem; nome+tamanho se doc) com botões Enviar/Cancelar. Enter = enviar. Esc = cancelar.
No envio → `sendAttachment(file, attachKindFromMime(file.type))`.
Se houver `replyTo` ativo, incluir `...quotedPayload()` também no corpo do envio de anexo
(hoje `sendAttachment` :1230-1258 não manda quoted; o backend já aceita os campos no mesmo DTO).

### 4. Conferir a affordance de "Responder"
O estado `replyTo` já existe (:516). Verificar que há gesto DESCOBRÍVEL pra acionar
(botão/ícone no hover da bolha da mensagem). Se não houver, adicionar (ícone ↩ no hover,
padrão WhatsApp Web) + barrinha "Respondendo a..." acima do composer com X pra cancelar
(se já existir, não duplicar).

## Regras de CSS (5 Leis — MÉTODO)
- ZERO cor/borda/sombra/radius/fonte inline ou hex solto (check-pele.mjs reprova).
- Reusar classes existentes do atendimento onde der. Classe nova → criar em
  `frontend/src/app/hbx-theme/whatsapp.css` (arquivo LIMPO no git) usando SÓ tokens/vars do
  tema. **PROIBIDO editar `screens.css`** (está sujo com WIP do dono).

## Aceite
- `cd frontend && npx tsc --noEmit` (ou o typecheck do projeto) limpo.
- `node frontend/scripts/check-pele.mjs` (ou o caminho real do check) passa nos arquivos tocados.
- Não precisa subir servidor; validação por typecheck + leitura (teste visual é do dono pós-publish).

## Regras duras
- DIRETO na master, sem branch/worktree. NÃO commitar (orquestrador commita).
- NÃO tocar nos arquivos sujos do dono: `frontend/package.json`, `package-lock.json`,
  `contatos/page.client.tsx`, `produtos/page.client.tsx`, `screens.css`,
  `components/hbx/shell.tsx`, `components/hbx/import-planilha-modal.tsx`, `backend/**`.
- Escopo de escrita: `frontend/src/app/(app)/atendimento/page.client.tsx` +
  `frontend/src/app/hbx-theme/whatsapp.css` (se precisar de classe nova).
- PT-BR. Ao concluir: DELETAR este .md e reportar arquivos + resumo.
