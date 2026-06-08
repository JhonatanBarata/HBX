# Passo 19 - Observacao desktop para List, Lead Plus e Full

## Objetivo

Criar uma tela desktop de Observacao que deixe impossivel confundir HBX List com HBX Lead Plus.

O problema atual nao e so dado. E percepcao de produto.

## Regras de produto

HBX List:

- lista limpa de contatos;
- card compacto;
- visual quase tabela;
- mostra empresa, cidade, segmento, telefone/WhatsApp quando existir, site/rede simples, origem basica e status;
- nao mostra motivo completo, dor, plano, evidencia detalhada, templates ou timeline de inteligencia.

HBX Lead Plus:

- dossier comercial;
- score grande;
- dor provavel;
- canal recomendado;
- e-mail com status/fonte/confianca;
- evidencias;
- motivo do score;
- plano de abordagem;
- primeira mensagem sugerida;
- risco;
- proxima acao.

HBX Full:

- tudo do Lead Plus;
- automacao;
- IA;
- campanhas;
- relatorios;
- acompanhamento em massa.

## Layout desktop

```text
Metricas: analisados | Lead Plus | e-mails | API paga | custo | rejeicoes

Fila de cards          Dossier do lead                 Plano de acao
List/Lead+/Full        score, evidencias, timeline     canal, script, CTA
compactos              fonte, confianca, sinais        custo, risco, proximo passo
```

## Estrutura visual HBX

Seguir padrao de UI do projeto:

- usar `DashboardScaffold` com `hideHeader` em pagina operacional desktop;
- comecar por `hbx-guide1-slot`;
- usar `HbxGuide1` quando houver guias;
- usar `hbx-content-container` ou `hbx-content-container--plain`;
- se houver rail horizontal secundario, usar `hbx-guide5`;
- nao criar hero de marketing;
- texto publico em PT-BR;
- manter light/dark legivel.

## Diferenca de dados por plano

Backend deve limitar campos sensiveis para List.

Nao basta esconder no frontend.

List pode receber:

- dados de contato basicos;
- status simples;
- score generico se existir;
- CTA para desbloquear inteligencia.

Lead Plus/Full podem receber:

- `qualityV2`;
- `opportunityReason`;
- `painPitch`;
- `actionPlan`;
- `evidenceTimeline`;
- `sourceConfidence`;
- `emailConfidence`;
- `recommendedChannel`;
- templates.

## Componentes sugeridos

Criar ou evoluir:

```text
frontend/src/app/radar-digital/page.client.tsx
frontend/src/app/radar-digital/page.module.css
frontend/src/components/HbxGuide1.tsx
```

Possiveis componentes locais:

- `RadarObservationShell`
- `RadarObservationQueue`
- `RadarObservationDossier`
- `RadarActionPlanPanel`
- `RadarEvidenceTimeline`
- `RadarPlanGate`

Se forem locais, manter pequenos. Se virarem reaproveitaveis, mover para `components`.

## Estados obrigatorios

- sem selecao;
- carregando;
- erro;
- List bloqueado com CTA;
- Lead Plus com dossier;
- Full com automacao;
- e-mail ausente;
- e-mail provavel;
- e-mail confirmado;
- importado do Local Lab;
- negativo/opt-out protegido;
- API paga bloqueada por budget.

## Criterios de aceite

- Em desktop, List parece lista operacional simples.
- Lead Plus parece dossier rico.
- Full deixa claro que tem automacao/IA alem do dossier.
- Nenhum texto estoura em mobile/desktop.
- Light e dark legiveis.
- Campos premium nao chegam completos no payload de List.
- A coroa deixa de ser o diferencial principal.

## Validacoes

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- verificar visual em desktop e mobile
- usar Browser para screenshot apos mudanca significativa de frontend

## Prompt Codex para aplicar

```text
Implemente o Passo 19 em `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING/19-observacao-desktop-list-lead-plus.md`.
Foque na tela desktop de Observacao e na separacao real List/Lead Plus/Full. Use os padroes hbx-guide1/hbx-content-container, PT-BR, light/dark e nao crie hero.
```

