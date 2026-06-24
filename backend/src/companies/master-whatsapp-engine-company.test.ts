import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_KIND_PLATFORM_INFRA } from '../common/company-kind';
import {
  MASTER_WHATSAPP_ENGINE_COMPANY_NAME,
  MASTER_WHATSAPP_ENGINE_COMPANY_SLUG,
} from './master-whatsapp-company.constants';
import { CompaniesService } from './companies.service';

test('getOrCreateMasterWhatsAppEngineCompany creates only technical platform_infra company', async () => {
  let createData: any = null;
  const prisma = {
    company: {
      findUnique: async () => null,
    },
    $transaction: async (callback: any) => callback({
      company: {
        create: async ({ data }: any) => {
          createData = data;
          return { id: 999, ...data };
        },
      },
    }),
  };
  const service = new CompaniesService(prisma as any, {} as any, {} as any, {} as any, {} as any);

  const company = await service.getOrCreateMasterWhatsAppEngineCompany();

  assert.equal(company.id, 999);
  assert.equal(createData.name, MASTER_WHATSAPP_ENGINE_COMPANY_NAME);
  assert.equal(createData.slug, MASTER_WHATSAPP_ENGINE_COMPANY_SLUG);
  assert.equal(createData.companyKind, COMPANY_KIND_PLATFORM_INFRA);
  assert.equal(createData.whatsappConnectionMode, 'TEMPORARY');
  assert.equal(createData.whatsappModalProvider, 'external_modal');
});
