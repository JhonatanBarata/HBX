# Simplificacao de Regras - Admin, Master e Vendedores HBX

## Resposta curta

Eu aplicaria em **8 passos**.

Nao recomendo criar uma company comum nova para mascarar o problema. O caminho correto e estabilizar o contrato oficial:

- MASTER puro nao depende de company de cliente.
- MASTER operacional usa a company interna HBX.
- Vendedor HBX pertence a company operacional HBX.
- Admin comum pertence a uma company cliente.
- Cada tela deve saber o tipo de usuario antes de chamar endpoint.
- O backend continua sendo a fonte real de permissao, limite e quota.

## Problema real

Hoje o sistema tem partes certas, mas aplicadas de forma desigual.

Existe a company operacional HBX:

`hbx-master-whatsapp-engine`

Ela ja aparece em regras de modulo, cobranca, perfil, Vendas, Radar e contexto master. O problema e que algumas telas e endpoints ainda usam atalhos antigos:

- "tem company?" como se todo usuario operacional fosse cliente comum.
- "role USER" como se todo USER fosse vendedor comum.
- "ADMIN" como permissao generica para endpoints que a tela chama sem conferir perfil.
- `sellerDistributionDailyLimitOverride` misturado como limite de enriquecimento e entrega.
- UI escondendo ou mostrando coisa sem um contrato unico de politica.

Isso gera 403 em tela normal, principalmente para vendedor HBX novo, mesmo quando o fluxo principal esta funcionando.

## Objetivo

Criar um contrato unico para:

- MASTER.
- ADMIN comum.
- vendedor comum.
- vendedor/parceiro HBX.
- contexto operacional HBX.
- suporte MASTER sobre vendedor/empresa.

O resultado esperado e: se um vendedor pedir suporte, o MASTER consegue entrar, ver o contexto, entender limites e agir sem ficar tropeçando em tela que chama endpoint errado.

## Passo 1 - Correcoes imediatas de ruido e bloqueio

Objetivo: parar erros obvios antes da reorganizacao maior.

Escopo:

- Corrigir `radiusKm` para 250 em todos os DTOs HTTP do backend ligados a Radar e auto-distribuicao.
- Bloquear no frontend chamadas administrativas quando o usuario for vendedor HBX ou vendedor comum.
- No Radar, nao chamar `/users/company` para vendedor.
- Na TopBar, nao chamar `/companies/me/whatsapp-modal/status` para vendedor.
- Garantir que `profile/current-user` carregue `userKind`, `sellerProfile` e `company.isHbxSellerNetwork` de forma confiavel.

Arquivos provaveis:

- `backend/src/webscraping/webscraping.controller.ts`
- `frontend/src/app/radar-digital/page.client.tsx`
- `frontend/src/components/TopBar.tsx`
- `backend/src/auth/profile.controller.ts`

Validacao:

- Login MASTER.
- Login admin comum.
- Login vendedor HBX novo.
- Abrir Radar e Vendas sem 403 lateral.
- Testar busca com 250 km.

## Passo 2 - Contrato unico de contexto operacional

Objetivo: parar de cada modulo resolver company de um jeito.

Criar helper backend:

`backend/src/common/effective-company.ts`

Contrato:

- Usuario comum: usa `req.user.companyId`.
- Admin comum: usa `req.user.companyId`.
- Vendedor HBX: usa a company operacional HBX.
- MASTER com empresa assumida: usa a empresa assumida.
- MASTER operacional sem empresa assumida: usa a company operacional HBX.
- MASTER em rota explicita com `companyId`: usa o parametro validado.
- Se nada resolver: erro claro, nao fallback silencioso.

Tambem criar helper frontend:

`frontend/src/lib/currentUserAccess.ts`

Contrato:

- `isSystemMaster`
- `isOperationalMaster`
- `isAssumedCompanyMaster`
- `isCompanyAdmin`
- `isCommonSeller`
- `isHbxPartnerSeller`
- `canCallAdminCompanyEndpoints`
- `canCallWhatsAppAdminEndpoints`
- `canManageTeam`

Validacao:

- Todas as telas deixam de inferir permissao manualmente.
- Nenhuma tela chama endpoint admin se `canCallAdminCompanyEndpoints=false`.

## Passo 3 - Politica central de Equipe

Objetivo: substituir regras espalhadas por uma politica unica por usuario.

Criar:

- `backend/src/team/team-policy.types.ts`
- `backend/src/team/team-policy.service.ts`
- `backend/src/team/team.module.ts`
- `backend/src/team/team.controller.ts`

Contrato minimo:

- Modulos permitidos.
- Comissao.
- D+.
- Heranca/rede HBX.
- Limite de enriquecimento por dia.
- Limite de entrega de cards por dia.
- Limite de cards ativos.
- Limite mensal.
- Quantidade de puxada/importacao para Vendas.
- Segmentos permitidos/bloqueados.
- Cidades/estados permitidos.
- Uso de localizacao.
- Filtros obrigatorios de Radar.
- Visibilidade para vendedor.

Regra sobre infinito:

- Nunca persistir `∞` como string.
- MASTER pode ter `unlimited` real.
- ADMIN comum transforma infinito em `inherit`.
- Vendedor herda politica ou empresa, nunca acima do plano.

Validacao:

- MASTER consegue salvar `unlimited`.
- ADMIN comum nao consegue salvar acima do plano.
- Vendedor recebe payload sem campos sensiveis ocultos.

## Passo 4 - Persistencia e compatibilidade com legado

Objetivo: adicionar a nova politica sem quebrar usuarios atuais.

Adicionar no Prisma:

- `TeamPolicyPreset`
- `UserTeamPolicy`
- relacoes com `Company` e `User`

Criar backfill:

- Para cada usuario ativo, criar politica inicial com base no estado atual.
- Ler `UserModuleAccess` como fallback.
- Ler `commissionPercent`, `canRegisterHbxSellers`, `sellerReferralCommissionPercent`, `referredByUserId`.
- Separar o uso legado de `sellerDistributionDailyLimitOverride`.

Regra importante:

`sellerDistributionDailyLimitOverride` nao pode continuar sendo fonte unica para enriquecimento e distribuicao.

Novos campos logicos:

- `enrichmentDaily`
- `cardDeliveryDaily`
- `activeCards`
- `monthlyCards`
- `vendasPullQuantity`

Validacao:

- Usuario antigo continua com mesmo acesso apos migration.
- Usuario novo ja nasce com `UserTeamPolicy`.

## Passo 5 - Integrar politica em modulos, Radar e Vendas

Objetivo: fazer a politica valer no backend, nao so na tela.

Integrar em:

- `ModulesService.canUserAccessModule`
- `ModulesService.listMyModules`
- servicos de Radar
- servicos de Vendas
- auto-distribuicao
- enriquecimento
- entrega/importacao de cards

Regras:

- Se politica bloqueia Radar, bloquear rota e UI.
- Se politica bloqueia Vendas, bloquear rota e UI.
- Se politica limita enriquecimento, `getUsageSnapshot` e `recordLeadEnrichmentUseOnce` precisam respeitar.
- Se politica limita cards ativos, `assertSellerActiveCardSlots` precisa respeitar.
- Se politica exige Instagram, Facebook, Email, Website ou WhatsApp, a entrega de cards deve filtrar antes de mandar para Vendas.

Validacao:

- Nao depender de botao escondido.
- Backend bloqueia direto.
- Desktop e mobile recebem a mesma politica.

## Passo 6 - Transformar Gerencial em Equipe

Objetivo: simplificar a tela e parar de misturar cadastro, contrato, permissao e suporte numa tela pesada.

Manter rota por compatibilidade:

`/gerencial`

Mas a tela passa a se chamar:

`Equipe`

Primeira visao:

- tabela simples estilo Excel.
- uma linha por pessoa.
- colunas: nome, login/email, papel, status, ferramentas, acoes.
- ferramentas em chips pequenos.
- nao mostrar comissao, heranca, D+ e detalhes sensiveis na primeira visao.

Criar dois fluxos:

- Cadastro simples.
- Cadastro avancado.

Cadastro simples:

- nome
- email/login opcional conforme regra atual
- WhatsApp
- senha opcional
- politica

