# W3 — Front: seção Módulos em /configuracoes + ficha do master + fail-open da nav

Leia `CONTRATOS.md` (mesma pasta) antes. Só frontend. Arquivos-alvo: `frontend/src/app/(app)/configuracoes/page.client.tsx`, `frontend/src/app/(app)/master/janela-empresas.tsx`, `frontend/src/components/hbx/shell.tsx` (1 fix pontual). NÃO tocar em `frontend/src/app/entrega/*` nem `components/casca/*` (W4 em paralelo).

## 1. Seção "Módulos" em /configuracoes (SÓ isTenantAdmin)
- Nova seção na lista SECTIONS (ícone coerente com as existentes), visível só p/ `isTenantAdmin` (mesmo padrão da seção Integrações).
- Conteúdo: os toggles de categoria vindos de **GET `/profile/module-categories/options`** — 1 linha por categoria com label já usado no OOBE (Radar de empresas, Vendas e Agenda, WhatsApp e IA, Logística, Website) + switch. Categoria `locked` NÃO aparece (nunca mostrar o que o master não liberou).
- Toggle → recomputar o conjunto ligado e **POST `/profile/module-categories`** com a lista completa; otimista + rollback em erro (padrão das notification-prefs da própria tela). Mínimo 1 categoria ligada — impedir desligar a última (switch trava, sem textão).
- Após salvar OK: invalidar a visão de módulos do shell — a sidebar usa cache de 60s (`fetchMyModulesCached`); seguir o padrão mais simples já usado no repo (OOBE usa reload; aqui preferir soft: se existir função de invalidar cache exportável, usar; senão, reload da página).
- ZERO textão: título da seção + switches; no máximo 1 linha de hint.

## 2. Ficha da empresa no /master (janela-empresas)
- O painel Módulos continua com o toggle do master (agora TETO/`masterEnabled` no backend — W1). Exibir ao lado, discreto, o estado da empresa quando divergente (ex. tag pequena "empresa desligou" quando `masterEnabled=true && companyEnabled=false`). Adaptar ao shape novo da resposta (`masterEnabled`/`companyEnabled`/`effective` — ver CONTRATOS nº3); o toggle liga/desliga o teto.

## 3. Fix fail-open da nav (sujeira da auditoria)
- `shell.tsx` `isModuleVisible`: id ausente nos mapas (`NAV_MODULE_KEY`/`NAV_ENTITLEMENT`) hoje cai em `?? null` = visível pra todos. Trocar para fail-closed: id sem entrada EXPLÍCITA em ambos os mapas → oculto (+ `console.warn` em dev). Os `null` explícitos existentes continuam = sem gate. Conferir que TODOS os ids de NAV_LINKS têm entrada explícita nos dois mapas (adicionar `null` explícito onde faltar) — nada pode sumir da nav com esse fix.

## Regras
- 5 Leis do Design System: zero cor/borda/sombra/fonte solta; usar classes/tokens do `hbx-theme/`; switches = componente/classe já existente no repo (procurar padrão de toggle usado em Notificações).
- PT-BR mínimo, sem inventar texto.

## Checks obrigatórios
- `cd frontend && npx tsc --noEmit` (ou script de typecheck). Se acusar erro FORA dos arquivos desta frente (W4 em paralelo), ignorar e anotar.
- `node frontend/scripts/check-pele.mjs` se existir (procurar o caminho real do script; roda no lint).
- NÃO commitar. Retornar JSON: `{status, filesTouched[], checks, pendencias[], notas[]}`.
