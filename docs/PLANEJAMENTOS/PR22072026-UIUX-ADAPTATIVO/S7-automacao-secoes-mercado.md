# S7 — /automacao seções internas no padrão de mercado (Intercom/HubSpot/ManyChat/Blip)

> Depende da S6 (mesma tela). Referências: como essas 4 empresas apresentam builder de
> automação — navegação persistente, canvas/preview lado a lado, estados visuais por
> etapa. NÃO é copiar tela: é o NÍVEL de acabamento.

## Evidência

- Seções: `secao-atendente.tsx` (~1612 l), `secao-cobranca.tsx` (~584),
  `secao-prospeccao.tsx` (~809), `secao-regras.tsx` (~621). Hoje cada uma abre com
  `.aut-secao-head` (botão Voltar + título) e painéis empilhados — funcional, mas sem a
  cara de produto das referências.

## Tarefas

1. **Casca de seção única** (padrão Intercom): ao entrar numa seção, navegação entre os
   4 objetivos permanece visível como trilho compacto no topo (chips com Glass Pill —
   troca de seção sem voltar ao hub; "Voltar" continua existindo). Estado do chip = o
   mesmo StatusTone do card (fonte: overview já carregado no pai).
2. **Layout 2 colunas onde há preview** (padrão ManyChat/Blip): config à esquerda,
   `phone-preview` (kit já existe) fixo à direita mostrando o efeito AO VIVO — hoje o
   preview existe no Atendente; padronizar posição/moldura e levar pra Cobrança (prévia
   do lembrete). Prospecção/Regras: coluna direita vira resumo do motor (telemetria por
   executor já vem no overview).
3. **Blocos de fluxo com acabamento** (padrão HubSpot): onde a seção lista
   passos/gatilhos/rotinas, cada item vira card de fluxo com conector visual
   (MiniFluxo/linha), estado colorido por token e ação no hover — em vez de listas cruas.
4. **Consistência**: mesmo espaçamento, mesma família de painel, mesmos empty-states
   (`kit/empty-state.tsx`) nas 4 seções; nada de layout diferente por seção sem motivo.
5. Estrutura nova SÓ em `automacao.css` (+ `screens.css` se genérico); zero copy nova.

## NÃO-fazer

- NÃO mudar lógica/endpoints das seções (é pele+estrutura, não comportamento).
- NÃO criar sub-rotas Next — navegação continua `?secao=` (regra da fusão MOTOR-ÚNICO).
- NÃO esconder funcionalidade existente atrás de menu novo.

## Checks

- `npm run lint && npm run build` verdes.
- Fluxo completo em cada seção no Chrome localhost (configurar, salvar, publicar
  Atendente em modo roteiro com empresa de teste — NUNCA disparar WhatsApp real).
- Trilho de seções desliza com Glass Pill; 4 resoluções sem corte.

## Pronto-quando

As 4 seções compartilham a casca nova (trilho + 2 colunas + blocos de fluxo), com
acabamento nível referência, sem regressão funcional, lint/build verdes.
