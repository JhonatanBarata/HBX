# F5-fix — Suíte `webscraping.service.test` que trava no Windows + 4 falhas pré-existentes

> Worker Sonnet. Contexto: relato do W2 (02/07): a suíte trava intermitente ~teste 30 no Windows —
> suspeita de `setInterval` em `onModuleInit` não limpo entre instâncias de teste. Além disso há
> 4 falhas PRÉ-existentes conhecidas: estado estático do governor Google Places vazando entre
> testes + mock incompleto de `radarCoverage` (`getRadarCoverageForCombo` undefined).

## Missão
`node --test dist/webscraping/webscraping.service.test.js` termina verde, 3 execuções seguidas,
sem timeout — no Windows.

## Como
1. Reproduza o travamento (rode a suíte; se travar, capture onde).
2. Cace `setInterval`/`setTimeout` recorrentes criados em `onModuleInit`/constructor dos serviços
   que a suíte instancia (candidatos: governor de fontes/frota, fila de missões, post-delivery,
   zap-check-guard). Fix CORRETO: `.unref()` nos timers de infra + `onModuleDestroy` limpando —
   nunca gambiarras de teste escondendo timer vivo.
3. As 4 falhas: isolar estado estático (reset explícito em before/beforeEach do teste OU método
   `resetForTests()` no serviço) e completar o mock de `radarCoverage`. NÃO afrouxe asserção de
   produto pra passar.
4. Qualquer teste que leia env ambiente: PINAR (worktree não tem `.env`, host tem — teste que
   passa por acaso no worktree quebra no host).

## Regras duras
- NÃO mudar comportamento de produção além de `.unref()`/`onModuleDestroy`/reset-para-teste.
- NÃO tocar prisma schema, Webwhats, :3107.
- Validação: `cd backend && npm run build` + suíte completa 3× verde + suítes vizinhas que você
  tocar. Commit na branch do worktree. Relatório: causa-raiz do travamento (prova), arquivos,
  antes/depois das 4 falhas.
