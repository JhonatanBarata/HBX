# W1 — PORTA ÚNICA + LANDING COM TELAS REAIS (front)

Decisões do dono (10/07, chat): logado entra DIRETO no app (nunca vê landing/login); `/login` deixa de
existir como tela (1 login só, dentro da landing); logout/401 voltam pra landing com TRANSIÇÃO (nada de
corte seco); landing usa telas REAIS do sistema (radar real, WhatsApp real); hero mais separado (celular
desgrudado do desktop); entrada de cliente novo continua chamativa e sem atrito.

## Regras duras
- Trabalhar DIRETO na branch atual. NÃO criar branch/worktree. NÃO commitar. NÃO publicar.
- 5 Leis do Design System (docs/Rules/FRONTEND.md): zero cor/borda/sombra/radius solto; tudo token/classe
  central em `frontend/src/app/hbx-theme/`. `node frontend/scripts/check-pele.mjs` tem que passar.
- UI copy: SÓ o texto necessário (label + campo). Zero textão inventado.
- "Refazer = deletar o velho no mesmo passo." Nada de código morto deixado pra trás.
- NÃO tocar em: `register/page.client.tsx`, `oobe-gate.tsx`, `tutorial-*`, `checkout-panel`, `plans.tsx`,
  bloco `.site-*` do screens.css (outros workers cuidam). Em `shell.tsx` só nas linhas do logout (`sairTopo`).
- Ao final: `cd frontend && npm run typecheck` (ou build) verde + check-pele verde.

## Fatos já mapeados (não re-explorar do zero)
- `/` = `app/page.tsx` → `components/hbx/public-entry.tsx` (359 l, CSS `hbx-theme/public-entry.css`,
  prefixo `f1-`). Login embutido já existe: `screen:"home"|"login"`, camada `.f1-login-layer` com
  `<LoginClient embedded/>`. `?ver=planos`→/register, `?ver=entrar`→/login (linhas 18-19).
- `/login` = `app/login/page.tsx` → `app/login/page.client.tsx` (338 l). Tem 2 modos no mesmo DOM:
  cinematográfico (robô, painéis, cena `.hbx-scene`, fundos `public/portal/{autonomo,corporativo}/1-5.png`
  ~23MB, conceito "mundo" `?lado=`) e `.is-plain`. Toggle "Visual" persiste em `localStorage hbx:login-plain`.
- Token: localStorage/sessionStorage via `lib/api.ts` (`getToken()` :29). SEM middleware Next; guard é
  client-side (`auth-gate.tsx:19-23`). 401 global: `api.ts:94-103` → `window.location.replace("/login")`.
- Logout (todos corte seco `clearToken()`+`replace("/login")`): `shell.tsx:1240-1252` (sairTopo),
  `casca/screens/mais-sheet.tsx:243-252`, `bloqueio-gate.tsx:127-133`, `master/page.client.tsx:237/265`,
  `entrega/ajustes/page.client.tsx:253-256` (este NÃO chama POST /auth/logout — bug, consertar).
- Transições: `hbx-theme/transitions.css` — tokens `.hbx-page`/`.app-page`; `@view-transition` declarado
  mas NENHUM `document.startViewTransition` no código (navegação client-side do Next não dispara).
- Radar real: função local `RadarDisc` em `app/(app)/leads/page.client.tsx:341-413` (~75 l, zero API,
  props `mini?`, labels de pool fixo — NUNCA nome de empresa real). CSS `.radar*` já global (screens.css
  ~1865-2100, tokens `--radar-*` no skeleton.css). NÃO importar de page.client.tsx (puxa 2168 l pro bundle).
- WhatsApp real: `components/hbx/whatsapp-preview.tsx` (268 l, exportado, 100% props, zero fetch).
- Dashboard pós-login pisca vazio ~2s ("—"/"Sem dados") antes dos dados (`(app)/dashboard/page.client.tsx`).

## Entregas
1. **Logado → app direto, zero flash.** Em `/`: decisão pré-hidratação (script inline no molde do
   THEME_BOOT em `app/layout.tsx:40`, ou gate síncrono no 1º render client) — `getToken()` presente →
   vai pro `/dashboard` sem pintar a landing. Token inválido: o fluxo 401 existente resolve (cai de volta).
2. **`/?entrar` abre o card de login na landing** (substitui o redirect `?ver=entrar`→/login; manter
   `?ver=entrar` como alias). Deep-link com aviso de sessão expirada continua funcionando via
   `hbx:session-notice`.
3. **`/login` vira redirect server-side pra `/?entrar`** (page.tsx enxuto; page.client.tsx morre — ver 5).
4. **Logout com transição de saída** em TODOS os 5 pontos: criar helper único (ex. `lib/logout.ts`):
   POST /auth/logout best-effort → transição de saída (usar `document.startViewTransition` quando houver,
   fallback classe CSS de fade nos tokens do transitions.css) → `clearToken()` → `/` (landing home).
   401 do api.ts idem: destino `/?entrar` (com notice), não mais `/login`.
   Consertar `/entrega`: chamar POST /auth/logout também.
5. **Matar o login cinematográfico:** LoginClient fica SÓ o card (o mesmo usado embedded); deletar robô,
   painéis laterais, "mundo"/`?lado=`, toggle "Visual", `hbx:login-plain`, imagens `public/portal/*` e
   `robo-*.png` (conferir por grep que nada mais referencia antes de deletar). CSS órfão do cinematográfico
   sai do screens.css COM CIRURGIA: `.hbx-scene`/`.world`/`.scene` são usados por /register e /reset-password
   — o que eles usam FICA (a migração visual deles é do W3, fase 2).
6. **Transição login→app:** entrada suave no dashboard segurando o flash — skeleton nos KPIs/painéis do
   dashboard (sem "—" cru) ou segurar a transição até o 1º payload. Escolher o mais simples que fique bom.
7. **Landing com telas reais:** extrair `RadarDisc` → `components/hbx/radar-disc.tsx` (leads/page.client.tsx
   passa a importar de lá — zero mudança de comportamento na tela de leads); usar no slot `RadarScreen` da
   landing no lugar do `f1-map` fake. Trocar `WhatsAppScreen` fake por `<WhatsAppPreview>` com conversa demo
   estática curta (nomes fake do pool, nunca empresa real). Slots Vendas/Entrega/Cobrança continuam como estão.
8. **Hero mais separado:** celular desgrudado/reposicionado do desktop no `public-entry.css` (respiro,
   escala) — desktop e mobile viewport (testar visual nas 2 larguras).

## Prova
Typecheck + check-pele verdes. Listar no relatório final: arquivos deletados, bytes de assets removidos,
e os fluxos que mudaram (mapa rota antiga→nova). NÃO deletar este .md (o orquestrador remove após verificação).
