import test from 'node:test';
import assert from 'node:assert/strict';
import { ModulesService } from './modules.service';

// Contrato empresarial é somente metadado de cobrança; não altera produto nem módulos.

type FakeCompanyRow = {
  id: number;
  companyKind?: string | null;
  accountType?: string | null;
  monthlyValueOverride?: number | null;
};

function buildService(companyRow: FakeCompanyRow) {
  const supportActions: any[] = [];
  let company: FakeCompanyRow = { ...companyRow };

  const prisma: any = {
    company: {
      findUnique: async () => ({ ...company }),
      update: async ({ data }: any) => {
        company = { ...company, ...data };
        return { ...company };
      },
    },
    // ensureMasterBillingRuntimeSchema (cache por processo) roda $executeRawUnsafe em série na
    // 1ª chamada do processo de teste inteiro — precisa existir mesmo que nunca seja inspecionado.
    $executeRawUnsafe: async () => undefined,
  };

  const usersService: any = {
    findById: async (id: number) => ({ id, isSystemMaster: true, companyId: null }),
  };
  const masterContextService: any = {
    resolveRuntimeContext: async () => ({ effectiveCompanyId: null, masterContext: { active: false } }),
    registerSupportAction: async (input: any) => {
      supportActions.push(input);
    },
  };

  const service = new ModulesService(
    prisma,
    {} as any, // integrationConnectionsService — não usado neste caminho
    usersService,
    masterContextService,
    {} as any, // companyOperationalStatus
    {} as any, // commercialUsageLimits
    {} as any, // webwhatsBridge
    {} as any, // creditWallet
  );

  return { service, supportActions, getCompany: () => company };
}

const MASTER_USER_ID = 1;
const COMPANY_ID = 501;

test('liga accountType enterprise e grava somente o valor comercial', async () => {
  const { service, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: null,
  });

  const result = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 1500,
  });

  assert.equal(result.accountType, 'enterprise');
  assert.equal(result.monthlyValueOverride, 1500);

  assert.equal(getCompany().accountType, 'enterprise');
  assert.equal(getCompany().monthlyValueOverride, 1500);
});

test('valor ausente não mexe no que já estava gravado', async () => {
  const { service, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: 777,
  });

  const result = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {});

  assert.equal(result.accountType, 'enterprise');
  assert.equal(result.monthlyValueOverride, 777);
  assert.equal(getCompany().monthlyValueOverride, 777);
});

test('idempotente — 2ª chamada não regrava account-type nem muda produto', async () => {
  const { service, supportActions, getCompany } = buildService({
    id: COMPANY_ID,
    companyKind: 'tenant',
    accountType: 'credit',
    monthlyValueOverride: null,
  });

  const first = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 999,
  });
  const second = await service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {
    monthlyValue: 999,
  });

  assert.deepEqual(first, second);
  assert.equal(getCompany().accountType, 'enterprise');

  // setCompanyAccountTypeByMaster só audita quando o valor MUDA — a 2ª chamada já era
  // enterprise e retorna cedo sem novo log; o log do próprio contrato roda 1x por chamada.
  const accountTypeLogs = supportActions.filter((entry) => entry.action === 'COMPANY_ACCOUNT_TYPE_SET');
  const contractLogs = supportActions.filter((entry) => entry.action === 'COMPANY_ENTERPRISE_CONTRACT_ACTIVATED');
  assert.equal(accountTypeLogs.length, 1);
  assert.equal(contractLogs.length, 2);
});

test('empresa de infraestrutura não recebe contrato empresarial (mesmo guard do account-type)', async () => {
  const { service } = buildService({
    id: COMPANY_ID,
    companyKind: 'platform_infra',
    accountType: 'credit',
  });

  await assert.rejects(
    () => service.setCompanyEnterpriseContractByMaster(MASTER_USER_ID, COMPANY_ID, {}),
    /infraestrutura/,
  );
});
