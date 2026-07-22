# RELATÓRIO S10 — QA integral local (GATE do publish)

**Sprint:** S10-qa-integral · **Worker:** Sonnet · **Data:** 21-22/07/2026
**Escopo:** roteiro completo do `S10-qa-integral.md` (10 passos) contra as 5 telas
(`page.client.tsx` + `secao-atendente/cobranca/prospeccao/regras.tsx`) da frente
PR21072026-AUTOMACAO-PADRAO-MERCADO, em `localhost:3001` (Chrome/Claude Browser pane),
empresa Atlas Distribuidora (#39, `teste`/`teste123`), sem publish, sem armar bot, sem
disparo real de WhatsApp em nenhum momento.

## Veredito

# GO-COM-RESSALVAS

Zero ❌ que bloqueiem o publish desta frente. Zero regressão nova nas 5 telas/kit desta
frente. 3 ⚠️ genuínos — nenhum introduzido pelas sprints S00-S09, mas o dono precisa saber
antes de publicar (detalhe na seção 11).

## Checklist dos 10 passos

| # | Passo | Resultado |
|---|---|---|
| 1 | Build de verdade (lint+build+check-pele) | ✅ |
| 2 | Hub | ✅ |
| 3 | Atendente | ✅ (1 observação de ambiente, ver §3) |
| 4 | Cobrança | ✅ |
| 5 | Prospecção | ✅ |
| 6 | Regras | ✅ com ⚠️ herdado (não desta sprint, ver §6) |
| 7 | Gates de acesso (3 perfis) | ✅ TESTADO AO VIVO nos 3 perfis |
| 8 | Redirects | ✅ |
| 9 | 2 temas | ✅ com ⚠️ de ambiente + 1 achado POSITIVO (ver §9) |
| 10 | Este relatório | ✅ |

---

## 1. Build de verdade

```
cd frontend && npm run lint
→ eslint: 1 erro (lead-cockpit-modal.tsx:383, "Calling setState synchronously within an
  effect") + 20 warnings — todos em arquivos fora desta frente (agenda, atendimento,
  contatos, leads, qr.ts, vendas, bot-prospeccao-panel, public-entry, register-client,
  theme-attributes, bot-alert). Contagem batida 1 a 1 com a baseline do enunciado.

node ./scripts/check-pele.mjs   (rodado à parte — "npm run lint" para no erro acima e
  o `&&` do package.json não chega a executar o check-pele; conferido isolado)
→ 27 violações R1 em hbx-theme/kit.css (--radar-ai-status-*, linhas 1546-1598, pré-
  existente) + 1 R2 em impersonation-banner.tsx:13 (pré-existente) + 2 R1 em
  logistica/route-builder.module.css:8,22 (pré-existente). 30 linhas ao todo — bate
  exatamente com "27 kit.css + 1 impersonation-banner + 2 route-builder".

npm run build
→ Turbopack, "Compiled successfully in 8.8s", TypeScript OK, 51 rotas estáticas
  geradas (inclui /automacao). Build limpo.
```

**Zero item novo em qualquer um dos 3 gates.** Baseline batida exatamente.

⚠️ Nota operacional (não é falha de gate): rodar `npm run build` enquanto uma sessão de
browser já está com a página carregada contra o MESMO servidor de `localhost:3001`
invalida os hashes de chunk que o browser já tinha em memória — aconteceu 1x durante
esta sessão (`Ops, algo deu errado / No link element found for chunk .../src_app_
globals_*.css`), resolvido com um hard-reload. O servidor de `:3001` parece ser
`next start` (produção) servindo o mesmo `frontend/.next` que o `npm run build`
regenera — não `next dev`. Não é bug do código desta sprint; é um efeito colateral de
rodar o gate de build enquanto alguém testa ao vivo no mesmo processo. Registrando
porque pode confundir quem repetir este QA.

## 2. Hub

4 cartões com dado real do `/automation/overview` (Rascunho·IA / Pré-voo: sem chip /
Pausado·0 leads / Nada ligado·0 gatilhos·0 rotinas), galeria "Começar por um modelo"
(4 templates) quando nada está ligado, StatusChip do motor "Sem chip" (tone atenção) no
hero. Zero parágrafo.

**Fail-soft:** exercitado ao vivo (via o teste do passo 7, gate "nenhum") — `load()` em
`page.client.tsx:309-317` tem UM catch genérico que cobre qualquer erro (rede OU HTTP);
com os 3 módulos desligados a tela mostrou exatamente "Não carregou / Módulo
indisponível para este usuário ou empresa. / Tentar novamente" — é o MESMO branch de
código que trataria uma queda de rede de verdade, então a evidência é válida para os
dois casos, não só para gate.

## 3. Atendente

Persona real da Atlas: **Júlia** (IA), 2 mensagens, 3 condições, "Aguardando suporte"
(não publicado).

- **Wizard/galeria:** confirmada renderizando na §2 (4 templates com "Usar"). Não cliquei
  "Usar" em nenhum — abriria o wizard sobre a config real da Júlia; risco desnecessário
  pra só confirmar que a entrada existe (já confirmado visualmente).
- **Editor:** mensagens/condições da Júlia renderizam certo.
- **Ajustes IA → salvar → reload persiste:** testei de verdade. Troquei "Estilo de
  comunicação" Descontraído→Formal, salvei, **hard-reload**, confirmei Formal marcado
  (`is-on`). Troquei de volta Formal→Descontraído, salvei, hard-reload, confirmei via
  `GET /automation/agent` bruto que `ia.tom` voltou a `"descontraido"` — JSON completo
  do agente comparado antes/depois, idêntico (nome, perfil, produtos, fluxo com 2
  passos/3 condições, `published:false`).
- **Sandbox 2 cérebros:** testei os DOIS. Cérebro IA: mandei "oi", resposta veio
  rotulada `respondido pelo roteiro de botões` (a mensagem de abertura do `ia.fluxo` é
  servida pelo motor de casamento determinístico, não LLM — comportamento correto por
  código, `SANDBOX_SOURCE_LABEL` em `secao-atendente.tsx:263-267` documenta os 3
  rótulos possíveis: `ia`/`roteiro`/`fallback`). Cérebro Roteiro: mandei "oi", recebi o
  `welcomeMessage` real com os 4 botões do menu, rotulado `roteiro` (esperado, é o
  próprio roteiro). **Não consegui forçar ao vivo o rótulo `fallback` ("IA
  indisponível")** — uma segunda mensagem fora do fluxo scriptado não completou o
  envio (input ficou preenchido mas o submit não disparou de forma confiável neste
  ambiente); o mecanismo existe e está correto no código, mas o caso específico de
  timeout/fallback não foi provado ao vivo. Registrando como não-testado, não como ok.
- **Canvas Roteiro sem regressão:** 7 de 7 peças "Pronto" (100%) — Boas-vindas, Menu,
  Pós-ação, Encerramento, Retorno, Humano, Bloqueado, todas com conteúdo real.
- **Achado verificado e descartado** (não é bug): alternar o toggle "Roteiro/IA" na
  barra do editor **parece** disparar um PUT (a 1ª vez que testei vi um PUT no log de
  rede logo depois do clique), mas ao isolar o teste (ler `updatedAt` antes/depois de
  cada clique) confirmei que o `brain` salvo no servidor **nunca muda** — o toggle é
  100% estado local (`setSelectedBrain`, `secao-atendente.tsx:862`, sem chamada de
  API). O PUT que vi era resíduo de uma chamada de "Salvar ajustes" anterior ainda no
  buffer de rede da ferramenta. Confirmado 2x com leitura direta do `GET
  /automation/agent` (`updatedAt` idêntico nas duas pontas).

## 4. Cobrança

Canvas 3 de 7 peças (43%) — Menu, Encerramento, Humano prontos; Boas-vindas, Pós-ação,
Retorno, Bloqueado vazios (com atalho "MONTAR"). Prévia do telefone espelha o texto real
da peça Menu ("Perfeito, {{cliente}}. Escolha abaixo...") com os 4 botões certos.
StatusChip único "Aguardando suporte" — **sem** a contradição Pausado×Ligado que o A6
apontava. Não cliquei Salvar/Publicar (config real da Atlas, sem necessidade de mutar
pra confirmar o visual).

## 5. Prospecção

Zero jargão visível (grep + inspeção visual — nenhum `cadencia_steps`/`skipped`/nome de
flag na tela). 3 personas (Confiável/Estratégico/Determinado) com StatusChip "Ligado",
cadência resumida (N toques · N WhatsApp) e prévia da mensagem de abertura de cada
persona diretamente no card.

**Aplicar via picker (Lei nº4):** cliquei "Aplicar" na persona Confiável — abriu modal
"Aplicar: Confiável (Conservador)" com abas "Lista de leads"/"Pesquisa salva", contador
"0 selecionados", "Selecionar visíveis" e uma LISTA VISUAL de 10 leads reais (nome +
cidade/segmento) — **zero campo de ID**. Fechei em "Cancelar" sem aplicar nada.

**Resultado honesto com lead bloqueado:** reproduzido localmente — o lead "Pet Shop
Amigo Fiel" aparece no picker com o badge "Cadencia ativa" (não deixa selecionar como se
estivesse livre); mesmo padrão confirmado depois na tela `/vendas` (mesmo lead com tag
"Sem conversaCadencia ativa" na lista).

## 6. Regras

Empties com `MiniFluxo` desenhado ("Lead responde → mover p/ retorno → notificar
vendedor" / "Toda segunda → Pesquisa salva → 50 no funil") + 1 linha + CTA — Lei 1/2 ok.

**Gatilho CRUD completo, testado ao vivo:** criei "QA S10 teste (apagar)" (Lead responde
no WhatsApp → notificar vendedor) → confirmei na lista (StatusChip Ligado, 0 disparos)
→ Desativar (virou Pausado) → Remover → confirmei lista voltou a "Nenhum gatilho ainda"
e contador a 0. Zero resíduo.

**Rotina, pesquisa salva vazia (achado A5) — ⚠️ parcialmente resolvido, achado herdado:**
abri "Nova rotina" sem pesquisa salva cadastrada → mostra "Nenhuma pesquisa salva — crie
um filtro em Vendas." com um botão real "Criar pesquisa" (**não é mais** o beco sem
saída do A5 original — existe um caminho). Cliquei o botão: ele é um `<Link
href="/leads">` (`secao-regras.tsx:585`) que por sua vez é um redirect-shim
(`leads/redirect.client.tsx:14`) que seta `sessionStorage["hbx:vendas-modo"]="buscar"` e
manda pra `/vendas`, cuja intenção documentada é abrir DIRETO na aba "Buscar empresas"
(onde vive o botão "Salvar atual" que cria a pesquisa salva de verdade).
**Na prática isso não aconteceu**: cheguei em `/vendas` na aba "Meu funil" (errada); o
`sessionStorage` ficou setado mas nunca foi consumido/removido — reproduzi 2x, inclusive
com hard-reload direto em `/vendas` com a flag setada manualmente, mesmo resultado. O
mecanismo automático de troca de aba (`vendas/page.client.tsx:565-576`, efeito de mount
com `requestAnimationFrame`) simplesmente não dispara nas condições testadas. Clique
manual na aba "Buscar empresas" funciona normal (o bug é só no AUTO-switch, não na aba
em si).
**Isto NÃO é arquivo desta frente** (`vendas/page.client.tsx` é anterior, S07 só
reusou um link que já existia, citando no comentário "MESMO link que dashboard/
page.client.tsx já usa") — não tentei consertar (fora do escopo de arquivo da Lei 6,
mecanismo pré-existente, merece sprint própria). Impacto real: usuário faz 1 clique a
mais do que o desenhado; não é mais o dead-end original do A5.

## 7. Gates de acesso (3 perfis) — TESTADO AO VIVO

O seed local só tem 1 usuário (`teste`, ADMIN da Atlas, todos os módulos ligados) — sem
usuários prontos com os 3 perfis pedidos. Em vez de criar empresas/usuários novos
(mais invasivo), usei o **próprio mecanismo de self-service do admin**
(`Configurações → Módulos`, toggle de categoria — `POST /profile/module-categories`),
que mapeia 1:1 pros 3 módulos do gate (`module-categories.ts`: categoria `vendas`→
módulo `vendas`; categoria `whatsapp`→módulos `atendimento`+`bot`) e é otimista+
reversível com piso de "mínimo 1 categoria ligada". Confirmei por código que é
NÃO-destrutivo (só mexe em `CompanyModule.enabled`, não toca conexão/sessão de
WhatsApp — zero relação com os guardrails do Webwhats) antes de tocar em qualquer coisa.

Testei os 3 perfis, um de cada vez, confirmando por `GET /modules/me` bruto entre cada
passo (não só pela UI):

| Perfil | Estado dos módulos | Sidebar "Automação" | Cartões do hub |
|---|---|---|---|
| **vendas-só** | atendimento=F, bot=F, vendas=T | Aparece | Só "Buscar clientes" + "Reagir e abastecer" (Prospecção/Regras) |
| **bot-só** | atendimento=T, bot=T, vendas=F | Aparece (Vendas/Agenda/Relatórios somem da sidebar) | Só "Atender sozinho" + "Cobrar quem deve" |
| **nenhum** | atendimento=F, bot=F, vendas=F | Some inteiramente | N/A — acesso direto por URL mostra fail-soft "Não carregou / Módulo indisponível para este usuário ou empresa. / Tentar novamente" (zero crash, zero vazamento de dado) |

Bate exatamente com `secaoGateOk` (`page.client.tsx:118-122`) e `hasAnyModuleAccess`
(`shell.tsx:782-785`) lidos no código. **Restaurado ao final** (Radar/Vendas/WhatsApp/
Logística ligados, Website desligado — o estado exato de antes) e **provado por
reload**: `GET /modules/me` depois da restauração devolve a MESMA lista, byte a byte,
da primeira leitura feita antes de eu tocar em qualquer coisa.

Não criei usuário/empresa nova — não foi necessário dado que o toggle de categoria do
próprio admin cobriu os 3 casos com evidência ao vivo real (leitura de API, não achismo
de UI).

## 8. Redirects

```
/bot          → /automacao?secao=atendente              ✅
/automacoes   → /automacao?secao=prospeccao              ✅
/assistente   → /automacao?secao=atendente&cerebro=ia    ✅
```

`/assistente/copiloto/*`: confirmado por código (não por clique — não existe página
`/assistente/copiloto` no Next.js, só `app/(app)/assistente/page.tsx` sem subpastas;
`AssistenteRedirect` casa só o pathname exato `/assistente`). O "Copiloto" citado no
guardrail do S17 é `leads/[id]/copiloto-panel.tsx` (painel dentro da tela do Lead) +
endpoints de backend `/assistente/copiloto/*` — nunca passou nem passa por este
redirect de página. Guardrail respeitado por construção, não por sorte.

## 9. 2 temas (claro/escuro)

5 telas (hub + 4 seções) visitadas em claro e escuro — renderizam certo, zero erro de
console nas 10 combinações. `computer{action:"screenshot"}` travou (timeout 30s) em
toda tentativa, como avisado; evidência por `get_page_text` + `getComputedStyle` via
`javascript_tool` + console + rede, como a S09 já tinha documentado como necessário
neste ambiente.

**Achado POSITIVO — os 2 bugs de contraste que a S09 reportou na pele "Login Mod" JÁ
ESTÃO CORRIGIDOS**, mas só no working tree, **não commitado**:
`git diff -- frontend/src/app/hbx-theme/theme-login.css` mostra 14 inserções/3 remoções
não commitadas. Não fui eu quem editou — encontrei já modificado ao chegar (é
exatamente o que a S09 pediu na task em background `task_237c50e8`, "Corrigir
contraste da pele Login Mod no claro"; presumo que o dono ou aquela task já resolveu).
Recalculei WCAG ao vivo pelos valores atuais (`getComputedStyle` real, não só leitura
do CSS):
- `--hbx-brand-strong`/`--hbx-success` (claro): `#8FCF16`→`#4A7307` — contraste sobre
  `--hbx-surface` (`#FBFCF7`) subiu de 1,83:1 pra **5,44:1** (passa 3:1 ícone E 4,5:1
  texto).
- `--hbx-warning`/`--hbx-danger` (claro): `#667064` (idêntico ao muted)→`#3F4B3D` —
  agora distinto do `--text-muted` (`#667064`) e com **8,92:1** contra o surface. O
  dot "Atenção" e o dot "Pausado" não são mais a mesma cor.
- O diff também blinda 2 seletores (`.casca-fallback__cta`, `.casca-toast`) que pintam
  `brand-strong` como FUNDO (não como texto/ícone) pra continuarem usando o verde
  vibrante original — sem isso a tinta escura quebraria o contraste do texto ESCURO
  que fica em cima desses dois.
- O achado secundário da S09 (`--text-muted` no ESCURO, 3,54:1) **segue sem correção**
  — recalculei e confere exatamente 3,54:1 ainda hoje; a própria S09 já tinha
  deprioritizado esse item ("não numa 2ª task pra não gerar ruído"), então é esperado.

**⚠️ Isto NÃO está commitado.** Se o dono publicar sem levar esse arquivo junto, os 2
bugs de contraste voltam. Não commitei eu (não é arquivo desta frente — é pele global,
decisão do dono, exatamente como a S09 já tinha sinalizado) — só confirmo que a
correção existe, funciona e está pronta, esperando ir junto num publish.

**⚠️ Achado de AMBIENTE (não é bug de código) — clicar o toggle claro/escuro dispara
`"Ops, algo deu errado — Transition was aborted because of invalid state"`:**
reproduzido 3 de 3 vezes ao clicar de verdade (via `element.click()`, já que o clique
por coordenada da ferramenta `computer` não registrou nenhuma das vezes que tentei —
mesma instabilidade que a S09 já relatou). Causa-raiz confirmada por
`document.visibilityState`/`document.hasFocus()`: neste Browser pane o documento fica
**`"hidden"`/sem foco** o tempo todo (não é uma aba de verdade em primeiro plano do
SO) — e a View Transitions API do Chrome (`document.startViewTransition`, usada em
`theme-attributes.tsx:87-114` pro cross-fade suave) **lança esse exato erro por
especificação** quando chamada com o documento não-visível. O mecanismo em si funciona
certo (o `data-theme-mode` troca corretamente toda vez, confirmado por leitura direta
do atributo antes/depois de cada clique) — só a ANIMAÇÃO de transição reclama neste
ambiente headless-like. Não deveria reproduzir numa janela de Chrome de verdade com
foco (que é como o dono/cliente usa); registrando para o dono validar 1x manualmente
se quiser ter 100% de certeza, mas não trato como ❌ de código desta sprint.

## 10. Este relatório

Feito. Commit local a seguir.

## 11. O que o dono precisa saber antes de publicar

1. **Contraste da pele Login Mod (2 bugs da S09) já está corrigido, mas só localmente,
   não commitado.** Arquivo: `frontend/src/app/hbx-theme/theme-login.css`. Se o
   publish não incluir esse arquivo, os 2 bugs (verde 1,83:1 e aviso≡pausado) voltam
   pro ar. Vale conferir que esse diff vai junto no próximo `npm run publish`.
2. **CTA "Criar pesquisa" (Regras → Nova rotina, achado A5) não completa o auto-switch
   de aba em `/vendas`** — usuário chega na aba "Meu funil" em vez de "Buscar
   empresas" e precisa clicar 1x a mais pra achar "Salvar atual". Mecanismo
   pré-existente (`vendas/page.client.tsx:565-576`), fora do escopo de arquivo desta
   frente — não é dead-end (o A5 original), mas não é o caminho liso documentado.
   Sugestão: sprint curta e separada, fora desta frente.
3. **Sandbox da IA no cérebro Atendente — não consegui forçar ao vivo o rótulo
   "fallback" (IA indisponível/timeout).** O mecanismo existe no código (3 rótulos:
   ia/roteiro/fallback) e testei 2 dos 3 (roteiro nos dois cérebros); o terceiro
   (timeout real da IA local) fica sem prova ao vivo nesta rodada — não é evidência de
   bug, é ausência de teste.
4. Gates dos 3 perfis (bot-só/vendas-só/nenhum) **testados ao vivo com evidência de
   API**, não só suposição de código — nenhum usuário novo precisou ser criado.
5. Zero regressão nos gates de build/lint/check-pele — baseline batida exatamente.
6. Erro "Transition was aborted" ao trocar tema é do AMBIENTE de preview (documento
   sem foco/hidden), não do código — mecanismo de troca de tema em si funciona
   (confirmado por leitura de atributo, não só visual).
7. Working tree: só a modificação pré-existente de `theme-login.css` (não minha, ver
   item 1) + este relatório. Nenhum resíduo de teste ficou na Atlas (gatilho de QA
   criado e removido; módulos restaurados e provados por reload; persona Júlia e
   config da Cobrança/Prospecção intocadas — só li, não salvei nada nelas).

## Commit

Local (branch `master`, não publicado): ver hash no `git log` após este commit —
sprint anterior (S09) em `b1134ef7`; entre S09 e este relatório o dono publicou mais 3
commits `feat(android)` em paralelo (fora do escopo desta frente).
