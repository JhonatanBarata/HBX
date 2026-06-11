# PR10062026004 — Contrato obrigatório de frontend HBX

Data: 11/06/2026
Status: CONTRATO CONGELADO — passo 1 da contenção de entropia.
Escopo: frontend, rotas, overlays, shell de páginas, acesso/cobrança e catálogo comercial.
Não altera backend.

---

## Objetivo

Parar o crescimento da entropia antes de migrar telas.

Este arquivo define o contrato que humano e IA devem seguir em qualquer mudança nova de frontend. O alvo não é redesenhar tudo agora; é impedir que nasçam mais telas, popups, rotas e regras comerciais fora do trilho.

---

## Recorte contra o DROP paralelo

Outro agente está executando o DROP canônico de estado comercial:

- DROP 3-resto: serializações de `modules.service`;
- DROP 4: financeiro, auth, companies e master-runtime;
- DROP 5: commercial-plans, radar, commissions, whatsapp-modal, messaging e users;
- DROP 6: `UserModuleAccess` e `billingExempt*`;
- DROP 7: dual-write, derivação legada e migração destrutiva;
- DROP 8: frontend sem campos crus;
- DROP 9: checks completos, E2E e smoke das 3 personas.

Enquanto esse DROP estiver ativo, esta trilha de frontend não toca:

- `backend/**`;
- Prisma, migrations, dual-write, `UserModuleAccess` ou `billingExempt*`;
- `frontend/src/lib/billing-access.ts`;
- limpeza de `paymentStatus`, `subscriptionStatus` ou `premiumAccess`;
- telas `whatsapp`, `planos`, `vendas`, `tutorial` ou `master` quando o assunto for campos crus de acesso/cobrança;
- E2E/smoke das 3 personas;
- check obrigatório de CI que possa falhar antes do DROP 8 terminar.

A atuação permitida nesta trilha é, por enquanto, documentação, inventário e especificação de UI. Código novo de frontend só entra em parte própria e com confirmação explícita.

---

## Execução em partes

### Parte 1 — Blindagem documental da trilha

Status: CONCLUÍDA.

Entregas:

- contrato obrigatório de frontend registrado neste arquivo;
- recorte contra o DROP paralelo registrado;
- plano fatiado abaixo definido;
- zero alteração de backend.

### Parte 2 — Blueprint de tela nova

Escopo: docs apenas.
Status: CONCLUÍDA em `OK-PR10062026005-blueprint-tela-nova-frontend.md`.

Entregar um guia curto de criação de tela nova:

- quando usar shell operacional;
- quando usar `HbxPageShell`/`HbxSection`;
- onde encaixar `guia1`, `subguia`, conteúdo e `guiaesquerdovertical`;
- quais overlays são permitidos;
- como registrar exceção.

Não implementar código.

### Parte 3 — Inventário de UI legado

Escopo: relatório docs.
Status: CONCLUÍDA em `OK-PR10062026006-inventario-ui-legado.md`.

Mapear, sem alterar telas:

- páginas com `page.module.css`;
- usos de `HbxPopup*`;
- shells locais;
- rotas alias;
- arquivos de maior risco visual.

Não mexer em `vendas/page.client.tsx` além de citar no inventário.

### Parte 4 — Manifesto conceitual de rotas

Escopo: docs primeiro.
Status: CONCLUÍDA em `OK-PR10062026007-manifesto-rotas-canonicas.md`.

Definir formato do manifesto:

- rota canônica;
- aliases;
- destino;
- motivo;
- prazo de remoção;
- dono.

Não mover rota, não apagar alias e não alterar comportamento.

### Parte 5 — Especificação do kit UI

Escopo: docs.
Status: CONCLUÍDA em `OK-PR10062026008-especificacao-kit-ui.md`.

Especificar o kit alvo do PR10062026003:

- `PageShell`;
- `Section/Panel`;
- KPI;
- tabela;
- lista;
- `Modal`;
- `ConfirmDialog`;
- `PersistentNotice`;
- `Toast`;
- `Drawer`;
- rota `/dev/ui`.

Não criar componentes ainda.

### Parte 6 — Checklist de revisão frontend

Escopo: docs.
Status: CONCLUÍDA em `OK-PR10062026009-checklist-revisao-frontend.md`.

Criar checklist para revisão humana e IA:

- shell correto;
- overlay correto;
- sem CSS local novo indevido;
- sem rota duplicada;
- sem regra comercial no React;
- claro/escuro preservados;
- textos públicos em PT-BR.

### Parte 7 — Scanner dry-run opcional

Escopo: script report-only, sem CI obrigatório.
Status: CONCLUÍDA como `scripts/hbx-frontend-contract-scan.mjs`.

Só executar depois de confirmação do dono e sem tocar nos arquivos do DROP paralelo.

O scanner apenas reporta:

- imports de `HbxPopup*`;
- novos `page.module.css`;
- rotas alias;
- possíveis preços hardcoded.

Não deve falhar build, lint ou CI nesta fase.

Uso quando o dono pedir:

```powershell
node scripts/hbx-frontend-contract-scan.mjs
```

