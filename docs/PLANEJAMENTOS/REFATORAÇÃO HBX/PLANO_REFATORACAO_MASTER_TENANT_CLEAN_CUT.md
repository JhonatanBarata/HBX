# Plano de refatoracao HBX - Master, Tenant e Infra

Origem: diretriz `refactor/master-tenant-clean-cut`.

Objetivo: aplicar a separacao entre System Master, empresas tenant e infraestrutura de plataforma sem tentar resolver tudo em uma unica passada. Cada fase deve terminar com validacao pequena, busca de vestigios e decisao clara de continuar ou corrigir.

## Regra central

System Master nao e empresa. HBX nao e categoria especial. HBX deve ser uma empresa tenant normal com acesso manual/full concedido por dados, nao por `slug`.

Modelo alvo:

- `companyKind="tenant"`: empresa operacional normal do produto, incluindo a propria HBX.
- `companyKind="platform_infra"`: infraestrutura interna da plataforma, como `hbx-master-whatsapp-engine`.

Nao criar fallback silencioso para regras antigas. Nao liberar privilegio por `slug === "hbx"`. Nao usar `hbx-master-whatsapp-engine` como empresa comercial.

## Preparacao obrigatoria

Antes de alterar codigo:

1. Confirmar branch atual:

```powershell
git branch --show-current
```

2. Criar e trocar para a branch obrigatoria:

```powershell
git checkout -b refactor/master-tenant-clean-cut
```

3. Se a branch nao puder ser criada ou trocada, abortar a refatoracao.

4. Confirmar worktree e registrar alteracoes existentes:

```powershell
git status --short
```

5. Localizar contexto do repo. O `AGENTS.md` pede `docs/ai/README.md`; se o arquivo continuar ausente, registrar isso no resumo e seguir usando os padroes de `AGENTS.md` e `project-standards`.

## Estrategia de aplicacao

Nao aplicar em lote. Executar em fases pequenas e so avancar quando a fase atual estiver compilando ou com falha compreendida.

Ordem recomendada:

1. Inventario e mapa de impacto.
2. Schema e backfill.
3. Helper central de `companyKind`.
4. Access/modules.
5. Profile/current-user e login/redirect.
6. Isolamento de infraestrutura WhatsApp.
7. MasterProvisioningService.
8. Testes.
9. Grep final e limpeza de vestigios.
10. Commit.

## Fase 1 - Inventario e mapa de impacto

Objetivo: saber onde a regra antiga vive antes de editar.

Buscar:

```powershell
rg -n "HBX_MASTER|COMPANY_ADMIN|isHbxOperationCompany|isMasterOperationalCompany|master_operacional|master_operational_company|hbx_seller_operational_company|slug === 'hbx'|slug === \"hbx\"|MASTER_WHATSAPP_ENGINE_COMPANY_SLUG|hbx-master-whatsapp-engine" .
```

Classificar cada resultado em:

- runtime comercial;
- infraestrutura WhatsApp/engine;
- migration/backfill;
- teste;
- comentario/documentacao.

Saida esperada:

- lista curta de arquivos a tocar primeiro;
- lista de arquivos que devem permanecer apenas como `MIGRATION_ONLY`;
- nenhuma alteracao de codigo ainda.

Criterio de parada: se a busca mostrar que a regra antiga esta espalhada em muitas areas, dividir a proxima fase por backend/frontend. Nao editar tudo de uma vez.

## Fase 2 - Schema e backfill

Objetivo: adicionar a base de dados para diferenciar tenant de infra.

Passos:

1. Verificar se `Company.companyKind` ja existe no Prisma/schema.
2. Se nao existir, adicionar campo com default seguro para empresas existentes.
3. Criar migration/backfill idempotente:
   - `hbx-master-whatsapp-engine` => `platform_infra`;
   - demais empresas => `tenant`;
   - `HBX`/`HBX2` => `tenant`;
   - se houver promocao de `HBX2` para `HBX`, fazer apenas como rotina idempotente e explicita.
4. Comentarios com nomes antigos so podem aparecer como `MIGRATION_ONLY`.

Validar:

```powershell
cd backend
npm run prisma:validate
```

Saida esperada:

- schema/migration consistente;
- nenhuma regra runtime alterada ainda, exceto tipos gerados se necessario.

Criterio de parada: se Prisma falhar, corrigir antes de mexer em guards, services ou frontend.

## Fase 3 - Helper central de companyKind

Objetivo: evitar que cada modulo recrie a regra.

Criar helper central com:

```ts
resolveCompanyKind(company)
isTenantCompany(company)
isPlatformInfraCompany(company)
```

Regra:

- regra comercial usa `companyKind === "tenant"`;
- regra de infra usa `companyKind === "platform_infra"`;
- helper nao pode ler `slug` para conceder privilegio comercial.

Validar:

- teste unitario pequeno do helper;
- build backend se os tipos forem compartilhados.

Criterio de parada: se o helper precisar de fallback por slug para runtime, parar e revisar. Slug antigo so pode existir em migration/backfill.

## Fase 4 - Modules/access

Objetivo: remover o governador antigo sem misturar com login ou profile.

Alterar apenas access/modules nesta fase:

- remover `HBX_MASTER` como governador runtime;
- remover par artificial `COMPANY_ADMIN` vs `HBX_MASTER`;
- `platform_infra` nao recebe modulo comercial;
- `tenant` recebe modulos conforme plano/manual grant;
- HBX tenant segue a mesma regra de qualquer tenant.

Testes minimos:

- empresa `slug="hbx"` e `companyKind="tenant"` nao ganha privilegio especial por slug;
- `platform_infra` nao recebe Vendas/Radar/Gerencial/Financeiro;
- access governor antigo nao aparece mais em runtime.

