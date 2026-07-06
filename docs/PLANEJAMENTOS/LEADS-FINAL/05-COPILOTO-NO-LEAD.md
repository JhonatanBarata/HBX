# 05 — Copiloto no lead (o "Assistente IA" com motor próprio)

## Objetivo
Expor a IA que JÁ roda em prod (bot classificador + assistente, `qwen3:4b-instruct` na
VPS) como **Copiloto dentro da página do lead** (plano 02), com 3 ações que o Biz não
consegue entregar. Trabalho de SUPERFÍCIE — motor não muda.

## Por quê ($)
"IA no CRM" é commodity (HubSpot/Pipedrive/Attio cobram como add-on). O padrão não é
plágio — plágio seria copiar tela/texto/nome. Nossa IA roda na VPS a custo ~zero → dá pra
entregar INCLUSO o que concorrente cobra, como argumento de fechamento. E o contexto RFB
(CNAE/porte/cidade) é dado que temos de graça e o Biz cobra pra mostrar.

## Estado atual (memória IA-VPS/WHATSAPP, conferir ao vivo)
- Prod: single `qwen3:4b-instruct` (CHIP 6 injetado 05/07) — ollama `KEEP_ALIVE=-1`,
  `ctx4096`, `parallel2`; envs POR FRENTE (bot × assistente); timeouts 20s; smoke BOT 6/6;
  overlap bot 3,9s < 9s com card rodando.
- Gate anti-alucinação no `LeadContactWriteService` (IA não inventa contato).
- Pendência conhecida: publish das 2 regras do prompt do assistente (`8681dbea`) —
  conferir se já subiu antes de mexer em prompt.

## Desenho

### Superfície (front, página do lead)
- Painel/toggle "**Copiloto**" no topo do miolo (naming nosso; NÃO usar "Assistente IA"
  do Biz nem robozinho igual). Visual 100% por token/classe central.
- 3 ações, cada uma = 1 clique = 1 chamada:
  1. **Rascunhar resposta** (tab WhatsApp): contexto = últimas N mensagens da conversa +
     ficha RFB da empresa (CNAE, porte, cidade, situação). Sai como RASCUNHO no campo de
     digitação — **NUNCA envia sozinho** (guardrail duro abaixo).
  2. **Resumir conversa**: resumo em 3-5 bullets → botão "salvar como anotação" (usa o
     LeadNote do plano 02).
  3. **Próxima ação sugerida**: sugere follow-up com data ("ligar em 2 dias — pediu
     orçamento") → 1 clique cria a atividade agendada (se contrato de atividades existir;
     senão, vira anotação pinada — dado sem contrato nunca é fake).

### Backend
- Endpoint(s) no módulo do assistente existente reutilizando o client ollama da frente
  IA-VPS (mesmos envs/timeout 20s da frente "assistente" — NÃO roubar a faixa do bot;
  respeitar as faixas realtime/batch do GOVERNOR-IA §9 / `AiGatewayService`).
- Prompt por ação, curto, em PT-BR, com a ficha RFB embutida. Saída JSON validada
  (rascunho/resumo/sugestão) — resposta malformada = erro gracioso, sem retry automático.
- Flag de ambiente própria (default ON local, decisão do dono pra prod) — padrão da casa.

## Guardrails DUROS
- **Copiloto NUNCA envia mensagem WhatsApp sozinho.** Só preenche rascunho; humano aperta
  enviar. Zero automação de envio nova — frente WhatsApp tem histórico de ban (23/06) e a
  regra é freio, não sintoma.
- 1 clique = 1 chamada; sem loop, sem polling; timeout 20s; falha = "Copiloto
  indisponível" e a tela segue 100% funcional (IA é acessório, nunca bloqueia fluxo).
- Não encostar nos envs/faixa do BOT classificador (que está LIGADO em prod) — qualquer
  mudança de env na VPS segue o padrão dump-de-envs + RECREATE conferido.
- Teste de carga mínimo: repetir o smoke de overlap (copiloto + bot simultâneos) antes de
  considerar pronto — a VPS é leve e o bot em produção tem prioridade.

## Passos
1. Conferir estado real: envs do assistente na VPS, publish `8681dbea`, contrato de
   atividades no CRM.
2. Backend: 3 endpoints/ações no módulo assistente + prompts + validação de saída.
3. Front: painel Copiloto na página do lead (depende do plano 02 estar mergeado).
4. Smoke local (npm run up) com ollama local → smoke VPS de overlap.

## Checks / DoD
- 3 ações funcionando no Chrome com lead real de teste; rascunho aparece no campo e NÃO
  envia; resumo vira anotação; sugestão cria atividade (ou anotação pinada).
- Overlap: bot classificando + copiloto rascunhando ao mesmo tempo, ambos < timeout.
- Desligar a flag → painel some, página do lead intacta (fail-closed limpo).
- Nada no diff toca conexão/reconexão/envio automático do motor.
