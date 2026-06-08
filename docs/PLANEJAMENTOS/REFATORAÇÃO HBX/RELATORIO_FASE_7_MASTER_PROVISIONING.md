# Relatorio Fase 7 - MasterProvisioningService

Data: 2026-06-08

## Objetivo

Preparar o Master como painel tecnico de provisionamento de tenants, sem transformar a empresa de infraestrutura em workspace comercial.

## Implementado

- Criado `backend/src/master-provisioning/master-provisioning.service.ts`.
- Criado `backend/src/master-provisioning/master-provisioning.module.ts`.
- Registrado `MasterProvisioningModule` em `backend/src/app.module.ts`.
- Criado teste `backend/src/master-provisioning/master-provisioning.service.test.ts`.

## Contrato do servico

`MasterProvisioningService.buildProvisioningPlan(input)` normaliza e valida:

- tenant com `companyKind="tenant"`;
- plano/manual;
- modulos do plano ou modulos informados;
- limites comerciais e prazo de comissao;
- admin inicial;
- `supportEmail`, `replyToEmail`, `supportWhatsapp`;
- produtos iniciais;
- implantacao assistida.

`MasterProvisioningService.provisionTenant(input)` faz provisionamento transacional minimo:

- cria empresa tenant;
- configura plano/manual;
- cria grants de modulos existentes;
- cria entitlements manuais quando `manualAccess=true`;
- cria admin inicial com senha temporaria quando necessario;
- marca implantacao assistida.

## Pendencias explicitas

- `supportEmail`, `replyToEmail` e `supportWhatsapp` ainda nao possuem campos dedicados no schema. O contrato marca `persistence="pending_schema"` e o provisionamento usa apenas `contactEmail/contactPhone` como contato operacional basico.
- Produtos iniciais ficam com `persistence="deferred"` nesta fase. Nao foi criado produto profundo nem catalogo comercial completo.
- Nenhum SMTP por empresa foi implementado nesta fase.

## Validacao

- `npm --prefix backend run build`
- `node --test backend/dist/master-provisioning/master-provisioning.service.test.js`
