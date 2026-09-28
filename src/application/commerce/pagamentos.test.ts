/**
 * Testes do caso de uso de pagamentos com catálogo e estratégias falsos.
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pagamentos } from './pagamentos.ts';
import { ErroDeCompra } from '../../domain/commerce/purchase.ts';
import type { EstrategiaDePagamento, Pedido } from './ports.ts';

const iniciados: Array<[string, Pedido]> = [];
const estrategia = (metodo: EstrategiaDePagamento['metodo']): EstrategiaDePagamento => ({
  metodo,
  async iniciar(p) { iniciados.push([metodo, p]); return { tipo: 'aguardar', orderId: 'o-' + metodo }; },
});
const catalogo = {
  async item(kind: string, id: string) {
    if (id === 'rascunho') return { status: 'draft', price: 500 };
    return kind === 'subscription' ? { status: 'approved', price: 2500 } : { status: 'published', price: 800 };
  },
};
const seguimento = { observar: () => () => {}, capturarPaypal: async () => 'paid' };
const svc = new Pagamentos(catalogo, ['wallet', 'mcx', 'reference', 'paypal'].map((m) => estrategia(m as never)), seguimento);
const minimos = { min_tip: 200, min_topup: 1000 };

test('o preço vem do catálogo, não do valor que o ecrã mandou', async () => {
  assert.equal(await svc.cotar('subscription', 'c1', 1, minimos), 2500);
  assert.equal(await svc.cotar('post', 'p1', 99999, minimos), 800);
  await assert.rejects(svc.cotar('post', 'rascunho', null, minimos), ErroDeCompra);
  await assert.rejects(svc.cotar('post', null, null, minimos), /Falta o alvo/);
});

test('gorjetas e carregamentos respeitam os mínimos das definições', async () => {
  assert.equal(await svc.cotar('tip', null, 300, minimos), 300);
  await assert.rejects(svc.cotar('topup', null, 500, minimos), ErroDeCompra);
});

test('métodos: carregar a carteira não se paga com a carteira', async () => {
  assert.deepEqual(svc.metodos('topup'), ['mcx', 'reference', 'paypal']);
  await assert.rejects(svc.iniciar('wallet', { kind: 'topup', target_id: null, amount: 1000, meta: {} }), ErroDeCompra);
});

test('Multicaixa Express valida e normaliza o número antes de chamar o método', async () => {
  iniciados.length = 0;
  await assert.rejects(svc.iniciar('mcx', { kind: 'tip', target_id: 'c1', amount: 300, meta: {}, telefone: '81234' }), /9 dígitos/);
  const r = await svc.iniciar('mcx', { kind: 'tip', target_id: 'c1', amount: 300, meta: {}, telefone: '+244 923 456 789' });
  assert.equal(r.orderId, 'o-mcx');
  assert.equal(iniciados.length, 1, 'o número inválido nunca chegou à estratégia');
  assert.equal(iniciados[0][1].telefone, '923456789');
});
