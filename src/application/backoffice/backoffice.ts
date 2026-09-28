/**
 * Casos de uso da administração (padrão Facade).
 *
 * A interface chama estes métodos e nunca a base de dados. Cada método:
 *   1. confirma a permissão de quem está a agir (matriz do domínio);
 *   2. aplica as regras do domínio (transições, validações);
 *   3. só então pede ao repositório para ler ou escrever.
 *
 * A fronteira real continua no backend (RLS e funções SECURITY DEFINER). Isto
 * garante que a interface nunca pede uma operação que o domínio proíbe — nem
 * por um clique sintético no despachante global de comandos.
 */
import { pode, recusaMudarPapel, type Permissao, type Role } from '../../domain/identity/role.ts';
import { ErroDeRegra, exigir } from '../../domain/shared/errors.ts';
import { recusaDecisao } from '../../domain/backoffice/kyc.ts';
import { eEstadoLevantamento, podeTransitar, recusaMotivo, type EstadoLevantamento } from '../../domain/backoffice/payout.ts';
import { validarDefinicoes } from '../../domain/platform/settings.ts';
import { recusaPromocao } from '../../domain/platform/promo.ts';
import type {
  Fila, FiltroDenuncias, FiltroKyc, FiltroLevantamentos, FiltroSuporte, Linha, RepositoriosDoBackoffice,
} from './ports.ts';

export type Actor = { id: string; role: Role };

const ESTADOS_DO_CRIADOR = ['approved', 'suspended', 'rejected', 'pending'];

export class Backoffice {
  readonly #r: RepositoriosDoBackoffice;
  readonly #actor: Actor;

  constructor(repositorios: RepositoriosDoBackoffice, actor: Actor) {
    this.#r = repositorios;
    this.#actor = actor;
  }

