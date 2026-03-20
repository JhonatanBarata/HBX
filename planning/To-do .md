Você está no projeto HBX.

Quero implementar um painel administrativo para configurar jornadas de agendamento via WhatsApp dentro do sistema.

Importante:
- Não quero hardcode do fluxo final.
- Não quero só um “editor de bot” genérico.
- Quero um painel utilizável onde eu consiga criar e editar esse fluxo sozinho.

Objetivo:

# TO-DO: Jornada de Agendamento WhatsApp — Painel Administrativo (HBX)

## Resumo
Painel administrativo para configurar jornadas de agendamento via WhatsApp. Cada "Guia" é uma opção clicável que aponta para uma agenda específica. O objetivo é permitir criação/edição das guias, regras de disponibilidade, mensagens automáticas, simulação e cancelamento, mantendo PT-BR e patch mínimo.

---

## Objetivo
Criar um painel no HBX que permita montar a jornada completa:

- Mensagem inicial editável
- Botões / Guias clicáveis
- Agenda vinculada por guia
- Exibição de disponibilidade e fallback
- Confirmação de agendamento
- Cancelamento de agendamento

O painel deve ser administrável, reutilizável e não depender de hardcode do fluxo.

---

## Principais requisitos (resumido)

- Não hardcodear o fluxo final
- Não ser apenas um editor de bot genérico
- PT-BR em toda a interface
- Patch mínimo e preservação do padrão visual do projeto
- Frontend/Backend bem separados
- Não expor credenciais nem executar automações perigosas

---

## Funcionalidades necessárias

1) Guias (services)
- Criar / editar / remover / ordenar
- Nome exibido editável (inline)
- Slug / id interno
- Tipo de ação: `abrir_agenda`, `cancelar_agendamento`, `acao_customizada` (futura)
- Agenda vinculada
- Ordem de exibição
- Ativo / Inativo

2) Mensagem inicial
- Texto editável com variáveis (empresa, atendente, contexto)
- Campos: saudação, nome da empresa, nome da atendente, texto introdutório, tipo de envio, fallback

3) Regras por guia
- Agenda vinculada
- Dias úteis (configuráveis)
- Horários válidos e faixa de funcionamento
- Janela de busca (quantos dias priorizar)
- Quantidade de horários sugeridos
- Mensagem quando não houver disponibilidade imediata
- Fallback com N (ex.: 3) horários futuros

4) Cancelamento
- Guia especial para cancelar agenda
- Localizar agendamento do cliente
- Mostrar compromisso atual e solicitar confirmação
- Cancelar mediante confirmação
- Tratar caso sem agendamento encontrado

5) Simulação
- Simular clique na guia
- Simular retorno de horários
- Simular confirmação de agendamento
- Simular cancelamento

6) UX e aparência
- Visual profissional, mantendo cores e identidade HBX
- Foco em produtividade e simplicidade
- Interface em PT-BR

7) Arquitetura
- Patch mínimo
- Reaproveitar componentes existentes quando possível
- Separar responsabilidades frontend/backend
- Evitar mudanças de alto impacto fora do escopo

---

## Fluxo do cliente (exemplo)

1. Bot envia mensagem inicial com botões (guias).
2. Cliente clica em uma guia (ex.: Manutenção).
3. Sistema busca disponibilidade na agenda vinculada.
4A. Se tiver horários nas regras prioritárias: mostrar opções.
4B. Se não tiver: mostrar mensagem de indisponibilidade + fallback com 3 horários futuros.
5. Cliente escolhe horário.
6. Sistema cria o agendamento e confirma.
7. Cliente pode escolher a guia "Cancelar agenda" para localizar e cancelar seu agendamento.

---

## O que precisa existir no sistema (modelos lógicos)

- Guias do WhatsApp (id, nome, slug, tipo, agenda_id, ordem, ativo, regras)
- Agendas/Calendários (referência existente no sistema)
- Regras de disponibilidade por guia (dias úteis, janela, limites)
- Mensagens automáticas e variáveis
- Endpoint de simulação (sandbox) para testar fluxo sem cliente real

---

## Nome da feature (sugestões)

- Construtor de Fluxo de Agendamento WhatsApp
- Painel de Botões de Agendamento
- Jornada de Agendamento no WhatsApp

---

## Como o painel deve ser organizado (telas)

- Tela 1 — Fluxo principal: mensagem inicial + visual dos botões/guias
- Tela 2 — Guias / Serviços: lista, editar nome/ação/agenda/ordem/ativo
- Tela 3 — Regras da agenda (por guia): dias úteis, horário, antecedência, limite, janela
- Tela 4 — Mensagens automáticas: textos editáveis (confirmação, cancelamento, fallback)
- Tela 5 — Simulação: sandbox para reproduzir fluxo e validar respostas

---

## Entregáveis esperados

