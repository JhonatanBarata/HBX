# PR16062026033 — WHATSAPP: motor de FILTRO só no MASTER (matar shared engine + fallback)

> **Ordem do dono (16/06):** "limpar toda conexão compartilhada do whatsapp, o motor do
> whatsapp a ser utilizado será apenas do master. é LIMPEZA GRANDE! ... parar de tentar usar
> motor de cliente para filtro, o radar ainda é compartilhado não é? então não é certo um
> número filtrar pro outro, deixe isso no master (meu número, minha responsabilidade).
> destrutivo e limpo, não quero saber de legado dessa idéia."
> **Nada de código aplicado** — isto é PLANO (dono mandou parar de editar e planejar).
> Reverti as 3 edições que tinha começado no Radar (árvore limpa).

## DE ONDE VEM (não reinventar)
- Item da fila persistente que CRIOU este mecanismo: `PLAN16062026001.md` → **E-RADAR-WA**
  (motor compartilhado `hbx-master-whatsapp-engine` + **fallback** pro chip da empresa).
  Este plano **REVERTE a direção** desse item. Origem mais antiga: `PLAN14062026001`.
- Memória relacionada: `whatsapp-motor-compartilhado` (a ideia que está sendo morta),
  `radar-compartilhado-por-empresa` (a lagoa é compartilhada no tempo).
- Regras de domínio: `docs/Rules/WHATSAPP.md` e `docs/Rules/MOTOR.md`
  (a fonte do `whatsappStatus=confirmed` continua sendo o Webwhats — só muda QUAL chip
  faz o lookup; aqui passa a ser SEMPRE o do master).

## O MODELO FECHADO COM O DONO (3 perguntas respondidas nesta conversa)
1. **WhatsApp do master = número pessoal dele**, conectado no sistema, **só dele** (suporte).
   Mantém o modal de conexão do master. (resposta: "Conecta no sistema, só seu")
2. **Filtro do Radar ("esse número existe?") roda SÓ no número do master.** A lagoa do
   Radar é compartilhada → quem filtra é UM número só (o do master), nunca o chip de um
   cliente filtrando lead de outro. Sem motor do master conectado, **o filtro não roda**
   (NÃO cai mais no chip do cliente). "meu número, minha responsabilidade."
3. **HBX admin conecta WhatsApp NORMAL, igual qualquer empresa** (mensageria/Atendimento —
   é o chip das meninas). **NÃO remover** o WhatsApp do tenant. (dono corrigiu meu
   entendimento: "não quero remover o whatsapp do admin").
4. **Contas:** "Jhonatan continua master". **Não há reversão de role a fazer** (ver §CONTAS).

## DIAGNÓSTICO do "não cadastro vendedor / whatsapp não funciona"
Converter a conta para master (`isSystemMaster=true`, `role=USERMASTER`) **zera o
`companyId`** e o login força `company=null` para master (`auth.service.ts:1018`). O master
só enxerga a superfície master (`MASTER_SURFACE_MODULE_KEYS = {master, exclusoes}` em
`modules.service.ts:129`). Cadastrar vendedor e conectar WhatsApp são funções de **admin de
empresa** → por isso somem no master. **A HBX (company 2) nunca quebrou**: o admin dela
(`jhonatan@hbxsystem.com.br`, id 36) está intacto. Era só estar logado no lugar errado.

---

## ESCOPO — o que SAI e o que FICA

### SAI (matar — é a "frescura" do filtro compartilhado)
| Onde | O quê |
|---|---|
| `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts` | `radarCheckWhatsappNumbers`: tirar o **fallback pro `tenantCompanyId`**. Passa a rodar SÓ no motor do master (`resolveRadarWhatsappEngineCompanyId`). Sem engine → `return []` (cards ficam `unverified`, busca não bloqueia). Atualizar os 2 chamadores (`applyRadarWhatsappCheck` ~2467 e o check de card cacheado ~3351) — a função não recebe mais `tenantCompanyId`. |
| `backend/src/vendas/vendas.service.ts` (~1275) | `const engineCompanyId = (await getOrCreateMasterWhatsappEngineCompanyId()) \|\| companyId` → **remover o `\|\| companyId`**. Sem engine → não roda a consulta (não cai no chip do cliente). |
| `backend/src/vendas/vendas.service.ts` (~5005) | mesmo `\|\| companyId` no `enrichLeadForUser` → remover. |
| `backend/src/vendas/vendas.service.ts` (~4990) | tirar o trilho `verifiedBy: 'client_engine'` (o tipo é `'platform_engine' \| 'client_engine' \| 'manual' \| null`). Não existe mais "client engine"; default vira `platform_engine`/`manual`/`null`. |
| comentários | limpar todo texto "fallback p/ empresa", "chip do Master indisponível, fallback", "motor compartilhado" — não deixar vestígio da ideia. |

