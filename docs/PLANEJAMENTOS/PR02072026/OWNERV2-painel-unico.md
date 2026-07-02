# OWNER V2 — :3107 vira UM painel: LOCAL na esquerda × VPS na direita (9 exigências do dono)

> Worker Opus. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (adendo 02/07),
> `hbx-owner/local-agent/server.js` + `web/` (padrão IIFE; `tree.js`/`arvore.js` como referência
> de estilo). Decisão do dono: **refazer sem legado** — o layout novo substitui, não convive.

## O desenho (lei do dono)
UM painel só. Coluna ESQUERDA = LOCALHOST. Coluna DIREITA = VPS. Sem abas paralelas duplicando
função. `:3107` é a ÚNICA tela do sistema Owner (ops-control segue headless; nada renasce em
outra porta).

## Exigências (numeração do dono — implementar TODAS)
1. **Fábrica (esquerda):** cartão da fábrica de enriquecimento — status/progresso (processados,
   budget restante, lead atual, erros) + campo "quantos leads" + botões INICIAR (budget
   obrigatório) e **PARAR** (só aqui — ver exigência 2). Contrato EXATO com o backend LOCAL
   (outro worker implementa; até lá, degrade gracioso "fábrica offline"):
   `GET /modules/owner/fabrica/status` · `POST /modules/owner/fabrica/start {budget}` ·
   `POST /modules/owner/fabrica/stop`. Proxy via `backendRequest` do server.js.
2. **Parar é LOCAL e escopado:** o botão Parar vive no cartão do motor de scraping local
   (risco de ban de IP), junto do "só scrapear X". **NÃO existe botão "PARAR TUDO" no lado
   VPS** — remover o que a aba árvore criou (decisão do dono: VPS é fluido; o freio de lá é o
   governor fail-closed).
3. **Zero pago na esquerda:** a coluna local não mostra NENHUM painel/config de fonte paga.
   O painel "Fonte de busca · grátis primeiro, pago só reforço" (gauges Brave/Places/Serper…)
   fica SÓ na direita (VPS) — exigência 8 do dono.
4. **IA LOCAL × IA VPS (exigências 4 e 7):** seção "IA LOCAL" (esquerda) = o que já existe do
   Ollama (:11434, allowlist 7b/30b, warm, chat) renomeado; seção "IA VPS" (direita) = slot com
   o que estiver configurado hoje (read-only do env da VPS via ops-control) + estado "a definir
   em testes" — NÃO inventar backend de IA na VPS.
5. **Saúde (exigência 5):** cartões de saúde localhost e VPS — JÁ EXISTEM; reorganizar nas
   colunas certas, sem reescrever a coleta.
6. **BANCO (exigência 6, direita):** visão do servidor de leads inteiro da VPS + botão
   **"Exportar tudo (csv.gz)"**. Backend VPS: endpoint novo `/modules/owner/radar/export-all`
   fazendo streaming com memória constante (cursor paginado ou COPY, gzip no fluxo — precisa
   aguentar milhões de linhas), proxied até o navegador (download). CSV = colunas do lead +
   contatos achatados (tel1..3, email1..3, insta, fb, site, nota).
7. **Aba "Árvore do motor" morre como aba** (sem legado, incluindo o de ontem): os números do
   `tree-status` viram CARTÕES dentro das colunas (fila/missões e gauges na direita; o que for
   local na esquerda). Deletar `arvore.js` e a nav dela; o endpoint `tree-status` do backend FICA
   (é a fonte dos cartões). Aproveite os padrões bons dele (falha parcial = null honesto).
8. **Cockpit de leads e transferência local↔VPS existentes:** mantêm a função, entram no layout
   novo (não duplicar, não deixar tela órfã).
9. **Uma tela só:** garantir que nenhum resto de UI antiga fica acessível (nav antiga, abas
   mortas, arquivos js órfãos carregados no index) — remoção FÍSICA dos arquivos substituídos.

## Regras duras
- Vanilla JS/IIFE + classes/tokens do próprio app — sem framework, sem CSS lib.
- NÃO tocar: `backend/prisma/schema.prisma`, `Webwhats/`, radar core (exceto o endpoint
  `export-all` novo no módulo owner), rotas de fábrica local (contrato acima é de outro worker).
- Fábrica antiga: se sobrarem `btn-factory`/`btn-ft-*`/`factory-hero` no seu worktree (outro
  worker está demolindo em paralelo), NÃO os carregue pro layout novo — o v2 nasce sem eles.
- Testes que leem env: pinar. Junction node_modules igual aos demais workers.
- Validação: `cd backend && npm run build` + teste do endpoint export (mock, streaming, gzip) +
  smoke real do :3107 (`node hbx-owner/local-agent/server.js` + curl das rotas + abrir a página).
- Commit na branch do worktree. Relatório: layout final (descrição por coluna), rotas novas,
  arquivos deletados (lista), o que degrada gracioso aguardando F2, testes, pendências.
