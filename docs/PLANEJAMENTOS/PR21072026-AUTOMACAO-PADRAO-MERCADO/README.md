# PR21072026 — /automacao COM CARA DE MERCADO (frente de FRONT)

> Pedido do dono (21/07): "apropriar essa /automacao. Frontend bonito, tudo testado,
> fácil de cadastrar! igual os sistemas q conversamos: Intercom, Hubspot, Manychat,
> Blip e CNPJ Biz. Foco no front end, e **remover todas explicações, as imagens têm
> que falar por si**."

A fusão (PR20072026-MOTOR-UNICO, 23 sprints, em prod `083f1bf9`) provou o MOTOR.
Esta frente troca a pele: hoje a /automacao **explica** o que faz em parágrafos;
produto de mercado **mostra** — diagrama, prévia real, número, estado. Texto didático
em tela é sintoma de UI que não se explica sozinha.

## Diagnóstico (dados do QA de 21/07 em produção — `QA-VPS.md` da frente anterior)

| Onde | O que está errado | Prova |
|---|---|---|
| Hub | 4 cartões com parágrafo explicativo cada + hero em prosa | screenshot QA — 5 blocos de texto corrido |
| Prospecção | Jargão interno CRU na tela: `cadencia_steps · ligado · skipped` | telemetria do orquestrador vazando pro cliente |
| Prospecção | "Aplicar" pede **IDs de cards colados à mão** | achado A4 — eu mesmo tive que garimpar o id numa chamada de rede |
| Prospecção | "✓ 0 lead(s) inscrito(s)" com check VERDE quando o lead foi bloqueado | achado A3 — backend manda `conflitosAutomacao`, UI joga fora |
| Regras | Empty state é uma AULA (parágrafo de 3 linhas) | achado — o produto explicando a si mesmo |
| Regras | Rotina sem pesquisa salva = beco sem saída (combo vazio, sem caminho) | achado A5 |
| Atendente | Cérebro IA **não tem Ajustes** — persona (nome/tom/perfil/produtos) só no wizard; mudar = "Refazer" do zero | achado A2 (herdado da tela velha) |
| Cobrança/Hub | Vocabulário de status desencontrado: dot "Pausado" sobre número "Ligado" | achado A6 |
| Cockpit lead | Selo "WhatsApp ✓" pra QUALQUER telefone preenchido (sem checagem) — me fez disparar num FIXO | achado B1, `lead-cockpit-modal.tsx:671` (a linha 771 do mesmo arquivo faz certo) |

## Benchmark — o que copiar de cada um (concreto, não inspiração)

| Player | Prática | Vira aqui |
|---|---|---|
| Intercom | Status é 1 badge único (Live/Paused/Draft) idêntico no produto INTEIRO; canvas limpo, zero prosa | `StatusChip` central com 4 estados; varredura de vocabulário |
| HubSpot | Card de automação carrega MINI-DIAGRAMA do fluxo + números de resultado; seleção de registro é SEMPRE busca, nunca ID | cartões vivos do hub; picker de leads no Aplicar |
| ManyChat | Nó mostra a MENSAGEM dentro; entrada = galeria de templates por objetivo, editar > construir do zero | galeria visual dos seeds existentes com mini-preview |
| Blip | Prévia do WhatsApp fiel, sempre visível, WhatsApp-first BR | `PhonePreview` compartilhado nas 3 seções que enviam |
| CNPJ Biz | Prospecção B2B escolhe alvo por filtro/lista visual | picker por lista do funil (reusa `GET /vendas/board`) |

## As 6 Leis desta frente (valem pra TODA sprint; violou = sprint reprovada)

1. **TETO DE COPY**: por bloco, 1 título (≤4 palavras) + no máx 1 linha (≤70 chars).
   Parágrafo em tela é PROIBIDO — explicação longa só em tooltip/hover, e olhe lá.
2. **IMAGEM > TEXTO**: toda explicação vira forma — mini-diagrama, prévia no telefone,
   número grande, estado colorido. Se precisa de texto pra entender, a forma falhou.
3. **STATUS ÚNICO**: um componente `StatusChip` (ligado/pausado/rascunho/atenção) e
   um vocabulário. `skipped`, `preflight`, `executores`, nomes de flag: NUNCA na UI.
4. **NUNCA PEDIR ID**: usuário escolhe entidade por busca/lista visual, sempre.
5. **5 Leis do Design System**: tudo token/classe central (`hbx-theme/`), zero hex/inline,
   `check-pele.mjs` verde. Ilustração = SVG inline com `currentColor`/var — nunca hex,
   nunca arquivo binário. ⚠️ `*/` dentro de comentário CSS derruba o build (2x na
   frente passada). ⚠️ hex em COMENTÁRIO também reprova check-pele.
