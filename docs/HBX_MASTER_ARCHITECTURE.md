# HBX Master Architecture

## Nome final

HBX Master.

## Objetivo

Ser o centro de comando do HBX dentro deste repo, conectando Radar, Vendas, WhatsApp e Retorno com uma rotina operacional unica.

## Fontes existentes

- `/ops-control`: saude tecnica, VPS, Docker, logs e Radar Audit.
- `JhonatanBarata/HBXBOSS`: cockpit pessoal, Kanban, Git seguro, plano do dia, relatorios e Modo IA.
- `/backend`: APIs do SaaS, Night Factory, usuarios, empresas, planos e Atendimento.
- `/frontend/src/app/master`: Master Command Center atual.
- `/Webwhats`: entrada de comunicacao WhatsApp.

## Modulos finais

- Dashboard
- Automatizadores
- Git / PR
- Testes
- Ops Control
- Radar Audit
- Comunicacao
- Tickets
- Morning Desk
- Deploy Control
- Config

## Fluxo do dono

1. Abrir HBX Master.
2. Ver Morning Desk.
3. Analisar tickets e HOLDs.
4. Ativar automatizadores seguros.
5. Baixar PR.
6. Rodar testes.
7. Revisar merge manualmente.
8. Verificar producao.
9. Responder cliente.

## Regras de seguranca

- Sem shell livre.
- Sem deploy automatico.
- Sem merge automatico.
- Sem secrets.
- Sem migrations automaticas.
- Auth, billing e plans ficam em HOLD quando houver risco.
- Producao so muda com confirmacao manual e fora desta fase.

## Fases

- Fase 1: docs, fila Codex, Local Agent e UI operacional inicial.
- Fase 2: endurecer Git/PR e testes.
- Fase 3: Ops Control embutido com acoes allowlistadas.
- Fase 4: Support Ops e Codex PR Worker.
- Fase 5: Deploy Control com publish/new revisado pelo dono.
- Fase 6: app Windows final.
