# W4 — Front /entrega: destino só-logística, de-HBX, Financeiro, Ajustes com módulos

Leia `CONTRATOS.md` (mesma pasta) antes. Só frontend. Arquivos-alvo: `frontend/src/app/entrega/*`, `frontend/src/components/casca/mobile-shell.tsx` (redirect), `frontend/src/components/casca/hbx-mark.tsx` NÃO editar (criar variante local em entrega/ se precisar). NÃO tocar em `(app)/configuracoes` nem `master/*` nem `shell.tsx` (W3 em paralelo).

Helper compartilhado da frente: `soLogistica(mods)` conforme CONTRATOS ("Detecção só-logística"). Módulos via `/modules/me` (existe fetch cacheado no shell — se não for importável sem tocar shell.tsx, fazer fetch próprio leve em entrega/ com cache em módulo).

## 1. Redirect mobile module-aware (mata o /vendas-403)
- `mobile-shell.tsx` ~301: trocar o redirect incondicional `/dashboard→/vendas` por: módulos carregados → se `vendas` accessible → `/vendas`; senão se `soLogistica` → `/entrega`; senão → primeira aba visível da casca (ordem atual da tab bar; fallback `/empresas`). Enquanto módulos carregam, manter o loader atual (sem flash). Cuidado com loop (só redirecionar 1x por mount).

## 2. De-HBX no /entrega quando só-logística
- Header (`EntregaScaffold`): quando `soLogistica`, no lugar de `<HbxMarkViva/>` mostrar o NOME DA EMPRESA (de `/profile/current-user`, cache em módulo + localStorage p/ PWA offline), tipografia via token existente; caso contrário, marca HBX como hoje.
- `document.title = "Entregas"` quando só-logística (client-side).
- Tab bar (`EntregaTabBar`): 5º item dinâmico — `soLogistica` → some o item "HBX"; se `moduloFinanceiroAtivo` (GET /logistica/config já consumido no app) → entra aba "Financeiro" (`/entrega/financeiro`, ícone novo em icons.tsx no mesmo estilo). Não-só-logística → item "HBX" continua, mas `href` vira `/dashboard` (nunca mais /vendas hardcoded).
- Hint do countdown (`page.client.tsx` ~744): "Volte pro HBX —" → "Volte pro app —" (p/ todo mundo).

## 3. Ajustes: módulos + voltar pro HBX
- Nova seção "Módulos" (padrão `.ent-section`, mesma pegada visual), **só para dono/admin** (role de `/profile/current-user`; entregador USER não vê): switches das categorias de **GET `/profile/module-categories/options`**, escondendo `locked` e escondendo a própria `logistica` (está dentro dele; e o POST exige mín. 1 ligada — a logistica ligada garante isso). Toggle → POST `/profile/module-categories` com o conjunto completo recomputado, otimista+rollback, chips "salvando…/salvo ✓" do padrão da tela. Ao ligar algo, o 5º item da tab bar reflete (recarregar mods).
- Item "Abrir o HBX completo" (linha simples → `/dashboard`) quando `soLogistica` — é a volta que saiu da tab bar.

## 4. Tela Financeiro (`/entrega/financeiro`) — fase 1
- Gate: `moduloFinanceiroAtivo`; OFF → não renderiza conteúdo (mesma pegada dos stats).
- Lista de clientes com saldo: **GET `/logistica/financeiro/saldos`** — linha: nome, saldo aberto, aguardando fechamento. Toque → detalhe do cliente (mesma tela, drill-down ou CascaSheet — seguir padrão de navegação já usado em clientes/).
- Detalhe do cliente: (a) resumo (saldo aberto / aguardando fechamento — dados do extrato existente); (b) **extrato de entregas** via **GET `/logistica/clientes/:id/entregas`**: linha = data + hora (deliveredAt), itens resumidos (qtd× produto), valor, e ✓/✗/– do WhatsApp (whatsappStatus enviado/falhou/pulado — ícone pequeno, sem textão) com paginação "carregar mais"; (c) extrato de cobranças (endpoint existente `/logistica/clientes/:id/extrato`) com botão **"Marcar pago"** nas pendentes → **POST `/logistica/charges/:id/quitar`** (confirm 1 toque, otimista+rollback). "Marcar pago" só para dono/admin (mesma role da seção Módulos).
- Botão "Financeiro" na FICHA do cliente (`clientes/page.client.tsx`): abre o detalhe financeiro desse cliente (mesma rota com query/param ou sheet — o que for mais simples no padrão atual).
- Stats do dia da home FICAM onde estão (regra do dono — P4). Não mover nada da home.

## Regras
- Visual 100% nas classes `ent-*`/tokens (`hbx-theme/entrega.css`); zero hex/inline; mobile-first 1 tela; PT-BR mínimo (label + campo).
- `*/` em comentário CSS derruba o app. `.next` pode cachear "Can't resolve" de arquivo novo — se acontecer, apagar `.next`.

## Checks obrigatórios
- `cd frontend && npx tsc --noEmit` (erros fora desta frente: ignorar e anotar).
- check-pele se houver script.
- NÃO commitar. Retornar JSON: `{status, filesTouched[], checks, pendencias[], notas[]}`.
