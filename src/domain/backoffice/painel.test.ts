/**
 * Testes das regras do painel da «Visão geral».
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverPeriodo, recusaFiltros, variacao, conversao, percentagens, escalaDoEixo, diasEntre } from './painel.ts';

test('painel: períodos fixos acabam hoje e contam o dia de hoje', () => {
  assert.deepEqual(resolverPeriodo({ periodo: '7' }, '2026-11-15'), { de: '2026-11-09', ate: '2026-11-15' });
  assert.deepEqual(resolverPeriodo({ periodo: '30' }, '2026-03-01'), { de: '2026-01-31', ate: '2026-03-01' });
  assert.equal(diasEntre('2026-01-31', '2026-03-01'), 30);
  assert.deepEqual(resolverPeriodo({ periodo: '365' }, '2026-11-15'), { de: '2025-11-16', ate: '2026-11-15' });
});

test('painel: período personalizado tem de ser válido', () => {
  assert.deepEqual(resolverPeriodo({ periodo: 'custom', de: '2026-10-01', ate: '2026-10-31' }, '2026-11-15'), { de: '2026-10-01', ate: '2026-10-31' });
  assert.ok('erro' in resolverPeriodo({ periodo: 'custom', de: '2026-10-31', ate: '2026-10-01' }, '2026-11-15'));
  assert.ok('erro' in resolverPeriodo({ periodo: 'custom', de: '2026-10-01', ate: '2026-12-01' }, '2026-11-15'));
  assert.ok('erro' in resolverPeriodo({ periodo: 'custom', de: '2020-01-01', ate: '2026-11-15' }, '2026-11-15'));
  assert.ok('erro' in resolverPeriodo({ periodo: 'custom', de: '', ate: '2026-11-15' }, '2026-11-15'));
});

test('painel: filtros fora das listas são recusados', () => {
  assert.equal(recusaFiltros({ periodo: '30', tipo: 'post', contas: 'criadores', origem: 'sem_convite', comparar: true }), null);
  assert.ok(recusaFiltros({ periodo: '15' as never, comparar: true }));
  assert.ok(recusaFiltros({ periodo: '30', tipo: 'topup' as never, comparar: true }));
  assert.ok(recusaFiltros({ periodo: '30', criador: 'abc', comparar: true }));
  assert.equal(recusaFiltros({ periodo: '30', criador: '6f1c2a34-1b2c-4d5e-8f90-1234567890ab', comparar: true }), null);
});

test('painel: variação, conversão e percentagens', () => {
  assert.equal(variacao(120, 100), 20);
  assert.equal(variacao(90, 120), -25);
  assert.equal(variacao(5, 0), null);
  assert.equal(conversao(25, 100), 25);
  assert.equal(conversao(3, 0), null);
  assert.deepEqual(percentagens([1, 1, 1]), [34, 33, 33]);
  assert.equal(percentagens([52, 21, 13, 9, 5]).reduce((s, v) => s + v, 0), 100);
  assert.deepEqual(percentagens([0, 0]), [0, 0]);
});

test('painel: o eixo usa passos redondos e cobre o máximo', () => {
  assert.deepEqual(escalaDoEixo(290000), { passo: 100000, topo: 400000 });
  assert.deepEqual(escalaDoEixo(7, true), { passo: 2, topo: 8 });
  assert.deepEqual(escalaDoEixo(0), { passo: 1, topo: 4 });
  assert.ok(escalaDoEixo(3, true).passo >= 1);
});
