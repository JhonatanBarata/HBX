# PR10062026002 — Arquitetura pura do cadastro: master → contratante → vendedor

Data: 10/06/2026
Status: PLANEJADO (aguardando "go" do dono)
Antecessor: PR10062026001 (concluído — estado canônico, papéis de cobrança, master enxuto)
Princípio do dono: **sem legado** — regras desnecessárias são removidas do backend, não escondidas.

---

## Decisões tomadas na entrevista (10/06/2026)

### O estado da empresa (núcleo de tudo)
- **Um campo só no banco**: `Company.status` =
  `pending_checkout | trial | active | courtesy | overdue | suspended`
  + datas (`trialEndsAt`, `courtesyEndsAt`, `graceEndsAt`) + `courtesyReason` + auditoria.
- A migração **converte os dados atuais e REMOVE** os 4 campos sobrepostos
  (`paymentStatus`, `subscriptionStatus`, `premiumAccess`, `onboardingStatus`) e os campos
  de isenção da fase anterior (`billingExempt*` vira cortesia). Impossível dois campos
  discordarem, porque só existe um.
- **Cortesia** funde "liberar manual" + "isentar": motivo obrigatório, prazo opcional
  (com prazo = temporária e volta a cobrar ao vencer; sem prazo = permanente, caso HBX).
- **Graça não é estado**: empresa `overdue` com `graceEndsAt` futuro mantém acesso e
  mostra "Em atraso · bloqueia em X dias". Venceu a graça → `suspended`.
- 6 estados, 6 badges, 1 fonte. `resolveCompanyAccessState` deixa de inferir e passa a
  apenas LER `status` + datas (fica trivial).

### Master
- Criação de empresa: **self-service + master**. Empresa criada pelo master nasce
  `pending_checkout` + convite por e-mail para o contratante concluir (um fluxo só).
- Inspector com **5 abas**: Resumo | Plano & Cobrança | Equipe | Conexões | Auditoria & Perigo.
- **5 ações de alto nível** (e nada de campo cru editável):
  Mudar plano · Trial (conceder/estender/encerrar) · Cortesia · Lançar pagamento · Suspender/Reativar.
  Os campos técnicos viram leitura em "Detalhes técnicos". Somem: checkbox "Premium manual",
  dropdown "Status assinatura", botões "Marcar pago/pendente".
- Troca de plano **só no inspector**; "Planos & Regras" vira catálogo (referência) +
  exceções ativas — sem repetir os cards de troca.
- **Módulos travados**: List e Lead seguem o catálogo, sempre. Toggle fino de módulo por
  empresa só existe no Full (implantação assistida). Overrides fora disso são removidos.

### Contratante (comprador)
- **Trial padrão único**: todo cadastro self-service ganha X dias de Lead Plus,
  começando **após confirmar o e-mail**. List e Full não têm trial (contratação direta).
- Gerencial governa por vendedor: **módulos + limites** (cards/dia, enriquecimentos)
  dentro do teto do plano.
- Vendedor nasce por **convite por link** (fluxo hbx-vendedor); se passar dos usuários
  incluídos no plano, o gerencial mostra o custo extra **antes** de confirmar o convite.
- **Só team policy**: `userModuleAccess` (legado) morre — tabela, sync e leituras.

### Vendedor
- Default ao ser convidado: **Vendas + Radar** (contratante desliga o que quiser).
- **Mesma regra em desktop e mobile** — somem as listas separadas
  (`SELLER_MOBILE_OPERATIONAL_MODULE_KEYS` / `SELLER_DESKTOP_...`).
- Login cai **direto em Vendas**.
- Carteira: vendedor vê **só os próprios** leads/cards/retornos; contratante vê tudo.
- Empresa irregular → tela neutra (entregue no PR10062026001; manter invariante).

### Erros 403 (relatados pelo dono)
- Aparecem **logado como vendedor** e **no gerencial do contratante**.
- Princípio da caçada: navegação só mostra o que o papel pode; toda tela visível só chama
  endpoints que o papel alcança; nunca "tela quebrada por 403" — ou o item não aparece,
  ou aparece com estado neutro.

### Ordem de execução: backend primeiro
Cada fase commitada, buildada e testada antes da seguinte.

---

## Fases

### Fase A — Estado único no banco (a espinha dorsal)
- [x] A.1 Migração aditiva `20260610_company_unified_status`: `Company.status` +
      `statusChangedAt/ByUserId` + `courtesyEndsAt/courtesyReason`, backfill idempotente
      (também no ensure de runtime). **Mecanismo extra além do planejado:** dual-write
      transicional via middleware Prisma ($use) — escritor legado que toca os campos
      sobrepostos tem o estado único recalculado após a escrita, sem mudar ~20 call sites.
- [x] A.2 `resolveCompanyAccessState` lê o stored primeiro (datas decidem vencimentos:
      trial vencido→suspended, cortesia vencida→overdue "volta a cobrar", graça vencida→
      bloqueia); derivação legada exportada como fallback p/ o evaluate na transição.
      Matriz: 23 casos (8 novos stored-first), 46 testes verdes no total.
