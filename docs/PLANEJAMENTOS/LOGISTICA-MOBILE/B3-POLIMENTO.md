# B3 — Polimento de confiança: confirmação offline VISÍVEL + data viva + endereço estruturado

> Worker Sonnet. Trabalhar DIRETO no master (NUNCA criar branch/worktree/stash). Commit local por
> caminho (`git add <paths>`), mensagem `feat(logistica): ...` / `fix(logistica): ...`. **NÃO
> publicar.** Antes: `git status` + conferir `origin/master`. `casca.css`/`kit.css` sujos do dono —
> INTOCÁVEIS. Aprovado pelo dono 07/07.

## Defeitos a matar (revisão 07/07)
1. **Confirmação offline invisível** (`frontend/src/app/entrega/page.client.tsx`): sem sinal, a
   parada confirmada continua "aberta" no carrossel (o backend está blindado por idempotencyKey —
   NÃO mexer nisso). O entregador fica sem feedback e pode reconfirmar.
2. **Data "Hoje" congelada**: `DATA_HOJE` é constante de módulo (~linha 41) — PWA aberto de um dia
   pro outro mostra ontem.
3. **Reeditar cliente degrada o endereço** (`clientes/page.client.tsx` ~linhas 257–260): o texto
   composto ("Rua X, 123 - Centro") volta inteiro pro campo Endereço com número/bairro vazios;
   salvar de novo pode gerar "Rua X, 123 - Centro, 456".

## O que fazer
1. **Offline visível**: a fila IndexedDB (`entrega-offline.ts`) JÁ tem os `entregaId` pendentes
   (`listAll`). Expor os ids no hook `useOfflineSync` (`entrega-hooks.ts`); em `page.client.tsx`:
   - paradas com confirmação na fila SAEM do carrossel de abertas (localmente);
   - na lista "Hoje", essas paradas ganham tag de sincronização (⇅) no lugar do ETA;
   - quando a fila drena e o reload confirma 'entregue', o fluxo atual já cobre.
2. **Data viva**: derivar a data de um estado que re-calcula em `visibilitychange`/foco (barato,
   sem interval agressivo). PWA que virou a noite aberto mostra o dia certo ao voltar pro app.
3. **Endereço estruturado** (aditivo, sem quebrar nada):
   - Migration aditiva (padrão N1; SQL à mão se shadow falhar): `CustomerProfile.numero String?`
     + `CustomerProfile.bairro String?` (conferir antes se já não existem no schema).
   - Backend (endpoints do núcleo que a tela usa — mapear via `clientes-api.ts`): aceitar/devolver
     `numero`/`bairro`; CONTINUAR compondo e gravando `endereco` texto como hoje (dupla escrita —
     rota/deep-link/telas antigas seguem lendo `endereco`).
   - Front editor: ao carregar, preencher número/bairro das colunas novas quando existirem (fallback
     atual se não); ao salvar, mandar as partes + o texto composto. Some a degradação.

## Guardrails
- NÃO tocar WhatsApp/cobrança/flags/motor de rota. Idempotência e fila offline (teto/backoff)
  INTACTAS — só LEITURA da fila pra UI.
- Checks: `cd backend && npm run build` + `npx prisma validate` + testes do módulo verdes;
  `cd frontend && npx tsc --noEmit`; check-pele verde. Teste manual mental do fluxo offline
  descrito no RESULTADO.

## Ao concluir
Gravar `B3-RESULTADO.md` (o que mudou, arquivos, checks) e APAGAR este arquivo. Commit local.
