/**
 * Portas da administração: o que o caso de uso precisa do mundo exterior, sem
 * saber que por trás está o Supabase. A infraestrutura implementa cada uma
 * (src/infrastructure/supabase/backoffice.ts); os testes podem implementá-las
 * em memória.
 *
 * Divididas por agregado (princípio da segregação de interfaces): cada
 * repositório só expõe o que a sua fila precisa.
 */
import type { ContagensDasFilas } from '../../domain/backoffice/queue.ts';
import type { EstadoLevantamento } from '../../domain/backoffice/payout.ts';
import type { Role } from '../../domain/identity/role.ts';

/** Uma linha tal como vem da base de dados, para a interface mostrar. */
export type Linha = Record<string, any>;

export type Fila = keyof ContagensDasFilas;
export type FiltroKyc = 'pending' | 'done' | 'all';
export type FiltroDenuncias = 'open' | 'all';
export type FiltroLevantamentos = 'open' | 'paid' | 'rejected' | 'all';
export type FiltroSuporte = 'open' | 'resolved' | 'all';
export type FiltroPedidosBanimento = 'open' | 'approved' | 'rejected' | 'all';

export interface RepositorioDeFilas {
  /** `admin`: inclui as filas só do admin completo (levantamentos, pedidos de banimento). */
  contar(admin: boolean): Promise<ContagensDasFilas>;
  /** Data do item por tratar mais antigo da fila, ou `null` se estiver vazia. */
  maisAntigo(fila: Fila): Promise<string | null>;
  /** Números dos últimos 30 dias (vendas, receita, saldos, contas). */
  estatisticas(): Promise<Linha>;
}

export interface RepositorioDeVerificacoes {
  listar(filtro: FiltroKyc, limite: number): Promise<Linha[]>;
  /** O pedido, o perfil de criador, os dados bancários e URLs temporários dos documentos. */
  detalhe(id: string): Promise<{ pedido: Linha; criador: Linha | null; banco: Linha | null; urls: Record<string, string> }>;
  decidir(id: string, aprovar: boolean, motivo: string | null): Promise<void>;
}

export interface RepositorioDeDenuncias {
  listar(filtro: FiltroDenuncias, limite: number): Promise<Linha[]>;
  obter(id: string): Promise<{ target_type: string; target_id: string; reason: string | null } | null>;
  resolver(id: string, remover: boolean): Promise<void>;
  handleDoPerfil(perfilId: string): Promise<string | null>;
}

export interface RepositorioDeLevantamentos {
  listar(filtro: FiltroLevantamentos, limite: number): Promise<Linha[]>;
  mudarEstado(id: string, estado: EstadoLevantamento, nota: string | null): Promise<void>;
}

export interface RepositorioDeSuporte {
  listar(filtro: FiltroSuporte, limite: number): Promise<Linha[]>;
  resolver(id: string): Promise<void>;
}

export interface RepositorioDaComunidade {
  utilizadores(pesquisa: string | null): Promise<Linha[]>;
  mudarPapel(utilizadorId: string, papel: Role): Promise<void>;
  mudarEstadoDoCriador(criadorId: string, estado: string): Promise<void>;
  banir(utilizadorId: string, codigo: string, explicacao: string, dias: number | null): Promise<void>;
  levantarBanimento(utilizadorId: string): Promise<void>;
  /** Devolve true quando a advertência (a 3.ª) baniu a conta. */
  advertir(utilizadorId: string, codigo: string, explicacao: string): Promise<boolean>;
  pedirBanimento(utilizadorId: string, codigo: string, explicacao: string): Promise<void>;
  pedidosDeBanimento(filtro: FiltroPedidosBanimento): Promise<Linha[]>;
  decidirPedidoDeBanimento(pedidoId: number, aprovar: boolean, dias: number | null, nota: string | null): Promise<void>;
  conversas(): Promise<Linha[]>;
  /** Mensagens de uma conversa (a abertura fica registada na auditoria) e URLs dos anexos. */
  mensagens(conversaId: string): Promise<{ mensagens: Linha[]; urls: Record<string, string> }>;
}

export interface RepositorioDePromocoes {
  listar(): Promise<Linha[]>;
  obter(id: string): Promise<Linha | null>;
  guardar(id: string | null, dados: Linha): Promise<void>;
  apagar(id: string): Promise<void>;
  /** Envia um ficheiro para o bucket público e devolve o URL. */
  enviarFicheiro(ficheiro: File, sufixo: string): Promise<string>;
}

export interface RepositorioDeDefinicoes {
  listar(): Promise<Array<{ key: string; value: unknown }>>;
  gravar(linhas: Array<{ key: string; value: number }>): Promise<void>;
}

export type RepositoriosDoBackoffice = {
  filas: RepositorioDeFilas;
  verificacoes: RepositorioDeVerificacoes;
  denuncias: RepositorioDeDenuncias;
  levantamentos: RepositorioDeLevantamentos;
  suporte: RepositorioDeSuporte;
  comunidade: RepositorioDaComunidade;
  promocoes: RepositorioDePromocoes;
  definicoes: RepositorioDeDefinicoes;
};
