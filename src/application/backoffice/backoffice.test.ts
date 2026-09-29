/**
 * Testes da fachada da administração com repositórios em memória (sem Supabase).
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Backoffice, type Actor } from './backoffice.ts';
import { ErroDeRegra } from '../../domain/shared/errors.ts';
import type { RepositoriosDoBackoffice } from './ports.ts';

/** Repositórios falsos: registam as escritas em `chamadas`. */
function falsos() {
  const chamadas: string[] = [];
  const reg = (s: string) => { chamadas.push(s); return Promise.resolve(); };
  const repos: RepositoriosDoBackoffice = {
    filas: { contar: async (p) => ({ kyc: 1, rep: 2, ct: 3, pay: p ? 4 : 0, ban: p ? 5 : 0 }), maisAntigo: async () => null, estatisticas: async () => ({}) },
    verificacoes: { listar: async () => [], detalhe: async () => ({ pedido: {}, criador: null, banco: null, urls: {} }), decidir: (id, a, m) => reg(`kyc ${id} ${a} ${m}`) },
    denuncias: {
      listar: async () => [],
      obter: async (id) => ({ target_type: id === 'perfil' ? 'creator' : 'post', target_id: 'x', reason: null }),
      resolver: (id, r) => reg(`rep ${id} ${r}`), handleDoPerfil: async () => 'h',
    },
    levantamentos: { listar: async () => [], mudarEstado: (id, e, n) => reg(`pay ${id} ${e} ${n}`) },
    suporte: { listar: async () => [], resolver: (id) => reg(`ct ${id}`) },
    comunidade: {
      utilizadores: async () => [], mudarPapel: (id, p) => reg(`role ${id} ${p}`), mudarEstadoDoCriador: (id, e) => reg(`cr ${id} ${e}`),
      banir: (id, c, m, d) => reg(`ban ${id} ${c} ${m} ${d}`), levantarBanimento: (id) => reg(`unban ${id}`),
      advertir: async (id, c, m) => { chamadas.push(`warn ${id} ${c} ${m}`); return false; },
      pedirBanimento: (id, c, m) => reg(`pedido ${id} ${c} ${m}`), pedidosDeBanimento: async () => [],
      decidirPedidoDeBanimento: (id, a, d, n) => reg(`decide ${id} ${a} ${d} ${n}`),
      conversas: async () => [], mensagens: async () => ({ mensagens: [], urls: {} }),
    },
    promocoes: { listar: async () => [], obter: async () => null, guardar: (id) => reg(`promo ${id}`), apagar: (id) => reg(`promo- ${id}`), enviarFicheiro: async () => 'url' },
    definicoes: { listar: async () => [], gravar: (l) => reg(`set ${l.map((x) => `${x.key}=${x.value}`).join(',')}`) },
  };
  return { repos, chamadas };
}
const admin: Actor = { id: 'a1', role: 'admin' };
const moderador: Actor = { id: 'm1', role: 'moderator' };
const recusa = (p: Promise<unknown>) => assert.rejects(p, ErroDeRegra);

test('moderador modera, mas não toca em dinheiro, papéis nem definições', async () => {
  const { repos, chamadas } = falsos();
  const b = new Backoffice(repos, moderador);
  assert.deepEqual(await b.contagens(), { kyc: 1, rep: 2, ct: 3, pay: 0, ban: 0 }, 'sem levantamentos nem pedidos de banimento');
  await b.arquivarDenuncia('d1');
  await recusa(b.levantamentos('open', 10));
  await recusa(b.mudarEstadoDoLevantamento('p1', 'pending', 'paid'));
  await recusa(b.suspenderPerfilDenunciado('perfil'));
  await recusa(b.mudarPapel('u2', 'admin'));
  await recusa(b.gravarDefinicoes([{ key: 'fee_pct', raw: '10' }]));
  await recusa(b.mensagensDaConversa('t1'));
  assert.deepEqual(chamadas, ['rep d1 false'], 'nada mais chegou à base de dados');
});