### Parte 8 — Kit UI em arquivos novos

Escopo: frontend novo, sem migrar telas existentes.
Status: CONCLUÍDA como implantação paralela do handoff `docs/TEMAS`.

Entregue:

- tokens em `frontend/src/app/hbx-theme`;
- assets em `frontend/public/hbx-theme`;
- shell corporativo em `frontend/src/components/corporate/HbxCorporateShell.tsx`;
- rota `/app2` com as 8 seções corporativas e preview de Login;
- rota `/dev/ui` apontando para o catálogo vivo;
- componentes base novos em `frontend/src/components/ui`;
- nenhuma tela real migrada;
- nenhum backend alterado.

### Parte 9 — Migração de telas

Fora do escopo enquanto o DROP paralelo não terminar.
Status: BLOQUEADA pelo DROP paralelo.

Quando liberado, migrar por PR pequeno, começando por telas de menor risco e deixando Vendas para uma extração controlada.

---

## Regra de aplicação

- Tela nova ou ajuste visual relevante deve seguir este contrato.
- Tela legada pode continuar existindo, mas quando for tocada deve se aproximar deste contrato no trecho alterado.
- Exceção precisa ser anotada no PR/plano com motivo, prazo e dono.
- Este contrato vale junto com `AGENTS.md`, `docs/ai/README.md` e `project-standards`.

---

## 1. Shell e layout

### Páginas operacionais desktop

Rotas como Vendas, Cadastros, Financeiro, Gerencial, Banco de Dados e Master não devem criar hero, header explicativo ou moldura local.

Contrato transicional até o kit do PR10062026003 ficar pronto:

- usar `DashboardScaffold` com `hideHeader` quando a página ainda estiver no shell atual;
- começar pela superfície operacional, geralmente `hbx-guide1-slot`;
- usar `HbxGuide1` para `guia1`;
- usar `HbxGuide4` para `guiaesquerdovertical`;
- usar `hbx-guide5` para subguia horizontal persistente;
- usar `hbx-desktop-container`, `hbx-content-container` e `hbx-content-container--plain` quando a página precisar de container operacional.

Contrato alvo do PR10062026003:

- o kit terá `PageShell`, `Section/Panel`, grades de KPI, tabela padrão e lista padrão;
- quando esse kit existir, ele substitui variações locais e vira o único caminho para página nova.

### Páginas admin/utilitárias durante a transição

Quando a tela não for cockpit operacional e já couber no padrão atual:

- usar `frontend/src/components/ui/HbxPageShell.tsx`;
- usar `frontend/src/components/ui/HbxSection.tsx`;
- não criar novo shell local com CSS próprio.

---

## 2. CSS e tema

- Não criar novo `page.module.css` para página operacional sem justificativa explícita.
- Preferir tokens, classes globais `hbx-*` e componentes existentes.
- Qualquer cor local nova precisa ter par claro/escuro ou derivar de token.
- Não hardcodar card branco, texto preto/azul, borda clara ou sombra clara sem equivalente dark.
- Não reinventar `guia1`, `guiaesquerdovertical` ou `subguia` com CSS local.

---

## 3. Overlays

Contrato alvo:

- decisão destrutiva ou confirmação: `ConfirmDialog`;
- aviso persistente que exige ação do usuário: `PersistentNotice`;
- janela de formulário: `Modal`;
- painel lateral: `Drawer`;
- mensagem efêmera: `Toast`.

Contrato transicional:

- usar `HbxConfirmDialog` para confirmações novas;
- não importar `HbxPopup1`, `HbxPopup2`, `HbxPopup3` ou `HbxPopup4` em código novo;
- usos existentes de `HbxPopup*` ficam como legado até a migração para o kit;
- erro crítico de ação deve aparecer no ponto de ação, não só em toast, console, topo da página ou rota de checkout.

---

## 4. Rotas

- Cada funcionalidade deve ter uma rota canônica.
- Alias serve só para compatibilidade e deve apenas redirecionar.
- Alias não pode carregar regra de negócio, consulta de API, layout ou CSS próprio.
- Novo alias precisa registrar: rota canônica, motivo, prazo de remoção e dono.
- O PR10062026003 deve entregar o manifesto de rotas canônicas e o teste que bloqueia duplicidade.

Exemplos de alias legados já conhecidos:

- `/precheckout` -> `/pre-checkout`;
- `/mobile-vendas` -> `/mobile/vendas`;
- `/dashboard/gerencial` -> `/gerencial`.

---

## 5. Acesso, cobrança e papéis

Frontend não decide regra comercial.

Obrigatório:

- consumir `accessState`, `accessStateLabel`, `accessReleased`, capabilities e mensagens seguras vindas do backend;
- manter `PreCheckoutGate` como ponto de decisão visual para checkout;
- vendedor/USER nunca vê checkout, valores, status de pagamento ou motivo financeiro;
- bloqueio de vendedor é neutro: `company_access_paused` ou `module_not_enabled`;
- erro genérico de 403 nunca vira `payment_failed` no frontend.

Proibido em código novo de frontend:

- rederivar estado por `paymentStatus`;
- rederivar estado por `subscriptionStatus`;
- liberar acesso por `premiumAccess`;
- hardcodar mensagem financeira para usuário não-admin;
- abrir `/pre-checkout` por motivo que não veio do contrato canônico.

O fallback legado de `frontend/src/lib/billing-access.ts` foi REMOVIDO no DROP 8
(11/06): `resolvePreCheckoutReason` projeta só de `accessReleased`/`accessState`.
Nenhum cálculo paralelo de cobrança pode voltar a nascer no frontend.

---

## 6. Planos e módulos

- Catálogo comercial vem do backend, via `workspace.plansCatalog` ou API equivalente.
- Não copiar preço, plano, entitlement ou módulo comercial para constante local de frontend.
- `backend/src/commercial-plans/commercial-plan-catalog.ts` é a fonte do catálogo.
- Frontend pode ter tipo, formatação e fallback defensivo, mas não pode ter tabela comercial paralela.
- Nomes legados como `cadastro`/`cadastros` precisam de mapa de compatibilidade até o drop, não de novas variações.

---

## 7. Vendas como zona de contenção

`frontend/src/app/vendas/page.client.tsx` é o maior arquivo de risco do frontend.

Até a extração planejada:

- não adicionar nova responsabilidade ampla nesse arquivo;
- ao tocar em área isolável, preferir extrair componente, hook, helper ou tipo local;
- não misturar alteração visual com regra comercial;
- não introduzir novo overlay ou CSS local dentro de Vendas;
- qualquer extração deve preservar comportamento e rodar check relevante.

---

## 8. Gates executáveis planejados

Este contrato deve virar verificação na Fase F / PR10062026003:

- scanner proibindo novo import de `HbxPopup1/2/3/4`;
- scanner de campos crus de cobrança no frontend (`paymentStatus`, `subscriptionStatus`, `premiumAccess`) fora de allowlist transitória;
- scanner para novos `page.module.css` em páginas operacionais;
- teste de manifesto de rotas canônicas;
- scanner para preço/plano comercial hardcoded no frontend;
- lint/check obrigatório no CI.

Enquanto esses gates não existem, revisão humana e Codex devem aplicar este arquivo como checklist.

---

## Definição de pronto da Parte 1

- [x] Contrato obrigatório registrado no plano ativo.
- [x] Recorte contra o DROP paralelo registrado.
- [x] Plano fatiado em partes.
- [x] Sem alteração de backend.
- [x] `docs/ai/README.md` aponta para este contrato.
- [x] PR10062026003 referencia este contrato como checkpoint de K.1/K.2/K.6.

## Diagnóstico 11/06 — entropia restante registrada (itens sem cobertura prévia)

Pontos do diagnóstico do dono que NÃO estavam registrados nas partes acima e
entram como alvos da Parte 9 / Fase F:

1. **`DashboardScaffold` é componente-deus**, não só shell: mantém estado de
   apresentação, perfil, navegação peek, storage sync, prefetch de módulos e
   profile, eventos de contexto master e layout responsivo. Na migração de
   telas (Parte 9), ele é alvo de EXTRAÇÃO (shell burro + hooks/orquestradores
   separados) e depois remoção junto com o TopBar atual — nenhuma correção
   cosmética antes disso.
2. **`pre-checkout/page.client.tsx` tem inteligência própria de audiência**:
   consulta `/profile/current-user`, resolve billing/paused localmente (guarda
   defensiva nascida no D.4). Quando a tela migrar para o kit, a decisão deve
   se centralizar num ÚNICO ponto (PreCheckoutGate/contrato canônico) — a
   página vira apresentação pura.
3. **Taxonomia comercial dupla**: `backend/src/bootstrap/structural-defaults.json`
   ainda semeia a tabela `Plan` legada (`prata`, `ouro`, `diamante`,
   `diamante_plus`, `admin`, `monthlyPrice: 0`) enquanto o catálogo real é
   `COMMERCIAL_PLAN_KEYS` (List/Lead Plus/Full) em
   `commercial-plan-catalog.ts`. Unificar o vocabulário: o seed estrutural
   para de semear planos legados, censo/aposentadoria da tabela `Plan` (e da
   relação `company.plan` exposta em payloads), e um único nome comercial do
   seed ao checkout. Sem isso, oferta pública fica instável (seed diz uma
   coisa, master outra, checkout outra). Candidato a DROP próprio pós-PR-002.

## Checkpoint das Partes 2 a 7

- [x] Parte 2: blueprint de tela nova documentado.
- [x] Parte 3: inventário de UI legado documentado.
- [x] Parte 4: manifesto conceitual de rotas documentado.
- [x] Parte 5: especificação do kit UI documentada.
- [x] Parte 6: checklist de revisão frontend documentado.
- [x] Parte 7: scanner report-only criado, sem CI obrigatório.
- [x] Parte 8: implantação paralela do front em `/app2` e `/dev/ui`.
- [x] Nenhum teste/build/lint foi rodado, a pedido do dono.
- [x] Nenhum arquivo de backend foi alterado por esta trilha.
