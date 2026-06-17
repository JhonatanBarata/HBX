# PR16062026036 — WHATSAPP: SESSÃO POR NÚMERO (matar vazamento de chat entre chips)

> **Ordem do dono (16/06):** "estava no admin com o 19997024884, conectei outro chip
> +55 19 92012-1720 e ele carregou TODOS os chats do anterior. Isso nunca mais pode
> acontecer — uma linha não pode carregar da outra, mesmo sendo a mesma conta. Analise
> e trace um plano definitivo, **não aceito legados**."
>
> **Estado:** SÓ PLANEJAMENTO (decisão do dono 16/06). Nada de código aplicado. Decisão
> de dado vazado já tomada (ver §5). **Relacionado:** memória `whatsapp-troca-numero-limpa-chat`
> (band-aid de frontend que ESTE plano substitui), `whatsapp-status-tres-trilhos`.

## 1. CAUSA RAIZ (não é bug pontual — é arquitetura legada)

As conversas são carimbadas com um ID de sessão de conexão
(`CompanyConversation.whatsappConnectionSessionId`). A intenção: número novo = sessão
nova = conversas isoladas. **Mas a identidade da sessão é por EMPRESA, não por NÚMERO.**

A chave é `tenantKey = company-{id}` — uma só por empresa, igual pra qualquer chip. E
**três** resolvedores de sessão fazem a MESMA coisa errada: *"acha a última sessão ativa
da empresa por tenantKey; se achar, REUSA e sobrescreve o telefone dela pelo telefone atual."*

| Onde | Arquivo:linha | Pecado |
|---|---|---|
| Conexão | `backend/src/companies/whatsapp-modal.service.ts:1056` | acha ativa por tenantKey; em `:1081-1082` faz `data.phoneNormalized = telefoneNovo` |
| Chegada de msg | `backend/src/messaging/webwhats-bridge.service.ts:984` | mesma coisa; relabela em `:1014` |
| Leitura do inbox | `backend/src/inbox/inbox.service.ts:496` | mesma coisa; relabela em `:521` |

**O caso exato do dono:** chats do 19997024884 carimbados na sessão S1. Conectou o
19920121720 sem disconnect limpo. O reconcile achou S1 ainda "ativa", **reusou S1 e só
trocou o telefone dela pra 19920121720**. A sessão que segurava os chats do número antigo
virou "a sessão atual do número novo" → o inbox lista por sessão atual → **todos os chats
do antigo aparecem como do novo.**

**Segundo vazamento:** sem sessão resolvível, o inbox cai em `mode:'all'`
(`inbox.service.ts:595`, filtro `isRowVisibleForWhatsappSessionScope` em `:604-609`) e
mostra **tudo de todas as sessões**.

**Por que o popup "mesclar/limpar" falhou:** o band-aid (front, doc PR14062026 + memória
`whatsapp-troca-numero-limpa-chat`) só enxerga "sessões antigas" DIFERENTES da atual
(`buildWhatsappSessionCleanupState`, `inbox.service.ts:641` usa `NOT: { id: currentSessionId }`).
Como o bug **transforma a antiga na atual**, não existe "sessão antiga" pra ele ver. Band-aid cego.

## 2. O LEGADO QUE MORRE (não aceitar)
1. "Sessão é por empresa, reusa e relabela o telefone." (as 3 cópias)
2. `mode:'all'` (mostrar tudo quando não sabe escopar).
3. Três escritores da mesma resolução de sessão.
4. O conserto via popup no frontend (discard automático por telefone diferente).

## 3. PLANO DEFINITIVO — sessão é POR NÚMERO, identidade imutável

1. **Identidade = (empresa, provider, `phoneNormalized`).** `phoneNormalized` grava UMA vez
   e nunca mais troca. `tenantKey` segue `company-{id}` só pra falar com o motor Webwhats
   (isso é certo — o erro é usar tenantKey como identidade da sessão).

2. **Regra única no connect (ÚNICO dono do ciclo de vida da sessão):** chegou "connected"
   com telefone P:
   - sessão atual tem telefone **== P** → mantém (reconexão do mesmo chip);
   - telefone **diferente** → **fecha todas as ativas (status=disconnected) e CRIA sessão
     nova pra P.** Nunca sobrescreve telefone de uma sessão que já tem número;
   - telefone **null→P** (status conecta antes do número chegar) → primeira atribuição do
     null é permitida (não conta como "troca"). Só "real→outro real" = sessão nova.
   - grava `company.currentWhatsappConnectionSessionId = sessão nova`.

