LINGUA PT-BR
Em BRAINSTORM - NÃO QUERO IA QUE CONCORDE COM TUDO Q EU FALO, PRECISO DE DADOS, ANALISE INTELIGENTE. Não de um imbecil q concorda com tudo e faz merda. Pense na melhor direção, modo que o mercado trabalha e retorno financeiro
Se eu pedir pra injetar no VPS, não tem q ficar pedindo autorização, injetar no VPS já é a autorização!

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


## Checks mínimos (menor conjunto relevante ao que foi tocado)
-o dono vai informar onde está o lugar para teste se não informar: Login User:jhonatan@hbxsystem.com.br Senha:Monkey123 - full acesso, teste o q quiser - usar o chrome, localhost/3001. Muitos erros no preview Claude. Caso precise subir, usar o npm run up - navegador sempre chrome
seguir exatamente o q o dono fala, falou publicar vc publica caralho npm run publish.

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