- Implementação incremental por fases (ver abaixo)
- Arquivos alterados listados ao final de cada fase
- Instruções para configurar nova guia e vincular agenda
- Testes de simulação e validação
- Garantia mínima de que não quebra build/publish

---

## Fases (plano de execução — objetivo: patch mínimo e incremental)

### Fase 1 — Mapear e preparar (entregável: relatório de análise)
- Analisar estrutura atual em `/dashboard/inbox` e componentes relacionados
- Identificar estados, props e endpoints já existentes
- Encontrar menor ponto de integração para: calendário melhorado, guias, edição inline, painel dias úteis
- Listar o que pode ser reaproveitado (componentes, hooks, styles)
- Propor implementação com patch mínimo e definir API necessária (endpoints/read-only ou persistência)

Saída: arquivo com lista de arquivos analisados, arquitetura encontrada, proposta de implementação e ordem das próximas fases.

### Fase 2 — Estrutura de guias/abas
- Implementar frontend básico de guias (UI e estado local/global)
- Permitir selecionar guia ativa e preparar estrutura para nomes editáveis
- Não persistir ainda (ou usar persistência temporária/localStorage se necessário)

Saída: guias funcionando localmente; lista de arquivos alterados; instruções de teste.

### Fase 3 — Edição inline do nome da guia
- Implementar edição inline (click → input → salvar/cancel)
- Tratar comportamentos: Enter = salvar, Esc/blur = cancelar
- Preparar hooks para futura persistência

Saída: comportamento de edição testado e documentado; arquivos alterados listados.

### Fase 4 — Card lateral de dias úteis
- UI à direita para definir dias úteis por guia (visual de cartões)
- Vincular seleção ao guia ativo (estado temporário ou persistido se já existir API)
- Garantir usabilidade e coerência visual com HBX

Saída: painel de dias úteis operacional; instruções de uso; arquivos alterados.

### Fase 5 — Aperfeiçoamento visual do calendário
- Polimento visual do calendário (hierarquia, cards, estados ativos, tipografia)
- Manter cores padrão do sistema; evitar dependências novas sem necessidade
- Testes de responsividade (desktop/mobile)

Saída: melhoria visual implementada e validada; arquivos alterados listados.

### Fase 6 — Persistência (apenas se necessário)
- Persistir nomes das guias e configuração de dias úteis por agenda (API/backend)
- Reaproveitar endpoints existentes quando possível; criar endpoint mínimo se necessário
- Validar segurança (não expor credenciais) e validação de dados

Saída: backend (se necessário) + migrations/updates; instruções de deploy/teste.

---

## Checklist pré-implementação

- [ ] Executar Fase 1 (análise) — PRIORIDADE IMEDIATA
- [ ] Revisar componentes e padrões de estilo existentes
- [ ] Confirmar se existe endpoint para agendas; mapear modelo de dados
- [ ] Escolher estratégia de persistência (reaproveitar ou criar novo endpoint)

---

## Arquivos prováveis a serem tocados

- frontend/src/app/dashboard/inbox/page.client.tsx
- frontend/src/app/dashboard/inbox/components/* (novo: Guias, DaysPanel, CalendarWrapper)
- frontend/src/styles/* (preservar tema)
- backend/src/inbox/inbox.controller.ts (se persistir)
- backend/src/inbox/inbox.service.ts (se persistir)

---

## Como configurar uma nova guia (resumo de uso administrativo)

1. Acesse o painel "Guias / Serviços" (Tela 2).
2. Clique em "Nova Guia" e preencha: nome, tipo de ação, agenda vinculada, ordem e status.
3. Ajuste regras (Tela 3) e mensagens (Tela 4) conforme necessário.
4. Use a Tela 5 (Simulação) para testar o fluxo antes de publicar.

---

## Como testar (manual rápido)

1. Fase 1: revisar relatório de análise.
2. Após Fase 2: verificar seleção de guias e mudança de guia ativa.
3. Após Fase 3: testar edição inline (Enter/blur/Esc).
4. Após Fase 4: configurar dias úteis e validar que o painel reflete a guia ativa.
5. Após Fase 5: testar visual em desktop e mobile.
6. Após Fase 6: criar/editar guia e validar persistência entre reloads.

---

## Ao final de cada fase — entregue pelo desenvolvedor

- Lista de arquivos criados/alterados
- Breve explicação do fluxo implementado naquela fase
- Como configurar e criar uma nova guia (passo a passo)
- Como testar (passos rápidos)
- Validação mínima que foi executada (build/testes manuais)

---

## Observações finais

- Vou seguir o plano fase a fase (começando pela Fase 1). Se quiser que eu avance imediatamente para a Fase 2 após a análise, confirme.
- Mantive todo o conteúdo original organizado por tópicos e fases; não removi nenhuma solicitação funcional — apenas reestruturei e sintetizei para execução incremental.
