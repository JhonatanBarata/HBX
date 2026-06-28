# Plano — Onboarding HBX (do 1º login à comissão no master)

> Planejado em 28/06/2026 (co-design dono + Opus). Este doc é o INPUT da janela de build.
> Escopo: empacotar o sistema numa jornada de ativação por papel, do 1º login até o
> vendedor fechar e a comissão subir a cadeia até o master.

## Princípio (por que isso = retorno financeiro)
Velocidade até o 1º valor de CADA papel = ativação = retenção = mais gente virando
revendedor = mais comissão subindo pro master. Onboarding aqui é **engenharia de
ativação**, não "tour bonitinho".

## Como o mercado trabalha (o que dita o design)
- SMB BR vende no WhatsApp, é dono-operador, zero paciência pra setup → time-to-first-lead
  minúsculo; o "aha" é o 1º lead com telefone pra chamar agora.
- A conta é uma CADEIA (master HBX → empresa/admin → gerente → vendedor); cada papel tem
  trabalho e momento de valor diferentes → onboarding único pra todos fracassa.
- Duas vendas embutidas: empresa usando o HBX pra vender o produto DELA + empresa/vendedor
  REVENDENDO o HBX (comissão sobe pro master). O onboarding leva de usar → revender.
- Vendedor = alto volume, baixa técnica → gamificação/dopamina, não manual.
- Admin destrava ou trava a cadeia (módulos/permissões/canal). Permissões ruins = vendedor
  nunca liberado = cadeia parada.

## Framework de referência
- Espinha → **Salesforce Trailhead**: caminho guiado POR PAPEL, cada um terminando numa
  "primeira vitória" concreta.
- Gatilho → **Activation / Aha-moment (Reforge / Amplitude)**: 1 evento de ativação por
  papel; encurtar o caminho até ele.
- Casca persistente → **checklist "Getting Started" (HubSpot / Pipedrive)**.
- Camada vendedor → **Duolingo**: progressão gamificada.
- Profundidade por tela → **motor de coachmark "Como usar" que JÁ existe** (reaproveitar).

## Casca (HÍBRIDA — decisão travada)
1. **1º login guiado curto (universal, ~60s):** "esta é a sua casa" + identidade + pele + o
   único botão que importa pro papel.
2. **Checklist de ativação persistente por papel:** cada item = uma "1ª vez"; some ao
   completar. É o que garante o passo-a-passo até o fim sem prender em tour linear.
3. **Coachmark por módulo (já existe):** profundidade sob demanda via "Como usar".

### Gamificação (decisão travada: MÉDIA em mecânica, ALTA em produção visual)
- Mecânica média: cada "1ª vez" = conquista + barra de progresso do checklist + microcopy.
  SEM XP/níveis/ranking (evita competição tóxica e foco no jogo).
- **Visual dos momentos de conquista: MARCANTE, premium e SEMPRE presente** — toda "1ª vez"
  dispara o MESMO momento forte. **Nunca cara de joguinho/badge infantil.** Nasce em
  **componente central do design system** (tokens/classe central — 5 Leis), reusável em
  todos os marcos. É o ponto que o dono fez questão: marcante, consistente, sempre.

## Apex da comissão (decisão travada): CASCATA até o HBX
vendedor (quem fecha) → override do gerente/empresa (`commissionPercentSnapshot`) →
revenue/comissão do **master HBX**. Casa com `createHbxSalesHandoffForUser` + comissão
amarrada a quem fecha.

---

## Camada 1 — VENDEDOR (coração; build primeiro)
Ativação = **1ª conversa iniciada**.