test('levantamentos seguem a máquina de estados', async () => {
  const { repos, chamadas } = falsos();
  const b = new Backoffice(repos, admin);
  await b.mudarEstadoDoLevantamento('p1', 'pending', 'review');
  await b.mudarEstadoDoLevantamento('p1', 'review', 'paid');
  await recusa(b.mudarEstadoDoLevantamento('p2', 'paid', 'pending'));
  await recusa(b.mudarEstadoDoLevantamento('p3', 'pending', 'rejected', 'curto'.slice(0, 3)));
  await b.mudarEstadoDoLevantamento('p3', 'pending', 'rejected', '  IBAN de outra pessoa ');
  assert.deepEqual(chamadas, ['pay p1 review null', 'pay p1 paid null', 'pay p3 rejected IBAN de outra pessoa']);
});

test('denúncias: remover conteúdo não suspende perfis', async () => {
  const { repos, chamadas } = falsos();
  const b = new Backoffice(repos, admin);
  await b.removerConteudoDenunciado('post1');
  await recusa(b.removerConteudoDenunciado('perfil'));
  await b.suspenderPerfilDenunciado('perfil');
  assert.deepEqual(chamadas, ['rep post1 true', 'rep perfil true']);
});

test('KYC, papéis e definições passam pelas regras do domínio', async () => {
  const { repos, chamadas } = falsos();
  const b = new Backoffice(repos, admin);
  await recusa(b.decidirVerificacao('k1', true, [true, true, false, true], ''));
  await b.decidirVerificacao('k1', false, [], ' Documento cortado ');
  await recusa(b.mudarPapel('a1', 'fan'));
  await b.mudarPapel('u2', 'moderator');
  await recusa(b.mudarEstadoDoCriador('a1', 'suspended'));
  await recusa(b.gravarDefinicoes([{ key: 'fee_pct', raw: '20' }, { key: 'usd_rate', raw: '0' }]));
  await b.gravarDefinicoes([{ key: 'fee_pct', raw: '25' }]);
  assert.deepEqual(chamadas, ['kyc k1 false Documento cortado', 'role u2 moderator', 'set fee_pct=25']);
});

test('banir e advertir: só o admin, qualquer conta menos a própria e o perfil principal', async () => {
  const { repos, chamadas } = falsos();
  const b = new Backoffice(repos, admin);
  await b.banirConta({ id: 'mod1' }, 'multiplas_contas', 'Três contas com o mesmo telefone', 7);
  await b.advertir({ id: 'cr1' }, 'desrespeito', 'Insultos nos comentários');
  await recusa(b.banirConta({ id: 'a1' }, 'suspeito', 'motivo válido', 7));
  await recusa(b.banirConta({ id: 'dono', is_owner: true }, 'suspeito', 'motivo válido', null));
  await recusa(b.advertir({ id: 'dono', is_owner: true }, 'suspeito', 'motivo válido'));
  await recusa(b.banirConta({ id: 'x' }, 'suspeito', 'abc', 7));
  await recusa(b.banirConta({ id: 'x' }, 'inventado', 'motivo válido', 7));
  await recusa(b.banirConta({ id: 'x' }, 'suspeito', 'motivo válido', 3));
  await b.levantarBanimento('mod1');
  assert.deepEqual(chamadas, ['ban mod1 multiplas_contas Três contas com o mesmo telefone 7', 'warn cr1 desrespeito Insultos nos comentários', 'unban mod1']);
});

test('moderador não bane nem adverte: pede, e o admin decide', async () => {
  const { repos, chamadas } = falsos();
  const m = new Backoffice(repos, moderador);
  await recusa(m.banirConta({ id: 'x' }, 'perfil_falso', 'Fotos de outra pessoa', 7));
  await recusa(m.advertir({ id: 'x' }, 'perfil_falso', 'Fotos de outra pessoa'));
  await m.pedirBanimento({ id: 'x' }, 'perfil_falso', 'Fotos de outra pessoa');
  await recusa(m.pedirBanimento({ id: 'dono', is_owner: true }, 'perfil_falso', 'Fotos de outra pessoa'));
  await recusa(m.decidirPedidoDeBanimento(1, true, 7, null));
  const a = new Backoffice(repos, admin);
  await a.decidirPedidoDeBanimento(1, true, 30, null);
  await recusa(a.decidirPedidoDeBanimento(2, false, null, 'não'));
  await a.decidirPedidoDeBanimento(2, false, null, 'Fotos verificadas, são da própria');
  assert.deepEqual(chamadas, ['pedido x perfil_falso Fotos de outra pessoa', 'decide 1 true 30 null', 'decide 2 false null Fotos verificadas, são da própria']);
});
