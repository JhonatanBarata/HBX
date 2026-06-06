# HBX Master Git / PR Workflow

## Estados

- master atualizado
- PR listado
- PR criado pelo Codex
- lote aprovado pelo dono
- lote mergeado manualmente
- checkout integrado atualizado
- localhost subindo
- localhost aberto
- teste rodando
- teste passou
- teste falhou
- merge liberado
- merge feito
- publicacao pendente
- publicado

## Fluxo principal

O fluxo principal do HBX Master e validar o lote integrado, nao obrigar o dono a testar cada PR isoladamente.

1. Ticket seguro vira PR pequeno pelo Codex PR Worker ou Codex Cloud.
2. O dono revisa e pode mergear varios PRs em paralelo.
3. O HBX Master le o checkout atual, ja com os merges aplicados.
4. O Local Agent roda `npm run up` nessa pasta.
5. O dono abre `http://localhost:3001` e testa o ticket no sistema real.
6. O painel de Git mostra diff contra `origin/master...HEAD` quando houver lote ainda nao publicado.
7. O painel de Testes roda os pacotes por area alterada.
8. Se o lote tocar HOLD, o HBX Master sinaliza revisao manual antes de qualquer publicacao.

## Fluxo opcional por PR

Baixar PR isolado continua permitido, mas e ferramenta de diagnostico.

Use quando:

- o dono quer entender um PR antes de mergear;
- houve conflito entre PRs;
- um teste do lote falhou e precisa isolar causa;
- o Codex Cloud entregou algo suspeito.

Nao usar como regra obrigatoria para todo ticket simples.

## Comandos seguros

- `git status --short`
- `git branch --all`
- `git fetch origin`
- `gh pr list`
- `gh pr checkout <n>`
- `gh pr view <n>`
- `git diff --name-only origin/master...HEAD`
- `npm run up`
- `npm run down`

## Comandos proibidos inicialmente

- `git reset`
- `git clean`
- `git push direto`
- `merge automatico`
- `force`
- `publish automatico`

## HOLD por arquivo

- `.env`
- `secrets`
- `migrations`
- `auth`
- `billing`
- `commercial-plans`
- `deploy`
- `docker-compose`
- `scripts/ops`

## Teste por area

- Frontend: lint e build.
- Backend: prisma validate e build.
- Webwhats: typecheck e build.
- E2E: `npm run test:e2e` somente quando ambiente estiver pronto.

## Criterio para responder ticket

Um ticket so deve ser marcado como resolvido quando:

- o lote integrado sobe no localhost;
- a rota ou fluxo do cliente foi testado visualmente;
- os testes relevantes passaram ou a falha foi registrada como pre-existente;
- nenhum HOLD foi ignorado;
- o dono decidiu se o lote pode seguir para publicacao.