| # | Passo | Tela | Marco |
|---|---|---|---|
| 0 | "esta é a sua casa" + pele | 1º login | — |
| 1 | abrir Radar, ver o lago, mirar filtro | /vendas → slide "Buscar empresas" | coachmark (existe) |
| 2 | ▶ Buscar → enche "Disponíveis" | Radar | — |
| 3 | **puxar o 1º lead** → contato libera, entra na carteira | Radar | 🏆 vitória #1 |
| 4 | conectar WhatsApp (**just-in-time** — só agora) | /atendimento | — |
| 5 | **1ª conversa** → manda a 1ª mensagem | /atendimento | 🏆 **ATIVADO** |
| 6 | trabalhar o funil: etapa, ligação, agendar retorno | /vendas (funil) | — |
| 7 | **fechar a venda** | FecharVendaModal | 🏆 celebração |
| 8 | comissão amarrada → sobe a cadeia → master | handoff | 🎯 final |

Ponte revenda (decisão travada): **revelar "você pode revender o HBX" SÓ pós-1ª-vitória e
SÓ se a empresa tem `sellsHbxPlans`**. Não polui quem só vende o produto da empresa.

## Camada 2 — FECHAMENTO → COMISSÃO → MASTER
- **Celebração do vendedor (travada):** só o ganho DELE em destaque + linha sutil "subiu
  pra empresa/HBX". Não vê valores alheios (Lei do Vendedor: só admin vê valores de plano).
- **Quando conta (travada):** comissão **prevista na hora** (dopamina) + **confirmada
  quando o cliente paga/ativa** (casa com `activation_pending`). Nada de comissão-fantasma.