3. **Ingest e leitura do inbox viram SÓ-LEITURA.** Param de criar/reparar/relabelar sessão
   (apaga `resolveCurrentWebwhatsSession` reparador em `webwhats-bridge.service.ts:984-1078`
   e `ensureWebwhatsSessionFromCompany` em `inbox.service.ts:481-560` — viram leitura pura
   de `currentWhatsappConnectionSession`). **Um escritor só** (o connect, item 2).

4. **Listagem SEMPRE estrita à sessão atual.** Mata `mode:'all'`
   (`inbox.service.ts:595/606`). Sem sessão resolvível = inbox VAZIO, nunca "mostra tudo".

5. **Troca de número = dado antigo invisível por construção.** Chip novo = ID de sessão
   novo = chats do antigo somem sozinhos. Apaga o band-aid do front (discard automático).
   O popup mesclar/limpar fica OPCIONAL só pro caso "mesmo chip, quero zerar histórico".

6. **Endurecimento:** no disconnect, **zerar** `company.currentWhatsappConnectionSessionId`
   (ponteiro velho não pode ser reusado) — hoje o reconcile de disconnect
   (`whatsapp-modal.service.ts:1130`) só seta sessões a `disconnected`, não limpa o ponteiro.
   `phoneNormalized` write-once protegido no código.

## 4. TRAVA CRÍTICA DO DONO — NÃO DERRUBAR A CONEXÃO
> "chip é novo, e fica acusando spam se cai muito."

- **A camada de sessão do HBX é LÓGICA — desacoplada do motor Baileys.** Trocar/criar/apagar
  linha de `WhatsAppConnectionSession` ou conversa **NUNCA** pode disconnect/restart/re-pair
  a instância Webwhats (`tenantKey = company-{id}` continua a MESMA instância, mesmas creds).
- Toda a refatoração e a limpeza são **operações de banco** + carimbo de sessão. Zero toque
  no motor. Sem `docker restart`, sem reconectar, sem novo QR.
- O primitivo seguro já existe: o cleanup atual roda em transação de banco e grava
  `inboxResetAt`/`webwhatsResetAt` como floor pro ingestor IGNORAR o histórico que o WhatsApp
  re-sincroniza no mesmo chip (`inbox.service.ts:6262-6297`) — **não** chama disconnect.

## 5. DADO JÁ VAZADO (empresa admin na VPS) — DECISÃO DO DONO: APAGAR
> Decisão 16/06: "apagar os chats do número antigo" **+ trava §4 (não perder a conexão)**.

- A sessão S1 hoje está contaminada (dois números no mesmo ID, telefone relabelado p/ o novo).
- **Como fazer SEM derrubar o chip:** purga puro-banco das conversas/mensagens do 19997024884
  da empresa admin, mantendo a instância Baileys VIVA e a conexão do chip novo intacta. Grava
  o floor `inboxResetAt` pra o histórico re-sincronizado do número antigo não voltar.
- **NÃO** usar o caminho que dependa de disconnect/re-pair. **NÃO** restart de motor.
- Operação destrutiva de dado de produção → roda **só com o "go" do dono na hora**, e idealmente
  só DEPOIS da refatoração (senão o relabel pode re-contaminar). Preferir 1 botão no Owner com
  preview (contagem antes/depois) no padrão da memória `ferramenta-sem-estado-visivel`.

## 6. ORDEM DE EXECUÇÃO (quando o dono der "go")
1. Refatorar o connect (item 3.2) — escritor único, sessão por número.
2. Ingest + inbox viram leitura pura (3.3) + matar `mode:'all'` (3.4).
3. Endurecer disconnect (3.6).
4. Apagar band-aid do front (3.5).
5. Testes: troca de chip = inbox novo vazio; reconexão do mesmo chip = histórico fica;
   sem sessão = inbox vazio (não "all"). Atualizar `webwhats-bridge.service.test.ts` +
   `inbox.service.test.ts` (hoje cobrem o comportamento legado de reuse).
6. SÓ ENTÃO, com "go": purga do dado vazado na VPS (§5), conexão preservada.

## 7. RESTRIÇÕES (WHATSAPP.md + segurança)
- `Webwhats/` é projeto separado — **não** tocar como efeito colateral (este plano é
  100% no `backend/`, camada lógica; motor intacto).
- Sem deploy/publish/restart na VPS sem ordem na hora.
- `whatsappStatus=confirmed` só nasce do Webwhats — não mexer nessa promoção.
- Operação destrutiva (purga §5) só com "go" explícito.