Validar:

```powershell
cd backend
npm run build
```

Criterio de parada: se access quebrar muitos consumidores, corrigir consumers de access antes de entrar em profile/login.

## Fase 5 - Profile/current-user e login/redirect

Objetivo: fazer a identidade refletir o modelo novo.

Profile/current-user:

- nao declarar HBX como tipo especial por slug;
- empresa HBX retorna como tenant normal;
- System Master retorna contexto tecnico de master, nao empresa operacional comercial.

Login/redirect:

- remover tratamento especial por `slug hbx`;
- remover `hbx-master-whatsapp-engine` como destino operacional comercial;
- tenant manual/premium segue o fluxo normal por plano/grant/status comercial.

Testes minimos:

- System Master sem contexto assumido nao vira empresa operacional comercial;
- tenant manual/premium entra pelo fluxo normal;
- `slug="hbx"` nao muda redirect por privilegio especial.

Criterio de parada: se o frontend depender de campos antigos, corrigir o contrato em uma alteracao pequena antes de continuar.

## Fase 6 - Infraestrutura WhatsApp

Objetivo: manter `hbx-master-whatsapp-engine` apenas como infraestrutura tecnica.

Alterar apenas fluxos de infra:

- permitir `hbx-master-whatsapp-engine` somente onde for engine/status tecnico/WhatsApp base;
- impedir aparicao como cliente comercial;
- impedir vendedores comerciais, billing comercial e modulos tenant;
- manter constantes tecnicas apenas se indispensaveis.

Testes minimos:

- `hbx-master-whatsapp-engine` aceito em fluxo tecnico de infra;
- rejeitado em fluxo comercial tenant;
- nenhuma liberacao de Vendas/Radar/Gerencial/Financeiro por esse slug.

Criterio de parada: se uma regra comercial ainda precisar do slug da engine, remover essa dependencia antes de seguir.

## Fase 7 - MasterProvisioningService

Objetivo: preparar o Master como painel tecnico/provisionamento, sem virar workspace comercial.

Criar ou ajustar servico inicial com responsabilidades:

- criar tenant;
- configurar plano/manual;
- liberar modulos;
- configurar limites;
- criar admin inicial;
- configurar `supportEmail`, `replyToEmail`, `supportWhatsapp`;
- preparar produtos iniciais;
- marcar implantacao assistida.

Escopo desta fase:

- servico funcional ou esqueleto com contrato claro;
- sem produto completo;
- sem SMTP completo por empresa;
- sem migrar Radar/Vendas profundamente.

Criterio de parada: se o servico exigir mudanca ampla de produto, manter apenas contrato minimo e registrar pendencia.

## Fase 8 - Testes obrigatorios

Criar ou ajustar testes que provem:

1. Empresa `slug="hbx"` com `companyKind="tenant"` nao ganha privilegio especial.
2. Empresa HBX tenant usa a mesma regra de empresa cliente.
3. Empresa `platform_infra` nao aparece como empresa comercial/modulo tenant.
4. System Master sem contexto assumido nao vira empresa operacional comercial.
5. `hbx-master-whatsapp-engine` so e aceito em fluxo tecnico de infraestrutura.
6. Access governor antigo `HBX_MASTER` nao existe mais no runtime.
7. Login de tenant manual/premium segue fluxo normal, sem `if` por slug `hbx`.

Validar com o menor conjunto relevante primeiro. Depois rodar:

```powershell
cd backend
npm run build
```

Se frontend for tocado:

```powershell
cd frontend
npm run lint
npm run build
```

## Fase 9 - Grep final e limpeza

Rodar antes de finalizar:

```powershell
rg -n "HBX_MASTER|COMPANY_ADMIN|isHbxOperationCompany|isMasterOperationalCompany|master_operacional|master_operational_company|hbx_seller_operational_company|slug === 'hbx'|slug === \"hbx\"" .
```

Regra de decisao:

- se aparecer em runtime comercial, corrigir;
- se aparecer em migration/backfill, garantir comentario `MIGRATION_ONLY`;
- se aparecer em teste antigo, atualizar ou remover;
- se aparecer em documentacao, justificar no resumo.

Tambem buscar:

```powershell
rg -n "MASTER_WHATSAPP_ENGINE_COMPANY_SLUG|hbx-master-whatsapp-engine" backend frontend
```

Regra de decisao:

- permitido em infra WhatsApp/engine/status tecnico;
- proibido em access governor comercial, modulos, vendas, radar, gerencial, financeiro e frontend access helper.

## Fase 10 - Commit

Antes do commit:

```powershell
git status --short
git diff --stat
```

Commit esperado:

```powershell
git add <arquivos-da-refatoracao>
git commit -m "refactor(master): separar system master de tenant e infra"
```

Nao incluir alteracoes alheias ou arquivos fora do escopo.

## Resumo final obrigatorio

Ao concluir a aplicacao, reportar:

- branch criada;
- arquivos alterados;
- migrations criadas;
- regras antigas removidas;
- resultado do grep de vestigios;
- testes executados;
- falhas encontradas e se parecem preexistentes;
- pendencias reais, sem maquiagem.

## Checklist de seguranca HBX

Antes de encerrar:

- fortalece o fluxo Radar -> Vendas -> WhatsApp -> Retorno;
- nao libera recurso pago sem plano, pagamento, entitlement, quota ou status comercial;
- nao enfraquece auth, tenant boundary ou permissao;
- nao apaga negativos ou historico comercial;
- nao expoe segredo, PII, token ou dado comercial sensivel;
- nao transforma fonte generica em Radar card sem empresa real;
- nao executa deploy, publish ou restart de producao;
- mantem alteracoes pequenas e verificaveis.
