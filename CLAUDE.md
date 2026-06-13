# HBX — Roteador de regras

Leia este arquivo primeiro. Depois leia APENAS o arquivo de domínio relevante ao que vai alterar.

## REGRA ZERO — SIGA O QUE O PROGRAMADOR FALAR

Ordem do dono executa-se literalmente, sem reinterpretar, sem "melhorar", sem adaptar.

**Frontend — AS 5 LEIS DO DESIGN SYSTEM (ordem do dono, 12/06/2026, bloqueio absoluto):**
1. **Tokens centrais** — todo valor visual nasce em `frontend/src/app/hbx-theme/`
   (skeleton.css = contrato neutro; theme.css = utilities Tailwind v4 dos tokens).
2. **Componentes centrais** — visual repetido vira classe do kit (`kit.css`) ou
   utility; nunca se repete em tela.
3. **Tema SÓ troca tokens** (`[data-theme]`/`[data-theme-mode]`). Tema NUNCA muda
   escrita, estrutura, menu ou navegação — uma funcionalidade = UMA tela/DOM/escrita.
4. **Tela é PROIBIDA de ter cor, borda, sombra, fonte ou radius próprios** — só
   classe central/utility/token.
5. **`check-pele.mjs` fiscaliza no lint** (hex/rgba/style visual em TSX = build
   reprovado; styles visuais legados descem por catraca até zero).
Detalhes e exceções: docs/Rules/FRONTEND.md. Violação das leis = PARAR e avisar o
dono antes de editar. As telas atuais estão no ESQUELETO (peles deletadas por ordem
dele em 12/06) até ele aprovar peles novas. `docs/TEMAS` virou REFERÊNCIA de
estrutura/escrita — visual de lá NÃO se copia mais para dentro de tela.

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

## Webwhats

`Webwhats/` é projeto separado. Leia `Webwhats/AGENTS.md` antes de tocar em qualquer arquivo lá.
