# W1 — P1: Cutover da pesquisa determinística (ordem fixa + sourceChain + legado OFF + PARAR corta grátis)

> Worker Sonnet. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md` (as 3 leis),
> `docs/Rules/MOTOR.md` e, se tocar frontend, `docs/Rules/FRONTEND.md` (5 Leis — nada de hex/inline).

## Missão
Matar a dor nº1 ("nunca sei qual motor rodou"): a pesquisa do cliente vira ordem FIXA
RFB→web, o card grava `sourceChain`, o legado sai da rota atrás de flag, e PARAR congela
TODAS as fontes (inclusive ddg/bing — decisão do dono: parar = nenhuma fonte consultada).

## Âncoras no código
- Ordem das fontes por modo: `backend/src/webscraping/radar/01-search/radar-source-planner.service.ts`
  (mapa `byStrategy`; `cnpj_public` já existe e hoje vem DEPOIS de `hbx_engine`).
- Loop de execução: `radar-core-search-loop.mixin.ts` / `radar-source-executor.service.ts` (mesma pasta).
- Fusão (origem por item): `radar-result-merger.service.ts` (já tem `normalizeSource`).
- Fonte RFB: `radar-cnpj-public-source.service.ts` (flag `HBX_RADAR_CNPJ_PUBLIC_ENABLED`).
- Expansão de vizinhas: `radar-source-expansion.service.ts` / `radar-search-geo.service.ts` (verificar).
- Gate do PARAR (S1, já congela Brave): procurar `emergencyStop` em `radar/shared/radar-core-shared.ts`
  e `03-enrichment/radar-web-enrichment.service.ts`.

## Tarefas
1. **Ordem fixa nos modes de cliente (`fast`/`quality`)**: `cnpj_public` (RFB, formais) ANTES de
   `hbx_engine` (web). A lane do cliente é: semente → RFB → web → portas → fusão → crawl.
2. **Flag `HBX_LEGACY_SOURCES` (default OFF)**: com OFF, saem da rota do CLIENTE (fast/quality/deep):
   `radar_database`-first, `google_textual`, `local_directory`, `vertical_source`. Com ON, tudo volta
   (rollback barato). `night_factory` mantém os `reprocess_*` (fábrica não é rota de cliente).
   Ajustar testes que assumem a ordem antiga.
3. **`sourceChain` no card**: campo OPCIONAL (regra absoluta de cards: campo novo nunca quebra card
   antigo) gravado na persistência do card com a cadeia real (`rfb`, `web`, `rfb+web`). A fusão sabe
   as origens; propagar. Log da busca imprime a cadeia executada NA ORDEM (aceite do P1: o log mostra
   exatamente os motores e a ordem).
4. **Exibição**: no detalhe do card do vendedor, badge discreto com rótulo amigável
   ("Receita Federal + Web" / "Web" / "Receita Federal") — classes/tokens existentes do hbx-theme,
   campo ausente = não renderiza. Se achar o ponto do cockpit :3107 (export/gauge) com <30min de
   esforço, incluir lá também; senão relatar como pendência.
5. **PARAR corta ddg/bing**: o mesmo gate de `emergencyStop` que congela o Brave deve cobrir o
   fallback ddg/bing do `searchWeb` e qualquer disparo novo ao motor web. Teste cobrindo.
6. **Vizinha opt-in**: expansão para cidades vizinhas SÓ com opt-in explícito no request
   (default: não expande). Se o request ainda não tem o campo, criar opcional.
7. **Log dos rejeitados da porta receita**: os filtros da porta receita (ativa/cnae/dv/celular c/ 9)
   logam cada rejeitado com motivo (logger estruturado, sem PII além do necessário).

## Regras duras
- **NÃO tocar** `backend/prisma/schema.prisma` (outro worker é o único autorizado). Se `sourceChain`
  precisar de coluna, usar payload/JSON existente do card; se não houver NENHUM campo viável, gravar
  só no log + relatar (não inventar migration).
- NÃO tocar `Webwhats/` nem qualquer código de conexão/reconexão de chip.
- Regra de ouro do Radar: histórico negativo nunca é apagado.
- Testes: `cd backend && npm run build` (é o typecheck) + `node --test dist/...` dos módulos tocados.
- Commit na branch do worktree com mensagem clara. Relatório final: branch, arquivos, decisões, testes.