Cadastro avancado:

- preserva onboarding, contrato, documentos, anexos e ativacao.
- tambem cria `UserTeamPolicy`.

Validacao:

- Criar vendedor HBX rapido sem abrir fluxo pesado.
- Criar parceiro com fluxo avancado quando precisar contrato/documento.

## Passo 7 - Modal de politica e aplicacao em lote

Objetivo: permitir configurar vendedor sem espalhar regra em varias telas.

Criar:

- `frontend/src/app/gerencial/_components/TeamPolicyModal.tsx`
- `frontend/src/app/gerencial/_components/ApplyPolicyToUsersModal.tsx`

Blocos do modal:

- Modulos.
- Comissao.
- D+.
- Heranca/rede HBX.
- Enriquecimentos por dia.
- Cards/Vendas.
- Segmentos.
- Cidades/localizacao.
- Filtros forcados de Radar.
- Visibilidade.

Aplicacao em lote:

- lista estilo Excel.
- checkbox por vendedor.
- buscar por nome/email/login.
- filtros por status e papel.
- selecionar todos visiveis.
- limpar selecao.
- aplicar politica.

Regras:

- Nao aplicar em USERMASTER.
- ADMIN comum nao aplica em usuario fora da empresa.
- ADMIN comum nao aplica politica acima do plano.

Validacao:

- Remover modulo Atendimento de um vendedor remove do menu e bloqueia endpoint.
- Aplicar politica em lote nao altera master.

## Passo 8 - Auditoria, testes e rollout seguro

Objetivo: garantir que isso nao vire outra fonte de dor.

Auditoria:

- quem alterou
- empresa
- vendedor afetado
- antes/depois
- se foi batch
- modulos alterados
- limites alterados

Usar:

- `MasterSupportAuditLog` para acao de MASTER.
- `TeamPolicyAuditLog` se precisar log proprio.

Testes backend obrigatorios:

- MASTER resolve politica unlimited.
- ADMIN nao libera modulo fora do plano.
- Vendedor sem Atendimento nao acessa Atendimento desktop/mobile.
- Vendedor sem Radar nao acessa Radar.
- Vendedor com `inherit` recebe so o que empresa/plano permite.
- Comissao hidden nao aparece para vendedor.
- D+ hidden nao aparece para vendedor.
- Enriquecimento diario finite bloqueia no limite.
- Entrega diaria finite bloqueia no limite.
- Cards ativos finite bloqueia no limite.
- Filtro `requireInstagram` entrega so lead com Instagram.
- Filtro `requireEmail` entrega so lead com email valido/provavel.
- Batch nao aplica em USERMASTER.
- Admin comum nao aplica em usuario de outra empresa.

Testes frontend minimos:

- abre Equipe.
- lista usuarios em linha simples.
- abre Cadastro simples.
- abre modal de politica.
- remove modulo.
- salva.
- usuario nao ve modulo removido.

Rollout:

- primeiro deploy com fallback legado ativo.
- feature flag para limite por assento.
- logs acompanhados em VPS.
- depois remover dependencias antigas gradualmente.

## Ordem pratica de execucao

1. Passo 1 corrige a dor imediata.
2. Passo 2 fecha o contrato de contexto.
3. Passos 3 e 4 criam a politica central e persistencia.
4. Passo 5 faz a politica valer no backend.
5. Passos 6 e 7 simplificam a UI.
6. Passo 8 garante auditoria, testes e rollout.

## Criterio de pronto

- Vendedor HBX novo abre Radar sem 403 lateral.
- MASTER abre telas operacionais sem erro de company ausente.
- MASTER consegue dar suporte a vendedor HBX sem assumir company errada.
- Admin comum nao concede nada acima do plano.
- Vendedor nao ve o que nao pode usar.
- Backend bloqueia o que a UI esconde.
- Radar -> Vendas -> WhatsApp -> Retorno continua preservado.
- Negativos e historico de Radar nao sao apagados.
- `npm run lint` no frontend passa.
- `npm run build` no frontend passa.
- `npm run build` no backend passa.
- `prisma generate` passa.
- migrations aplicam em banco limpo.
