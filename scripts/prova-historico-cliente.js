#!/usr/bin/env node
/**
 * PROVA FUNCIONAL — Histórico operacional da ficha do cliente.
 *
 *     node scripts/prova-historico-cliente.js
 *
 * Dirige a casca real com a ponte costurada e confirma a cena inteira: abrir
 * cliente → tocar Histórico → ver hora/status/motivo → carregar a página 2.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'EntregaShell/app/src/logistica/assets/app/index.html')
  .replace(/\\/g, '/');

const PONTE = () => {
  window.__chamadas = [];
  window.HBX = {
    api(caminho, opcoes) {
      window.__chamadas.push([((opcoes && opcoes.method) || 'GET'), caminho]);
      if (caminho.indexOf('/logistica/clientes/c1/historico') === 0) {
        if (caminho.indexOf('cursor=prox-1') >= 0) {
          return Promise.resolve({ items: [{
            id: 'h3', tipo: 'entregue', titulo: 'Entregue, a receber',
            itensResumo: '1× Galão 20 Litros', motivo: null,
            createdAt: '2026-08-12T13:05:00.000Z',
          }], nextCursor: null });
        }
        return Promise.resolve({ items: [
          {
            id: 'h1', tipo: 'pago', titulo: 'Entregue e pago',
            itensResumo: '2× Galão 20 Litros', receiptMethod: 'pix', motivo: null,
            createdAt: '2026-08-14T12:34:00.000Z',
          },
          {
            id: 'h2', tipo: 'sem_atendimento', titulo: 'Sem atendimento',
            itensResumo: null, receiptMethod: null, motivo: 'Ninguém atendeu',
            createdAt: '2026-08-13T15:12:00.000Z',
          },
        ], nextCursor: 'prox-1' });
      }
      if (caminho.indexOf('/nucleo/clientes/c1') === 0) {
        return Promise.resolve({ id: 'c1', name: 'Adler / Thaís', locais: [], telefones: [], entregasCount: 3 });
      }
      if (caminho.indexOf('/nucleo/clientes') === 0) {
        return Promise.resolve({ items: [{
          id: 'c1', name: 'Adler / Thaís', isCliente: true, endereco: 'Rua 9', diasEntrega: [4], entregasCount: 3,
        }], total: 1 });
      }
      if (caminho.indexOf('/logistica/cliente-produtos') === 0) return Promise.resolve([]);
      if (caminho.indexOf('/logistica/config') === 0) return Promise.resolve({ moduloFinanceiroAtivo: false });
      if (caminho.indexOf('/logistica/rota') === 0) return Promise.resolve({ items: [], estado: 'montar' });
      if (caminho.indexOf('/logistica/agenda') === 0) return Promise.resolve({ dias: [] });
      return Promise.resolve({});
    },
    requestLocationPermission() {}, manterTelaAcesa() {}, modoNavegacao() {}, speak() {},
  };
  window.HBXApp = window.HBXApp || {};
};

const ok = [];
const falhou = [];
const eh = (nome, cond) => (cond ? ok : falhou).push(nome);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 940 } });
  const page = await context.newPage();
  page.on('pageerror', (erro) => falhou.push('ERRO DE PÁGINA: ' + erro.message));
  try {
    await page.goto(APP);
    await page.waitForTimeout(500);
    await page.evaluate(PONTE);
    await page.evaluate(() => window.ir('clientes'));
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('[data-acao="abrir-cliente"]')?.click());
    await page.waitForTimeout(500);

    const ficha = await page.evaluate(() => ({
      temBotao: !!document.querySelector('[data-acao="abrir-historico-cliente"]'),
      financeiro: !![...document.querySelectorAll('.grupo')].find((el) => el.textContent === 'Financeiro'),
    }));
    eh('Histórico fica na ficha mesmo sem Financeiro', ficha.temBotao && !ficha.financeiro);

    await page.evaluate(() => document.querySelector('[data-acao="abrir-historico-cliente"]')?.click());
    await page.waitForTimeout(300);
    const primeiraPagina = await page.evaluate(() => ({
      titulo: (document.querySelector('.portao h3') || {}).textContent,
      texto: (document.querySelector('.portao .corpo') || {}).textContent,
      chamou: window.__chamadas.some(([, caminho]) => caminho === '/logistica/clientes/c1/historico?limit=30'),
      mais: !!document.querySelector('[data-acao="historico-cliente-mais"]'),
    }));
    eh('abre a folha do Histórico', primeiraPagina.titulo === 'Histórico');
    eh('chama o histórico do cliente certo', primeiraPagina.chamou);
    eh('mostra entrega, não atendimento e horários de São Paulo',
      /Entregue e pago/.test(primeiraPagina.texto || '')
      && /Sem atendimento/.test(primeiraPagina.texto || '')
      && /14\/08 · 09:34/.test(primeiraPagina.texto || '')
      && /Ninguém atendeu/.test(primeiraPagina.texto || ''));
    eh('a primeira página oferece Ver mais', primeiraPagina.mais);

    await page.evaluate(() => document.querySelector('[data-acao="historico-cliente-mais"]')?.click());
    await page.waitForTimeout(300);
    const segundaPagina = await page.evaluate(() => ({
      texto: (document.querySelector('.portao .corpo') || {}).textContent,
      chamou: window.__chamadas.some(([, caminho]) => caminho.indexOf('/logistica/clientes/c1/historico?limit=30&cursor=prox-1') === 0),
      mais: !!document.querySelector('[data-acao="historico-cliente-mais"]'),
    }));
    eh('Ver mais busca a página seguinte', segundaPagina.chamou);
    eh('a página seguinte entra na mesma folha', /12\/08 · 10:05/.test(segundaPagina.texto || ''));
    eh('sem cursor não sobra botão morto de paginação', !segundaPagina.mais);
  } finally {
    await browser.close();
  }

  console.log('\n=== PROVA: histórico operacional do cliente ===');
  ok.forEach((nome) => console.log('  ok  ' + nome));
  falhou.forEach((nome) => console.log('  XX  ' + nome));
  console.log(`\n${ok.length}/${ok.length + falhou.length}`);
  process.exit(falhou.length ? 1 : 0);
})();
