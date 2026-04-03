# HBX Refactor Plan — Bloco 1

## Inventário completo dos docs `TODO_2026-04-04`

1. `docs/TODO_2026-04-04_AUDIT_WITH_ADMIN_EVOLUTION.md`
   - Exige auditoria junto de qualquer ampliação de poderes do MASTER.
2. `docs/TODO_2026-04-04_BRUTAL_VISUAL_PRODUCT_REVIEW.md`
   - Define a direção macro: menos texto, menos header, sem dashboard falso, separar módulo vs guia, bloquear módulo sem motor.
3. `docs/TODO_2026-04-04_EMAIL_FLOW_PRIORITY.md`
   - Marca e-mail de cadastro/confirmação/reset como bloqueador de operação.
4. `docs/TODO_2026-04-04_FRONT_TIMEOUT_RETRY.md`
   - Pede timeout/retry elegante no frontend para login, cadastro e fluxos de entrada.
5. `docs/TODO_2026-04-04_GLASS_SELECTOR_AND_DARKMODE.md`
   - Pede componente visual de seletor vivo e correção real do dark mode.
6. `docs/TODO_2026-04-04_INITIAL_ENTRY_ROUTING.md`
   - Pede remoção do dashboard inicial e abertura direta no primeiro módulo válido.
7. `docs/TODO_2026-04-04_LOGIN_CINEMATIC_MOTION_REQUEST.md`
   - Pede nova direção do login com motion premium/cinematográfico.
8. `docs/TODO_2026-04-04_MASTER_PREMIUM_WITHOUT_FINANCE.md`
   - Pede premium manual via MASTER sem gerar financeiro automático.
9. `docs/TODO_2026-04-04_MODULE_GATING_BY_ENGINE.md`
   - Pede bloquear módulo sem motor crítico operacional.
10. `docs/TODO_2026-04-04_TOP_STATUS_BAR_WHATSAPP_META.md`
    - Pede barra superior de motores com clique para diagnóstico real.
11. `docs/TODO_2026-04-04_WHATSAPP_TOPBAR_DETAIL.md`
    - Pede mover detalhe do QR/WhatsApp para topo clicável e aliviar a tela principal.

## Arquivos afetados descobertos

### Frontend

- `frontend/src/app/dashboard/page.client.tsx`
  - Tela inicial atual; hoje mistura dashboard falso, onboarding e injeção de áreas estruturais como se fossem módulos.
- `frontend/src/components/ModuleNav.tsx`
  - Menu principal atual mistura módulos comercializáveis com guias estruturais.
- `frontend/src/components/TopBar.tsx`
  - Já consulta `/modules/me`; vai precisar conversar com a nova semântica de acesso/bloqueio.
- `frontend/src/app/dashboard/whatsapp/page.client.tsx`
  - Guia estrutural relevante para resolução do motor crítico de WhatsApp.
- `frontend/src/app/dashboard/financeiro/page.client.tsx`
  - Guia estrutural relevante para estados sem acesso e regularização.
- `frontend/src/app/dashboard/gerencial/page.client.tsx`
  - Hoje ainda aparece como módulo, mas a nova leitura pede tratá-lo como guia estrutural.
- `frontend/src/app/dashboard/inbox/page.client.tsx`
  - Usa `/modules/me`; precisa continuar respeitando acessibilidade real do módulo Atendimento.

### Backend

- `backend/src/modules/modules.service.ts`
  - Fonte principal de `/modules/me` e de `canUserAccessModule`; é o ponto correto para expor categoria, elegibilidade de entrada e bloqueio por motor.
- `backend/src/modules/module-access.guard.ts`
  - Já usa `canUserAccessModule`; ao corrigir a regra no service, o bloqueio de rota acompanha.
- `backend/src/modules/webscraping-runtime.util.ts`
  - Já possui diagnóstico do runtime; pode alimentar gating do módulo Webscraping.
