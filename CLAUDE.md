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
Acessar VPS, ler logs, checar status, rodar comandos de leitura = **livre, sem pedir permissão**.
Push/deploy pro VPS = **livre quando o dono pedir** — executa direto, sem confirmar de volta.
A única trava é **disparar ação real irreversível que eu mesmo iniciaria sem o dono pedir**:
- Cobrança/checkout/webhook em modo **live** (dinheiro real movido).
- Escrita em **banco de produção** ou rotação de **credencial viva**.
- Disparo de mensagem real pra cliente (WhatsApp/Evolution em número de verdade).

Editar o CÓDIGO de pagamento, auth, migration etc. = **livre** (reversível). Só não **disparo**
a ação live por conta própria. Migration/op destrutiva contra DB **local** = livre (reseed desfaz).

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
- Login User:jhonatan@hbxsystem.com.br Senha:Monkey123 - full acesso, teste o q quiser - usar o chrome, localhost/3001. Muitos erros no preview Claude. Caso precise subir, usar o npm run up

## Publicar (deploy pro VPS — sempre com autorização do dono; ação live irreversível, ver Guardrails)
- **Edição pequena** (poucos arquivos, sem rebuild pesado) → **`npm run new`**: publish seletivo, sobe só o
  que foi editado e reinicia menos coisas. É o caminho preferido pro corriqueiro.
- **Mudança grande / muitos arquivos / precisa rebuild completo** → `npm run publish` (rebuild total
  backend+frontend+motores no VPS).
- Ambos commitam o working tree inteiro (`git add -A`) e o VPS faz `git reset --hard origin/master`. Pra subir
  **só um fix** no meio de outras mudanças: commita os arquivos do fix isolados + stash do resto antes de publicar.

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
- **`testar.md` é PRA O DONO testar, não pra mim.** Escreve pra leigo: **zero termo técnico** (nada de endpoint, status, código, nome de arquivo/campo/comando, sigla). Bem curto. Formato sempre **"Entre em X → faça Y → tem que ver Z"** (entre aqui, clique ali, veja isso). Se não dá pra explicar sem jargão, simplifica até dar — ou deixa o detalhe técnico no plano, não aqui. Todo teste novo entra nesse formato; ao tocar no `testar.md`, mantém tudo nesse padrão.

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

## Webwhats / Motor WhatsApp (regras duras — custaram chips banidos em jun/26)
`Webwhats/` é projeto separado (Evolution API/Baileys). Leia `Webwhats/AGENTS.md` antes de tocar. No VPS roda como systemd
`webwhats.service` (host `:8080`, log `journalctl -u webwhats.service`, banco `webwhats_prod`) — **NÃO é container**; o backend
fala por `http://172.18.0.1:8080`. **Conectar/reconectar chip é AÇÃO LIVE IRREVERSÍVEL** (chip banido não tem `git revert`) —
entra nos Guardrails.
- **Reconexão SÓ com disjuntor.** Nunca loop livre: teto de tentativas + backoff + parar e marcar p/ reparear. Bug que gera
  reconexão → a correção é o **FREIO**, nunca tapar o sintoma da vez. Loop de reconexão = ban.
- **1 número = 1 conexão.** Mesmo chip em 2 lugares → o último a conectar vence, o anterior **cai e limpa**. Nunca 2 sockets
  vivos no mesmo número (conflito multi-device = ban).
- **`npm run publish`/`new` reiniciam o `webwhats.service`** — o restart re-linka os chips (close 515/428 por um instante →
  re-`open` sozinho; boot escalonado de 8s). Isso, por si só, **NÃO bana** — re-link no deploy é comprovadamente seguro. A
  máquina de ban era o **LOOP de reconexão** (já morto pelo disjuntor); o cuidado é com o loop, não com o restart do publish.
- **Testar conexão/reconexão em número DESCARTÁVEL meu, jamais no chip do dono** — ver ficar `open` sem loop por minutos antes
  de encostar em chip real. Culpar "o número" por bug meu de reconexão = proibido.
- **Derrubar chip SEMPRE pela rotina do app** (`disconnectCompanySession`), nunca pela API crua do motor
  (`DELETE /instance/logout|delete`) — a crua não sincroniza o banco do app e o painel passa a mentir.
- **Fonte única da verdade = motor ao vivo** (`/instance/connectionState`, `/instance/fetchInstances`), não o banco do app.
- **Deploy do motor:** `npm run publish` (full) funciona; **`npm run new` está QUEBRADO** (gera script remoto com syntax error →
  sai status 2 → não aplica nada). Manual cirúrgico que funciona: `node scripts/vps-run.js` → `cd /root/HBX && git fetch origin
  master && git reset --hard origin/master && cd Webwhats && npm run build && systemctl restart webwhats`; conferir o `dist`
  depois. `publish`/`new` rodam typecheck ESTRITO do motor → passar `cd Webwhats && npm run typecheck`, não só `build`.