- **Master recebe (travada):** **sino no momento + feed no painel master** ("Empresa X ·
  Vendedor Y fechou Plano Z · R$W · activation_pending").

## Camada 3 — GERENTE + TELA DE PERMISSÕES (a dor)
Ativação do gerente = **1º vendedor liberado**.

Jornada: ver time → ajustar **preset do cargo** (não pessoa a pessoa) → **liberar o 1º
vendedor** → acompanhar funil do time.

### Redesign da tela de permissões — 3 níveis de divulgação progressiva
Hoje: 76 toggles por pessoa = muro. O backend JÁ agrupa as 76 em **8 grupos**
(`modules, radar, vendas, communication, commission, sellerNetwork, products, admin` —
`backend/src/team/team-access-catalog.ts`). Expor em camadas:
- **Nível 1 — Presets por cargo:** Vendedor/Gerente nascem certos (Lei do Vendedor:
  vendedor no máximo operacional, admin corta). 99% para aqui.
- **Nível 2 — os 8 GRUPOS (decisão travada: camada padrão da tela):** toggles por grupo,
  por pessoa, como exceção. (76 deixou de ser o default.)
- **Nível 3 — Avançado:** matriz 76 completa, escondida atrás de "Avançado".
- **Quem edita (travada):** admin tudo (presets + matriz); gerente só faz exceções por
  pessoa do próprio time.
- Onboarding gerente/admin toca só níveis 1–2.

## Camada 4 — ADMIN / EMPRESA
Ativação (travada, ramificada): time = 1º vendedor convidado + módulos ok; solo = 1ª conversa.

| # | Passo | Obs |
|---|---|---|
| 0 | 1º login → **"sozinho ou com time?"** (ramifica) | decisão travada: pergunta e ramifica |
| 1 | identidade (nome/logo/segmento padrão) | — |
| 2 | confirmar módulos (já vêm default — só ajusta) | radar/vendas/atend/cadastro/email ON |
| 3a | com time: convidar gerente/vendedores + preset de cargo | nível 1 das permissões |
| 3b | solo: cai direto no fluxo do Vendedor | reusa Camada 1 |
| 4 | conectar WhatsApp (**nudge — pode pular**, nunca muro) | — |
| 5 | ver o 1º lead/venda acontecer | — |

Sub-passo recomendado: **"o que você vende?"** leve (catálogo/oferta) → alimenta o
`FecharVendaModal`.

## Camada 5 — MASTER (command center, NÃO tour)
O master opera a plataforma; não é "ensinado". Decisões travadas:
- **Centro = feed do flywheel ao vivo** (vendas+comissões entrando em tempo real).
- **Métrica-norte = vendedores ativados** (indicador-líder do flywheel).
- **Drill-down = god-view** (empresa → vendedor → negócio).
- Peças: feed do flywheel · roster de empresas (status comercial/MRR) · funil de aquisição
  (quantas chegaram em "ativado") · drill-down.

---

## Existe × Novo (custo do build)
| Peça | Status |
|---|---|
| `FecharVendaModal` + comissão amarrada + handoff + `commissionPreview` | ✅ existe (working tree) |
| Motor coachmark "Como usar" + tours por módulo (Radar consertado 28/06) | ✅ existe |
| Presets por cargo + 8 grupos + matriz 76 (dados) | ✅ existe |
| **Checklist de ativação persistente + tracking dos eventos** | 🔨 NOVO (coração) |
| **Componente central de "momento de conquista" (marcante, premium, sempre)** | 🔨 NOVO |
| **Feed de comissão + sino do master** | 🔨 NOVO |
| **Redesign da tela de permissões (8 grupos default + avançado)** | 🔨 rework |
| **Ramificação solo/time no 1º login do admin** | 🔨 NOVO |
| Celebração (escopo "só ganho dele") + ponte revenda | 🔧 ajuste |

## Eventos de ativação a rastrear (camada de dados nova)
- Vendedor: `lead_pulled` · `whatsapp_connected` · **`first_conversation_started` (=ATIVADO)** · `first_deal_closed`.
- Gerente: **`first_seller_released` (=ATIVADO)**.
- Admin: `company_identity_set` · `first_module_confirmed` · time:`first_seller_invited` / solo:`first_conversation` (=ATIVADO).
- Guardar como flags/timestamps de estado de onboarding por usuário (tabela nova ou JSON no user).

## Ordem de build (vendedor-first)
1. Checklist de ativação + tracking de eventos (+ componente de conquista).
2. Finale: feed de comissão + sino do master.
3. Redesign da tela de permissões.
4. Ramo solo/time do admin.
5. Cockpit do master (feed/roster/aquisição/drill-down).

## Âncoras no código (pra build window não procurar)
- Coachmark: `frontend/src/components/hbx/tutorial-coach.tsx`, `tutorial-coach-host.tsx`,
  `tutorial-coach-store.ts`; passos `frontend/src/lib/tutorial-coach-steps.ts`; gatilho
  "Como usar" + `MODULE_TOURS` em `frontend/src/components/hbx/shell.tsx`.
- Vendedor: `/vendas` (`frontend/src/app/(app)/vendas/page.client.tsx`), slide "Buscar
  empresas" monta `<LeadsClient embedded/>` (`frontend/src/app/(app)/leads/page.client.tsx`);
  `/atendimento` (`.../atendimento/page.client.tsx`). `/leads` redireciona pra `/vendas`.
- Fechar venda: `components/hbx/fechar-venda-modal.tsx`; `createHbxSalesHandoffForUser`;
  rota `POST /vendas/conversation/:id/hbx-handoff`; `GET /vendas/me/commission-profile`;
  `commissionPreview`; lead → `activation_pending`.
- Permissões: `backend/src/team/team-access-catalog.ts` (8 grupos); `/gerencial?aba=4`
  "Padrão por cargo" + matriz 76; `backend/src/modules/modules.service.ts` (default módulos).
- Gate revenda: `Company.sellsHbxPlans`.
- Master: telas master (`/master`, `/dashboard`); cockpit HBX Owner (:3107).

## Riscos / pontos de atenção
- WhatsApp = risco de ban → conectar é AÇÃO LIVE; testar reconexão só em número
  descartável, nunca no chip do dono (ver CLAUDE.md / Webwhats).
- "Momento de conquista" e celebração nascem em token/classe central (5 Leis) — `check-pele`
  reprova hex/inline em tela.
- Feed/sino do master provavelmente é trabalho NOVO end-to-end (evento → notificação → UI).