  get actor(): Actor { return this.#actor; }
  pode(p: Permissao): boolean { return pode(this.#actor.role, p); }

  #exige(p: Permissao): void {
    if (!this.pode(p)) throw new ErroDeRegra('Sem permissão para esta ação.');
  }

  /* ---------- Filas e números ---------- */
  async contagens() { this.#exige('moderar'); return this.#r.filas.contar(this.pode('gerir_levantamentos')); }
  async maisAntigo(fila: Fila) { this.#exige('moderar'); return this.#r.filas.maisAntigo(fila); }
  async estatisticas() { this.#exige('ver_financas'); return this.#r.filas.estatisticas(); }

  /* ---------- Verificações (KYC) ---------- */
  async verificacoes(filtro: FiltroKyc, limite: number) { this.#exige('moderar'); return this.#r.verificacoes.listar(filtro, limite); }
  async detalheDaVerificacao(id: string) { this.#exige('moderar'); return this.#r.verificacoes.detalhe(id); }
  async decidirVerificacao(id: string, aprovar: boolean, pontosConfirmados: boolean[], motivo: string): Promise<void> {
    this.#exige('moderar');
    exigir(recusaDecisao({ aprovar, pontosConfirmados, motivo }));
    await this.#r.verificacoes.decidir(id, aprovar, aprovar ? null : motivo.trim());
  }

  /* ---------- Denúncias ---------- */
  async denuncias(filtro: FiltroDenuncias, limite: number) { this.#exige('moderar'); return this.#r.denuncias.listar(filtro, limite); }
  async denuncia(id: string) { this.#exige('moderar'); return this.#r.denuncias.obter(id); }
  async arquivarDenuncia(id: string): Promise<void> {
    this.#exige('moderar');
    await this.#r.denuncias.resolver(id, false);
  }
  /** Esconde a publicação, apaga a mensagem ou termina a live. Perfis não: isso é suspender. */
  async removerConteudoDenunciado(id: string): Promise<void> {
    this.#exige('moderar');
    const d = await this.#r.denuncias.obter(id);
    if (d?.target_type === 'creator') throw new ErroDeRegra('Para suspender um perfil, usa «Suspender perfil».');
    await this.#r.denuncias.resolver(id, true);
  }
  async suspenderPerfilDenunciado(id: string): Promise<void> {
    this.#exige('suspender_perfis');
    await this.#r.denuncias.resolver(id, true);
  }
  async handleDoPerfil(id: string) { this.#exige('moderar'); return this.#r.denuncias.handleDoPerfil(id); }

  /* ---------- Levantamentos ---------- */
  async levantamentos(filtro: FiltroLevantamentos, limite: number) { this.#exige('gerir_levantamentos'); return this.#r.levantamentos.listar(filtro, limite); }
  async mudarEstadoDoLevantamento(id: string, de: string, para: string, nota: string | null = null): Promise<void> {
    this.#exige('gerir_levantamentos');
    if (!eEstadoLevantamento(de) || !eEstadoLevantamento(para)) throw new ErroDeRegra('Estado inválido.');
    if (!podeTransitar(de, para)) throw new ErroDeRegra('Este levantamento já não pode mudar para esse estado.');
    if (para === 'rejected') exigir(recusaMotivo(nota ?? ''));
    await this.#r.levantamentos.mudarEstado(id, para as EstadoLevantamento, para === 'rejected' ? nota!.trim() : null);
  }

  /* ---------- Suporte ---------- */
  async pedidosDeSuporte(filtro: FiltroSuporte, limite: number) { this.#exige('moderar'); return this.#r.suporte.listar(filtro, limite); }
  async resolverPedidoDeSuporte(id: string) { this.#exige('moderar'); return this.#r.suporte.resolver(id); }

  /* ---------- Comunidade ---------- */
  async utilizadores(pesquisa: string | null) { this.#exige('moderar'); return this.#r.comunidade.utilizadores(pesquisa); }
  async mudarPapel(utilizadorId: string, papel: string): Promise<void> {
    exigir(recusaMudarPapel(this.#actor, utilizadorId, papel));
    await this.#r.comunidade.mudarPapel(utilizadorId, papel as Role);
  }
  async mudarEstadoDoCriador(criadorId: string, estado: string): Promise<void> {
    this.#exige('suspender_perfis');
    if (!ESTADOS_DO_CRIADOR.includes(estado)) throw new ErroDeRegra('Estado inválido.');
    if (criadorId === this.#actor.id) throw new ErroDeRegra('Não podes mudar o teu próprio estado.');
    await this.#r.comunidade.mudarEstadoDoCriador(criadorId, estado);
  }
  async conversas() { this.#exige('ver_mensagens_privadas'); return this.#r.comunidade.conversas(); }
  async mensagensDaConversa(id: string) { this.#exige('ver_mensagens_privadas'); return this.#r.comunidade.mensagens(id); }

  /* ---------- Promoções ---------- */
  async promocoes() { this.#exige('gerir_promocoes'); return this.#r.promocoes.listar(); }
  async promocao(id: string) { this.#exige('gerir_promocoes'); return this.#r.promocoes.obter(id); }
  async apagarPromocao(id: string) { this.#exige('gerir_promocoes'); return this.#r.promocoes.apagar(id); }
  /**
   * Guarda uma promoção. Os ficheiros novos (se os houver) são enviados primeiro
   * e os seus URLs substituem os anteriores.
   */
  async guardarPromocao(id: string | null, dados: Linha, ficheiros: { principal?: File | null; mobile?: File | null } = {}): Promise<void> {
    this.#exige('gerir_promocoes');
    exigir(recusaPromocao({ titulo: String(dados.title ?? ''), tipo: String(dados.content_type), posicao: String(dados.position), html: dados.html ?? null }));
    const linha = { ...dados };
    if (linha.content_type !== 'html') {
      if (ficheiros.principal) {
        linha.image_url = await this.#r.promocoes.enviarFicheiro(ficheiros.principal, '');
        linha.media_type = ficheiros.principal.type || null;
      }
      if (ficheiros.mobile) linha.mobile_image_url = await this.#r.promocoes.enviarFicheiro(ficheiros.mobile, 'm-');
    }
    await this.#r.promocoes.guardar(id, linha);
  }

  /* ---------- Definições ---------- */
  async definicoes() { this.#exige('gerir_definicoes'); return this.#r.definicoes.listar(); }
  /** Valida todas antes de gravar qualquer uma. */
  async gravarDefinicoes(entradas: Array<{ key: string; raw: unknown }>): Promise<void> {
    this.#exige('gerir_definicoes');
    const v = validarDefinicoes(entradas);
    if (v.error !== undefined) throw new ErroDeRegra(v.error);
    await this.#r.definicoes.gravar(v.rows);
  }
}
