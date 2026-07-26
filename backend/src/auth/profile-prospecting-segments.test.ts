import test from 'node:test';
import assert from 'node:assert/strict';

import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ProfileController } from './profile.controller';

test('POST /profile/prospecting-segments retorna 200 e grava segmentos, estado e cidade', async () => {
  const company = {
    id: 77,
    prospectingSegmentsJson: null as string | null,
    prospectingEstado: null as string | null,
    prospectingCidade: null as string | null,
  };
  const prisma = {
    company: {
      update: async ({ where, data }: any) => {
        assert.equal(where.id, company.id);
        Object.assign(company, data);
        return { ...company };
      },
    },
  };
  const usersService = new UsersService(prisma as any, {} as any);
  usersService.findById = async () => ({
    id: 5,
    companyId: company.id,
    role: 'ADMIN',
    isSystemMaster: false,
    canViewBilling: true,
  }) as any;
  const controller = new ProfileController(usersService, {} as any, {} as any, prisma as any, {} as any);
  const handler = ProfileController.prototype.saveProspectingSegments;

  assert.equal(Reflect.getMetadata(PATH_METADATA, ProfileController), 'profile');
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'prospecting-segments');
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST);
  assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, handler), HttpStatus.OK);

  const response = await controller.saveProspectingSegments(
    { user: { id: 5 } },
    { segments: ['Pet shops'], estado: 'SP', cidade: 'RIO CLARO' },
  );

  assert.deepEqual(response, { ok: true, prospectingSegments: ['Pet shops'] });
  assert.equal(company.prospectingSegmentsJson, JSON.stringify(['Pet shops']));
  assert.equal(company.prospectingEstado, 'SP');
  assert.equal(company.prospectingCidade, 'RIO CLARO');
});