- [x] A.3 Escritores principais nativos: financeiro seta `status` explicitamente nas 4
      transições reais (ativação por charge, ativação por assinatura, início de graça =
      overdue+prazo, bloqueio pós-graça = suspended). Corrigida a 4ª ocorrência da praga
      premiumAccess (pagamento/graça não setam mais a flag de cortesia). Ações do master
      e cadastro seguem cobertos pelo dual-write até as Fases B (5 ações) e C (fluxo de
      cadastro) reescreverem esses caminhos.
- [~] A.4 EM ANDAMENTO — re-sequenciado em 10/06 após censo dos leitores:
      **Fatia 1 ✔** commercial-plans.service projeta do canônico (morreu a regra de graça
      própria divergente). **Fatia 2 ✔** operational-status (chip Acesso): PENDING ≠
      "Atraso" (vira "Checkout"), cortesia = chip verde, graça com leitura própria
      amarela mantendo acesso. **Pendência anotada p/ Fase D:** o payload do
      operational-status leva texto de cobrança e é buscado por qualquer papel
      (boasvindas/TopBar) — neutralizar para vendedor na caçada de vazamentos.
      **Fatia 3 ✔** whatsapp-modal (isTrialing/isPaidOrActive → canônico; fixture de teste
      corrigido: trial real não carrega premiumAccess). **Fatia 4 ✔** radar-presentation
      (morreu a cópia local do motor de acesso) + messaging (trial-vendas → canônico);
      fixtures do Radar ganharam isActive. **PASSADA DE LEITORES DE DECISÃO COMPLETA.**
      O que resta para o DROP (depois de B e C): serializações de exibição
      (users/profile/companies), capability-tier (`resolveCommercialPlanKeyForCapabilities`
      ganha assinatura nova), máquina de cadastro do auth (Fase C), ações do master
      (Fase B), e o gate de login do auth (Fase C).
      Falso positivo anotado: hbx-recovery `paymentStatus` é status de pagamento MP de
      cobranças do tenant, não estado da empresa.
      3 testes do Radar falham de forma PRÉ-EXISTENTE (regras de entrega de cards, sem
      relação com estado) — delegados para sessão separada. **Descoberta importante:** auth.service não é conversão
      mecânica — é a máquina de cadastro inteira (estados fora do vocabulário como
      `pending_trial_activation`, register gravando `grace`); reescrever é trabalho da
      Fase C, não do A.4. **Novo sequenciamento:** A.4 converte os leitores de decisão
      restantes (companies operational-status, whatsapp-modal, vendas/messaging/radar);
      o DROP físico (`paymentStatus`, `subscriptionStatus`, `premiumAccess`,
      `onboardingStatus`, `billingExempt*`, tabela `UserModuleAccess`) acontece DEPOIS
      das Fases B (5 ações do master) e C (cadastro) reescreverem seus caminhos —
      senão mexemos duas vezes nos mesmos arquivos.
- [x] A.5 Remoções acordadas (a tabela física cai no A.4):
      **a)** `userModuleAccess` não é mais lido nem escrito — team policy é a única fonte
      (gerencial grava direto no modulesJson); **b)** listas mobile/desktop removidas —
      vendedor tem UMA regra (Vendas+Radar default em qualquer superfície; Atendimento
      elegível via gerencial); **c)** módulos travados — override por empresa só no Full
      (leituras + endpoint master rejeita fora dele).
- [ ] A.6 (diagnóstico) `RolesGuard` e `seller-access-governance` viram projeções do
      contrato único de decisão — fim da autorização espalhada em 5 camadas.
- [ ] Checks: prisma validate, build, matriz de testes nova, smoke de login das 3 personas.

### Fase B — Master com 5 ações e 5 abas
- [ ] B.1 Inspector: reduzir para Resumo | Plano & Cobrança | Equipe | Conexões |
      Auditoria & Perigo. Resumo = badge única + 5 ações + perfil; "Detalhes técnicos"
      colapsado e só leitura.
- [ ] B.2 Implementar as 5 ações sobre o campo único (endpoints novos e enxutos;
      remover endpoints/DTOs dos controles crus).
- [ ] B.3 Cortesia única substitui Isentar + Liberar manual (UI e backend); badge
      "Cortesia · motivo" e prazo visível quando houver.
- [ ] B.4 "Planos & Regras" sem cards de troca (catálogo + exceções: cortesias com
      motivo/prazo, em atraso com prazo de graça, checkout pendente).
- [ ] B.5 Módulos travados na UI: aba Plano & Cobrança mostra módulos do catálogo;
      ajuste fino aparece apenas quando plano = Full.
- [ ] B.6 Empresa criada pelo master: modal pede nome + e-mail do contratante → nasce
      pending_checkout → dispara convite.