### FICA (NÃO apagar — quebraria o que o dono quer manter)
- **Motor do master = empresa-âncora** `hbx-master-whatsapp-engine` (id 1, `platform_infra`).
  É onde mora o NÚMERO PESSOAL do dono (o único filtro). `getOrCreateMasterWhatsApp...`
  (companies.service:528 e vendas.service:4905) **continuam** — é a âncora do número dele.
  *Opcional (polimento):* renomear display de "HBX Infra WhatsApp Engine" → "WhatsApp do
  Master" em `master-whatsapp-company.constants.ts` pra não soar "compartilhado". Slug pode
  ficar (muitas refs); só o nome.
- **Endpoints de conexão do master:** `companies.controller.ts` `master/whatsapp-modal/*`
  (status/start/qr/disconnect/restart, ~745–810) + `allowMasterWhatsappEngineFallback`
  (~288/340/665/679/739/837/889). É COMO o dono conecta o número dele. **Manter.**
- **Front do master:** `master-whatsapp-chip.tsx`, `janela-sistema.tsx`, `janela-empresas.tsx`
  (conexão do número do master). **Manter.**
- **WhatsApp de cada tenant (incl. HBX):** fluxo normal de conexão para MENSAGERIA
  (`whatsapp-connection-flow.ts`, Atendimento). **Intacto** — só não é mais usado pra filtrar.
- **Plumbing `platform_infra`** (auth/financeiro/modules/commissions/seat-billing): **NÃO
  mexer** — é usada pela empresa-âncora e está entrelaçada com cobrança/acesso. Mexer aqui
  é refactor grande e arriscado, FORA do pedido.

### FORA DE ESCOPO (não confundir com "whats compartilhado")
- **`useMasterWhatsAppToken` / `masterWhatsAppCredentialKey`** = token Meta do master
  emprestado pra empresa **MANDAR mensagem** (mensageria, não filtro). É outra "conexão
  compartilhada", mas mexer nela rói modules/financeiro/operacional. **Deixar como está**
  até o dono pedir explicitamente.

---

## CONTAS (auth — destrutivo, decisão do dono já tomada)
Estado no banco LOCAL (`localhost/jhonatan_dev`):
| id | login | role | empresa |
|---|---|---|---|
| 1 | `jhonatan.barata` / `master@hbx.local` | USER | — |
| 35 | `Jhonatan` | USERMASTER (master) | — |
| 36 | `jhonatan@hbxsystem.com.br` | ADMIN | 2 (HBX) |

**Decisão:** "Jhonatan continua master" → **id 35 fica master** (dono do número do filtro),
**id 36 já é admin da HBX**. **Nenhuma mudança de role.** Gerenciar a HBX (cadastrar
vendedor, conectar o chip) = logar como `jhonatan@hbxsystem.com.br`. Se o dono não tiver a
senha do id 36 → **reset de senha local** (ação pontual, não destrutiva).
HBX (company 2): conecta o chip como tenant normal — **não limpar campos whatsapp**.

---

## CONSEQUÊNCIA (registrar — é intencional)
- Verificação "esse número existe?" (Radar lista/card + Vendas) passa a depender **só** do
  número do master conectado. Master desconectado = leads ficam `unverified` (busca não
  trava; cards entregam). **Sem fallback** pro chip do cliente — de propósito.
- Cada empresa segue conectando o WhatsApp dela pra mensageria; só não filtra pelos outros.

## CHECKS / APLICAÇÃO
- `cd backend && npm run prisma:validate && npm run build`. **Sem migration.**
- Ajustar testes que assumam o fallback/`client_engine` (ex.: `webscraping.service.test.ts`
  mocka `applyRadarWhatsappCheck` — provavelmente OK; conferir).
- Backend só vale em produção após **`docker restart` na VPS** (o DONO roda o deploy).
- Front do master não muda (conexão do número segue igual).

## CHECKLIST (pronto pro Sonnet, ordem)
- [ ] Radar: `radarCheckWhatsappNumbers` master-only, sem `tenantCompanyId`; 2 chamadores.
- [ ] Vendas: remover `|| companyId` (x2) e o trilho `client_engine`.
- [ ] Limpar comentários/labels da ideia velha (sem vestígio).
- [ ] (Opcional) renomear display da empresa-âncora → "WhatsApp do Master".
- [ ] Conferir que tenant (HBX) conecta WhatsApp normal — nada removido.
- [ ] `prisma:validate` + `build` verdes; ajustar testes.
- [ ] Anotar no `PLAN16062026001` que E-RADAR-WA foi REVERTIDO por este bloco (já feito).
