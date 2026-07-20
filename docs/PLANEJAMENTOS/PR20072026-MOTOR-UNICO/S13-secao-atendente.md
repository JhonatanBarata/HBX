# S13 — Seção Atendente: wizard único, 2 cérebros, 1 sandbox ⚠

**Fase 3 · Worker: Sonnet · Depende de: S05, S12 · Frontend · Revisão adversarial: SIM**

## Objetivo
A fusão que o cliente VÊ: bot-atendimento + assistente viram UM "Atendente" na seção
`?secao=atendente` do `/automacao`. Padrão ManyChat/Intercom: identidade única, escolha de cérebro
(Roteiro de botões | IA), editor do cérebro escolhido, UM celular de teste real.

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/secao-atendente.tsx` (componente da seção)
- REUSAR (importar, não copiar): `WhatsAppPreview`, `BotFlowCanvas`, `BotPhaseEditor`,
  `BotVariablesDrawer`, `BotTermsModal`, `GlassPill` — e os padrões do wizard do
  `/assistente/page.client.tsx`
- EDITAR `frontend/src/app/(app)/automacao/page.client.tsx` (plugar seção)
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. Consumir SÓ os endpoints novos: `GET/PUT /automation/agent`, `POST /automation/agent/sandbox`,
   `POST /automation/agent/publish` (S05). NUNCA chamar `/assistente` ou `/inbox/bot-config` direto.
2. **Primeira visita** (agent sem identidade): wizard 3 passos (base: o do assistente, que é o
   melhor) — identidade (nome/tom + frase de preview), negócio (perfil/produtos/empresa), e passo 3
   NOVO: **escolha do cérebro** com 2 cartões honestos:
   - "Roteiro de botões" — resposta fixa, zero surpresa (recomendado pra começar)
   - "Inteligência Artificial" — conversa natural, IA local, teste grátis no sandbox
3. **Editor** (agent existente): toolbar única (avatar/nome/estado: Ativo no WhatsApp | Rascunho |
   Aguardando suporte) + switch de cérebro sempre visível.
   - Cérebro Roteiro → editor de fases atual (fluxo/organograma + peças) SÓ no modo Tabuleiro
     (Trilha/Bandeja morrem — não portar).
   - Cérebro IA → trilho mensagens/condições/few-shots atual do assistente.
4. **Sandbox único** (dock direita, `WhatsAppPreview`): chama `/automation/agent/sandbox` com o
   cérebro ATIVO — IA responde via Ollama (como hoje), Roteiro responde via replay backend (S05).
   Morre o chat fake hardcoded do bot velho. Rótulo de fonte (ia/roteiro/fallback) mantido.
5. **Publicar**: gate de Termos (`BotTermsModal`) + pino armado (mesmas regras de hoje — pré-voo
   visível: chip conectado, config completa). Publicar com cérebro X desativa o outro
   automaticamente (backend S05 já garante; UI reflete).
6. Estados de erro: agent 403 (módulo bot ausente) → seção nem aparece (gate S12); overview
   indisponível → aviso, não branco.
6b. **Permissão (regra de produto 20/07)**: `canManage:false` (vendedor) → wizard/editor/publicar
   em modo LEITURA (campos disabled, sem botões de salvar/publicar), sandbox LIBERADO (testar não
   altera nada). A config do Admin vale pra empresa inteira — o vendedor vê o agente da empresa,
   nunca configura o dele.
7. QA local Chrome (localhost:3001, login `.test-login.local.md`): wizard completo → editor →
   sandbox nos 2 cérebros → troca de cérebro → publicar (empresa de teste com pino armado, se
   houver; senão validar o estado "Aguardando suporte").

## Critérios de aceite
- Fluxo completo funciona nos 2 cérebros com endpoints novos. Lint + build verdes.
- Zero import das páginas velhas (`bot/page.client`, `assistente/page.client`) — só componentes compartilhados.

## DoD
Commit local: `feat(automation): S13 — seção Atendente unificada (2 cérebros, 1 sandbox)`
