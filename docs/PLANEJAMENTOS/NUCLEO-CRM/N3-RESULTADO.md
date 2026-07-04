# N3 — RESULTADO (módulo Empresas — janela contas PJ, READ-ONLY)

> Sprint N3 do plano NÚCLEO-CRM. Executado 04/07 na branch `claude/nucleo-crm`
> (base = N1 @ `975dc399`, sem divergência com `origin/master @ 7fd01a26`).
> **NÃO publicado.** Escopo: janela "Empresas" (contas PJ) só de LEITURA +
> nav/ícone/gate. ZERO escrita, ZERO paywall.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `backend/src/nucleo/nucleo-cadastro.service.ts` | +2 métodos de LEITURA (`listEmpresas`, `getEmpresa`) + tipos (`ListEmpresasParams/Result`, `EmpresaListItem`, `EmpresaDetail`, `EmpresaContato`). Métodos de escrita de N1 intactos. |
| `backend/src/nucleo/nucleo.controller.ts` | **NOVO.** `NucleoController` (`@Controller('nucleo')`, `@UseGuards(JwtAuthGuard)`): `GET /nucleo/empresas` + `GET /nucleo/empresas/:id`. |
| `backend/src/nucleo/nucleo.module.ts` | Registra `controllers: [NucleoController]`. |
| `backend/src/bootstrap/structural-defaults.json` | +`SystemModule 'empresas'` (`defaultEnabled: true`, `companyAssignable: true`, `serviceUrl:/empresas`) — entrada de kill-switch do master. |
| `frontend/src/app/(app)/empresas/page.tsx` | **NOVO.** Server page (metadata) → `EmpresasClient`. |
| `frontend/src/app/(app)/empresas/page.client.tsx` | **NOVO.** Lista de contas PJ + busca (nome/CNPJ/cidade) + filtro UF + paginação; clique abre ficha (modal central) com dados + contatos. |
| `frontend/src/components/hbx/shell.tsx` | `ICONS.empresas` (prédio), `NAV_LINKS` (+Empresas), `NAV_ENTITLEMENT.empresas=null`, `NAV_MODULE_KEY.empresas=null`. |
| `frontend/src/app/hbx-theme/screens.css` | +bloco `.emp-*` (linhas/badges/ficha/pager) — visual em classe central, sem inline. |

## Endpoints criados (company-scoped, READ-ONLY)
- `GET /nucleo/empresas?query=&uf=&page=&pageSize=` → `{ page, pageSize, total, totalPages, items[] }`.
  Lista `CustomerProfile` onde `tipo='pj'` **da empresa logada** (companyId sempre do JWT).
  `query` casa nome/cidade (insensitive) e CNPJ (dígitos); `uf` filtra exato. `pageSize` default 30, teto 100.
  Cada item traz `contatosCount` (via `_count`) + flags `isLead/isCliente/isFornecedor` + `origin`.
- `GET /nucleo/empresas/:id` → detalhe da conta PJ + `contatos[]` (nome/cargo/whatsapp/phone/email/isPrincipal).
  **Isolamento duro:** `findFirst` por `{ id, companyId, tipo:'pj' }` — id de outro tenant devolve 404 (nunca vaza).

## Nav / ícone / gate (kill-switch, NÃO paywall)
- **Ícone:** `ICONS.empresas` registrado (prédio). A chave EXISTE — nav id sem
  entrada em `ICONS` derruba a Sidebar (`ICONS[id]` undefined → `d.map` de
  undefined), que foi o P0 do "assistente". Testado no build (rota `/empresas`
  no manifesto, sem crash).
- **Visível por default:** `NAV_ENTITLEMENT.empresas = null` e
  `NAV_MODULE_KEY.empresas = null` → a aba **nasce ligada** pro tenant, sem exigir
  tier de plano. Isto casa a direção CRÉDITOS ("módulo = kill-switch, não paywall").
- **Por que NÃO usei `@ModuleAccess('empresas')` no controller:** o
  `ModuleAccessGuard`/`canUserAccessModule` só libera módulo que esteja no set
  default de um PLANO (via catálogo comercial) — usar ali viraria **paywall por
  tier**, o oposto do pedido. Em vez disso, o controller usa só `JwtAuthGuard`
  (mesmo padrão do `CadastrosController`) e o companyId sai do JWT.
- **Kill-switch do master:** o `SystemModule 'empresas'` (defaultEnabled=true)
  fica no catálogo pro master poder cortar por empresa no futuro. Quando quiser
  ligar o corte por-empresa, é trocar `NAV_MODULE_KEY.empresas` de `null` para
  `"empresas"` e gatear o controller — deixei documentado inline.

## Estado vazio
"Nenhuma empresa ainda — as empresas aparecem aqui quando você puxa contas do
Radar." Sem prometer botão de cadastro que ainda não existe (cadastro manual é
N4).

## Checks (resultado)
- **Backend `npm run build` (tsc estrito):** ✅ VERDE, 0 erro.
- **Frontend `npm run build` (next build):** ✅ VERDE — "Compiled successfully",
  rota `/empresas` no manifesto (static).
- **Frontend `tsc --noEmit`:** ✅ VERDE, 0 erro.
- **`check-pele.mjs` (5 Leis):** meus arquivos = **0 violações** (0 hex/rgba/hsl,
  0 arbitrary-Tailwind, 0 style inline visual; conferido por grep nos arquivos
  novos + bloco `.emp-*`). ⚠️ O script REPROVA por **violações R1
  PRÉ-EXISTENTES** que NÃO são minhas e já estão no HEAD commitado:
  `whatsapp.css:86` (`#1C1C1E`), `bot-builder.css:163` (`rgba`), `screens.css`
  linhas 1555/1572 (`box-shadow rgba`) e outras de `whatsapp.css`. Meu bloco
  começa após a linha ~3520. Não toquei nesses arquivos e não posso "consertá-los"
  sem sair do escopo N3 (seriam mudanças de pele alheias). **Decisão pro dono:**
  ou tokenizar essas peles pré-existentes num PR de pele à parte, ou marcá-las
  com `/* pele-allow */`. N3 em si não adiciona nenhuma violação.

## Guardrails respeitados
- **NÃO publiquei.** Branch `claude/nucleo-crm`.
- **NÃO usei `git stash`.**
- **NÃO toquei** `buscar-empresas.tsx` nem `vendas/page.client.tsx`.
- **Trabalho paralelo do dono preservado:** o working tree tem `leads/page.client.tsx`
  (modificado) e `filtro-avancado-modal.tsx` (novo) — são o refab "Buscar empresas"
  do DONO, não meus. **NÃO os commitei nem toquei**; o commit de N3 inclui só os
  8 arquivos da tabela acima.

## Decisões pro dono revisar
1. **Rótulo "Empresas" = só PJ** (conforme plano item 2). PF (Dona Maria) fica na
   janela "Clientes"/Contatos de N4. Se preferir "Empresas" já englobando PF,
   é ajustar o filtro `tipo` do `listEmpresas`.
2. **Posição no menu:** coloquei "Empresas" logo após "Conversas" (é janela da
   espinha, perto do funil). Fácil remanejar 1 linha se quiser noutro lugar.
3. **Kill-switch inerte por ora:** a aba nasce ligada e não há corte por-empresa
   ativo (gate = null). O interruptor existe no catálogo, mas só age quando você
   pedir pra ligar o `NAV_MODULE_KEY.empresas="empresas"` + `@ModuleAccess`.
4. **check-pele pré-existente vermelho** (ver acima) — precisa de decisão sua
   (PR de pele à parte OU `pele-allow`), independe de N3.
