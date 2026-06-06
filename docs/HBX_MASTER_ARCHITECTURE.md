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
5. Codex PR Worker ou Codex Cloud cria PRs pequenos para tickets `BUG_SAFE`.
6. Revisar e mergear manualmente os PRs do lote quando o dono decidir aplicar em paralelo.
7. Validar o checkout consolidado pelo HBX Master.
8. Subir o HBX local com `npm run up` pelo Local Agent.
9. Abrir `http://localhost:3001` e testar visualmente o ticket resolvido.
10. Rodar testes por area conforme o diff do lote.
11. Verificar producao somente quando a publicacao for uma etapa manual aprovada.
12. Responder cliente.

## Modelo PR paralelo + localhost

- PR e branch sao unidades de producao do Codex, nao o ambiente final de uso.
- O fluxo principal do dono e consolidar os PRs aprovados no checkout atual e testar esse lote integrado.
- O localhost sempre mostra o codigo da pasta atual; depois dos merges, o HBX Master deve subir e testar essa pasta.
- Baixar PR isolado fica como ferramenta opcional de diagnostico, quando o dono quiser investigar um PR antes do merge.
- O HBX Master nao faz merge automatico, nao publica automatico e nao resolve conflitos sozinho.
- Arquivos de auth, billing, planos, secrets, migrations, deploy e dados sensiveis continuam em HOLD manual.

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
