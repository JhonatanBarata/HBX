# HBX Codex Automacao Noturna

Fase 1: somente relatorio.

Esta fase deixa o Codex procurar problemas, rodar checks seguros e reportar achados. Ela nao altera arquivos rastreados, nao abre patch, nao faz deploy e nao mexe em pagamento, auth, secrets, migrations ou regras comerciais.

## Fase 1 - PC ligado

No Codex App, crie uma automacao standalone para o projeto HBX:

- Schedule: `23:59 America/Sao_Paulo`
- Execution: dedicated git worktree
- Prompt: `$hbx-nightly-maintainer`

Regras do prompt:

```text
Rode uma auditoria noturna HBX em modo somente relatorio.
Use $hbx-nightly-maintainer.
Nao altere arquivos rastreados nem crie patch.
Nao faca commit, push, merge, deploy, publish, migration, seed ou restart.
Nao mexa em pricing, plano, paywall, checkout, pagamentos, auth, autorizacao, secrets, env vars ou regras comerciais.
Reporte checks rodados, falhas, riscos e proximos patches seguros.
```

## Fase 1 - PC desligado

Use o workflow do GitHub Actions:

- `.github/workflows/hbx-nightly-codex-audit.yml`
- horario: `23:59 America/Sao_Paulo`
- prompt: `.github/codex/prompts/nightly-audit.md`
- modo: `sandbox: workspace-write`, para permitir builds/checks que geram artefatos temporarios
- trava: o workflow falha se o Codex alterar arquivos rastreados em modo somente relatorio

Antes de usar no GitHub, configure o secret:

- `OPENAI_API_KEY`

O relatorio fica como artifact do workflow:

- `hbx-nightly-codex-audit`

## Fase 2 - PC ligado

No Codex App, crie uma segunda automacao standalone para o projeto HBX:

- Schedule: `23:59 America/Sao_Paulo`
- Execution: dedicated git worktree
- Prompt: `$hbx-nightly-patcher`

Regras do prompt:

```text
Rode manutencao noturna HBX fase 2.
Use $hbx-nightly-patcher.
Trabalhe somente em worktree/branch isolada.
Faca apenas correcoes pequenas e seguras.
Nao faca merge, deploy, publish, migration, seed ou restart.
Nao mexa em pricing, plano, paywall, checkout, pagamento, auth, autorizacao, secrets, env vars, migrations ou regras comerciais.
Rode os checks relevantes.
Deixe um resumo claro dos arquivos alterados, checks e riscos.
```

## Fase 2 - PC desligado

Use o workflow do GitHub Actions:

- `.github/workflows/hbx-nightly-codex-patch.yml`
- horario: `23:59 America/Sao_Paulo`
- prompt: `.github/codex/prompts/nightly-patch.md`
- modo: `sandbox: workspace-write`
- saida: cria branch `codex/hbx-nightly-patch-*` e abre PR quando houver patch seguro
- trava: falha se tocar mais de 5 arquivos, `.github`, `.agents`, `AGENTS.md`, manifests/lockfiles, artefatos gerados ou caminhos protegidos de pagamento, auth, billing, migrations, secrets, webhooks ou acesso comercial

Antes de usar no GitHub, configure o secret:

- `OPENAI_API_KEY`

O PR nunca faz merge sozinho. O fluxo correto continua sendo:

Codex propoe -> PR abre -> checks rodam -> voce revisa -> merge manual.

O relatorio fica como artifact do workflow:

- `hbx-nightly-codex-patch`

## Fase 3 - Corrigir CI de PR

A fase 3 e sob demanda. Ela nao roda por horario. Use quando um PR estiver com checks quebrados.

Opcoes:

- comentar `/codex-fix-ci` dentro do PR;
- rodar manualmente o workflow `.github/workflows/hbx-pr-codex-ci-fix.yml` com o numero do PR.

O workflow:

- le o PR e seus checks;
- usa regras inline no workflow e tambem pode usar `.github/codex/prompts/fix-ci.md` / `$hbx-ci-fixer` quando esses arquivos ja existirem na branch do PR;
- tenta corrigir apenas causa clara de lint/type/build/test;
- empurra commit pequeno para a propria branch do PR, se for branch do mesmo repositorio;
- comenta o resultado no PR;
- nao faz merge, auto-merge, deploy, publish, migration, seed ou restart.

Travas:

- bloqueia PR vindo de fork;
- falha se tocar mais de 5 arquivos;
- bloqueia `.github`, `.agents`, `AGENTS.md`, manifests/lockfiles, artefatos gerados, secrets, migrations, auth, pagamento, billing, webhooks, checkout e acesso comercial;
- se a falha for ambigua ou protegida, ele so comenta relatorio.

Antes de usar no GitHub, configure o secret:

- `OPENAI_API_KEY`

O relatorio fica como artifact do workflow:

- `hbx-codex-ci-fix`

## Observacao

A fase 1 continua disponivel como modo conservador. Se os workflows de fase 1 e fase 2 ficarem agendados ao mesmo tempo, os dois rodam as `23:59 America/Sao_Paulo`. A fase 3 fica manual por seguranca.
