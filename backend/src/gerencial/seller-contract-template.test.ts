import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSellerPartnerContract } from './seller-contract-template';

test('buildSellerPartnerContract substitui variaveis e inclui regras base', () => {
  const contract = buildSellerPartnerContract({
    sellerName: 'João Parceiro',
    sellerCpf: '12345678901',
    sellerEmail: 'joao@hbx.com.br',
    sellerPhone: '11999990000',
    sellerAddress: 'Rua HBX, 100',
    commissionPercent: 20,
    commissionDueBusinessDays: 3,
    contractDate: '03/06/2026',
    canRecruitSellers: false,
  });

  assert.match(contract, /João Parceiro/);
  assert.match(contract, /12345678901/);
  assert.match(contract, /joao@hbx\.com\.br/);
  assert.match(contract, /sem vínculo empregatício/i);
  assert.match(contract, /sem meta obrigatória/i);
  assert.match(contract, /comissão de 20%/i);
  assert.match(contract, /não está autorizado/i);
});

test('buildSellerPartnerContract inclui clausulas de gestor, herança e indicador', () => {
  const contract = buildSellerPartnerContract({
    sellerName: 'Maria Gestora',
    commissionPercent: 20,
    commissionDueBusinessDays: 3,
    canRecruitSellers: true,
    sellerReferralCommissionPercent: 2,
    referredByName: 'João Indicador',
  });

  assert.match(contract, /autorizado a indicar/i);
  assert.match(contract, /Comissão herdada configurada: 2%/);
  assert.match(contract, /indicação de João Indicador/);
});

test('buildSellerPartnerContract inclui clausula de teto de comissao quando houver teto', () => {
  const comTeto = buildSellerPartnerContract({
    sellerName: 'Ana Vendedora',
    commissionPercent: 20,
    commissionMonthlyCap: 100,
    setupCommissionCap: 50,
  });
  assert.match(comTeto, /teto de comissão por cliente/i);
  assert.match(comTeto, /R\$\s*100,00/);
  assert.match(comTeto, /implantação por cliente é limitada a R\$\s*50,00/);

  // Sem teto (0) → cláusula NÃO aparece (não deixa linha órfã no contrato).
  const semTeto = buildSellerPartnerContract({
    sellerName: 'Ana Vendedora',
    commissionPercent: 20,
    commissionMonthlyCap: 0,
    setupCommissionCap: 0,
  });
  assert.doesNotMatch(semTeto, /teto de comissão/i);
});
