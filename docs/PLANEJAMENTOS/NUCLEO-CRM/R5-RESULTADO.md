# NÚCLEO-CRM R5 — bordas endurecidas (RESULTADO)

> Fatia BACKEND-ONLY do sprint R5 do `PLANO-ROBUSTEZ.md`. Worker LOCAL, direto no
> master, NÃO publicado. ZERO toque em `frontend/**` e `tests/e2e/**` (WIP do dono).
> e2e/Playwright ADIADO de propósito (colide com o WIP do dono em `tests/e2e/**`).

## O que já estava blindado (confirmado, não mexi)
- **ValidationPipe global** (`src/main.ts`) já roda com `whitelist:true` +
  `forbidNonWhitelisted:true` + `transform:true`. Ou seja: **campo extra no body →
  400** e **tipo errado → 400** já valiam pra TODO endpoint novo (nucleo+logistica).
- Os DTOs de `nucleo/dto/nucleo.dto.ts` e `logistica/dto/logistica.dto.ts` já vinham
  decorados com `class-validator` (`@IsString/@IsInt/@IsBoolean/@IsOptional/@Min/@Max/
  @MaxLength` + tetos em strings livres: nome 160, notes 500, template 1000, motivo 240/300).
- Cross-tenant **no SERVIÇO** já devolvia `null` p/ id de outro tenant (merge/soft-delete
  provados em `nucleo-r3.test.ts`; `updateFinanceiroCliente` em `logistica.service.test.ts`).
  A maioria dos controllers já mapeava `null → NotFoundException` (404).

## O que GANHOU validação / o que corrigi
1. **Enum travado no DTO** (antes era só `@IsString` + validação tardia no serviço):
   - `ConfirmarEntregaDto.receiptMethod` → `@IsIn(['pix','dinheiro','fiado'])`.
   - `UpdateFinanceiroClienteDto.formaPagamento` → `@IsIn(['aberto','mensal','na_hora','pendura'])`.
   - `UpdateFinanceiroClienteDto.metodoPadrao` → `@IsIn(['pix','dinheiro',''])` (`''` limpa o método).
   - (`tipo:'pf'|'pj'` no nucleo já era `@IsIn` — mantido.)
   Efeito: `formaPagamento:'xyz'` / `receiptMethod:'cripto'` são barrados na BORDA (400),
   não mais dependendo só do `normalize*` do serviço. Serviço segue validando por segurança.
2. **Bug de vazamento de existência corrigido** — `NucleoController.getEmpresa` lançava
   `ForbiddenException` (**403**) p/ id de outro tenant, o que VAZA a existência do
   registro alheio. Trocado por `NotFoundException` (**404**), alinhado ao resto dos
   endpoints e à regra R5 ("404, não 403 vazando existência"). `ForbiddenException`
   permanece só p/ "empresa não identificada" no próprio token (403 legítimo).

## Arquivos tocados (SÓ estes; git add por caminho, sem `-A`)
- `backend/src/logistica/dto/logistica.dto.ts` (import `IsIn` + 3 enums travados).
- `backend/src/nucleo/nucleo.controller.ts` (getEmpresa 403→404).
- `backend/src/nucleo/nucleo-r5.dto.test.ts` (NOVO — DTO estrito via ValidationPipe real).
- `backend/src/nucleo/nucleo-r5.crosstenant.test.ts` (NOVO — 404 cross-tenant nos endpoints id-scoped).

## Provas por teste (node --test, backend)
- **`nucleo-r5.dto.test.ts`** (mesma config do pipe global): (a) campo extra → 400;
  (b) enum inválido (`formaPagamento:'xyz'`, `receiptMethod:'cripto'`, `tipo:'mei'`) → 400;
  (c) tipo errado / teto estourado → 400; (d) payload válido passa (inclui `metodoPadrao:''`).
- **`nucleo-r5.crosstenant.test.ts`**: id de outro tenant → **404** em TODOS os endpoints
  id-scoped novos — nucleo (getEmpresa, updateConta, addContato, updateContato, mergeConta,
  deleteConta, deleteContato) e logistica (confirmar, cancelar, reenviarAviso, deleteEntrega,
  extrato, updateFinanceiroCliente, updateClienteProduto, getAvisarCliente, setAvisarCliente).

## Checks (todos VERDES)
- `cd backend && npm run build` → limpo (tsc + prisma generate).
- `npx prisma validate` → schema válido (não toquei schema).
- `node --test` nucleo (25/25, inclui 6 novos R5) + logistica (48/48).

## Escopo NÃO feito (de propósito)
- **e2e / Playwright mobile**: ADIADO — colide com o WIP do dono em `tests/e2e/**`.
  Cobertura de borda entregue via `node --test` backend (DTO + controller 404).
- Nada de lógica de negócio / dinheiro / WhatsApp / flags foi alterado. NÃO publicado.