6. **FRONT-ONLY**: backend intocável. Exceções cirúrgicas já mapeadas e PROVADAS:
   nenhuma — até o picker reusa `GET /vendas/board` (page.client.tsx:515 já consome).
   Worker que "precisar" de endpoint novo: parar e reportar, não criar.

## Sprints (1 worker Sonnet por sprint; ordem = dependência)

| # | Sprint | Entrega |
|---|---|---|
| S00 | verdade-no-feedback | A3 (conflitos na msg do Aplicar) + B1 (selo WhatsApp ✓ só com checagem real) — 2 fixes cirúrgicos de honestidade |
| S01 | kit-visual | `StatusChip`, `EmptyState` ilustrado, `MiniFluxo`, `PhonePreview` extraído/compartilhado — componentes + classes centrais, nenhuma tela ainda |
| S02 | hub-cartoes-vivos | Hub: 4 cartões com mini-visual + número + StatusChip, hero enxuto, zero parágrafo |
| S03 | atendente | Copy no teto + **Ajustes do cérebro IA** (persona editável pós-wizard — reusa o MESMO `PUT /automation/agent` do wizard) |
| S04 | cobranca | Copy + StatusChip + resolver a contradição Pausado×Ligado (A6) na apresentação |
| S05 | prospeccao-limpa | Telemetria crua FORA da tela; personas com prévia no PhonePreview; copy no teto |
| S06 | picker-de-leads | "Aplicar" vira seletor visual de leads do funil (busca+checkbox, reusa board) — mata o campo de IDs |
| S07 | regras-visuais | Empty states = diagrama QUANDO→ENTÃO desenhado + 1 linha + CTA; modal de rotina com caminho real pra criar pesquisa salva (A5) |
| S08 | galeria-templates | Entrada "começar por um modelo" visual: seeds existentes (3 personas, templates ágil/flexível/avançado, roteiro 7 peças) viram cards com mini-preview |
| S09 | varredura-copy | Pente-fino nas 4 seções + hub contra as Leis 1-3; contraste (regra do dono: contraste SEMPRE); tooltips só onde sobrou dúvida real |
| S10 | qa-integral | QA Chrome localhost:3001 completo (3 perfis de gate: bot-só, vendas-só, nenhum) + build+lint+check-pele + relatório com screenshots — GATE do publish |

Depois do publish do dono: QA-VPS curto (reaproveitar roteiro da frente anterior).

## Guardrails duros (mesmos da frente-mãe + específicos)

- Trabalhar DIRETO na master, commit local por sprint, **publish só do dono**.
  NUNCA criar branch/worktree (regra 04/07).
- **Nada de disparo real de WhatsApp nesta frente** — é frente de FRONT. Sandbox ok
  (roda local, não toca chip). Teste com envio real: só o dono manda, e aí no fluxo
  da QA-VPS, nunca aqui.
- Webwhats/ INTOCÁVEL. Backend INTOCÁVEL (Lei 6).
- Iterar em localhost:3001 (`teste`/`teste123`, script em backend/scripts/) — não
  publicar picadinho pra testar (memória: terminar tudo → 1 publish).
- Cada sprint: `cd frontend && npm run lint && npm run build` + check-pele verdes
  ANTES do commit. Os vermelhos PRÉ-EXISTENTES conhecidos (kit.css radar-ai,
  lead-cockpit react-hooks) não são desta frente — não "consertar de brinde", só
  não piorar.

## Pendências PARALELAS (não são sprint — decisão/ação do dono)

1. **A1 — timeout da IA**: `HBX_ASSISTENTE_TIMEOUT_MS=20000` estoura na 1ª chamada
   fria (Ollama CPU: 9–12s medidos). Recomendação: subir pra `45000` no .env da VPS
   (1 linha, vale pro Atendente AO VIVO, não só sandbox).
2. Backfill empresa 45 (`automation-agent-backfill.js`) — classificador me bloqueou;
   comando pronto no QA-VPS.md da frente-mãe.
3. Lixo de QA pra apagar quando quiser: lead "QA TESTE 21-07 (apagar)" e gatilho
   "QA teste 21-07 (apagar)" na empresa 5.
4. Rotacionar credencial Firebase (pendência da frente-mãe, segue aberta).

## Decisões tomadas (com recomendação; dono pode reverter no chat)

- Chips de telemetria (`cadencia_steps · skipped`): **REMOVER da UI** (não esconder
  atrás de toggle). Quem precisa disso lê log. UI mostra só o resultado humano.
- Nome do módulo segue "Automação"; nomes das seções seguem os 4 objetivos.
- Ilustrações: SVG inline tokenizado + CSS puro. Zero biblioteca nova, zero asset
  binário.
