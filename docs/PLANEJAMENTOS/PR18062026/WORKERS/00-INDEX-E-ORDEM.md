# WORKERS — Índice e ordem (recortes acionáveis dos 2 planos-mestre)

> Estes arquivos são o **recorte acionável** dos planos-mestre para o worker **Sonnet** aplicar.
> **Fonte de verdade** (não duplicar, não divergir): os planos-mestre na pasta acima:
> - [PLAN-WHATSAPP-FASE-B-VISAO-EMPRESA.md](../PLAN-WHATSAPP-FASE-B-VISAO-EMPRESA.md)
> - [PLAN-PLANOS-COBRANCA-ACESSO-MASTER.md](../PLAN-PLANOS-COBRANCA-ACESSO-MASTER.md)
>
> Cada doc-worker é **auto-contido**: dá pra pegar um e aplicar sem ler o resto. Mas leia SEMPRE,
> antes de tocar código: `/CLAUDE.md` + o `docs/Rules/<DOMÍNIO>.md` indicado no topo do doc.

## Quem faz o quê (NÃO cruzar)

| Frente | Dono | Doc | Estado |
|---|---|---|---|
| **WhatsApp Fase B** — visão de empresa (admin agrega N sessões) | **SONNET** | [WA-FASE-B-VISAO-EMPRESA.md](WA-FASE-B-VISAO-EMPRESA.md) | a fazer |
| **F1** — bot+email viram módulos | — | (sem doc) | ✅ FEITO 18/06 (verificado: `structural-defaults.json:58,67`) |
| **F2** — catálogo editável (preço/plano) | **OPUS** | — | **não partido aqui. SONNET NÃO PEGA** (preço/paywall) |
| **F3** — wizard +Nova empresa + MasterEd + fronteira | **SONNET** | [F3-WIZARD-MASTERED-FRONTEIRA.md](F3-WIZARD-MASTERED-FRONTEIRA.md) | a fazer |
| **F4** — painel admin/gerente + delegação | **SONNET** | [F4-PAINEL-ADMIN-GERENTE-DELEGACAO.md](F4-PAINEL-ADMIN-GERENTE-DELEGACAO.md) | a fazer |
| **F5** — agenda do bot (depende de F1, já feito) | **SONNET** | [F5-AGENDA-DO-BOT.md](F5-AGENDA-DO-BOT.md) | a fazer |
| **F6** — cobrança de assento extra (MP) | **OPUS** | — | **não partido aqui. SONNET NÃO PEGA** (cobrança) |
| **F7** — faxina / sem legado | OPUS (final + contínuo) | — | passo final |

**Por que F2/F6 não estão aqui:** são frentes **financeiras** (preço, paywall, cobrança MP). O dono
autorizou só o **orquestrador (Opus)** a executá-las direto. Se um doc-worker te empurrar pra mexer
em **valor/charge/checkout/paywall**, isso é F2/F6 → **PARE e devolva ao orquestrador.**

## Ordem real (dependência)

```
F1 ✅ → F2 (Opus) → F3 (Sonnet) → F4 / F5 (Sonnet) → F6 (Opus) → F7
WhatsApp Fase B = assunto PARALELO (independente das F). Pode rodar a qualquer hora.
```

- **F3** lê o catálogo **atual (hoje em código)** — não espera o editor da F2. Só consome planos/ciclos que já existem.
- **F4** vem logo depois da F3 (a F3 fixa a fronteira master↔empresa que a F4 usa).
- **F5** depende só da F1 (feita) → pode ir.

## Travas globais (valem em TODO doc — `/CLAUDE.md`)

Sem ordem explícita do dono na tarefa, **não**:
- mexer em **preço, plano, paywall, cobrança, checkout, webhook de pagamento, dado de produção**;
- reescrever **auth/autorização, secrets, env de prod, credencial**;
- migration/operação **destrutiva** de dados;
- **deploy/publish/release/restart** de prod;
- **refactor amplo fora do escopo** pedido.

Frontend: todo visual nasce em **token/classe central** (`frontend/src/app/hbx-theme/`). Nada de hex/cor/
borda/sombra/radius solto (`check-pele.mjs` reprova). **Sem legado:** versão antiga sai no mesmo passo
(apagada ou alias que só redireciona). Confirme que a tela é a **canônica** (a do menu) antes de editar.

## Processo quando travar (NÃO chutar)

Cada doc tem um bloco **DECIDIR ANTES (PARE)**. Se bater nele, ou em qualquer dúvida de produto:
**pare, não invente default**, devolva ao orquestrador com a pergunta objetiva. O orquestrador
pergunta ao dono e te injeta SÓ o que foi decidido.

## Checks (rodar no fim de cada frente)

```bash
# Backend (sempre que tocar backend)
cd backend && npm run prisma:validate && npm run build
# + node --test dos arquivos de teste tocados

# Frontend (sempre que tocar tela/CSS/rota)
cd frontend && npm run lint && npm run build
```

Snapshot de linhas neste índice e nos docs = **18/06**. Se um número de linha não bater (o arquivo
mudou), **ache pelo símbolo** com grep — os nomes de função/símbolo são estáveis, as linhas não.