- `backend/src/bootstrap/structural-defaults.json`
  - Catálogo atual ainda reflete uma leitura antiga do produto e explica parte da confusão entre módulo e guia.
- `backend/src/auth/profile.controller.ts`
  - Já entrega dados de empresa e status úteis para fallback da entrada inicial.

## Ordem exata de execução proposta

1. Separar semântica de módulo comercial vs guia estrutural sem quebrar o catálogo atual.
2. Enriquecer `/modules/me` com categoria, elegibilidade de entrada e bloqueio por motor crítico.
3. Fazer `canUserAccessModule` respeitar o mesmo gating operacional.
4. Corrigir `/dashboard` para abrir automaticamente o primeiro módulo comercial realmente válido.
5. Criar fallback curto e honesto quando não houver módulo operacional disponível.
6. Reorganizar a navegação para mostrar módulos e guias em grupos distintos.
7. Ajustar topo/status para refletir a nova leitura de motores.
8. Revisar MASTER para separar melhor acesso, cobrança, módulos e exceções.
9. Entrar no bloco visual: reduzir headers, matar heroes excessivos e compactar cards.
10. Fechar bloqueadores de produto: e-mail transacional, timeout/retry de front e estados reais de trial/manual premium.

## Conflitos entre regra atual e regra desejada

1. Hoje `Cadastro` é injetado no dashboard como se fosse módulo principal.
   - Regra desejada: `Cadastro` é guia estrutural, não deve decidir a entrada inicial.
2. Hoje `Financeiro` e `Gerencial` participam do mesmo catálogo visual de módulos comercializáveis.
   - Regra desejada: ambos precisam ser tratados como guias estruturais.
3. Hoje `/dashboard` funciona como painel/menu intermediário.
   - Regra desejada: `/dashboard` deve encaminhar direto para o primeiro módulo operacional.
4. Hoje `/modules/me` considera acesso, trial e permissão, mas não fecha por motor crítico ausente.
   - Regra desejada: sem motor crítico, módulo fecha.
5. Hoje o frontend injeta `Central WhatsApp` como card de área no mesmo nível dos módulos.
   - Regra desejada: é trilho estrutural de correção/configuração, não módulo comercial.
6. Hoje o backend ordena módulos por nome.
   - Regra desejada: a entrada inicial precisa respeitar ordem de produto, não ordem alfabética.
7. Hoje o produto fala de `Recovery`, mas a base técnica antiga ainda colapsa isso em `atendimento`/`hbx_recovery`.
   - Regra desejada: o produto precisa deixar claro o papel comercial/operacional dessa frente, mesmo antes de uma separação total de chave técnica.

## Quick wins visuais identificados

1. Tirar o hero/onboarding grande da entrada e trocar por redirecionamento direto com fallback seco.
2. Separar visualmente `Módulos` de `Guias` no menu principal.
3. Mostrar módulo bloqueado com estado desabilitado e motivo curto, em vez de sumir sem contexto.
4. Reduzir o texto fixo de telas de ativação, principalmente WhatsApp e Financeiro.
5. Compactar o topo e fazer os estados operacionais aparecerem como chips curtos.

## Bloqueadores de produto identificados

1. Fluxo real de e-mail em produção para cadastro, confirmação e reset.
2. Timeout/retry do frontend para backend lento nos fluxos de entrada.
3. Definição operacional final de `premium manual` vs `pago real` vs `trial`.
4. Ambiguidade atual entre `Atendimento` e `Recovery` na modelagem do produto.
5. Ausência de auditoria forte em todas as exceções administrativas do MASTER.

## Escopo deste bloco 1

1. Separar módulo vs guia estrutural sem migrar schema agora.
2. Corrigir a entrada inicial para abrir no primeiro módulo comercial válido.
3. Bloquear módulo sem motor crítico na leitura de acesso.
4. Resumir os impactos por etapa lógica.
