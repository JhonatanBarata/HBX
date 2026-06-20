# HBX — Roteador de regras

Leia este arquivo primeiro; depois leia só o arquivo de domínio do que vai mexer (mapa abaixo).
Aqui mora postura + guardrails + roteamento. Detalhe técnico vive nos `docs/Rules/`.

## Postura (como eu trabalho aqui)
Parceiro de construção, não fiscal. O fluxo do dono é **localhost reversível**: nada vai pro
mundo real até ele dar push pro VPS. Então o default é **fazer de qualquer jeito + listar os
riscos** — o dono testa de manhã, gostou segue, não gostou `git revert`. Não espero o dono pra
trabalhar; código é reversível, esperar seria desperdício. Decido no melhor critério, trago
ideia fora do pedido, refatoro aparência/legado por padrão. Perguntar é quase nunca — só antes
de uma **ação live irreversível** (ver Guardrails).

## Guardrails (a única trava real: o que o git não desfaz)
Código é livre — todo arquivo que eu escrever, o dono reverte em localhost se não gostar.
A única trava NÃO é "código sensível"; é **disparar ação real que escapa do localhost e não
tem revert** (não é pedir licença, é que não dá pra desfazer):
- Push/deploy pra VPS (produção).
- Cobrança/checkout/webhook em modo **live** (dinheiro real movido).
- Escrita em **banco de produção** ou rotação de **credencial viva**.
- Disparo de mensagem real pra cliente (WhatsApp/Evolution em número de verdade).

Editar o CÓDIGO de pagamento, auth, migration etc. = **livre** (reversível). Só não **disparo**
a ação live sozinho. Migration/op destrutiva contra DB **local** = livre (reseed desfaz).

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

## Frontend — 5 Leis do Design System (MÉTODO, não freio)
Todo visual nasce em token/classe central (`frontend/src/app/hbx-theme/`); nada de cor,
borda, sombra, fonte ou radius solto em tela; tema só troca tokens; `check-pele.mjs`
reprova hex/inline no lint. Detalhe e exceções: [docs/Rules/FRONTEND.md](docs/Rules/FRONTEND.md).
**Refatorar aparência/peles está AUTORIZADO — não usar as Leis pra recusar trabalho de aparência.**

## Sem legado (ordem do dono 17/06)
Código morto não fica. Tela/rota/feature substituída → a antiga sai **no mesmo passo**: apagada
ou **alias que só redireciona** (`redirect("/canônica")` na `page.tsx`; ex.: `/workspace`→`/dashboard`,
`/webscraping`→`/leads`). Junto vão botões/links, a entrada no `app-shell.tsx` (META) e o CSS
(`screens.css`) que só ela usava. Duas coisas vivas pra mesma função = proibido. Antes de editar
uma tela, confirme que é a CANÔNICA (a do menu). (O dono raramente reverte CÓDIGO; o que se
versiona/reverte é REGRA.)

## Checks mínimos (menor conjunto relevante ao que foi tocado)
- Frontend: `cd frontend && npm run lint` → `npm run build`
- Backend: `cd backend && npm run prisma:validate` → `npm run build`
- E2E (`npm run test:e2e` na raiz) só quando um caminho end-to-end mudou e o ambiente está pronto.

## Orquestrador × subagentes (papéis)
O **planejador (Opus)** planeja e orquestra; quem **edita** são os **workers (Sonnet, inteligência
máxima)**, spawnados ao "aplique com o orquestrador" — divididos em blocos/pedidos separados
(cada worker tem ~200k de contexto). Exceção: frentes **financeiras** (preço/cobrança/checkout/paywall) o
Opus edita **direto** — máxima precisão na lógica de dinheiro —, sempre com **revisão obrigatória do diff
antes do merge** (e confirmação em runtime, não só build). Worker quebrou? Projeto simples: resolve e segue. Pagamento/regra/arquitetura:
imprime o erro e escala pro dono.

## Planejamentos (PR)
Planos vivem em `docs/PLANEJAMENTOS/`, sempre com **UMA** pasta de dia ativa (`PR{DDMMAAAA}`, ex.: `PR13062026`).
- Pasta do dia não existe? Cria, migra o que sobreviveu do dia anterior (não-concluído) e apaga a antiga.
- Lê a pasta toda; deleta o que já estiver concluído.
- Nunca cria `.md` de assunto que já existe — injeta no plano existente. Um plano por assunto, não por edição.
Depois de limpar, sobra só **`testar.md`** (testes que têm que passar antes de subir qualquer branch). Nunca deletar esse arquivo.

## Projetos noturnos (modo autônomo) — "flui sem mim"
Gatilhos: "faça sem perguntar", "iniciar projeto noturno", "refatoração noturna", "não vou estar no pc".
O PC fica ligado trabalhando enquanto o dono dorme. **Não espero o dono pra nada de código.**
Esta seção sobrepõe as outras (inclusive "escala pro dono" do orquestrador):
- Branch **`trabalho noturno`** (isolada; o dono revisa de manhã).
- Aplico o que está nos `.md` da pasta do dia e decido no feeling + pesquisa de mercado.
  **Não pergunto nada** — a hora de perguntar era na injeção.
- Faço **de qualquer jeito** o que for código. Worker quebrou? Tento outro caminho, documento e sigo.
- Fecho com `RISCOS.md` na pasta do dia: o que mudei, riscos, o que testar, como reverter cada bloco.
  De manhã o dono testa — gostou segue, não gostou `git revert`.
- Único não-faço: disparar ação live que escapa do localhost (ver Guardrails) — git não desfaz.
- Termina tudo, depois desliga o PC. não importa se ficou algo pra trás o pc tem q ser desligado.

## Webwhats
`Webwhats/` é projeto separado. Leia `Webwhats/AGENTS.md` antes de tocar em qualquer arquivo lá.
