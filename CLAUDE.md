# HBX — Roteador de regras

Leia este arquivo primeiro. Depois leia APENAS o arquivo de domínio relevante ao que vai alterar.

## REGRA ZERO — SIGA O QUE O PROGRAMADOR FALAR

Ordem do dono executa-se literalmente, sem reinterpretar, sem "melhorar", sem adaptar.

**Telas do frontend:** a fonte é a pasta `docs/TEMAS`. Tela nova = **COPIAR o arquivo
da pasta como está** (markup e CSS idênticos, elemento por elemento, texto por texto)
e depois **só ligar os endpoints do backend** nos pontos dinâmicos. Não recriar, não
redesenhar, não reaproveitar tela velha, não omitir elemento do template. Se um
elemento do template não tem endpoint, ele fica visual como no template — registrar no
doc do PR, nunca decidir sozinho remover.

**TEMA É SÓ PELE (bloqueio absoluto, 12/06/2026):** tema muda só visual — fontes,
cores, janelas, transições — via tokens. Tema NUNCA muda escrita, estrutura, menu ou
navegação. Uma funcionalidade = UMA tela, UM DOM, UMA escrita; os temas vestem essa
tela. Proibido tela/componente/app paralelo por tema. Tarefa que faria uma tela ficar
diferente da outra entre temas = **PARAR e avisar o dono antes de editar** — só executa
com autorização explícita dele (ou se ele deletar a REGRA DURA do FRONTEND.md).

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
