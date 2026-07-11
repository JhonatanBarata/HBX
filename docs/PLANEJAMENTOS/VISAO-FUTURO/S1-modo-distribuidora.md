# S1 — MODO DISTRIBUIDORA (ATIVA — sem flag; o gate natural é a empresa ser só-logística)

> Frente VISAO-FUTURO, 11/07/2026. Decisão do dono: NÃO é app separado — quando a empresa
> escolhe só "logística" no OOBE, o HBX inteiro deve parecer PERFEITAMENTE um sistema avulso
> de distribuidora. O mobile (`/entrega`) JÁ é esse sistema; o vazamento é o DESKTOP.

## Estado real (recon 11/07, conferido no código)
- Detecção pronta: `soLogistica()` em `frontend/src/lib/so-logistica.ts:20-27` — `logistica` acessível E nenhum de vendas/atendimento/webscraping/website/bot. `financeiro` NÃO conta (de propósito). Fonte: `GET /modules/me`.
- Mobile já resolve: redirect `mobile-shell.tsx:305-333` (`soLogistica → /entrega` na :324); de-HBX do header/título em `frontend/src/app/entrega/EntregaScaffold.tsx:48-69`; tab bar sem HBX `EntregaTabBar.tsx:75-91`; ajustes app-like com escape intencional "Abrir o HBX completo" (`entrega/ajustes/page.client.tsx:656-660`).
- Desktop VAZA: sem redirect (logística-only cai em `/dashboard` de vendas — `frontend/src/app/(app)/dashboard/page.client.tsx`); sidebar marca "HBX" hardcoded `shell.tsx:872-875`; busca "Buscar leads, empresas, propostas..." `shell.tsx:1367`; sinais WhatsApp/geo/Bot/e-mail na topbar `shell.tsx:1493-1565`; URL direta de módulo off = tela vazia (403 do backend sem tratamento; `api.ts` só trata 401).

## Escopo (frontend only — NADA de backend, NADA de schema)
1. **Redirect desktop**: empresa só-logística que entrar em `/` (pós-login), `/dashboard` ou rota de módulo DESLIGADO → `/entrega`. Implementar como gate client no grupo `(app)` (sugestão: componente novo `frontend/src/components/hbx/so-logistica-gate.tsx` montado em `app-shell.tsx` — NÃO dentro de `shell.tsx`). Usar o cache de `/modules/me` já existente; fail-closed = não redirecionar enquanto `loaded=false` (nunca chutar).
2. **Rotas NEUTRAS continuam acessíveis** (o "HBX completo" reduzido, escape intencional dos ajustes): `financeiro`, `empresas`, `contatos`, `produtos`, `configuracoes`, `gerencial`, `dashboard`?— NÃO: `/dashboard` redireciona (é 100% vendas). As neutras ficam.
   Rotas de módulo off que redirecionam: conferir hrefs reais em `NAV_LINKS` (`shell.tsx:297-350`) — vendas, atendimento/conversas, radar/leads (webscraping), bot, assistente, website, automacoes, agenda, relatorios, concierge.
3. **De-HBX do shell desktop quando `soLogistica`** (edits CIRÚRGICOS em `shell.tsx` — ver guardrail abaixo):
   a. Marca da sidebar (`:872-875`): trocar "HBX" pelo nome da empresa (`currentCompanyName` já existe `:435-437`).
   b. Placeholder da busca (`:1367`): neutro ("Buscar…" ou "Buscar clientes, produtos…").
   c. Sinais de módulos alheios na topbar (WhatsApp `:1496`, geo/Radar `:1526`, Bot `:1535`, E-mail `:1558`): ocultar quando só-logística (o sino de avisos do master FICA — comunicação da plataforma com o tenant é legítima).
4. **Título do documento** nas rotas neutras quando só-logística: nome da empresa (o `/entrega` já faz `document.title="Entregas"` — replicar padrão no gate, sem mexer em metadata estática do Next).
5. **`/entrega` no desktop**: conferir como o app renderiza em viewport largo; se ficar "faixa mobile esticada", ajustar o container na folha da skin `entrega` (largura máxima confortável/centrada, SEM tocar tokens globais de outras peles — Lei do design system: tudo em classe central da skin própria).

## O que NÃO fazer
- NÃO tocar `frontend/src/app/page.tsx` (porta única, publicada 10/07 — regra: não mexer).
- NÃO tocar backend (o guard 403 já existe e está certo).
- NÃO criar flag env: o comportamento é derivado dos módulos da empresa (mesma filosofia do mobile). Empresa multi-módulo: ZERO mudança de comportamento (critério de aceite nº1).
- NÃO remover o link "Abrir o HBX completo" dos ajustes (escape intencional).
- NÃO inventar texto/label novo além do necessário (regra do dono: zero textão em tela).

## ⚠️ Guardrail de sessão paralela (CRÍTICO)
`frontend/src/components/hbx/shell.tsx` e `frontend/src/app/globals.css` estão sendo editados AGORA por outra sessão (frente Financeiro). Regras:
- Edits em `shell.tsx`: cirúrgicos, um por vez, old_string mínimo e único; se um Edit falhar por mudança concorrente, RELER o arquivo e reaplicar. JAMAIS Write/reescrever o arquivo inteiro. Fazer os edits de `shell.tsx` por ÚLTIMO, depois do resto pronto.
- Não tocar `globals.css` (CSS novo vai na folha da skin entrega ou arquivo próprio da feature em `hbx-theme/` se necessário).
- NÃO commitar nada (o orquestrador commita por paths). NÃO criar branch/worktree (regra do dono: direto na branch atual).

## Critérios de aceite
1. Empresa multi-módulo: nada muda (diff de comportamento zero fora do modo).
2. Empresa só-logística no desktop: login → aterrissa em `/entrega`; digitar `/vendas` na URL → volta pra `/entrega` sem flash de tela de vendas (aceitável 1 frame de loading, não a casca de vendas montada); `/financeiro`, `/empresas`, `/contatos`, `/produtos`, `/configuracoes` seguem abrindo com shell de-HBX (marca = nome da empresa, busca neutra, sem sinais de módulos alheios).
3. `soLogistica` com `loaded=false` → comporta como hoje (sem redirect precipitado, sem flash).
4. `npx tsc --noEmit`/lint do frontend verdes; `node scripts/check-pele.mjs` (ou script equivalente do repo) verde.
5. Nenhuma alteração em arquivos do backend.
