/**
 * Testes das regras de domínio. Correm com o Node, sem dependências:
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erroValorLivre, emDolares, MAX_FREE_AMOUNT } from './shared/money.ts';
import { pode, eStaff, eAdmin, recusaMudarPapel } from './identity/role.ts';
import { checkSetting, validarDefinicoes, parteDoCriador } from './platform/settings.ts';
import { precoDeVenda, valorLivre, metodosPara, metodoInicial, telefoneMcx, ErroDeCompra } from './commerce/purchase.ts';
import { horasDeEspera, estaAtrasado, descreverEspera } from './backoffice/queue.ts';
import { idade, recusaDecisao } from './backoffice/kyc.ts';
import { accoesPossiveis } from './backoffice/report.ts';
import { podeTransitar, porTratar, eIrreversivel, recusaMotivo } from './backoffice/payout.ts';

test('dinheiro: valor livre respeita mínimo, inteiro e teto', () => {
  assert.equal(erroValorLivre(500, 200), null);
  assert.match(erroValorLivre(100, 200)!, /entre 200/);
  assert.ok(erroValorLivre(250.5, 200));
  assert.ok(erroValorLivre(MAX_FREE_AMOUNT + 1, 200));
  assert.equal(erroValorLivre(1, 0), null, 'mínimo 0 passa a 1');
});

test('dinheiro: conversão para dólares nunca dá Infinity', () => {
  assert.equal(emDolares(9200, 920), 10);
  assert.equal(emDolares(1000, 0), null);
  assert.equal(emDolares(1000, Number.NaN), null);
});

test('papéis: matriz de permissões', () => {
  assert.ok(eStaff('moderator') && eStaff('admin') && !eStaff('creator') && !eStaff(null));
  assert.ok(eAdmin('admin') && !eAdmin('moderator'));
  assert.ok(pode('moderator', 'moderar'));
  for (const p of ['suspender_perfis', 'gerir_levantamentos', 'ver_mensagens_privadas', 'gerir_definicoes'] as const) {
    assert.ok(!pode('moderator', p), `moderador não pode ${p}`);
    assert.ok(pode('admin', p));
  }
});

test('papéis: ninguém muda o próprio papel, e só o admin muda papéis', () => {
  assert.equal(recusaMudarPapel({ id: 'a', role: 'admin' }, 'b', 'moderator'), null);
  assert.match(recusaMudarPapel({ id: 'a', role: 'admin' }, 'a', 'fan')!, /próprio/);
  assert.match(recusaMudarPapel({ id: 'a', role: 'moderator' }, 'b', 'admin')!, /permissão/);
  assert.match(recusaMudarPapel({ id: 'a', role: 'admin' }, 'b', 'root')!, /inválido/);
});

test('definições: validação por campo e entre campos', () => {
  assert.deepEqual(checkSetting('fee_pct', '20'), { value: 20 });
  assert.ok(checkSetting('fee_pct', '20.5').error);
  assert.ok(checkSetting('usd_rate', '0').error, 'câmbio 0 era divisão por zero');
  assert.ok(checkSetting('min_tip', '').error);
  assert.equal(parteDoCriador(20), 80);
  const ok = validarDefinicoes([{ key: 'fee_pct', raw: '25' }, { key: 'min_tip', raw: '100' }]);
  assert.deepEqual(ok.rows, [{ key: 'fee_pct', value: 25 }, { key: 'min_tip', value: 100 }]);
  assert.ok(validarDefinicoes([{ key: 'fee_pct', raw: '25' }, { key: 'min_tip', raw: 'x' }]).error, 'um inválido bloqueia todos');
});

test('compras: preço vem do item e respeita o estado', () => {
  assert.equal(precoDeVenda('subscription', { status: 'approved', price: 2500 }), 2500);
  assert.equal(precoDeVenda('message', { ppv_price: 999.6 }), 1000);
  assert.throws(() => precoDeVenda('subscription', { status: 'pending', price: 2500 }), ErroDeCompra);
  assert.throws(() => precoDeVenda('post', { status: 'draft', price: 100 }), ErroDeCompra);
  assert.throws(() => precoDeVenda('ticket', { status: 'ended', price: 100 }), ErroDeCompra);
  assert.throws(() => precoDeVenda('post', { status: 'published', price: 0 }), ErroDeCompra);
  assert.throws(() => precoDeVenda('post', null), /já não existe/);
});

test('compras: valor livre, métodos e telefone', () => {
  assert.equal(valorLivre('tip', 300, { min_tip: 200, min_topup: 1000 }), 300);
  assert.throws(() => valorLivre('topup', 500, { min_tip: 200, min_topup: 1000 }), ErroDeCompra);
  assert.deepEqual(metodosPara('topup', ['wallet', 'mcx', 'paypal']), ['mcx', 'paypal']);
  assert.equal(metodoInicial('post', 5000, 1000), 'wallet');
  assert.equal(metodoInicial('post', 500, 1000), 'mcx');
  assert.equal(metodoInicial('topup', 99999, 1000), 'mcx');
  assert.equal(telefoneMcx('+244 923 456 789'), '923456789');
  assert.equal(telefoneMcx('823456789'), null);
});

test('filas: espera e atraso', () => {
  const agora = new Date('2026-09-28T12:00:00Z');
  assert.equal(horasDeEspera('2026-09-28T09:00:00Z', agora), 3);
  assert.ok(!estaAtrasado('2026-09-26T13:00:00Z', agora));
  assert.ok(estaAtrasado('2026-09-26T11:00:00Z', agora));
  assert.equal(descreverEspera('2026-09-28T11:30:00Z', agora), 'há menos de 1 h');
  assert.equal(descreverEspera('2026-09-27T12:00:00Z', agora), 'há 24 h');
  assert.equal(descreverEspera('2026-09-25T12:00:00Z', agora), 'há 3 dias');
});

test('KYC: idade exacta e decisão', () => {
  const em = new Date('2026-09-28T12:00:00');
  assert.equal(idade('2008-09-28', em), 18);
  assert.equal(idade('2008-09-29', em), 17, 'véspera do aniversário ainda não tem 18');
  assert.equal(idade(null, em), null);
  assert.equal(recusaDecisao({ aprovar: true, pontosConfirmados: [true, true, true, true], motivo: '' }), null);
  assert.ok(recusaDecisao({ aprovar: true, pontosConfirmados: [true, true, false, true], motivo: '' }));
  assert.ok(recusaDecisao({ aprovar: false, pontosConfirmados: [], motivo: 'mau' }));
  assert.equal(recusaDecisao({ aprovar: false, pontosConfirmados: [], motivo: 'Documento cortado' }), null);
});

test('denúncias: moderador não suspende perfis', () => {
  const perfil = { status: 'open', target_type: 'creator' };
  assert.deepEqual(accoesPossiveis(perfil, 'moderator'), { arquivar: true, remover: false, suspender: false, soAdminSuspende: true });
  assert.deepEqual(accoesPossiveis(perfil, 'admin'), { arquivar: true, remover: false, suspender: true, soAdminSuspende: false });
  assert.equal(accoesPossiveis({ status: 'open', target_type: 'post' }, 'moderator').remover, true);
  assert.equal(accoesPossiveis({ status: 'kept', target_type: 'post' }, 'admin').arquivar, false);
});

test('levantamentos: máquina de estados', () => {
  assert.ok(podeTransitar('pending', 'review'));
  assert.ok(podeTransitar('review', 'paid'));
  assert.ok(!podeTransitar('paid', 'pending'), 'pago é final');
  assert.ok(!podeTransitar('rejected', 'paid'), 'recusado é final');
  assert.ok(!podeTransitar('review', 'pending'));
  assert.ok(porTratar('review') && !porTratar('paid'));
  assert.ok(eIrreversivel('paid') && !eIrreversivel('review'));
  assert.ok(recusaMotivo('abc') && !recusaMotivo('IBAN errado'));
});
