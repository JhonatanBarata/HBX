# HBX — Roteador de regras

Leia este arquivo primeiro. Depois leia APENAS o arquivo de domínio relevante ao que vai alterar.

## REGRA ZERO — SIGA O QUE O DONO FALAR

Ordem do dono executa-se literalmente, sem reinterpretar nem "melhorar". Mas literal
não é burro: pense a **feature inteira** — o backend e a tela que ele serve nascem
juntos, nunca um sem o outro. Proponha, traga ideia, seja criativo no COMO; não vire
executor de checklist.

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
- Deploy, publish, release ou restart de produção.
- Refactor amplo fora do escopo pedido.

## Produto

`Radar → Vendas → WhatsApp → Retorno`

Mantenha mudanças alinhadas a esse fluxo. Resultado negativo do Radar nunca é descartado casualmente.

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

A fila de edições pequenas de backend (`PLAN…001.md`) é o único doc persistente:
**migra junto** a cada virada de dia e só esvazia quando os itens são aplicados.

## Webwhats

`Webwhats/` é projeto separado. Leia `Webwhats/AGENTS.md` antes de tocar em qualquer arquivo lá.
