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
- [ ] A.1 Migração aditiva: criar `Company.status`, `courtesyEndsAt`, `courtesyReason`
      (+ `statusChangedAt`, `statusChangedBy` para auditoria). Backfill: converter cada
      empresa usando o resolvedor canônico atual (paying→active, manual/exempt→courtesy,
      trial→trial, pending→pending_checkout, overdue/grace→overdue, suspended→suspended).
- [ ] A.2 `resolveCompanyAccessState` passa a ler `status` + datas (deriva apenas:
      trial vencido→suspended, courtesy vencida→active ou overdue, graça vencida→suspended).
      Matriz de testes refeita para o novo contrato.
- [ ] A.3 Escritores migram para o campo único: webhooks Mercado Pago, financeiro
      (ativação por pagamento, graça, bloqueio), evaluateCompanyStatus (vira apenas o
      aplicador de vencimentos: trial/cortesia/graça), ações do master.
- [ ] A.4 Migração destrutiva (commit separado, após smoke): DROP de `paymentStatus`,
      `subscriptionStatus`, `premiumAccess`, `onboardingStatus`, `billingExempt*`.
      Remover todas as leituras restantes (grep até zerar).
- [ ] A.5 Remoções acordadas: tabela/sync `userModuleAccess`; listas mobile/desktop de
      vendedor; overrides de módulo por empresa fora do plano Full.
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

---

## Salvaguardas
- A migração destrutiva (A.4) só roda DEPOIS do smoke com o campo novo (A.1–A.3
  convivem lendo o campo único com os velhos ainda presentes, por segurança de rollback).
- Paywall: nenhuma fase pode liberar feature paga sem estado válido — matriz de testes
  da Fase A cobre cada transição.
- Vendedor nunca vê cobrança (invariante do PR10062026001, vale em todas as fases).
- Backup do banco antes da Fase A em produção.
