import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArgumentMetadata, ValidationPipe, BadRequestException } from '@nestjs/common';

import {
  CreateContaDto,
  CreateContatoDto,
  UpdateContaDto,
} from './dto/nucleo.dto';
import {
  ConfirmarEntregaDto,
  CreateEntregaDto,
  UpdateFinanceiroClienteDto,
  UpdateLogisticaConfigDto,
} from '../logistica/dto/logistica.dto';

// NÚCLEO-CRM R5 (05/07) — blindagem de BORDA dos endpoints novos (nucleo+logistica).
//
// Prova, com a MESMA config do ValidationPipe global de main.ts
// (whitelist + forbidNonWhitelisted + transform), que os DTOs de escrita:
//   (a) rejeitam CAMPO EXTRA no body (forbidNonWhitelisted → 400);
//   (b) rejeitam VALOR FORA DO ENUM (@IsIn: formaPagamento/receiptMethod/tipo etc. → 400);
//   (c) rejeitam TIPO ERRADO (número onde é string, etc. → 400);
//   (d) aceitam um payload válido.
// Isso trava a superfície de auth/entrada ANTES de chegar no serviço.

// Espelho EXATO do pipe de main.ts (mesmas flags). Sem exceptionFactory: o default
// já lança BadRequestException (400) — é só o que precisamos observar aqui.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

async function run(metatype: any, value: unknown): Promise<unknown> {
  const meta: ArgumentMetadata = { type: 'body', metatype, data: '' };
  return pipe.transform(value, meta);
}

async function expectReject(metatype: any, value: unknown, msg: string) {
  await assert.rejects(
    () => run(metatype, value),
    (e: unknown) => e instanceof BadRequestException,
    msg,
  );
}

async function expectPass(metatype: any, value: unknown, msg: string) {
  await assert.doesNotReject(() => run(metatype, value), msg);
}

// ── (a) CAMPO EXTRA → 400 (forbidNonWhitelisted) ──────────────────────────────
test('R5 DTO: campo extra no body é rejeitado (forbidNonWhitelisted)', async () => {
  await expectReject(
    CreateContaDto,
    { nome: 'Dona Maria', companyId: 999 }, // companyId NUNCA vem do body → extra
    'CreateContaDto deve rejeitar companyId (campo extra)',
  );
  await expectReject(
    CreateEntregaDto,
    { customerProfileId: 'c1', hackerFlag: true },
    'CreateEntregaDto deve rejeitar campo extra',
  );
  await expectReject(
    UpdateFinanceiroClienteDto,
    { contabilizar: true, isAdmin: true },
    'UpdateFinanceiroClienteDto deve rejeitar campo extra',
  );
});

// ── (b) ENUM INVÁLIDO → 400 (@IsIn) ───────────────────────────────────────────
test('R5 DTO: valor fora do enum é rejeitado (@IsIn)', async () => {
  // logistica: formaPagamento / metodoPadrao / receiptMethod
  await expectReject(
    UpdateFinanceiroClienteDto,
    { formaPagamento: 'xyz' },
    "formaPagamento:'xyz' deve ser 400",
  );
  await expectReject(
    UpdateFinanceiroClienteDto,
    { metodoPadrao: 'boleto' },
    "metodoPadrao:'boleto' deve ser 400",
  );
  await expectReject(
    ConfirmarEntregaDto,
    { receiptMethod: 'cripto' },
    "receiptMethod:'cripto' deve ser 400",
  );
  // nucleo: tipo (pf|pj)
  await expectReject(
    CreateContaDto,
    { nome: 'X', tipo: 'mei' },
    "tipo:'mei' deve ser 400",
  );
  await expectReject(
    UpdateContaDto,
    { tipo: 'ong' },
    "tipo:'ong' deve ser 400",
  );
});

// ── (c) TIPO ERRADO → 400 ─────────────────────────────────────────────────────
test('R5 DTO: tipo errado é rejeitado', async () => {
  await expectReject(
    CreateContaDto,
    { nome: 12345 }, // nome deve ser string
    'nome numérico deve ser 400',
  );
  await expectReject(
    CreateContatoDto,
    { customerProfileId: 'c1', nome: 'João', isPrincipal: 'sim' }, // boolean esperado
    'isPrincipal string deve ser 400',
  );
  await expectReject(
    UpdateLogisticaConfigDto,
    { raioChegadaM: 999999 }, // acima do @Max(5000)
    'raioChegadaM acima do teto deve ser 400',
  );
  await expectReject(
    CreateEntregaDto,
    { customerProfileId: 'c1', notes: 'x'.repeat(600) }, // acima do @MaxLength(500)
    'notes acima do teto deve ser 400',
  );
});

// ── (d) PAYLOAD VÁLIDO passa ───────────────────────────────────────────────────
test('R5 DTO: payload válido passa', async () => {
  await expectPass(
    CreateContaDto,
    { nome: 'Dona Maria', tipo: 'pf', whatsapp: '5588999990000', isCliente: true },
    'conta válida passa',
  );
  await expectPass(
    UpdateFinanceiroClienteDto,
    { formaPagamento: 'na_hora', metodoPadrao: 'pix', contabilizar: true, diaFechamento: 10 },
    'financeiro válido passa',
  );
  await expectPass(
    UpdateFinanceiroClienteDto,
    { metodoPadrao: '' }, // '' limpa o método padrão (na_hora → sem método)
    "metodoPadrao:'' (limpar) passa",
  );
  await expectPass(
    ConfirmarEntregaDto,
    { lat: -3.7, lng: -38.5, receiptMethod: 'dinheiro' },
    'confirmar válido passa',
  );
});