### Fase C — Contratante: cadastro, gerencial e convites
- [ ] C.1 Fluxo self-service: cadastro → confirmação de e-mail → trial Lead Plus inicia
      (X dias, regra única no catálogo) → fim do trial: checkout ou suspensão.
      Remover inícios de trial paralelos/duplicados.
- [ ] C.2 Gerencial por vendedor: módulos (do plano) + limites individuais dentro do
      teto; tudo via team policy (única fonte após A.5).
      **Design aprovado em 10/06 (fim da "regra dupla" na tela):** modelo único
      "Papel + árvore de permissões", inspirado em permission sets (HubSpot) e
      simplicidade role-first (Slack/Linear):
      1. O papel decide o teto — capacidade exclusiva de admin NEM APARECE na tela do
         vendedor (não existe "OFF travado", existe ausência);
      2. UMA árvore só: módulo é o nó-pai (liga/desliga), capacidades aninham embaixo;
         pai desligado → filhos somem. Acabam as seções separadas "Módulos" × "Acessos";
      3. Presets viram atalho que PREENCHE a árvore (Prospector/Closer/Completo) —
         depois de aplicado, a árvore é a única fonte; preset não compete;
      4. Limites moram no nó do módulo (cards/dia no nó Radar), dentro do teto do plano;
      5. Backend já pronto (team policy única); é a UI que para de falar duas línguas.
      Visual definitivo no PR-003 (tela Configurações > Equipe do handoff).
- [ ] C.3 Convite de vendedor: cadastro nome+contato → link de onboarding → vendedor
      define senha. Aviso de custo extra (R$ por vendedor além dos incluídos) ANTES de
      confirmar, com valor vindo do catálogo.
- [ ] C.4 Tela financeira do contratante revisada para o estado único (assinatura,
      próximo vencimento, histórico) — sem expor campos crus.

### Fase D — Vendedor + caçada aos 403
- [ ] D.1 Default Vendas + Radar no convite; regra única desktop/mobile (consequência
      de A.5, validar nas telas).
- [ ] D.2 Login do vendedor → direto em Vendas.
- [ ] D.3 Carteira própria: auditar board de Vendas/Radar/retornos para escopo por
      vendedor (contratante vê tudo no gerencial).
- [ ] D.4 Caçada 403 — vendedor: mapear todos os endpoints chamados pelas telas que o
      vendedor vê; cada um ou é permitido pela policy ou a UI não o chama. Zero 403 em
      navegação normal.
- [ ] D.5 Caçada 403 — gerencial: idem para o contratante (equipe, permissões, limites).
- [ ] D.6 Teste E2E do fluxo completo: master cria empresa → convite → contratante
      confirma e-mail → trial → convida vendedor → vendedor opera → trial vence →
      checkout → ativa. Sem 403, sem tela de cobrança para o vendedor.

### Fase E — Documentação e fechamento
- [ ] E.1 AGENTS.md e docs/ai/README.md atualizados para o estado único (vocabulário,
      campos removidos, invariantes novas).
- [ ] E.2 Este documento marcado CONCLUÍDO com desvios anotados.

### Fase F — Governança executável (ajuste do diagnóstico de 10/06)
> "Transformar convenções implícitas em contratos executáveis." A CI atual só compila;
> os githooks estão desativados. As invariantes do AGENTS.md ganham tooling que recusa PR.
- [ ] F.1 `hbx-quality.yml` vira gate de verdade: lint obrigatório (front) + testes
      focados obrigatórios (company-access-state, module-access-policy, team-policy,
      users) por PR; falhou, não entra.
- [ ] F.2 Reativar `.githooks` (pre-commit: lint rápido; pre-push: testes focados).
- [ ] F.3 Scanner de secrets (gitleaks ou equivalente) no CI.
- [ ] F.4 Checklist de endurecimento operacional: secrets fora do env plano do host
      (documentar rotação), revisar permissões do workflow noturno do Codex,
      `migrate deploy` no boot revisado.
- [ ] F.5 Regras de lint que congelam os contratos: proibido comparar role por string
      fora da camada de política; proibido preço/planKey/copy de cobrança hardcoded no
      frontend; proibido shell de página fora do kit (entra junto com o PR-003 K.6).

### Ajustes incorporados do diagnóstico (10/06)
- Fase A ganha o item A.6: `RolesGuard` e `seller-access-governance` passam a ser
  projeções do contrato único de decisão (ou documentados como tal), encerrando a
  autorização espalhada em 5 camadas.
- Manifesto de rotas canônicas + política de alias com prazo → registrado no PR-003 T.6.

---

## Salvaguardas
- A migração destrutiva (A.4) só roda DEPOIS do smoke com o campo novo (A.1–A.3
  convivem lendo o campo único com os velhos ainda presentes, por segurança de rollback).
- Paywall: nenhuma fase pode liberar feature paga sem estado válido — matriz de testes
  da Fase A cobre cada transição.
- Vendedor nunca vê cobrança (invariante do PR10062026001, vale em todas as fases).
- Backup do banco antes da Fase A em produção.
