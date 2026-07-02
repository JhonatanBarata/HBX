# F3 — :3107 vira o cockpit da árvore (home "Árvore do motor" + endpoint agregador)

> Worker Sonnet. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (F3, tem a
> tabela caixa→número→fonte), o desenho `docs/PLANEJAMENTOS/ARVORE-MESTRA/pesquisa-vps.svg`
> (a topologia que a tela replica), `hbx-owner/local-agent/web/tree.js` (padrão IIFE) e o
> TREE_CONTRACT.md que ele cita (procure no diretório do local-agent).

## Missão
O dono abre `http://127.0.0.1:3107` e responde em 10s: "o que rodou, o que travou, quanto gastou,
quanto tem no estoque" — olhando a MESMA grade da árvore mestra, com números reais.

## Parte 1 — backend: `GET /modules/owner/radar/tree-status`
Endpoint novo no módulo owner (mesmo guard JWT+Master das rotas `/modules/owner/*` existentes),
agregando NUMA resposta (cache in-memory 10s):
- `seed`: buscas de hoje (runs).
- `rfb`: count `CnpjPublicCompany` + flag `HBX_RADAR_CNPJ_PUBLIC_ENABLED` atual.
- `web`: engines vivos/teto (fonte que o governor de frota já usa).
- `gates`: aceitos × rejeitados de hoje (use `RadarLeadEvent`/contadores existentes; se não houver
  contador barato, derive do pool do dia — NÃO crie tabela).
- `fusion`: % de cards de hoje com 2+ fontes (`sourceEngines`).
- `enrich`: fill-rate email/insta/sócio do pool de hoje.
- `zapGate`: stats do `ZapCheckGuardService` (cache-hit, bloqueados, estado do disjuntor, fila) —
  se o serviço não expõe getter, adicione um `getStats()` read-only nele (só leitura, zero mudança
  de comportamento).
- `card`: entregues hoje + split de `sourceChain`.
- `missions`: stats da fila S4 (serviço de stats já existe em `radar/missions/`).
- `vault`: gauges do governor S3 (brave/serper/places — reusar o que o gauge atual consome).
Tudo tolerante a falha parcial: bloco que falhar volta `null` + `error`, nunca derruba a resposta.

## Parte 2 — :3107 (vanilla, padrão do app)
- **Arquivo NOVO** `hbx-owner/local-agent/web/arvore.js` (IIFE isolado, mesmo padrão do `tree.js`:
  helper de fetch próprio com token, escape próprio, não toca globais do app.js).
- Aba/nav "Árvore do motor" no `index.html` — **mexa o MÍNIMO no index.html e NADA no app.js**:
  outro worker está removendo os botões da fábrica antiga em paralelo (`btn-factory`/`btn-ft-*`);
  não toque nesses blocos ou o merge quebra.
- `server.js`: proxy do `tree-status` no padrão `backendRequest` existente.
- Render: a grade do `pesquisa-vps.svg` + fábrica + cofre — caixas com número grande + subtítulo,
  cor por estado (ok/atenção/off), polling 15s, clique na caixa abre painel de detalhe simples
  (pré-formatado, sem lib nova).
- Ações: botão PARAR TUDO com estado vivo (rota de emergency stop que o app já usa) e redrive
  de dead-letter (rota missions existente). Confirmação explícita nas duas.
- Zero framework, zero CSS framework — classes/tokens do próprio app.

## Regras duras
- NÃO tocar prisma schema, Webwhats, radar core (exceto o `getStats()` read-only), app.js.
- Validação: `cd backend && npm run build` + teste unitário do agregador (mock dos provedores,
  pinando QUALQUER env que leia — lição de hoje: worktree não tem `.env`, host tem; teste que lê
  env ambiente sem pinar = bomba). Pro :3107: `node hbx-owner/local-agent/server.js` sobe e
  serve a página sem erro no console (smoke via curl).
- Commit na branch do worktree. Relatório: rotas, arquivos, screenshot textual da árvore
  (estrutura), o que ficou mock/null, testes.
