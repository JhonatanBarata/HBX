# HBX — Roteador de regras

Leia este arquivo primeiro. Depois leia APENAS o arquivo de domínio relevante ao que vai alterar.
## Frontend — 5 Leis do Design System (MÉTODO, não freio)
Todo visual nasce em token/classe central (`frontend/src/app/hbx-theme/`); nada de cor,
borda, sombra, fonte ou radius solto em tela; tema só troca tokens; `check-pele.mjs`
reprova hex/inline no lint. Detalhe e exceções: [docs/Rules/FRONTEND.md](docs/Rules/FRONTEND.md).
**Refatorar aparência/peles está AUTORIZADO — não usar as Leis pra recusar trabalho de aparência.**
## Mapa de domínios → `docs/Rules/`
| Vai alterar | Leia |
|---|---|
| Backend, NestJS, Prisma, endpoints, regras de negócio | [docs/Rules/BACKEND.md](docs/Rules/BACKEND.md) |
| Frontend, telas, componentes, CSS, rotas | [docs/Rules/FRONTEND.md](docs/Rules/FRONTEND.md) |
| Radar, scraping, motor Python, enriquecimento, cards | [docs/Rules/MOTOR.md](docs/Rules/MOTOR.md) |
| WhatsApp, Evolution API, Webwhats, mensageria | [docs/Rules/WHATSAPP.md](docs/Rules/WHATSAPP.md) |
| Planos, cobrança, acesso, status comercial | [docs/Rules/PAGAMENTOS.md](docs/Rules/PAGAMENTOS.md) |
| Deploy, infra, Docker, Ops Control, HBX Owner | [docs/Rules/INFRA.md](docs/Rules/INFRA.md) |
| Sites de clientes, templates Firebase | [docs/Rules/WEBSITE-KIT.md](docs/Rules/WEBSITE-KIT.md) |

## Regras de segurança (valem sempre, sem exceção)

Não fazer nada abaixo sem ordem explícita do dono na tarefa atual:
- Preço, plano, paywall, cobrança, checkout, webhook de pagamento, dado de produção.
- Reescrita de auth/autorização, secrets, env de produção, rotação de credencial.
- Migration destrutiva ou operação destrutiva de dados.

## Sem legado (ordem do dono 17/06)

Código morto não fica. Tela/rota/feature unificada ou substituída → a versão antiga sai
**no mesmo passo**: apagada, ou **alias que só redireciona** (`redirect("/canônica")` na
`page.tsx`, ex.: `/workspace`→`/dashboard`, `/webscraping`→`/leads`). Junto vão os
botões/links, a entrada no `app-shell.tsx` (META) e o CSS (`screens.css`) que só ela usava.
Duas coisas vivas pra mesma função = proibido. O dono **raramente reverte CÓDIGO** — o que
se versiona/reverte é REGRA. Antes de editar uma tela, confirme que é a CANÔNICA (a do menu).

## Checks mínimos (menor conjunto relevante ao que foi tocado)

- Frontend: `cd frontend && npm run lint` → `npm run build`
- Backend: `cd backend && npm run prisma:validate` → `npm run build`
- E2E (`npm run test:e2e` na raiz) só quando um caminho end-to-end mudou e o ambiente está pronto.

## Planejamentos (PR)

Planos (PR) vivem em `docs/PLANEJAMENTOS/`. Sempre existe **UMA** pasta de dia ativa.
1. **Pasta do dia existe?** Se não, criar `PR{DD}{MM}{AAAA}` (ex.: `PR13062026`),
   **migrar pra ela tudo que sobreviveu do dia anterior** (o que não está concluído)
   e **apagar a pasta antiga**.
2. **Ler a pasta toda.** Deletar o que já estiver concluído.
3. **Nunca criar `.md` de algo que já existe — injetar no plano existente** e juntar
   o que for do mesmo assunto. Um plano por assunto, não um por edição.
Após limpar a pasta (deletar concluídos), deve sobrar apenas **`testar.md`** — lista dos
testes que precisam passar antes de subir qualquer branch. Nunca deletar esse arquivo.
## Webwhats
`Webwhats/` é projeto separado. Leia `Webwhats/AGENTS.md` antes de tocar em qualquer arquivo lá.
