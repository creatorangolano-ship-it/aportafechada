/**
 * Tipos do domínio.
 *
 * As colunas que estão marcadas abaixo saíram de ler as consultas reais do
 * frontend e de `0001_verificacao.sql`. As que não conheço estão declaradas
 * como index signature.
 *
 * ESSA PARTE É PROVISÓRIA, e há um comando que a resolve:
 *
 *   npx supabase gen types typescript --project-id xkcngjrlfmozlsttuxgs > src/lib/db.types.ts
 *
 * Isso gera os tipos exactos de todas as tabelas, e a partir daí `Profile`,
 * `Creator`, `Post` et al passam a ser `Database['public']['Tables']['profiles']['Row']`
 * e o index signature desaparece. Não o fiz porque o comando precisa da CLI do
 * Supabase autenticada, e o gerador é a única parte do projecto que ainda
 * depende do painel.
 */

/** Papel de uma conta. O backend assume exactamente estes quatro valores. */
export type Role = 'fan' | 'creator' | 'moderator' | 'admin';

/** Estado de aprovação de um perfil de criador.
 *  Só 'approved' pode ser visto por outros e pode cobrar: é o que `vPerfil` e
 *  `vPost` verificam, e o que `resolve_price` tem de reler no servidor. */
export type CreatorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/** Estado de uma compra. Só 'paid' dá acesso — nunca tratar as outras como acesso. */
export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/** O que está a ser comprado. Determina de que tabela o preço é relido. */
export type PayKind = 'subscription' | 'post' | 'message' | 'ticket' | 'tip' | 'topup';

/** A linha de `profiles`. `email` não vem da tabela: é juntada pela sessão. */
export type Profile = {
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  country: string | null;
  birthdate: string | null;
  /** Lista de categorias do utilizador. Guardada como array — `account.ts` faz
   *  `(S.me.interests || []).includes(c)`, o que rebentaria se fosse uma string. */
  interests: string[] | null;
  role: Role;
  onboarded: boolean;
  email_notifications: boolean | null;
  referred_by: string | null;
  wallet_balance: number;
  earnings_balance: number;
  created_at: string;
  /** Perfil principal da plataforma: ninguém o bane, adverte ou lhe muda o papel. */
  is_owner?: boolean;
  /** Banimento: `banned_at` preenchido e `banned_until` nulo (permanente) ou no futuro. */
  banned_at?: string | null;
  banned_until?: string | null;
  follower_count?: number;
  /** Só existe depois de `loadMe`, que a junta a partir da sessão. */
  email?: string;
  // Colunas que ainda não tipámos.
  [k: string]: any;
};

/** A linha de `creators`. `id` é o mesmo id do perfil. */
export type Creator = {
  id: string;
  status: CreatorStatus;
  price: number;
  category: string | null;
  city: string | null;
  bio: string | null;
  cover_url: string | null;
  created_at?: string;
  /** Perfil juntado pelas consultas (`profile:profiles!creators_id_fkey(...)`). */
  profile?: Partial<Profile> | null;
  [k: string]: any;
};

export type Post = {
  id: string;
  creator_id: string;
  status: 'draft' | 'published' | 'hidden' | 'removed';
  price: number;
  title: string | null;
  body_preview: string | null;
  media_url: string | null;
  created_at: string;
  creator?: Partial<Creator> | null;
  [k: string]: any;
};

export type Purchase = {
  id: string;
  user_id: string;
  kind: PayKind;
  target_id: string;
  amount: number;
  status: PurchaseStatus;
  created_at: string;
  creator?: Partial<Creator> | null;
  post?: Partial<Post> | null;
  [k: string]: any;
};

export type Thread = {
  id: string;
  fan_id: string;
  creator_id: string;
  last_message_at: string | null;
  fan_read_at: string | null;
  creator_read_at: string | null;
  [k: string]: any;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  ppv_price: number | null;
  media_url: string | null;
  created_at: string;
  [k: string]: any;
};

/** Definições da plataforma. Todas as chaves são número, em Kwanzas ou em percentagem. */
export type Cfg = {
  fee_pct: number;
  affiliate_pct: number;
  min_payout: number;
  min_tip: number;
  min_topup: number;
  min_price: number;
  usd_rate: number;
  reference_days: number;
};

export type Live = {
  id: string;
  creator_id: string;
  status: 'scheduled' | 'live' | 'ended';
  title: string | null;
  price: number;
  room: string | null;
  started_at: string | null;
  creator?: Partial<Creator> | null;
  [k: string]: any;
};

/** O que o servidor tem de devolver para mostrar o valor ao utilizador.
 *  `pay.js` transforma isto em Kz e depois em USD. */
export type PriceQuote = {
  kind: PayKind;
  target: string | null;
  amount: number;   // Kwanzas
  usd: number;      // dólares, para o PayPal
};

/**
 * Uma acção do despachante global.
 *
 * Recebe o `dataset` inteiro do elemento que a accionou — daí `data-v`, `data-id`,
 * `data-price` chegarem aqui como strings. É esta assinatura que torna
 * `data-price` num valor *não confiável*: o atacante controla o DOM, logo controla
 * estes campos. Nada de dinheiro pode ser decidido a partir daqui (ver `pay.ts`).
 *
 * Pode devolver `void`, uma promessa, ou `true`/`false` para continuar a cascata
 * de handlers (ver `main.ts`).
 */
export type ActionFn = (d: Record<string, string>) => unknown;

/** O mapa `data-act="nome"` → função. Cada módulo de vista exporta o seu. */
export type Actions = Record<string, ActionFn>;

/**
 * O alvo de um evento `change`: por definição, um control de formulário.
 *
 * Não é `HTMLElement` por omisso. As vistas fazem `t.value`, `t.name` e
 * `t.checked` em todo o lado, e com `HTMLElement` cada um desses sítios dava
 * erro — o que empurrava a resolver cada um com um `as` individual e a perder a
 * verificação de tipos onde ela dava jeito. Os três tipos têm `.value`, `.name`,
 * `.id` e `.checked`; só `.files` é exclusivo de `HTMLInputElement`, e esse
 * caso está assinalado no ponto de uso.
 */
export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Handlers de `change`, em cascata: devolvem `true` quando trataram do evento. */
export type ChangeFn = (t: FormControl) => boolean | Promise<boolean>;
/** Handlers de `submit`, em cascata: devolvem `true` quando trataram do evento. */
export type SubmitFn = (f: HTMLFormElement) => boolean | Promise<boolean>;
/** Uma vista: devolve o HTML da página (ou uma promessa dele). */
export type View = () => string | Promise<string>;
