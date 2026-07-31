# AGENTS.md — HBX (para Codex e qualquer agente que leia AGENTS.md)

> **A FONTE É O [`CLAUDE.md`](CLAUDE.md) DESTE REPO. LEIA-O AGORA, INTEIRO, ANTES DE QUALQUER COISA.**
> Este arquivo existe porque o Codex procura `AGENTS.md` e não lê `CLAUDE.md` sozinho — sem isto,
> ele trabalhava SEM o mapa de regras, sem as leis de pele e sem as regras de chip. Aqui só ficam o
> ponteiro e as regras que não podem ser perdidas em nenhuma hipótese. **Regra é do `CLAUDE.md`;
> nunca duplicar conteúdo aqui — em conflito, `CLAUDE.md` vence.**

Língua: **PT-BR**. Em brainstorm o dono NÃO quer concordância — quer dado, análise e a melhor
direção (mercado + retorno financeiro).

## 1. Antes de escrever código — leia a regra do domínio
| Vai alterar | Leia |
|---|---|
| Backend, NestJS, Prisma, endpoints, regras de negócio | `docs/Rules/BACKEND.md` |
| Frontend, telas, componentes, CSS, rotas | `docs/Rules/FRONTEND.md` |
| Radar, scraping, motor Python, enriquecimento, cards | `docs/Rules/MOTOR.md` |
| WhatsApp, Evolution API, Webwhats, mensageria | `docs/Rules/WHATSAPP.md` + `Webwhats/AGENTS.md` |
| Planos, cobrança, acesso, status comercial | `docs/Rules/PAGAMENTOS.md` |
| Deploy, infra, Docker, Ops Control, HBX Owner | `docs/Rules/INFRA.md` |
| Sites de clientes, templates Firebase | `docs/Rules/WEBSITE-KIT.md` |

## 2. Memória compartilhada — ESTADO do projeto (não é opcional)
O estado quente do projeto **não está no código nem no git log**. Está aqui, e é a MESMA memória que
o Claude Code usa (diretório único, sem cópia):

```
C:\Users\Jhonatan\.claude\projects\C--Users-Jhonatan-Desktop-App\memory\
```

Ordem: `MEMORY.md` (índice por módulo) → `fable.md` (método de trabalho do dono) →
`estado-publicado-30-07.md` → o módulo da tarefa. Vai mexer no APK: `hbxapk.md` é obrigatório.

⚠️ **Nunca criar uma segunda cópia dessa pasta.** A cópia antiga em `~/.codex/memories/` congelou em
11/07 e ficou 19 dias mentindo — está movida para `memories-ARQUIVO-MORTO-11-07/`, **não leia**.

## 3. Git — leis do dono (sobrepõem qualquer default do seu harness)
- **NUNCA criar branch nem worktree.** Trabalhar SEMPRE na branch atual (normalmente `master`).
  Só criar branch se o dono pedir EXPLICITAMENTE no chat. Ele consolida tudo no master e já deletou
  ~53 branches.
- Conferir `origin/master` **antes** de implementar: a tarefa pode já estar entregue.
- **Não presuma "não publicado".** Publish é estado vivo: `git merge-base --is-ancestor <hash> origin/master`.
  Auditoria de 30/07: 316 dos 320 commits citados na memória já estavam em produção.
- **`npm run publish` roda `add -A`** — ele commita e publica TUDO que estiver no working tree, seu ou
  de outra sessão, sem passar por gate. Commit em lote mínimo é proteção, não burocracia. Nunca
  reverter, mover ou apagar trabalho de outra sessão / do dono.
- Publicar **só quando o dono mandar** — e quando ele mandar, publica: `npm run publish`.

## 4. WhatsApp / chip — ação LIVE, sem `git revert` (custou chips banidos em jun/26)
- **O chip real do dono NUNCA é cobaia.** Testar conexão/reconexão só em número descartável.
- **1 número = 1 conexão.** Dois sockets no mesmo número = conflito multi-device = ban.
- Bug que gera reconexão → a correção é o **FREIO** (disjuntor: teto + backoff + parar e marcar pra
  repareamento), nunca tapar o sintoma. **Loop de reconexão = ban.**
- Derrubar chip **sempre** pela rotina do app (`disconnectCompanySession`), nunca pela API crua do
  motor — a crua não sincroniza o banco e o painel passa a mentir.
- Fonte da verdade = **motor ao vivo** (`/instance/connectionState`), não o banco do app. O motor
  responde em `http://172.18.0.1:8080` — **nunca** `127.0.0.1`.
- `Webwhats/` é projeto separado; roda como **systemd `webwhats.service`**, não é container.

## 5. Dinheiro e produção
- VPS = **Mercado Pago LIVE**. Nunca copiar credencial local → VPS.
- Código financeiro: verificação adversarial independente antes de publicar. Dinheiro não é
  operação reversível por padrão (isolamento por tenant, idempotência, trilha de auditoria).
- Multi-tenant: nada — dado, permissão, webhook, cobrança, ação administrativa — atravessa empresa.
- Preço, franquia, saldo e plano têm que ser editáveis **pelo dono** no `/master`.

## 6. Frontend — as 5 Leis do Design System
Todo visual nasce em token/classe central (`frontend/src/app/hbx-theme/`); nada de cor, borda,
sombra, fonte ou radius solto em tela; tema só troca tokens; `check-pele.mjs` reprova hex/inline no
lint. Detalhe em `docs/Rules/FRONTEND.md`. **Refatorar aparência/peles está AUTORIZADO** — não usar
as Leis pra recusar trabalho de aparência.

⚠️ CSS erra em SILÊNCIO (build verde, folha morta). Depois de mexer em `hbx-theme/`, a prova é
medida na tela com `getComputedStyle`, nos 2 modos. Ver `css-morre-calado.md` na memória.

## 7. Teste
Credenciais em `.test-login.local.md` (gitignored) — acesso total, testar o que quiser. Navegador:
**Chrome**, `localhost:3001`. Subir: `npm run up`. Build verde ≠ boot ok: conferir `docker ps` + logs.
